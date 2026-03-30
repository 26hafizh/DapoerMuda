import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

export const appUsers = [
  {
    login: process.env.ADMIN_LOGIN || 'admin',
    password: process.env.ADMIN_PASSWORD || '123',
    role: 'admin',
    displayName: process.env.ADMIN_DISPLAY_NAME || 'Admin Utama'
  },
  {
    login: process.env.CASHIER_LOGIN || 'user',
    password: process.env.CASHIER_PASSWORD || '123',
    role: 'user',
    displayName: process.env.CASHIER_DISPLAY_NAME || 'Kasir Shift 1'
  }
];
