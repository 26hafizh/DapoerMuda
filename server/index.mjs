import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { serverConfig } from './config.mjs';
import {
  addProduct,
  authenticateUser,
  createSnapshot,
  createTransaction,
  createUser,
  listUsers,
  readSessionUser,
  readState,
  restockProduct,
  seedState,
  updateUser
} from './store.mjs';

const sessions = new Map();
const publicRoot = path.resolve(serverConfig.publicDir);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', serverConfig.corsOrigin);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw createHttpError(400, 'Format JSON request tidak valid.');
  }
}

function createSession(login) {
  const token = randomUUID();
  sessions.set(token, {
    login,
    expiresAt: Date.now() + serverConfig.sessionTtlMs
  });
  return token;
}

function pruneExpiredSessions() {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

async function getSessionUser(request) {
  pruneExpiredSessions();

  const authHeader = request.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    throw createHttpError(401, 'Sesi login tidak ditemukan.');
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    throw createHttpError(401, 'Sesi login sudah berakhir. Silakan masuk lagi.');
  }

  const user = await readSessionUser(session.login);
  if (!user) {
    sessions.delete(token);
    throw createHttpError(401, 'Akun Anda sudah tidak aktif. Silakan hubungi admin.');
  }

  session.expiresAt = Date.now() + serverConfig.sessionTtlMs;
  return { token, user };
}

function ensureAdmin(user) {
  if (user.role !== 'admin') {
    throw createHttpError(403, 'Hanya admin yang boleh menjalankan aksi ini.');
  }
}

function matchRoute(pathname, matcher) {
  const matched = pathname.match(matcher);
  return matched || null;
}

async function buildClientSnapshot(user, state) {
  const snapshot = createSnapshot(state ?? await readState());

  if (user?.role === 'admin') {
    snapshot.users = await listUsers();
  }

  return snapshot;
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch (error) {
    throw createHttpError(400, 'Parameter URL tidak valid.');
  }
}

async function serveStatic(request, response, pathname) {
  const cleanPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const requestedPath = path.resolve(publicRoot, cleanPath);
  const isInsidePublicRoot = requestedPath === publicRoot || requestedPath.startsWith(`${publicRoot}${path.sep}`);

  if (!isInsidePublicRoot) {
    throw createHttpError(403, 'Akses file ditolak.');
  }

  let filePath = requestedPath;

  try {
    await access(filePath);
  } catch (error) {
    filePath = path.join(publicRoot, 'index.html');
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === 'OPTIONS') {
      setCorsHeaders(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/health`) {
      sendJson(response, 200, {
        ok: true,
        mode: 'backend',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/auth/login` && request.method === 'POST') {
      const body = await readJsonBody(request);
      const user = await authenticateUser({
        login: body.username,
        password: body.password
      });
      const token = createSession(user.login);

      sendJson(response, 200, {
        message: 'Login berhasil.',
        token,
        user,
        data: await buildClientSnapshot(user)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/auth/logout` && request.method === 'POST') {
      const { token } = await getSessionUser(request);
      sessions.delete(token);
      sendJson(response, 200, { message: 'Logout berhasil.' });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/bootstrap` && request.method === 'GET') {
      const { user } = await getSessionUser(request);
      sendJson(response, 200, {
        data: await buildClientSnapshot(user)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/admin/seed` && request.method === 'POST') {
      const { user } = await getSessionUser(request);
      ensureAdmin(user);

      const body = await readJsonBody(request);
      const state = await seedState({
        snapshot: body.snapshot,
        actor: user.username
      });

      sendJson(response, 201, {
        message: 'Data awal berhasil dipindahkan ke backend.',
        data: await buildClientSnapshot(user, state)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/admin/users` && request.method === 'GET') {
      const { user } = await getSessionUser(request);
      ensureAdmin(user);

      sendJson(response, 200, {
        users: await listUsers()
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/admin/users` && request.method === 'POST') {
      const { user } = await getSessionUser(request);
      ensureAdmin(user);

      const body = await readJsonBody(request);
      const createdUser = await createUser({
        login: body.login,
        password: body.password,
        displayName: body.displayName,
        role: body.role,
        actor: user.username
      });

      sendJson(response, 201, {
        message: `Akun ${createdUser.displayName} berhasil dibuat.`,
        createdUser,
        currentUser: await readSessionUser(user.login),
        data: await buildClientSnapshot(user)
      });
      return;
    }

    const userMatch = matchRoute(url.pathname, new RegExp(`^${serverConfig.apiBasePath}/admin/users/([^/]+)$`));
    if (userMatch && request.method === 'PATCH') {
      const { user } = await getSessionUser(request);
      ensureAdmin(user);

      const body = await readJsonBody(request);
      const updatedUser = await updateUser({
        login: decodePathSegment(userMatch[1]),
        displayName: body.displayName,
        role: body.role,
        password: body.password,
        isActive: body.isActive,
        actor: user.username,
        actorLogin: user.login
      });
      const refreshedUser = await readSessionUser(user.login) || user;

      sendJson(response, 200, {
        message: `Akun ${updatedUser.displayName} berhasil diperbarui.`,
        updatedUser,
        currentUser: refreshedUser,
        data: await buildClientSnapshot(refreshedUser)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/products` && request.method === 'POST') {
      const { user } = await getSessionUser(request);
      ensureAdmin(user);

      const body = await readJsonBody(request);
      const state = await addProduct({
        name: body.name,
        price: Number(body.price),
        stock: Number(body.stock),
        actor: user.username
      });

      sendJson(response, 201, {
        message: 'Produk baru berhasil ditambahkan.',
        data: await buildClientSnapshot(user, state)
      });
      return;
    }

    const restockMatch = matchRoute(url.pathname, new RegExp(`^${serverConfig.apiBasePath}/products/(\\d+)/restock$`));
    if (restockMatch && request.method === 'POST') {
      const { user } = await getSessionUser(request);
      ensureAdmin(user);

      const body = await readJsonBody(request);
      const state = await restockProduct({
        productId: Number(restockMatch[1]),
        qty: Number(body.qty),
        newPrice: body.newPrice === null || body.newPrice === undefined || body.newPrice === '' ? null : Number(body.newPrice),
        actor: user.username
      });

      sendJson(response, 200, {
        message: 'Restok produk berhasil disimpan.',
        data: await buildClientSnapshot(user, state)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/transactions` && request.method === 'POST') {
      const { user } = await getSessionUser(request);
      const body = await readJsonBody(request);
      const result = await createTransaction({
        items: body.items,
        paidAmount: Number(body.paidAmount),
        actor: user.username
      });

      sendJson(response, 201, {
        message: 'Transaksi berhasil disimpan.',
        transaction: result.transaction,
        data: await buildClientSnapshot(user, result.state)
      });
      return;
    }

    if (url.pathname.startsWith(serverConfig.apiBasePath)) {
      sendJson(response, 404, { message: 'Endpoint API tidak ditemukan.' });
      return;
    }

    await serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, error.status || 500, {
      message: error.message || 'Terjadi kesalahan pada server.'
    });
  }
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`DapoerMuda backend running on http://${serverConfig.host}:${serverConfig.port}`);
});
