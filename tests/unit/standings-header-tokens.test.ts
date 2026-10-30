import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Leaderboard uses STANDINGS header label and aria-label', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Leaderboard.tsx'), 'utf8');
  assert.match(tsx, /<span>STANDINGS<\/span>/);
  assert.doesNotMatch(tsx, /<span>TOP 5<\/span>/);
  assert.match(tsx, /Standings through question/);
});
