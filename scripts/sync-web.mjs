import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'www');

const staticEntries = [
  'app-config.js',
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'icons'
];

async function syncStaticAssets() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const entry of staticEntries) {
    const from = path.join(rootDir, entry);
    const to = path.join(outputDir, entry);
    await cp(from, to, { recursive: true });
  }
}

async function printSummary() {
  const items = await readdir(outputDir, { withFileTypes: true });
  const names = items.map((item) => item.name).join(', ');
  console.log(`Web assets ready in ${outputDir}`);
  console.log(`Included: ${names}`);
}

await syncStaticAssets();
await printSummary();
