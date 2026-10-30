import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { playerVisibleRun } from '../../src/store/game-store';

test('player runs still drop focus, halftime, and fork slides', () => {
  const run = playerVisibleRun([
    { id: 'q1', type: 'question' },
    { id: 'focus', type: 'focus' },
    { id: 'half', type: 'halftime', halftime: true },
    { id: 'fork', type: 'fork' },
    { id: 'q2', type: 'question' },
  ] as never);
  assert.deepEqual(run.map((slide) => slide.id), ['q1', 'q2']);
});

test('retired interlude screens and their stylesheet are gone', () => {
  for (const file of [
    'src/screens/Focus.tsx',
    'src/screens/Halftime.tsx',
    'src/screens/Fork.tsx',
    'src/styles/interludes.css',
  ]) {
    assert.equal(fs.existsSync(path.resolve(file)), false, file);
  }
  const indexCss = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.doesNotMatch(indexCss, /interludes\.css/);
  const router = fs.readFileSync(path.resolve('src/screens/ScreenRouter.tsx'), 'utf8');
  assert.doesNotMatch(router, /from "\.\/Fork"/);
  assert.doesNotMatch(router, /<Fork/);
  assert.doesNotMatch(router, /slideType === "fork"\) return "Lobby"/);
});
