import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialHudVisibility, shouldRevealFromPointer } from '../../src/facilitator/hud-auto-hide.ts';

test('getInitialHudVisibility returns true for compact screens (<= 600px)', () => {
  assert.equal(getInitialHudVisibility(400), true);
  assert.equal(getInitialHudVisibility(600), true);
  assert.equal(getInitialHudVisibility(601), false);
  assert.equal(getInitialHudVisibility(1440), false);
  assert.equal(getInitialHudVisibility(undefined), false);
});

test('shouldRevealFromPointer obeys audience presentation flag', () => {
  assert.equal(shouldRevealFromPointer(true), false, 'Audience presentation disables pointer reveal');
  assert.equal(shouldRevealFromPointer(false), true, 'Facilitator presentation allows pointer reveal');
});
