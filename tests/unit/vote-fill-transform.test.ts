import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BinaryQuestion } from "../../src/screens/questions/BinaryQuestion";
import { MythAmongThree } from "../../src/screens/questions/MythAmongThree";
import { EstimateQuestion } from "../../src/screens/questions/EstimateQuestion";
import { vaxOrFictionDeck } from "../../src/data/decks/vax-or-fiction";
import type { Question } from "../../src/data/types";

// MOT-VQA-02. Vote-bar fills animated `width`, a layout property whose change forces the browser
// to reflow the row on every tick (the verify report measured a real nonzero layout-shift entry
// coincident with the reveal). The fix animates `transform: scaleX(...)` instead, with a
// permanent `width: 100%`, so the same visual end-width is reached through a composited
// transform rather than a layout-triggering resize.
//
// TW9: the previous version of this file matched the exact literal source text of each fill's
// style object, so a harmless rewrite of the same behavior (a different variable name, a helper
// function instead of an inline template literal) would fail it even though nothing was wrong.
// Rendered output is checked instead, following vote-aria-label.test.ts: an inline style's
// computed CSS text is real behavior (what the browser actually paints), not an implementation
// detail of how the component happens to compute it.

const repoRoot = path.resolve(import.meta.dirname, "../../");
const read = (relFile: string) => fs.readFileSync(path.join(repoRoot, relFile), "utf8");

// None of the three fills carry their own className (each is a bare aria-hidden positioning
// underlay), so the fill divs are exactly the plain `<div aria-hidden="true" style="...">` runs.
function fillStyles(html: string): string[] {
  return [...html.matchAll(/<div aria-hidden="true" style="([^"]*)"><\/div>/g)].map((match) => match[1]);
}

// STAGE-SPEC pass 4b fix (F4): the vote-fill bar this test used to check is gone. It was the
// "tint seam" defect (its own hard edge cut through the centered "N VOTES" text an independent
// designer's critique named): binary already prints both percentages and the winning card glows,
// so the fill was a second, redundant read of the same number that also happened to paint badly.
// Deleted in both binary buttons rather than fixed in place.
test("F4: BinaryQuestion no longer renders a vote-fill div (the tint seam is gone, not fixed in place)", () => {
  const question: Question = { id: "fill-binary", type: "question", kind: "binary", statement: "Fixture statement.", answer: true } as unknown as Question;
  const html = renderToStaticMarkup(React.createElement(BinaryQuestion, {
    question, showVotes: true, votes: { true: 17, false: 6 },
  }));
  const fills = fillStyles(html);
  assert.equal(fills.length, 0, "binary must render no vote-fill divs at all: deleted, not merely hidden");
});

test("MOT-VQA-02: MythAmongThree's vote fill animates transform, not width", () => {
  const question: Question = {
    id: "fill-myth", type: "question", kind: "myth-among-three", statement: "Fixture myth.",
    statements: ["First statement.", "Second statement.", "Third statement, the myth."], mythIndex: 2,
  } as unknown as Question;
  // 5 + 3 + 12 = 20 total: a=25%, b=15%, c=60%.
  const html = renderToStaticMarkup(React.createElement(MythAmongThree, { question, showVotes: true, votes: { a: 5, b: 3, c: 12 } }));
  const fills = fillStyles(html);
  assert.equal(fills.length, 3, "expected a fill per statement");
  const ratios = [0.25, 0.15, 0.6];
  for (const [index, style] of fills.entries()) {
    assert.doesNotMatch(style, new RegExp(`width:${Math.round(ratios[index]! * 100)}%`), "the fill must not render a percent width");
    assert.match(style, /transform-origin:left/, "scaleX must grow from the left edge");
    assert.match(style, new RegExp(`transform:scaleX\\(${ratios[index]}\\)`), "the fill must scale by the vote percent, not resize");
    assert.match(style, /transition:transform 0\.6s ease-out/, "the animated property must be transform, not width");
    assert.doesNotMatch(style, /transition:width/, "must not still transition width");
  }
});

test("MOT-VQA-02: EstimateQuestion's histogram fill animates transform, not width", () => {
  const question = vaxOrFictionDeck.questions.find((entry) => entry.kind === "estimate")!;
  assert.ok(question, "fixture assumption: the deck has an estimate question");
  const ranges = question.estimate!.ranges;
  const choices = Object.fromEntries(ranges.map((range, index) => [String.fromCharCode(97 + index), (index + 1) * 3]));
  const beforeLock = renderToStaticMarkup(React.createElement(EstimateQuestion, { question, showVotes: false, choices }));
  const beforeFills = fillStyles(beforeLock);
  assert.ok(beforeFills.length > 0, "histogram fills render before lock too (at 0 scale)");
  for (const style of beforeFills) {
    assert.match(style, /transform:scaleX\(0\)/, "before lock every fill scales to 0, not a 0% width");
    assert.match(style, /width:100%/, "the fill must keep a permanent 100% width even before lock");
  }
  const afterLock = renderToStaticMarkup(React.createElement(EstimateQuestion, { question, showVotes: true, choices }));
  const afterFills = fillStyles(afterLock);
  assert.ok(afterFills.length > 0, "histogram fills render after lock");
  for (const style of afterFills) {
    assert.doesNotMatch(style, /width:(?!100%)\d/, "the fill must not render a partial percent width");
    assert.match(style, /transform-origin:left/, "scaleX must grow from the left edge");
    assert.match(style, /transform:scaleX\(0\.\d+\)/, "a locked fill scales by its real vote percent, not 0");
    assert.match(style, /transition:transform 600ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\)/, "the animated property must be transform, not width");
    assert.doesNotMatch(style, /transition:width/, "must not still transition width");
  }
});

test("MOT-VQA-02: Showdown's audience-picks meter animates transform, not width, and the CSS transitions transform", () => {
  // Showdown's FinalistCard is not exported and reads live store state for its stage, so
  // rendering it in isolation would need the same store harness the rendered/store tests already
  // use; the meter's own rendered behavior (including the border-radius compensation NIT-6 adds)
  // is proven by tests/integration/showdown-meter-fill.test.mjs. This keeps only the plain CSS
  // declaration check, which is a real (if narrow) behavior claim: the transitioned property.
  const css = read("src/styles/question-chrome.css");
  const fillRuleStart = css.indexOf(".showdown-meter-fill {");
  assert.ok(fillRuleStart > -1, "the .showdown-meter-fill rule must exist");
  const fillRule = css.slice(fillRuleStart, css.indexOf("}", fillRuleStart));
  assert.match(fillRule, /transition:[^;]*\btransform 300ms ease\b/, "the meter fill must transition transform, not width");
  assert.doesNotMatch(fillRule, /transition:\s*width/, "must not still transition width");
  // NIT (question-chrome.css --fill-ratio): a plain, unregistered custom property cannot itself
  // transition, so the border-radius compensation this variable drives (NIT-6) was correct only
  // at the two ends of a change and wrong for the whole 300ms in between. Registering it as a
  // <number> and transitioning it in lockstep with transform keeps the cap round throughout.
  assert.match(css, /@property\s+--fill-ratio\s*\{[^}]*syntax:\s*['"]<number>['"]/, "--fill-ratio must be registered as an animatable <number>");
  assert.match(fillRule, /transition:[^;]*--fill-ratio 300ms ease\b/, "--fill-ratio must transition in lockstep with transform, same duration and easing");
});
