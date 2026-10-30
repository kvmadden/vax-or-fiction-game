import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PRIMARY_SHORTCUTS, MORE_SHORTCUTS, arrowKeyAccessibleName } from "../../src/facilitator/shortcuts";
import { KeyboardHelpModal } from "../../src/facilitator/Keyboard";

// ==============================================================================
// PRES-06/07: the ? sheet is five lines in show typography; the rest sits behind More.
// ==============================================================================

test("PRES-06/07: the help sheet leads with five show keys and keeps the rest behind more", () => {
  assert.equal(PRIMARY_SHORTCUTS.length, 5, "five lines run the show");
  const primaryKeys = PRIMARY_SHORTCUTS.map((s) => s.keys.join("/"));
  assert.deepEqual(primaryKeys, ["Space", "→/←", "L", "T", "H"]);
  assert.match(PRIMARY_SHORTCUTS[0]!.description, /lock/i, "Space is described as lock, then reveal");
  assert.match(PRIMARY_SHORTCUTS[0]!.description, /reveal/i);
  assert.ok(MORE_SHORTCUTS.some((s) => s.keys.includes("Enter")), "Enter (reveal now) lives behind more");
  assert.ok(MORE_SHORTCUTS.some((s) => s.keys.includes("Esc")), "Esc lives behind more");
  const all = [...PRIMARY_SHORTCUTS, ...MORE_SHORTCUTS];
  for (const shortcut of all) {
    assert.doesNotMatch(shortcut.description, /clinical|verdict|debrief|synthesis/i, `${shortcut.label} uses plain presenter words`);
  }
});

test("A11Y-18: the raw arrow glyphs in the shortcut sheet get an accessible name", () => {
  assert.equal(arrowKeyAccessibleName("→"), "Right arrow");
  assert.equal(arrowKeyAccessibleName("←"), "Left arrow");
  // Every other key on the sheet keeps its own visible text as its name, so the map stays undefined for them.
  for (const shortcut of [...PRIMARY_SHORTCUTS, ...MORE_SHORTCUTS]) {
    for (const key of shortcut.keys) {
      if (key === "→" || key === "←") continue;
      assert.equal(arrowKeyAccessibleName(key), undefined, `${key} should not get an arrow label`);
    }
  }
});

// W10: an aria-label on a <kbd> (no ARIA role of its own) is not reliably read, so a screen reader
// could say nothing for the arrow glyph even with the label attribute present. Render the sheet and
// check what a screen reader actually gets: the glyph itself hidden from assistive tech, and the real
// name as ordinary hidden text content instead, which every AT reads regardless of the element's role.
test("W10 / A11Y-18: the rendered arrow keys hide the glyph from assistive tech and expose the name as hidden text", () => {
  const html = renderToStaticMarkup(React.createElement(KeyboardHelpModal, { isOpen: true, onClose: () => {} }));
  for (const [glyph, name] of [["→", "Right arrow"], ["←", "Left arrow"]] as const) {
    const kbdMatch = html.match(new RegExp(`<kbd[^>]*>((?:(?!</kbd>).)*)${glyph}(?:(?!</kbd>).)*</kbd>`, "s"));
    assert.ok(kbdMatch, `a <kbd> containing ${glyph} must render`);
    assert.match(kbdMatch![0], new RegExp(`<span aria-hidden="true">${glyph}</span>`), `${glyph}'s own glyph must be hidden from assistive tech`);
    assert.match(kbdMatch![0], new RegExp(`<span class="sr-only">${name}</span>`), `${glyph}'s name must be real, visually hidden text content, not an attribute`);
  }
  // Every other key keeps rendering as plain text, unchanged.
  assert.match(html, /<kbd[^>]*>Space<\/kbd>/);
  assert.doesNotMatch(html, /aria-label="Right arrow"|aria-label="Left arrow"/, "the unreliable aria-label is gone, not merely supplemented");
});
