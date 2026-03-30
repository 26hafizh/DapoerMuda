import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { serverConfig, appUsers } from './config.mjs';
import { addProduct, createSnapshot, createTransaction, readState, restockProduct, seedState } from './store.mjs';

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
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

function createSession(user) {
  const token = randomUUID();
  sessions.set(token, {
    user,
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

function getSessionUser(request) {
  pruneExpiredSessions();

  const authHeader = request.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    const error = new Error('Sesi login tidak ditemukan.');
    error.status = 401;
    throw error;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    const error = new Error('Sesi login sudah berakhir. Silakan masuk lagi.');
    error.status = 401;
    throw error;
  }

  session.expiresAt = Date.now() + serverConfig.sessionTtlMs;
  return { token, user: session.user };
}

function matchRoute(pathname, matcher) {
  const matched = pathname.match(matcher);
  return matched || null;
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
      const login = String(body.username ?? '').trim();
      const password = String(body.password ?? '');
      const matchedUser = appUsers.find((user) => user.login === login && user.password === password);

      if (!matchedUser) {
        sendJson(response, 401, { message: 'Username atau password salah.' });
        return;
      }

      const user = {
        username: matchedUser.displayName,
        role: matchedUser.role,
        login: matchedUser.login
      };
      const token = createSession(user);
      const state = createSnapshot(await readState());

      sendJson(response, 200, {
        message: 'Login berhasil.',
        token,
        user,
        data: state
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/auth/logout` && request.method === 'POST') {
      const { token } = getSessionUser(request);
      sessions.delete(token);
      sendJson(response, 200, { message: 'Logout berhasil.' });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/bootstrap` && request.method === 'GET') {
      getSessionUser(request);
      sendJson(response, 200, {
        data: createSnapshot(await readState())
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/admin/seed` && request.method === 'POST') {
      const { user } = getSessionUser(request);
      if (user.role !== 'admin') {
        sendJson(response, 403, { message: 'Hanya admin yang boleh memindahkan data awal ke backend.' });
        return;
      }

      const body = await readJsonBody(request);
      const state = await seedState({
        snapshot: body.snapshot,
        actor: user.username
      });

      sendJson(response, 201, {
        message: 'Data awal berhasil dipindahkan ke backend.',
        data: createSnapshot(state)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/products` && request.method === 'POST') {
      const { user } = getSessionUser(request);
      if (user.role !== 'admin') {
        sendJson(response, 403, { message: 'Hanya admin yang boleh menambah produk.' });
        return;
      }

      const body = await readJsonBody(request);
      const state = await addProduct({
        name: body.name,
        price: Number(body.price),
        stock: Number(body.stock),
        actor: user.username
      });

      sendJson(response, 201, {
        message: 'Produk baru berhasil ditambahkan.',
        data: createSnapshot(state)
      });
      return;
    }

    const restockMatch = matchRoute(url.pathname, new RegExp(`^${serverConfig.apiBasePath}/products/(\\d+)/restock$`));
    if (restockMatch && request.method === 'POST') {
      const { user } = getSessionUser(request);
      if (user.role !== 'admin') {
        sendJson(response, 403, { message: 'Hanya admin yang boleh merestok produk.' });
        return;
      }

      const body = await readJsonBody(request);
      const state = await restockProduct({
        productId: Number(restockMatch[1]),
        qty: Number(body.qty),
        newPrice: body.newPrice === null || body.newPrice === undefined || body.newPrice === '' ? null : Number(body.newPrice),
        actor: user.username
      });

      sendJson(response, 200, {
        message: 'Restok produk berhasil disimpan.',
        data: createSnapshot(state)
      });
      return;
    }

    if (url.pathname === `${serverConfig.apiBasePath}/transactions` && request.method === 'POST') {
      const { user } = getSessionUser(request);
      const body = await readJsonBody(request);
      const result = await createTransaction({
        items: body.items,
        paidAmount: Number(body.paidAmount),
        actor: user.username
      });

      sendJson(response, 201, {
        message: 'Transaksi berhasil disimpan.',
        transaction: result.transaction,
        data: createSnapshot(result.state)
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
