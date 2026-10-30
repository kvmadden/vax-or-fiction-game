import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DS-05: the title/entry screen's clamp() bounds in
// src/styles/opening-stage.css sit off the approved 4/8/12/16/24/32/48/64 scale. The approved
// scale has no step above 64, so any bound over 64 snaps down to it. A bound exactly between two
// steps (28px, between 24 and 32) snaps up, matching DS-04's tie-break so the two spacing items in
// this batch round ties the same direction.
const APPROVED_PX = new Set([4, 8, 12, 16, 24, 32, 48, 64]);

function offScaleClampBounds(css: string): string[] {
  const findings: string[] = [];
  for (const clampMatch of css.matchAll(/clamp\(([^,]+),[^,]+,([^)]+)\)/g)) {
    for (const bound of [clampMatch[1], clampMatch[2]]) {
      const pxMatch = bound.trim().match(/^(\d+(?:\.\d+)?)px$/);
      if (pxMatch && !APPROVED_PX.has(Number(pxMatch[1]))) {
        findings.push(`${pxMatch[1]}px in "${clampMatch[0]}"`);
      }
    }
  }
  return findings;
}

test(".entry-screen and .entry-actions clamp() bounds stay on the approved spacing scale (DS-05)", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../src/styles/opening-stage.css"), "utf8");
  const entrySection = css.slice(css.indexOf(".entry-screen {"), css.indexOf(".entry-screen::after"));
  const actionsSection = css.slice(css.indexOf(".entry-actions {"), css.indexOf(".entry-actions button"));
  assert.deepEqual(offScaleClampBounds(entrySection), []);
  assert.deepEqual(offScaleClampBounds(actionsSection), []);

  // The two on-canonical-phone-and-desktop pins: gap and padding-top minimums moved from 28 to the
  // scale step above it (32), never below what shipped, and every bound over 64 was capped at 64
  // rather than left to grow past the scale's top step.
  assert.match(entrySection, /gap:\s*clamp\(32px,\s*5vh,\s*64px\)/);
  assert.match(entrySection, /padding:\s*clamp\(32px,\s*6vh,\s*64px\)\s*clamp\(24px,\s*5vw,\s*64px\)\s*clamp\(32px,\s*7vh,\s*64px\)/);
  assert.match(actionsSection, /margin-top:\s*clamp\(32px,\s*4vh,\s*48px\)/);
});

test("the clamp scanner actually catches an off-scale bound (control)", () => {
  assert.deepEqual(offScaleClampBounds(".x { padding: clamp(28px, 5vh, 72px); }"), ["28px in \"clamp(28px, 5vh, 72px)\"", "72px in \"clamp(28px, 5vh, 72px)\""]);
});
