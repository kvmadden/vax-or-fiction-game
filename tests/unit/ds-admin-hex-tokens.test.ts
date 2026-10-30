import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DS-01 / DS-03: admin.css carries 8 genuinely raw hex values with
// no token at all (the gradient stops at line 8, #111 and #ff8f7a at 107/120, and #0a1420 repeated
// at 55/157/184). The 6 other hex occurrences are `var(--token, #fallback)` defensive fallbacks and
// are not part of this defect. src/design/tokens.css is the one file allowed to hold hex.

const adminCssPath = resolve(import.meta.dirname, "../../src/styles/admin.css");
const tokensCssPath = resolve(import.meta.dirname, "../../src/design/tokens.css");

/**
 * Nit: the test below this one is titled "no raw hex left outside a var() fallback" but only
 * checked the 8 specific historical values DS-01/DS-03 named, so a different bare hex (already
 * present and missed, or added later by someone else) would not be caught even though the title
 * claims none remain. This scans every hex literal in the file and returns only the ones that
 * are not nested inside some var(...) call (a var(--token, #fallback) fallback is allowed, a bare
 * color:#fff or color-mix(in srgb, #fff, ...) is not), tracking paren depth so a fallback nested
 * inside another function (color-mix(in srgb, var(--x, #1e4d8c) 45%, transparent)) still counts
 * as inside a var call.
 */
function bareHexLiterals(css: string): string[] {
  const bare: string[] = [];
  const varStack: boolean[] = [];
  let i = 0;
  while (i < css.length) {
    // NIT: a hex literal written inside a CSS comment (documenting an old value, or a TODO) is not
    // a real declaration and must never be flagged. Skipped over entirely, including anything that
    // looks like a var( or paren inside it.
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (css.startsWith("var(", i)) {
      varStack.push(true);
      i += 4;
      continue;
    }
    if (css[i] === "(") {
      varStack.push(false);
      i += 1;
      continue;
    }
    if (css[i] === ")") {
      varStack.pop();
      i += 1;
      continue;
    }
    const hexMatch = /^#[0-9a-fA-F]{3,8}\b/.exec(css.slice(i));
    if (hexMatch) {
      if (!varStack.some(Boolean)) bare.push(hexMatch[0]);
      i += hexMatch[0].length;
      continue;
    }
    i += 1;
  }
  return bare;
}

test("tokens.css defines exact-value tokens for admin.css's raw colors (DS-01/DS-03)", () => {
  const tokens = readFileSync(tokensCssPath, "utf8");
  assert.match(tokens, /--color-admin-bg-gradient-1:\s*#07101c/i);
  assert.match(tokens, /--color-admin-bg-gradient-2:\s*#0c1828/i);
  assert.match(tokens, /--color-admin-bg-gradient-3:\s*#061018/i);
  assert.match(tokens, /--color-admin-surface:\s*#0a1420/i);
  assert.match(tokens, /--color-admin-primary-ink:\s*#111111/i);
  assert.match(tokens, /--color-admin-error-text:\s*#ff8f7a/i);
});

test("admin.css has no raw hex left outside a var() fallback (DS-01/DS-03)", () => {
  const admin = readFileSync(adminCssPath, "utf8");

  // The 8 genuinely raw occurrences must be gone as bare hex literals.
  assert.doesNotMatch(admin, /linear-gradient\(165deg,\s*#07101c/i, "gradient stop 1 must be tokenized");
  assert.doesNotMatch(admin, /#0c1828/i, "gradient stop 2 must be tokenized");
  assert.doesNotMatch(admin, /#061018/i, "gradient stop 3 must be tokenized");
  assert.doesNotMatch(admin, /color:\s*#111\b/i, ".admin-primary text color must be tokenized");
  assert.doesNotMatch(admin, /#ff8f7a/i, ".admin-error text color must be tokenized");
  assert.doesNotMatch(admin, /color-mix\(in srgb,\s*#0a1420/i, "the 3 repeated #0a1420 color-mix() calls must be tokenized");

  // Replacements are real token references, not new hex.
  assert.match(admin, /linear-gradient\(165deg,\s*var\(--color-admin-bg-gradient-1\)[^,]*,\s*var\(--color-admin-bg-gradient-2\)[^,]*,\s*var\(--color-admin-bg-gradient-3\)/);
  assert.match(admin, /color:\s*var\(--color-admin-primary-ink\)/);
  assert.match(admin, /color:\s*var\(--color-admin-error-text\)/);
  const surfaceRefs = admin.match(/color-mix\(in srgb,\s*var\(--color-admin-surface\)/g) ?? [];
  assert.equal(surfaceRefs.length, 3, "all 3 #0a1420 color-mix() call sites must reference --color-admin-surface");

  // The --color-accent-cobalt defensive fallback is not this defect and stays untouched.
  assert.match(admin, /var\(--color-accent-cobalt,\s*#1e4d8c\)/, "unrelated defensive fallback must be left alone");
  // Nit (premium-host-fix-3): --color-anticipation-gold's own #d4a017 fallback was dead code
  // (the token is always defined, design/tokens.css) and, alone, an inline hex literal. Dropped
  // at every call site. This assertion now confirms it stays gone instead of staying present.
  assert.doesNotMatch(admin, /#d4a017/i, "the dead --color-anticipation-gold fallback must not come back");
  const goldRefs = admin.match(/var\(--color-anticipation-gold\)/g) ?? [];
  assert.equal(goldRefs.length, 4, "all 4 --color-anticipation-gold call sites keep the token reference, just without the dead fallback");
});

test("admin.css has zero bare hex literals anywhere, not only the 8 named ones (DS-01/DS-03)", () => {
  const admin = readFileSync(adminCssPath, "utf8");
  assert.deepEqual(bareHexLiterals(admin), [], "every hex literal in admin.css must be inside a var(--token, #fallback) call");
});

test("the bare-hex scanner actually catches a planted violation (control)", () => {
  const planted = ".x { color: #ff00ff; background: var(--ok, #1e4d8c); }";
  assert.deepEqual(bareHexLiterals(planted), ["#ff00ff"], "the scanner must flag the bare hex and leave the var() fallback alone");
});

test("the bare-hex scanner ignores a hex literal written only inside a CSS comment (control)", () => {
  const planted = "/* was #ff00ff, now tokenized */\n.x { color: var(--ok, #1e4d8c); }\n/* #abc123 */";
  assert.deepEqual(bareHexLiterals(planted), [], "a hex value mentioned only in a comment is not a real declaration");
});
