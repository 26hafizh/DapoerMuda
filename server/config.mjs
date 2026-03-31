import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLogin(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeRole(value) {
  return String(value ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function buildSeedUser({ login, password, displayName, role }) {
  const normalizedLogin = normalizeLogin(login);
  const normalizedPassword = String(password ?? '');

  if (!normalizedLogin || !normalizedPassword) {
    return null;
  }

  return {
    login: normalizedLogin,
    password: normalizedPassword,
    displayName: normalizeWhitespace(displayName) || normalizedLogin,
    role: normalizeRole(role)
  };
}

function readExtraUsersFromEnv() {
  const rawValue = String(process.env.APP_USERS_JSON || '').trim();
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('APP_USERS_JSON tidak valid dan diabaikan.', error);
    return [];
  }
}

function createSeedUsers() {
  const baseUsers = [
    buildSeedUser({
      login: process.env.ADMIN_LOGIN || 'admin',
      password: process.env.ADMIN_PASSWORD || '123',
      displayName: process.env.ADMIN_DISPLAY_NAME || 'Admin Utama',
      role: 'admin'
    }),
    buildSeedUser({
      login: process.env.CASHIER_LOGIN || 'user',
      password: process.env.CASHIER_PASSWORD || '123',
      displayName: process.env.CASHIER_DISPLAY_NAME || 'Kasir Shift 1',
      role: 'user'
    }),
    ...readExtraUsersFromEnv().map((item) => buildSeedUser(item))
  ].filter(Boolean);

  const usersByLogin = new Map();

  baseUsers.forEach((user) => {
    usersByLogin.set(user.login, user);
  });

  if (!Array.from(usersByLogin.values()).some((user) => user.role === 'admin')) {
    usersByLogin.set('admin', {
      login: 'admin',
      password: '123',
      displayName: 'Admin Utama',
      role: 'admin'
    });
  }

  return Array.from(usersByLogin.values());
}

export const serverConfig = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 8787,
  apiBasePath: '/api',
  publicDir: path.join(rootDir, 'www'),
  dataFile: process.env.DATA_FILE
    ? path.resolve(rootDir, process.env.DATA_FILE)
    : path.join(rootDir, 'server', 'data', 'app.db'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 1000 * 60 * 60 * 12
};

export const seedUsers = createSeedUsers();
