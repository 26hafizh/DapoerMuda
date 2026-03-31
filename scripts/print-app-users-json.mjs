import { readFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeRole(value) {
  return String(value ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeUser(user, index) {
  const login = normalizeWhitespace(user?.login).toLowerCase();
  const password = String(user?.password ?? '');
  const displayName = normalizeWhitespace(user?.displayName) || login;
  const role = normalizeRole(user?.role);

  if (!login) {
    throw new Error(`User #${index + 1} wajib punya login.`);
  }

  if (!password) {
    throw new Error(`User ${login} wajib punya password.`);
  }

  return {
    login,
    password,
    displayName,
    role
  };
}

const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), 'users.seed.example.json');
const raw = await readFile(inputPath, 'utf8');
const parsed = JSON.parse(raw);

if (!Array.isArray(parsed)) {
  throw new Error('File user seed harus berupa array JSON.');
}

const normalizedUsers = parsed.map((user, index) => normalizeUser(user, index));
process.stdout.write(JSON.stringify(normalizedUsers));
