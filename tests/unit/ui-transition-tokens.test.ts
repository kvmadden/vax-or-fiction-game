import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('tokens.css declares standardized transition custom properties', () => {
  const css = fs.readFileSync(path.resolve('src/styles/tokens.css'), 'utf8');
  assert.match(css, /--transition-instant:\s*100ms/);
  assert.match(css, /--transition-quick:\s*180ms/);
  assert.match(css, /--transition-smooth:\s*260ms/);
  assert.match(css, /--ease-standard:/);
});
