import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('phone.css defines dynamic viewport height and safe-area clearances', () => {
  const cssPath = path.resolve('src/styles/phone.css');
  assert.equal(fs.existsSync(cssPath), true, 'src/styles/phone.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\.phone-option-card/);
  assert.match(css, /min-height:\s*48px/);
});

test('phone.css is imported in src/index.css', () => {
  const indexCss = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.match(indexCss, /@import\s+['"]\.\/styles\/phone\.css['"]/);
});

test('PhoneVote.tsx removes window.innerHeight < 700 compactViewport hack', () => {
  const tsx = fs.readFileSync(path.resolve('src/phone/PhoneVote.tsx'), 'utf8');
  assert.doesNotMatch(tsx, /window\.innerHeight\s*<\s*700/);
});

test('phone.css removes double safe-area inset from phone-layout-container and defines score bar styles', () => {
  const css = fs.readFileSync(path.resolve('src/styles/phone.css'), 'utf8');
  assert.doesNotMatch(css, /\.phone-layout-container\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/);
  assert.match(css, /\.phone-reveal-score-bar/);
  assert.match(css, /background-color:\s*var\(--color-panel-navy\)/);
  assert.match(css, /border:\s*1px solid var\(--color-hairline\)/);
});

test('PhoneLayout.tsx and PhoneReveal.tsx eliminate redundant inline styles', () => {
  const layoutTsx = fs.readFileSync(path.resolve('src/phone/PhoneLayout.tsx'), 'utf8');
  assert.doesNotMatch(layoutTsx, /paddingBottom:\s*showFooter/);
  const revealTsx = fs.readFileSync(path.resolve('src/phone/PhoneReveal.tsx'), 'utf8');
  assert.doesNotMatch(revealTsx, /data-role="phone-reveal-score-bar"[^>]*style=\{\{/);
});
