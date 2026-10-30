import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function token(name: string): string {
  const css = readFileSync(resolve(import.meta.dirname, "../../src/design/tokens.css"), "utf8");
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{3,8}|\\d+px)`));
  assert.ok(match, `${name} is a painted token`);
  return match[1]!;
}

// WCAG 2.1 Relative Luminance & Contrast Calculation Utilities
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function sRgbToLin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(sRgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// 1. Defect A11Y-01 / JUDGE-A01: Mobile Vote Buttons Color Contrast Ratio >= 4.5:1
test("A11Y-01 / JUDGE-A01: colorTokens.answerFalse guarantees >= 4.5:1 contrast against #ffffff text (WCAG 1.4.3 AA)", () => {
  const answerFalse = token("--color-answer-false");
  const light = token("--color-light");
  const falseContrast = contrastRatio(light, answerFalse);
  assert.equal(answerFalse, "#C2410C", "answer false is deep vermillion #C2410C");
  assert.ok(
    falseContrast >= 4.5,
    `answer false contrast against white must be >= 4.5:1 (got ${falseContrast.toFixed(2)}:1)`
  );
});

test("A11Y-01 / JUDGE-A01: colorTokens.answerTrue guarantees >= 4.5:1 contrast against #ffffff text (WCAG 1.4.3 AA)", () => {
  const answerTrue = token("--color-answer-true");
  const light = token("--color-light");
  const trueContrast = contrastRatio(light, answerTrue);
  assert.equal(answerTrue, "#0F766E", "answer true is deep forest teal #0F766E");
  assert.ok(
    trueContrast >= 4.5,
    `answer true contrast against white must be >= 4.5:1 (got ${trueContrast.toFixed(2)}:1)`
  );
});

test("A11Y-01 / JUDGE-A01: Mobile Vote buttons maintain 44px min touch target and token compliance", () => {
  assert.ok(parseInt(token("--kit-touch"), 10) >= 44, "Touch targets must maintain 44px floor");
  assert.match(
    readFileSync(resolve(import.meta.dirname, "../../src/design/tokens.css"), "utf8"),
    /--kit-radius-12:\s*var\(--kit-space-12\)/,
  );
});
