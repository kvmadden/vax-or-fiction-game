import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DS-12: the DELIBERATING badge on the estimate question screen and
// the presenter remote's Tip/Key labels render at 11px, live and reachable. Raised both to the
// 12px floor. (EstimateQuestion.tsx's "Most common" note at :416 also carries an inline fontSize:11,
// but presentation.css:544 overrides it to 26px with !important, so DS.md confirmed it never
// actually renders at 11px and it is not part of this defect.)

test("EstimateQuestion's DELIBERATING badge is at least 12px (DS-12)", () => {
  const tsx = readFileSync(resolve(import.meta.dirname, "../../src/screens/questions/EstimateQuestion.tsx"), "utf8");
  const deliberatingIndex = tsx.indexOf("DELIBERATING");
  const spanStart = tsx.lastIndexOf("<span", deliberatingIndex);
  assert.ok(spanStart >= 0 && deliberatingIndex - spanStart < 600, "the DELIBERATING text must sit inside a nearby <span");
  const badge = tsx.slice(spanStart, deliberatingIndex);
  const sizeMatch = badge.match(/fontSize:\s*(\d+)/);
  assert.ok(sizeMatch, "the DELIBERATING badge must declare an explicit fontSize");
  assert.ok(Number(sizeMatch[1]) >= 12, `DELIBERATING badge fontSize must be >= 12, got ${sizeMatch[1]}`);
});

test("the remote's Tip/Key labels are at least 12px (DS-12)", () => {
  // The presenter's pad labels its Key and Tip (and the audience code) with .remote-clicker__label.
  const css = readFileSync(resolve(import.meta.dirname, "../../src/styles/remote-clicker.css"), "utf8");
  const start = css.indexOf(".remote-clicker__label {");
  assert.ok(start >= 0, "the Tip/Key label rule must exist");
  const rule = css.slice(start, css.indexOf("}", start));
  const sizeMatch = rule.match(/font-size:\s*(\d+)px/);
  assert.ok(sizeMatch, "the Tip/Key rule must declare an explicit font-size");
  assert.ok(Number(sizeMatch[1]) >= 12, `Tip/Key font-size must be >= 12px, got ${sizeMatch[1]}px`);
});
