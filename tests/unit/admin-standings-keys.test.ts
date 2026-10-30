import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { leaderboardRowKey } from '../../src/phone/leaderboard-row-key';
import type { ArchiveStanding } from '../../src/network/game-archive';

// ADMIN-KEYS: the admin archive keyed each standings row by its rank plus nickname. Two players tied on
// score who also share a name (both "Player" after the DEF-32 filter, say) produced the same key, the same
// collision NIT-7 fixed on the phone board. React reports duplicate keys only while rendering in a browser,
// and the standings render only after a signed-in archive fetch, so this reads the key expression the
// standings list actually uses in Admin.tsx and runs it on tied rows. Comments are stripped first, and the
// list must appear exactly once, so a commented-out copy cannot stand in for the real one.
const source = fs.readFileSync(new URL('../../src/screens/Admin.tsx', import.meta.url), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function standingsRowKey(): (row: ArchiveStanding, index: number) => string {
  const matches = [...source.matchAll(/selected\.standings\.map\(\(([^)]*)\)\s*=>\s*\(\s*<li key=\{(.+?)\}>/gs)];
  assert.equal(matches.length, 1, 'test setup: exactly one standings row list, outside comments, in Admin.tsx');
  const [, rawParams, keyExpression] = matches[0];
  const params = rawParams.split(',').map((param) => param.trim()).filter(Boolean);
  const keyOf = new Function('leaderboardRowKey', ...params, `return (${keyExpression});`);
  return (row, index) => String(keyOf(leaderboardRowKey, row, index));
}

const tied = (nickname: string): ArchiveStanding => ({
  rank: 1, nickname, score: 300, bestStreak: 2, hardQuestionPoints: 0, realityGap: 0, team: null,
});

test('two tied, same-named standings rows in the admin archive get different keys (ADMIN-KEYS)', () => {
  const keyFor = standingsRowKey();
  const rows = [tied('Player'), tied('Player'), { ...tied('Ada'), rank: 3, score: 100 }];
  const keys = rows.map((row, index) => keyFor(row, index));
  assert.equal(new Set(keys).size, rows.length, `every standings row needs its own key, got ${JSON.stringify(keys)}`);
});

test('a standings row keeps its key across re-renders while its place holds, as on the phone board (ADMIN-KEYS)', () => {
  const keyFor = standingsRowKey();
  assert.equal(keyFor(tied('Ada'), 1), keyFor({ ...tied('Ada') }, 1));
  assert.equal(keyFor(tied('Ada'), 1), leaderboardRowKey({ rank: 1 }, 1), 'the admin rows use the same rank-and-place key as the phone board');
});

// The key expression above runs with the phone board's own helper in scope, so Admin.tsx must use that
// helper, imported, rather than a local function of the same name that could key by name again.
test('the admin standings key comes from the shared phone board helper, not a local copy (ADMIN-KEYS)', () => {
  assert.match(source, /import \{ leaderboardRowKey \} from '\.\.\/phone\/leaderboard-row-key';/);
  assert.doesNotMatch(source, /\b(?:function|const|let|var)\s+leaderboardRowKey\b/);
});
