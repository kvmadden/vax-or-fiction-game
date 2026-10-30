/**
 * Writes src/looks/patterns/topic-index.ts (VOF-94): the pattern family of every bundled question.
 *
 *   npm run patterns:index            write the index and list every family with its questions
 *   npm run patterns:index -- --check  list only, and fail when the committed index is not what the decks say
 *
 * Run it whenever a question is added or its stem changes. The derivation lives in pattern-index-lib.mjs, which
 * tests/unit/topic-pattern-families.test.ts holds the committed index to.
 */
import fs from 'node:fs';
import process from 'node:process';
import { PATTERN_FAMILIES } from '../src/looks/patterns/families.ts';
import { deriveIndex, loadDecks, renderIndex } from './pattern-index-lib.mjs';

const OUT = new URL('../src/looks/patterns/topic-index.ts', import.meta.url);
const check = process.argv.includes('--check');

const { rows, byKey, problems } = deriveIndex(await loadDecks());
const next = renderIndex(byKey);
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log(`questions ${rows.length}, unique stems ${byKey.size}, families ${new Set(rows.map((row) => row.family)).size}`);
for (const family of Object.keys(PATTERN_FAMILIES)) {
  const mine = rows.filter((row) => row.family === family);
  console.log(`\n${PATTERN_FAMILIES[family].label} (${family}) ${mine.length} questions`);
  for (const row of mine) console.log(`  ${row.key} [${row.via}] ${row.statement.slice(0, 110)}`);
}

if (problems.length) {
  console.error(`\nPROBLEMS\n${problems.join('\n')}`);
  process.exit(1);
}
if (check) {
  if (current !== next) {
    console.error('\nsrc/looks/patterns/topic-index.ts is out of date. Run: npm run patterns:index');
    process.exit(1);
  }
  console.log('\nthe committed index matches the decks');
} else {
  fs.writeFileSync(OUT, next);
  console.log(`\nwrote ${OUT.pathname}`);
}
