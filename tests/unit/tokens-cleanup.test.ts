import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
const APPROVED_SPACING = [0, 4, 8, 12, 16, 24, 32, 48, 64] as const;

describe('Task 3.3 / DS-03, DS-05, DS-06: Token & Stylesheet Hygiene', () => {
  it('DS-03: tokens.css defines --color-rim and --color-shadow with required RGBA values', () => {
    const tokensCssPath = path.resolve(process.cwd(), 'src/design/tokens.css');
    const tokensCss = fs.readFileSync(tokensCssPath, 'utf8');

    assert.match(
      tokensCss,
      /--color-rim:\s*rgba\(255,\s*255,\s*255,\s*0\.12\);/,
      'tokens.css must declare --color-rim with rgba(255, 255, 255, 0.12)'
    );

    assert.match(
      tokensCss,
      /--color-shadow:\s*rgba\(0,\s*0,\s*0,\s*0\.45\);/,
      'tokens.css must declare --color-shadow with rgba(0, 0, 0, 0.45)'
    );

    assert.match(
      tokensCss,
      /--kit-touch:\s*44px/,
      'tokens.css must declare the 44px touch floor'
    );
    assert.match(
      tokensCss,
      /--kit-touch-min:\s*max\(var\(--kit-space-64\), calc\(var\(--kit-touch\) \/ var\(--stage-scale, 1\)\)\)/,
      'tokens.css must keep a stage-scale-safe touch minimum'
    );
  });

  it('DS-05: tokens.css spacing steps stay on the approved scale and omit 5xl', () => {
    const tokensCss = fs.readFileSync(path.resolve(process.cwd(), 'src/design/tokens.css'), 'utf8');
    assert.doesNotMatch(tokensCss, /--kit-space-5xl/);
    const steps = [...tokensCss.matchAll(/--kit-space-(\d+):\s*(\d+)px/g)];
    assert.ok(steps.length >= 8, 'tokens.css declares the spacing steps');
    for (const [, key, val] of steps) {
      assert.ok(
        (APPROVED_SPACING as readonly number[]).includes(Number(val)),
        `--kit-space-${key} value ${val} must be on the approved scale`
      );
    }
    assert.equal(fs.existsSync(path.resolve(process.cwd(), 'src/design/tokens.ts')), false);
  });

  it('DS-05: TitleSlide and InstructionsSlide do not reference removed 5xl token', () => {
    const titleSlidePath = path.resolve(process.cwd(), 'src/screens/TitleSlide.tsx');
    const instructionsSlidePath = path.resolve(process.cwd(), 'src/screens/InstructionsSlide.tsx');

    const titleContent = fs.readFileSync(titleSlidePath, 'utf8');
    const instructionsContent = fs.readFileSync(instructionsSlidePath, 'utf8');

    assert.ok(
      !titleContent.includes('"5xl"'),
      'TitleSlide.tsx must not reference spacingScale["5xl"]'
    );
    assert.ok(
      !instructionsContent.includes('"5xl"'),
      'InstructionsSlide.tsx must not reference spacingScale["5xl"]'
    );
  });

  it('DS-06: Dead src/App.css is removed from filesystem', () => {
    const appCssPath = path.resolve(process.cwd(), 'src/App.css');
    assert.strictEqual(
      fs.existsSync(appCssPath),
      false,
      'src/App.css must be deleted from the repository'
    );
  });

  it('DS-06: src/App.tsx does not import App.css', () => {
    const appTsxPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
    assert.ok(
      !appTsxContent.includes("import './App.css'") && !appTsxContent.includes('import "./App.css"'),
      'src/App.tsx must not import App.css'
    );
  });
});
