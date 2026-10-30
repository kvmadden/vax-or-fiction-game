import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { presentationBundle } from './css-declarations';

// These class names are built with template strings at runtime
// (question-show-frame--${kind}, phone-vote-choice--${token}, show-scrim--${scrim}).
// They have to appear as literals in the stylesheet. Tailwind is gone, so nothing
// purges a rule whose class is only assembled in JavaScript.
describe('Dynamic presentation classes are written in the stylesheet', () => {
  const css = presentationBundle();
  const variants = [...new Set([...css.matchAll(/(?:question-show-frame|phone-vote-choice|show-scrim)--[a-z0-9-]+/g)].map((m) => m[0]))];

  it('finds the dynamic families in the stylesheet', () => {
    assert.ok(variants.length >= 8, `expected at least 8 dynamic variants, found ${variants.length}`);
  });

  it('does not depend on a Tailwind safelist', () => {
    assert.equal(fs.existsSync(path.resolve(process.cwd(), 'tailwind.config.js')), false);
    const postcss = fs.readFileSync(path.resolve(process.cwd(), 'postcss.config.js'), 'utf8');
    assert.doesNotMatch(postcss, /tailwindcss/);
    assert.doesNotMatch(css, /@tailwind/);
  });
});
