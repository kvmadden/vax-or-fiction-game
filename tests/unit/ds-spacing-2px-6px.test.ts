import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DS-06 and DEF-37 (verified: the same defect, flagged by two
// verifiers). Seven real padding/gap/margin declarations across 6 files sit at 2px or 6px, off the
// 4/8/12/16/24/32/48/64 scale. 2px is below the 4px floor, so it only has one direction to snap.
// 6px is equidistant between 4 and 8, so it snaps up (matching DS-04/DS-05's tie-break), never
// tightening a gap that already read a little loose.
const root = resolve(import.meta.dirname, "../..");
function read(relPath: string): string {
  return readFileSync(resolve(root, relPath), "utf8");
}

test("hud.css: #presenter-hud padding no longer uses the off-scale 2px (DS-06)", () => {
  const css = read("src/styles/hud.css");
  assert.doesNotMatch(css, /padding:\s*2px\s+16px/);
  assert.match(css, /padding:\s*4px\s+16px/);
});

test("keyboard-help.css: .shortcut-copy gap no longer uses the off-scale 2px (DS-06)", () => {
  const css = read("src/styles/keyboard-help.css");
  assert.doesNotMatch(css, /\.shortcut-copy\s*\{[^}]*gap:\s*2px/);
  assert.match(css, /\.shortcut-copy\s*\{[^}]*gap:\s*4px/);
});

test("opening-stage.css: .now-playing-bars gap and margin-bottom no longer use the off-scale 6px (DS-06, DEF-37)", () => {
  const css = read("src/styles/opening-stage.css");
  const rule = css.slice(css.indexOf(".now-playing-bars {"), css.indexOf(".now-playing-bars {") + 200);
  assert.doesNotMatch(rule, /gap:\s*6px/);
  assert.doesNotMatch(rule, /margin-bottom:\s*6px/);
  assert.match(rule, /gap:\s*8px/);
  assert.match(rule, /margin-bottom:\s*8px/);
});

test("remote-clicker.css: the Key and Tip blocks space on the kit scale, never the off-scale 6px (DS-06)", () => {
  // The Key and Tip labels sit on their own line over their values, so their spacing is vertical now.
  const css = read("src/styles/remote-clicker.css");
  assert.doesNotMatch(css, /:\s*(?:2|6)px/, "no off-scale 2px or 6px anywhere in the pad");
  assert.match(css, /\.remote-clicker__cue \.remote-clicker__key \{[^}]*margin-top:\s*var\(--kit-space-12\)/);
  assert.match(css, /\.remote-clicker__cue \.remote-clicker__tip \{[^}]*margin-top:\s*var\(--kit-space-16\)/);
});

test("preshow-stage.css: .setup-facilitator-steps li gap no longer uses the off-scale 2px (DS-06)", () => {
  const css = read("src/styles/preshow-stage.css");
  assert.doesNotMatch(css, /\.setup-facilitator-steps li\s*\{[^}]*gap:\s*2px/);
  assert.match(css, /\.setup-facilitator-steps li\s*\{[^}]*gap:\s*4px/);
});

test("restart-run.css: .restart-run-note-icon margin-top no longer uses the off-scale 2px (DS-06)", () => {
  const css = read("src/styles/restart-run.css");
  assert.doesNotMatch(css, /\.restart-run-note-icon\s*\{[^}]*margin-top:\s*2px/);
  assert.match(css, /\.restart-run-note-icon\s*\{[^}]*margin-top:\s*4px/);
});
