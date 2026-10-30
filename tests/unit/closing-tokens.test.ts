import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { presentationBundle } from './css-declarations';

describe('Task 3.2 / DS-02: Closing.tsx CSS Variable Tokens', () => {
  const closingPath = path.resolve(process.cwd(), 'src/screens/Closing.tsx');
  const tokensCssPath = path.resolve(process.cwd(), 'src/design/tokens.css');
  const closingContent = fs.readFileSync(closingPath, 'utf8');
  const presentationCss = presentationBundle();
  const closingCss = presentationCss.slice(presentationCss.indexOf('/* Closing:'));
  const critiqueCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/closing-critique.css'), 'utf8');
  const closingStyles = `${closingContent}\n${closingCss}\n${critiqueCss}`;
  const tokensCss = fs.readFileSync(tokensCssPath, 'utf8');

  it('DS-02: Closing.tsx contains 0 camelCase typo CSS variables', () => {
    const forbiddenTypos = [
      '--color-accentTeal',
      '--color-anticipationGold',
      '--color-verdictTrue',
      '--color-textPrimary',
    ];

    for (const typo of forbiddenTypos) {
      const count = (closingStyles.match(new RegExp(typo, 'g')) || []).length;
      assert.strictEqual(
        count,
        0,
        `Expected 0 occurrences of camelCase typo '${typo}' in Closing.tsx, found ${count}`
      );
    }
  });

  it('DS-02: Closing styles use the shared color tokens', () => {
    assert.ok(presentationCss.includes('/* Closing:'), 'Closing stylesheet section must exist');
    const colors = [...closingStyles.matchAll(/var\(\s*(--color-[a-zA-Z0-9_-]+)/g)];
    assert.ok(colors.length > 0, 'Closing must reference shared colors, not silently check zero tokens');
  });

  it('closing-critique.css carries no raw hex colours and only scale spacing', () => {
    assert.strictEqual((critiqueCss.match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0, 'closing-critique.css must use var(--color-*) tokens, not hex');
    const pixelValues = [...critiqueCss.matchAll(/(?<![\w-])(\d+)px/g)].map((match) => Number(match[1]));
    const offScale = pixelValues.filter((value) => value > 0 && value < 100 && ![1, 2, 4, 8, 12, 16, 24, 32, 48, 64].includes(value) && ![18, 20, 22, 26, 28, 30, 36, 40, 44, 56, 72, 80, 96].includes(value));
    assert.deepEqual(offScale, [], 'spacing stays on the 4/8/12/16/24/32/48/64 scale (type sizes and the 44pt floor excepted)');
  });

  it('DS-02: All var(--color-*) invocations in Closing.tsx exist in tokens.css', () => {
    const declaredTokens = new Set([...tokensCss.matchAll(/--[a-zA-Z0-9_-]+/g)].map((m) => m[0]));
    const matches = [...closingStyles.matchAll(/var\(\s*(--color-[a-zA-Z0-9_-]+)\s*\)/g)];
    assert.ok(matches.length > 0, 'Closing color token coverage must not be empty');

    const undeclaredVars: string[] = [];
    for (const match of matches) {
      const varName = match[1];
      if (!declaredTokens.has(varName)) {
        undeclaredVars.push(varName);
      }
    }

    assert.strictEqual(
      undeclaredVars.length,
      0,
      `Closing.tsx has undeclared CSS variables: ${[...new Set(undeclaredVars)].join(', ')}`
    );
  });
});
