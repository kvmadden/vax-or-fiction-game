import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('hud.css defines strict single-row layout and zero flex-wrap on presenter-hud', () => {
  const cssPath = path.resolve('src/styles/hud.css');
  assert.equal(fs.existsSync(cssPath), true, 'src/styles/hud.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#presenter-hud/);
  assert.match(css, /height:\s*48px/);
  assert.match(css, /overflow:\s*hidden/);
});

test('HUD.tsx does not use flex-wrap on the main toolbar container', () => {
  const tsx = fs.readFileSync(path.resolve('src/facilitator/HUD.tsx'), 'utf8');
  assert.doesNotMatch(tsx, /flex-wrap md:flex-nowrap/);
  assert.match(tsx, /hud-bar/);
});

test('hud.css defines semantic token classes and responsive collapse under 1200px', () => {
  const cssPath = path.resolve('src/styles/hud.css');
  assert.equal(fs.existsSync(cssPath), true, 'src/styles/hud.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.hud-button-ghost/);
  assert.match(css, /\.hud-button-primary/);
  assert.doesNotMatch(
    css,
    /\.hud-button-(?:ghost|primary)\s*\{[^}]*transition:\s*all/,
    'HUD buttons must not transition:all — mute label width must not animate',
  );
  assert.match(css, /\.hud-chip/);
  assert.match(css, /\.hud-cluster-flow/);
  assert.match(css, /\.hud-cluster-utilities/);
  assert.match(css, /@media\s*\(max-width:\s*1200px\)/);
  assert.match(css, /min-width:\s*44px/, 'utility buttons must meet 44pt touch target floor under 1200px');
  assert.match(css, /#hud-advance[\s\S]*min-width:\s*112px/, '#hud-advance must maintain 112px width');
});

test('index.css imports hud.css', () => {
  const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.match(css, /@import\s+['"]\.\/styles\/hud\.css['"]/);
});

// DS-15: pb-16 was a phantom clearance buffer (no CSS rule ever matched it, Tailwind is not part
// of this build) contributing 0px. Removed from PresentationSuite.tsx, see
// tests/unit/ds-pb16-removal.test.ts for the replacement coverage.
