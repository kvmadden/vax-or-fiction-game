import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const APPROVED = new Set([4, 8, 12, 16, 24, 32, 48, 64]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(css|tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('every --kit-space-N reference resolves to an approved tokens.css step', () => {
  const tokens = fs.readFileSync(path.join(root, 'src/design/tokens.css'), 'utf8');
  const defined = new Set(
    [...tokens.matchAll(/--kit-space-(\d+):\s*(\d+)px/g)].map(([, key, val]) => {
      assert.ok(APPROVED.has(Number(val)), `--kit-space-${key}: ${val}px is off the approved scale`);
      return key;
    }),
  );

  const missing: string[] = [];
  for (const file of walk(path.join(root, 'src'))) {
    if (file.endsWith(`${path.sep}tokens.css`)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/--kit-space-(\d+)\b/g)) {
      if (!defined.has(match[1])) {
        missing.push(`${path.relative(root, file)}: --kit-space-${match[1]}`);
      }
    }
  }
  assert.deepEqual(missing, [], `phantom kit-space tokens:\n${missing.join('\n')}`);
});
