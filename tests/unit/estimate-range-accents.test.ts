import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EstimateQuestion } from "../../src/screens/questions/EstimateQuestion";
import { ESTIMATE_RANGE_ACCENTS, estimateRangeAccent } from "../../src/screens/questions/estimate-accents";
import { vaxOrFictionDeck } from "../../src/data/decks/vax-or-fiction";

// The estimate range cards' colours have one source, src/screens/questions/estimate-accents.ts. question-chrome.css once
// carried a second list (vax, cobalt, gold, purple, fiction) on .answer-bar:nth-of-type(1 to 5). Every card is the only
// button in its own slot, so every card matched nth-of-type(1) and the component's inline accent won anyway: the rules
// never showed, and they misled the first draft of the Figma kit. The rendered colours are read in every look by
// tests/integration/looks-options.test.mjs.

const ORDER = [
  "var(--color-vax)",
  "var(--color-fiction)",
  "var(--color-accent-cobalt)",
  "var(--color-accent-purple)",
  "var(--color-accent-pink)",
  "var(--color-accent-green)",
];

test("the estimate range colours run teal, orange, cobalt, purple, pink and green, in authored order", () => {
  assert.deepEqual([...ESTIMATE_RANGE_ACCENTS], ORDER);
  ORDER.forEach((accent, index) => assert.equal(estimateRangeAccent(index), accent, `range ${index + 1}`));
  assert.equal(estimateRangeAccent(ORDER.length), "var(--color-accent-cobalt)", "a range past the list falls back to cobalt");
});

test("each range card carries its accent from that list, in the order the ranges are authored", () => {
  const question = vaxOrFictionDeck.questions.find((entry) => entry.id === "q33")!;
  assert.ok(question && question.kind === "estimate", "fixture assumption: q33 is an estimate question");
  const html = renderToStaticMarkup(React.createElement(EstimateQuestion, { question, format: "widescreen" }));
  const accents = [...html.matchAll(/<button[^>]*class="answer-bar"[^>]*style="([^"]*)"/g)]
    .map((match) => (match[1]!.match(/--range-accent:([^;]+)/) ?? [])[1]?.trim());
  assert.equal(accents.length, question.estimate!.ranges.length, `one card per range (${accents.length})`);
  assert.deepEqual(accents, ORDER.slice(0, accents.length));
});

function filesEnding(dir: string, endings: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesEnding(full, endings);
    return endings.some((ending) => entry.name.endsWith(ending)) ? [full] : [];
  });
}
const cssFiles = (dir: string) => filesEnding(dir, [".css"]);

test("no stylesheet sets an estimate card's --range-accent, so the list stays the one source", () => {
  const files = cssFiles(path.resolve("src"));
  // The scan has to see the stylesheets that paint the cards, or it proves nothing.
  const reads = files.filter((file) => /var\(--range-accent\b/.test(fs.readFileSync(file, "utf8"))).map((file) => path.basename(file));
  assert.ok(files.length >= 20, `the scan sees the app's stylesheets (${files.length})`);
  for (const painter of ["presentation.css", "question-chrome.css", "studio.css", "seventies.css", "casefile.css"]) {
    assert.ok(reads.includes(painter), `the scan sees ${painter} paint from --range-accent (${reads.join(", ")})`);
  }
  const sets = files.flatMap((file) => {
    const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    return [...text.matchAll(/--range-accent\s*:/g)].map(() => path.relative(process.cwd(), file));
  });
  assert.deepEqual(sets, [], "a stylesheet that sets --range-accent is a second source of the estimate colours");
});

test("only EstimateQuestion sets --range-accent in code, so no other component paints a second set of estimate colours", () => {
  const files = filesEnding(path.resolve("src"), [".ts", ".tsx"]);
  assert.ok(files.length >= 100, `the scan sees the app's source (${files.length})`);
  const setters = files.filter((file) => /['"]--range-accent['"]/.test(fs.readFileSync(file, "utf8"))).map((file) => path.relative(process.cwd(), file));
  assert.deepEqual(setters, ["src/screens/questions/EstimateQuestion.tsx"]);
});
