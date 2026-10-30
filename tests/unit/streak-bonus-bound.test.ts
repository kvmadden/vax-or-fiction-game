import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_STREAK_BONUS, score } from '../../src/engine/scoring';

// The relay, the client guard and the production validator all cap streakBonus at MAX_STREAK_BONUS.
// This ties that cap to what score() can really return, so changing the milestones in score() without
// moving the cap (or the reverse) fails here instead of silently dropping phone states on the wire.
test('every streak bonus score() can return is a whole number from 0 to MAX_STREAK_BONUS, and the cap is reached', () => {
  const kinds = ['binary', 'estimate', 'myth-among-three', 'which-patient', 'order'] as const;
  const seen = new Set<number>();
  let checked = 0;
  for (const kind of kinds) {
    for (let streak = 0; streak <= 200; streak += 1) {
      for (const isRight of [true, false]) {
        const { streakBonus } = score(isRight, kind, streak);
        assert.ok(Number.isInteger(streakBonus), `${kind} streak ${streak} gives a whole number`);
        assert.ok(streakBonus >= 0 && streakBonus <= MAX_STREAK_BONUS, `${kind} streak ${streak} gives ${streakBonus}, inside 0 to ${MAX_STREAK_BONUS}`);
        seen.add(streakBonus);
        checked += 1;
      }
    }
  }
  assert.equal(Math.max(...seen), MAX_STREAK_BONUS, 'the largest real bonus is exactly the cap, so the cap is not looser than it needs to be');
  console.log(`coverage: ${checked} score() calls, bonuses seen ${[...seen].sort((a, b) => a - b).join(', ')}`);
});
