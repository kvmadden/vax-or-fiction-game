import assert from 'node:assert/strict';
import test from 'node:test';
import { KIND_POINTS, STREAK_BONUS_ROWS } from '../../src/engine/points-table';
import { KIND_BASE_POINTS, score } from '../../src/engine/scoring';

// The player-facing points table (solo's topic pick and the room phone's seat) must say what the engine pays.
// A drift here tells a player the wrong number for a whole game.

test('each kind row matches KIND_BASE_POINTS and what score() pays a first right answer', () => {
  const byLabel = new Map(KIND_POINTS.map((row) => [row.label, row.points]));
  const kindsFor: Record<string, readonly (keyof typeof KIND_BASE_POINTS)[]> = {
    'True or false': ['binary'],
    'Estimate or myth': ['estimate', 'myth-among-three'],
    'Which patient': ['which-patient'],
    'Put in order': ['order'],
  };
  assert.deepEqual([...byLabel.keys()].sort(), Object.keys(kindsFor).sort(), 'one row per label, and no other rows');
  for (const [label, kinds] of Object.entries(kindsFor)) {
    for (const kind of kinds) {
      assert.equal(byLabel.get(label), KIND_BASE_POINTS[kind], `${label} is KIND_BASE_POINTS.${kind}`);
      assert.equal(byLabel.get(label), score(true, kind, 0).points, `${label} is what score() pays ${kind} with no streak`);
    }
  }
  const covered = new Set(Object.values(kindsFor).flat());
  assert.deepEqual([...covered].sort(), Object.keys(KIND_BASE_POINTS).sort(), 'every scored kind has a row');
});

test('the two bonus rows match the streak bonuses score() adds', () => {
  const [three, everyFifth] = STREAK_BONUS_ROWS;
  assert.equal(STREAK_BONUS_ROWS.length, 2);
  assert.equal(three?.points, score(true, 'binary', 2).streakBonus, 'a third right answer in a row');
  assert.equal(score(true, 'binary', 3).streakBonus, 0, 'a fourth in a row adds nothing, so the row names only the third');
  for (const current of [4, 9, 14]) {
    assert.equal(everyFifth?.points, score(true, 'binary', current).streakBonus, `streak ${current + 1} is a fifth`);
  }
});
