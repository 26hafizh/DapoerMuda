import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serverConfig } from './config.mjs';

const defaultProducts = [
  { id: 1, name: 'Indomie Goreng', price: 3500, stock: 50 },
  { id: 2, name: 'Kopi Hitam', price: 4000, stock: 30 },
  { id: 3, name: 'Beras 1L', price: 12000, stock: 20 },
  { id: 4, name: 'Telur 1kg', price: 28000, stock: 15 }
];

const legacyJsonDataFile = path.join(path.dirname(serverConfig.dataFile), 'app.json');

let databasePromise = null;
let writeQueue = Promise.resolve();

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatTransactionDisplayDate(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replace(/\./g, ':');
}

function normalizeProducts(items) {
  const source = Array.isArray(items) && items.length > 0 ? items : defaultProducts;

  return source.map((item, index) => ({
    id: Number.isInteger(Number(item.id)) ? Number(item.id) : index + 1,
    name: normalizeWhitespace(item.name) || `Produk ${index + 1}`,
    price: Math.max(0, Number(item.price) || 0),
    stock: Math.max(0, Number(item.stock) || 0)
  }));
}

function normalizeTransactions(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((trx, index) => ({
      id: String(trx.id ?? `TRX-${index + 1}`),
      createdAt: new Date(trx.createdAt ?? Date.now()).toISOString(),
      date: normalizeWhitespace(trx.date) || formatTransactionDisplayDate(trx.createdAt ?? Date.now()),
      items: Array.isArray(trx.items)
        ? trx.items
          .map((item) => ({
            id: Number(item.id) || 0,
            name: normalizeWhitespace(item.name) || 'Produk',
            price: Math.max(0, Number(item.price) || 0),
            qty: Math.max(0, Number(item.qty) || 0)
          }))
          .filter((item) => item.qty > 0)
        : [],
      total: Math.max(0, Number(trx.total) || 0),
      paidAmount: Math.max(0, Number(trx.paidAmount ?? trx.total) || 0),
      changeAmount: Math.max(0, Number(trx.changeAmount ?? 0) || 0),
      kasir: normalizeWhitespace(trx.kasir) || 'Tidak diketahui'
    }))
    .filter((trx) => trx.items.length > 0)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function normalizeActivities(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((activity, index) => ({
      id: String(activity.id ?? `activity_${index + 1}`),
      type: String(activity.type ?? 'info'),
      title: normalizeWhitespace(activity.title) || 'Aktivitas',
      detail: normalizeWhitespace(activity.detail),
      actor: normalizeWhitespace(activity.actor) || 'Sistem',
      createdAt: new Date(activity.createdAt ?? Date.now()).toISOString(),
      deviceId: normalizeWhitespace(activity.deviceId) || 'server'
    }))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};

  return {
    schemaVersion: 1,
    products: normalizeProducts(source.products),
    transactions: normalizeTransactions(source.transactions),
    activities: normalizeActivities(source.activities)
  };
}

function buildProductSignature(items) {
  return normalizeProducts(items)
    .map((item) => `${item.id}:${item.name.toLowerCase()}:${item.price}:${item.stock}`)
    .sort()
    .join('|');
}

function hasMeaningfulState(state) {
  const normalized = normalizeState(state);
  const defaultSignature = buildProductSignature(defaultProducts);
  const currentSignature = buildProductSignature(normalized.products);

  return (
    normalized.transactions.length > 0
    || normalized.activities.length > 0
    || currentSignature !== defaultSignature
  );
}

export function isPristineState(state) {
  return !hasMeaningfulState(state);
}

function buildActivity({ type, title, detail, actor }) {
  return {
    id: `ACT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    type,
    title,
    detail,
    actor,
    createdAt: new Date().toISOString(),
    deviceId: 'server'
  };
}

function getNextProductId(products) {
  const maxId = products.reduce((highest, product) => Math.max(highest, Number(product.id) || 0), 0);
  return maxId + 1;
}

function createTransactionId() {
  return `TRX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createDefaultState() {
  return normalizeState({
    products: defaultProducts,
    transactions: [],
    activities: []
  });
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

async function initializeDatabase() {
  await mkdir(path.dirname(serverConfig.dataFile), { recursive: true });

  const db = new DatabaseSync(serverConfig.dataFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      date_display TEXT NOT NULL,
      total INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      kasir TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      device_id TEXT NOT NULL
    );
  `);

  await bootstrapDatabaseIfNeeded(db);
  return db;
}

function getTableCount(db, tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

async function bootstrapDatabaseIfNeeded(db) {
  const hasExistingRows = (
    getTableCount(db, 'products') > 0
    || getTableCount(db, 'transactions') > 0
    || getTableCount(db, 'activities') > 0
  );

  if (hasExistingRows) {
    return;
  }

  let initialState = createDefaultState();

  try {
    const rawLegacy = await readFile(legacyJsonDataFile, 'utf8');
    const parsedLegacy = normalizeState(JSON.parse(rawLegacy));

    if (hasMeaningfulState(parsedLegacy)) {
      initialState = parsedLegacy;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Legacy JSON store tidak berhasil dimuat, backend memakai seed default.', error);
    }
  }

  replaceStateInDatabase(db, initialState);
}

function buildStateFromDatabase(db) {
  const products = normalizeProducts(
    db.prepare(`
      SELECT id, name, price, stock
      FROM products
      ORDER BY id ASC
    `).all()
  );

  const transactionRows = db.prepare(`
    SELECT
      t.id,
      t.created_at,
      t.date_display,
      t.total,
      t.paid_amount,
      t.change_amount,
      t.kasir,
      ti.product_id,
      ti.name AS item_name,
      ti.price AS item_price,
      ti.qty AS item_qty,
      ti.id AS item_row_id
    FROM transactions t
    LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
    ORDER BY datetime(t.created_at) DESC, t.id DESC, ti.id ASC
  `).all();

  const transactionsMap = new Map();
  transactionRows.forEach((row) => {
    if (!transactionsMap.has(row.id)) {
      transactionsMap.set(row.id, {
        id: row.id,
        createdAt: row.created_at,
        date: row.date_display,
        total: row.total,
        paidAmount: row.paid_amount,
        changeAmount: row.change_amount,
        kasir: row.kasir,
        items: []
      });
    }

    if (row.product_id !== null && row.product_id !== undefined) {
      transactionsMap.get(row.id).items.push({
        id: row.product_id,
        name: row.item_name,
        price: row.item_price,
        qty: row.item_qty
      });
    }
  });

  const activities = normalizeActivities(
    db.prepare(`
      SELECT id, type, title, detail, actor, created_at, device_id
      FROM activities
      ORDER BY datetime(created_at) DESC, id DESC
    `).all().map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      detail: row.detail,
      actor: row.actor,
      createdAt: row.created_at,
      deviceId: row.device_id
    }))
  );

  return normalizeState({
    products,
    transactions: Array.from(transactionsMap.values()),
    activities
  });
}

function replaceStateInDatabase(db, nextState) {
  const normalized = normalizeState(nextState);
  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, price, stock)
    VALUES (?, ?, ?, ?)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, created_at, date_display, total, paid_amount, change_amount, kasir)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTransactionItem = db.prepare(`
    INSERT INTO transaction_items (transaction_id, product_id, name, price, qty)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertActivity = db.prepare(`
    INSERT INTO activities (id, type, title, detail, actor, created_at, device_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec(`
    DELETE FROM transaction_items;
    DELETE FROM transactions;
    DELETE FROM activities;
    DELETE FROM products;
  `);

  normalized.products.forEach((product) => {
    insertProduct.run(product.id, product.name, product.price, product.stock);
  });

  normalized.transactions.forEach((transaction) => {
    insertTransaction.run(
      transaction.id,
      transaction.createdAt,
      transaction.date,
      transaction.total,
      transaction.paidAmount,
      transaction.changeAmount,
      transaction.kasir
    );

    transaction.items.forEach((item) => {
      insertTransactionItem.run(
        transaction.id,
        item.id,
        item.name,
        item.price,
        item.qty
      );
    });
  });

  normalized.activities.forEach((activity) => {
    insertActivity.run(
      activity.id,
      activity.type,
      activity.title,
      activity.detail,
      activity.actor,
      activity.createdAt,
      activity.deviceId
    );
  });
}

function runAtomicMutation(db, mutator) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const currentState = buildStateFromDatabase(db);
    const workingState = normalizeState(currentState);
    const resultState = mutator(workingState);
    const nextState = normalizeState(resultState ?? workingState);
    replaceStateInDatabase(db, nextState);
    db.exec('COMMIT');
    return nextState;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function readState() {
  const db = await getDatabase();
  return buildStateFromDatabase(db);
}

export function createSnapshot(state) {
  return normalizeState(state);
}

export async function mutateState(mutator) {
  const operation = writeQueue.catch(() => undefined).then(async () => {
    const db = await getDatabase();
    return runAtomicMutation(db, mutator);
  });

  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function addProduct({ name, price, stock, actor }) {
  return mutateState((state) => {
    const normalizedName = normalizeWhitespace(name);

    if (!normalizedName) {
      throw createHttpError(400, 'Nama produk wajib diisi.');
    }

    if (!Number.isFinite(price) || price < 0) {
      throw createHttpError(400, 'Harga produk tidak valid.');
    }

    if (!Number.isFinite(stock) || stock <= 0) {
      throw createHttpError(400, 'Stok awal harus lebih dari 0.');
    }

    const existing = state.products.find((product) => product.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) {
      throw createHttpError(409, `Produk ${existing.name} sudah ada.`);
    }

    const product = {
      id: getNextProductId(state.products),
      name: normalizedName,
      price: Math.max(0, Number(price) || 0),
      stock: Math.max(0, Number(stock) || 0)
    };

    state.products.push(product);
    state.activities.unshift(buildActivity({
      type: 'add_product',
      title: `Produk baru ${product.name} ditambahkan`,
      detail: `Stok awal ${product.stock} pcs dengan harga Rp ${product.price.toLocaleString('id-ID')}.`,
      actor
    }));

    return state;
  });
}

export async function restockProduct({ productId, qty, newPrice, actor }) {
  return mutateState((state) => {
    const product = state.products.find((item) => item.id === Number(productId));
    if (!product) {
      throw createHttpError(404, 'Produk tidak ditemukan.');
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      throw createHttpError(400, 'Jumlah restok harus lebih dari 0.');
    }

    if (newPrice !== null && newPrice !== undefined && (!Number.isFinite(newPrice) || newPrice < 0)) {
      throw createHttpError(400, 'Harga baru tidak valid.');
    }

    product.stock += Math.max(0, Number(qty) || 0);
    if (newPrice !== null && newPrice !== undefined) {
      product.price = Math.max(0, Number(newPrice) || 0);
    }

    state.activities.unshift(buildActivity({
      type: 'restock_product',
      title: `Restok ${product.name}`,
      detail: `Tambah ${qty} pcs${newPrice !== null && newPrice !== undefined ? ` dan harga diperbarui menjadi Rp ${product.price.toLocaleString('id-ID')}` : ''}.`,
      actor
    }));

    return state;
  });
}

export async function createTransaction({ items, paidAmount, actor }) {
  let createdTransaction = null;

  const state = await mutateState((state) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw createHttpError(400, 'Keranjang belanja kosong.');
    }

    const lineItems = items.map((item) => {
      const product = state.products.find((entry) => entry.id === Number(item.id));
      const qty = Math.max(0, Number(item.qty) || 0);

      if (!product) {
        throw createHttpError(404, `Produk dengan id ${item.id} tidak ditemukan.`);
      }

      if (qty <= 0) {
        throw createHttpError(400, `Jumlah pembelian ${product.name} tidak valid.`);
      }

      if (product.stock < qty) {
        throw createHttpError(409, `Stok ${product.name} tidak cukup.`);
      }

      return {
        id: product.id,
        name: product.name,
        price: product.price,
        qty
      };
    });

    const total = lineItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const numericPaidAmount = Math.max(0, Number(paidAmount) || 0);

    if (numericPaidAmount < total) {
      throw createHttpError(400, `Uang pembeli kurang Rp ${(total - numericPaidAmount).toLocaleString('id-ID')}.`);
    }

    lineItems.forEach((item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      product.stock -= item.qty;
    });

    const createdAt = new Date();
    const transaction = {
      id: createTransactionId(),
      createdAt: createdAt.toISOString(),
      date: formatTransactionDisplayDate(createdAt),
      items: lineItems,
      total,
      paidAmount: numericPaidAmount,
      changeAmount: Math.max(0, numericPaidAmount - total),
      kasir: actor
    };
    createdTransaction = transaction;

    state.transactions.unshift(transaction);
    state.activities.unshift(buildActivity({
      type: 'checkout',
      title: `Checkout ${transaction.id}`,
      detail: `Total Rp ${total.toLocaleString('id-ID')} dengan ${lineItems.reduce((sum, item) => sum + item.qty, 0)} item berhasil dicatat.`,
      actor
    }));

    return state;
  });

  return {
    state,
    transaction: createdTransaction
  };
}

export async function seedState({ snapshot, actor }) {
  return mutateState((state) => {
    if (!isPristineState(state)) {
      throw createHttpError(409, 'Backend sudah memiliki data. Seed awal hanya bisa dilakukan sekali.');
    }

    const importedState = normalizeState(snapshot);
    if (!hasMeaningfulState(importedState)) {
      throw createHttpError(400, 'Data lokal belum memiliki isi yang perlu dipindahkan ke backend.');
    }

    importedState.activities = normalizeActivities([
      buildActivity({
        type: 'backend_seed',
        title: 'Data lokal dipindahkan ke backend',
        detail: 'Snapshot awal dari device berhasil dijadikan sumber data utama backend.',
        actor
      }),
      ...importedState.activities
    ]);

    return importedState;
  });
}
