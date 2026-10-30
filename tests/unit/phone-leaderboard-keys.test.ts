import assert from 'node:assert/strict';
import test from 'node:test';
import { leaderboardRowKey } from '../../src/phone/leaderboard-row-key';

// NIT-7: PhoneSuite.tsx used to key each phone leaderboard row by `${rank}-${name}`. Two tied players
// who also share a display name (for example both flagged to "Player" by the DEF-32 filter) then
// produced the exact same key, a real React key collision. The wire entry carries only the four fields
// the production relay accepts, so the key is built from the rank and the row's place in the list.
test('two tied, same-named leaderboard rows get different keys (NIT-7)', () => {
  const tiedSameName = { rank: 1, name: 'Player', score: 100, team: null as null };
  assert.notEqual(leaderboardRowKey(tiedSameName, 0), leaderboardRowKey({ ...tiedSameName }, 1));
});

test('the same row in the same place always produces the same key (stable across re-renders)', () => {
  const row = { rank: 2, name: 'Ada', score: 50, team: 'NAVY' as const };
  assert.equal(leaderboardRowKey(row, 1), leaderboardRowKey({ ...row }, 1));
});
