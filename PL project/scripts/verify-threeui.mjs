import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'vendor/threeui/source-manifest.json'), 'utf8'));
for (const file of manifest.files) {
  const bytes = await readFile(path.join(root, file.destination));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256 || bytes.length !== file.bytes) throw new Error(`ThreeUI source mismatch: ${file.path}`);
}
console.log(`Verified ${manifest.files.length} exact ThreeUI source files and assets (${manifest.revision}).`);
