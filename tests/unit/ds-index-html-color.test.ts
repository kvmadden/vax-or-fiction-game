import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DS-02: index.html hardcodes the pre-paint page background so the
// window never flashes white before the stylesheet loads (real FOUC prevention, not a component,
// so a var() reference there is not viable). It must stay byte-equal to --color-stage-deep, and
// this test is the drift guard: it fails if either the literal loses its DS-02 marker comment or
// the two values ever disagree.

test("index.html's pre-paint background stays pinned to --color-stage-deep (DS-02)", () => {
  const html = readFileSync(resolve(import.meta.dirname, "../../index.html"), "utf8");
  const tokens = readFileSync(resolve(import.meta.dirname, "../../src/design/tokens.css"), "utf8");

  const tokenMatch = tokens.match(/--color-stage-deep:\s*(#[0-9a-fA-F]{3,8})/);
  assert.ok(tokenMatch, "--color-stage-deep must be declared in tokens.css");
  const tokenValue = tokenMatch[1].toLowerCase();

  // The DS-02 marker comment is the pin: it names the token this literal must never drift from,
  // so a future edit to either side is caught here instead of silently.
  assert.match(
    html,
    /DS-02[^\n]*--color-stage-deep/i,
    "index.html must carry a comment tying its pre-paint background to --color-stage-deep",
  );

  const styleMatch = html.match(/<style>\s*html,\s*body\s*\{\s*background:\s*(#[0-9a-fA-F]{3,8})\s*\}\s*<\/style>/);
  assert.ok(styleMatch, "index.html must set html,body background inline before the stylesheet loads");
  assert.equal(
    styleMatch[1].toLowerCase(),
    tokenValue,
    `index.html's pre-paint background (${styleMatch[1]}) must match --color-stage-deep (${tokenValue})`,
  );
});
