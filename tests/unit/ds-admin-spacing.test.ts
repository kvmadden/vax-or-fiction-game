import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DS-04: admin.css has 14 padding/margin/gap declarations at
// off-scale fractional-rem values. The approved scale is 4/8/12/16/24/32/48/64px (border,
// border-radius and animation/transition offsets are not spacing and are excluded, matching how
// DS.md itself scoped the count).
const APPROVED_PX = new Set([0, 4, 8, 12, 16, 24, 32, 48, 64]);
const REM_PX = 16;

// NIT: a hex-style CSS comment can wrap a spacing declaration too (documenting an old value, or
// commenting one out), and it is not a real, live declaration either way. Stripped before scanning
// so a value mentioned only in a comment is never flagged.
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function offScaleSpacingFindings(css: string): string[] {
  const findings: string[] = [];
  // One declaration per match: a spacing property, then its value up to the semicolon. `padding`
  // previously had no `(?:-top|-bottom|-left|-right)?` suffix group (unlike margin, right next to
  // it), so padding-top/-bottom/-left/-right declarations were silently skipped. rawValue's inner
  // scan previously matched only `rem`, so a plain px value (padding: 5px) was never checked
  // against the approved scale at all. The logical-property suffixes (-inline, -inline-start,
  // -inline-end, -block, -block-start, -block-end) were missing too, so padding-inline: 5px or
  // margin-block-end: 0.35rem would silently pass unscanned.
  const declRe = /\b((?:padding|margin)(?:-top|-bottom|-left|-right|-inline|-inline-start|-inline-end|-block|-block-start|-block-end)?|gap)\s*:\s*([^;]+);/g;
  for (const decl of stripCssComments(css).matchAll(declRe)) {
    const [, prop, rawValue] = decl;
    for (const valueMatch of rawValue.matchAll(/(-?\d*\.?\d+)(rem|px)\b/g)) {
      const [, numberStr, unit] = valueMatch;
      const px = unit === "rem"
        ? Math.round(Number(numberStr) * REM_PX * 100) / 100
        : Math.round(Number(numberStr) * 100) / 100;
      if (!APPROVED_PX.has(px)) {
        findings.push(`${prop}: ${valueMatch[0]} (${px}px) in "${prop}: ${rawValue.trim()}"`);
      }
    }
  }
  return findings;
}

test("admin.css spacing (padding/margin/gap) stays on the approved 4/8/12/16/24/32/48/64 scale (DS-04)", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../src/styles/admin.css"), "utf8");
  assert.deepEqual(offScaleSpacingFindings(css), []);
});

test("the off-scale scanner actually catches an off-scale value (control)", () => {
  const findings = offScaleSpacingFindings(".x { padding: 0.35rem; gap: 1rem; }");
  assert.deepEqual(findings, ['padding: 0.35rem (5.6px) in "padding: 0.35rem"']);
});

test("the scanner also catches off-scale padding-* directions and raw px values (control)", () => {
  // padding-top has no bare `padding` alternative to match under (fixed), 5px is off-scale (fixed
  // px support). padding-left: 16px and margin-right: 4px are both on-scale and must not appear.
  const findings = offScaleSpacingFindings(".x { padding-top: 5px; padding-left: 16px; margin-right: 4px; }");
  assert.deepEqual(findings, ['padding-top: 5px (5px) in "padding-top: 5px"']);
});

test("the scanner also catches off-scale logical padding and margin properties (control)", () => {
  const findings = offScaleSpacingFindings(
    ".x { padding-inline: 5px; padding-inline-start: 8px; padding-block-end: 0.35rem; margin-block: 16px; }",
  );
  assert.deepEqual(findings, [
    'padding-inline: 5px (5px) in "padding-inline: 5px"',
    'padding-block-end: 0.35rem (5.6px) in "padding-block-end: 0.35rem"',
  ]);
});

test("the scanner ignores a spacing declaration written only inside a CSS comment (control)", () => {
  const findings = offScaleSpacingFindings("/* was padding: 5px, now on-scale */\n.x { padding: 16px; }\n/* gap: 0.35rem */");
  assert.deepEqual(findings, [], "a declaration mentioned only in a comment is not real, live CSS");
});
