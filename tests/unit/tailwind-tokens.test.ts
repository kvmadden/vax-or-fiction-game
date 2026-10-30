import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const tokensCss = fs.readFileSync(path.resolve(process.cwd(), 'src/design/tokens.css'), 'utf8');

describe('DS-01: tokens.css is the palette', () => {
  it('declares the semantic colors', () => {
    for (const varName of [
      '--color-canvas-navy',
      '--color-panel-navy',
      '--color-accent-teal',
      '--color-accent-cobalt',
      '--color-verdict-true',
      '--color-verdict-false',
    ]) {
      assert.match(tokensCss, new RegExp(`${varName}:`), `tokens.css must declare ${varName}`);
    }
  });

  it('declares the spacing scale', () => {
    for (const px of [4, 8, 12, 16, 24, 32, 48, 64]) {
      assert.match(tokensCss, new RegExp(`--kit-space-${px}:\\s*${px}px`));
    }
  });

  it('is not routed through Tailwind', () => {
    assert.equal(fs.existsSync(path.resolve(process.cwd(), 'tailwind.config.js')), false);
    const postcss = fs.readFileSync(path.resolve(process.cwd(), 'postcss.config.js'), 'utf8');
    assert.doesNotMatch(postcss, /tailwindcss/);
  });
});
