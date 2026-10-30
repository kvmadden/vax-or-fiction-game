import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../");

// PRES-06/07: the HUD no longer carries its own help dialog. The ? button and the ? key open the
// one store-driven sheet in Keyboard.tsx, so the dialog pattern is pinned there (below) and the
// HUD is pinned to *not* mount a second dialog.
test("Task 4.2 / JUDGE-A04 (PRES-07): HUD.tsx routes help to the single Keyboard sheet instead of a second dialog", () => {
  const filePath = path.join(repoRoot, "src/facilitator/HUD.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  assert.doesNotMatch(content, /role=["']dialog["']/, "HUD.tsx must not mount its own help dialog");
  assert.doesNotMatch(content, /aria-modal=["']true["']/, "HUD.tsx must not mount its own modal");
  assert.match(content, /type:\s*["']OPEN_HELP["']/, "HUD.tsx help button must open the shared help sheet through the store");
});

test("Task 4.2 / JUDGE-A04: Keyboard.tsx implements WAI-ARIA dialog pattern and focus traps", () => {
  const filePath = path.join(repoRoot, "src/facilitator/Keyboard.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  // 1. role="dialog" and aria-modal="true"
  assert.match(
    content,
    /role=["']dialog["']/,
    "Keyboard.tsx KeyboardHelpModal must declare role='dialog'"
  );
  assert.match(
    content,
    /aria-modal=["']true["']/,
    "Keyboard.tsx KeyboardHelpModal must declare aria-modal='true'"
  );

  // 2. Initial focus on primary action, moved programmatically instead of the JSX `autoFocus`
  // prop: React applies `autoFocus` during commit, before the focus-restoration effect below
  // runs, which stole document.activeElement out from under the capture and made the sheet
  // always restore focus to itself instead of its opener (NITS3 / HELP-FOCUS).
  assert.doesNotMatch(
    content,
    /<button[^>]*autoFocus[^>]*ref=\{closeButtonRef\}/,
    "Keyboard.tsx close button must not use the JSX autoFocus prop; it races the focus-restoration effect"
  );
  assert.match(
    content,
    /<button[^>]*ref=\{closeButtonRef\}[^>]*data-role=["']keyboard-help-close["']/,
    "Keyboard.tsx close button must still carry closeButtonRef"
  );
  assert.match(
    content,
    /closeButtonRef\.current\.focus\(\)/,
    "Keyboard.tsx must programmatically focus primary action on open"
  );

  // 3. Tab and Shift+Tab focus trap
  assert.match(
    content,
    /e\.key\s*===\s*["']Tab["']/,
    "Keyboard.tsx must handle Tab keydown events"
  );
  assert.match(
    content,
    /e\.shiftKey/,
    "Keyboard.tsx must handle Shift+Tab reverse cycling"
  );
  assert.match(
    content,
    /firstElement\.focus\(\)/,
    "Keyboard.tsx must wrap focus to first element when tabbing forward"
  );
  assert.match(
    content,
    /lastElement\.focus\(\)/,
    "Keyboard.tsx must wrap focus to last element when shift-tabbing backward"
  );

  // 4. Trigger capture & focus restoration upon dismissal
  assert.match(
    content,
    /triggerRefInternal\.current\s*=/,
    "Keyboard.tsx must capture trigger element upon opening"
  );
  assert.match(
    content,
    /target\.focus\(\)/,
    "Keyboard.tsx must restore focus to triggering element upon dismissal"
  );
});

test("RestartRunModal traps Tab so Space cannot fire HUD skip or park", () => {
  const restart = fs.readFileSync(path.join(repoRoot, "src/components/RestartRunModal.tsx"), "utf8");
  assert.match(restart, /e\.key\s*===\s*["']Tab["']/, "RestartRunModal must trap Tab");
  assert.match(restart, /firstElement\.focus\(\)/, "RestartRunModal must wrap Tab forward");
  assert.match(restart, /lastElement\.focus\(\)/, "RestartRunModal must wrap Shift+Tab");
});
