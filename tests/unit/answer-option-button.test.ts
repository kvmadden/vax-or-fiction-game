import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MythAmongThree } from "../../src/screens/questions/MythAmongThree";
import { WhichPatientQuestion } from "../../src/screens/questions/WhichPatientQuestion";
import type { Question } from "../../src/data/types";

// A11Y-08. MythAmongThree and WhichPatientQuestion built their interactive answer option out of
// a <div role="button" tabIndex=... onKeyDown=...>, a hand-rolled button that carries none of a
// real button's built-in semantics or robustness. Both already had a working onKeyDown mapping
// Enter/Space to the same handler, so this was not a keyboard trap, but it is still the wrong
// element for the job. The fix is a real <button>, keeping the exact same look (same className,
// same inline style object, same aria-pressed/aria-label/onClick), so this is a markup change
// only, not a visual one.

const repoRoot = path.resolve(import.meta.dirname, "../../");
const read = (relFile: string) => fs.readFileSync(path.join(repoRoot, relFile), "utf8");

const mythQuestion: Question = {
  id: "btn-myth", type: "question", kind: "myth-among-three",
  statement: "Fixture myth statement.",
  statements: ["First fixture statement.", "Second fixture statement.", "Third fixture statement, the myth."],
  mythIndex: 2,
} as unknown as Question;
const patientQuestion: Question = {
  id: "btn-patient", type: "question", kind: "which-patient",
  statement: "Which reply fits the fixture scenario?",
  choices: ["First fixture reply.", "Second fixture reply, the best one.", "Third fixture reply."],
  bestIndex: 1,
} as unknown as Question;

test("A11Y-08: MythAmongThree's answer option is a real button, not a div playing one", () => {
  const source = read("src/screens/questions/MythAmongThree.tsx");
  assert.doesNotMatch(source, /role="button"/, "role=\"button\" is redundant, and wrong, on a real <button>");
  assert.doesNotMatch(source, /onKeyDown=\{\(e\) => \{\s*\n\s*if \(e\.key === 'Enter' \|\| e\.key === ' '\)/, "a real button activates on Enter/Space natively; the hand-rolled handler must be removed");

  const html = renderToStaticMarkup(React.createElement(MythAmongThree, { question: mythQuestion, showVotes: false }));
  assert.match(html, /<button type="button" class="answer-bar"/, "the option must render as a real <button type=\"button\">");
  assert.doesNotMatch(html, /<div class="answer-bar" role="button"/, "must not still render as a div impersonating a button");
  // Everything else about the element must be unchanged: same aria-pressed/aria-label/onClick-driven state.
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="A: First fixture statement\."/);
});

test("A11Y-08: WhichPatientQuestion's answer option is a real button, not a div playing one", () => {
  const source = read("src/screens/questions/WhichPatientQuestion.tsx");
  assert.doesNotMatch(source, /className="answer-bar"\s*\n\s*role="button"/, "the option must not still open with a div carrying role=\"button\"");
  assert.doesNotMatch(source, /role="button"/, "role=\"button\" is redundant, and wrong, on a real <button>");
  assert.doesNotMatch(source, /onKeyDown=\{\(e\) => \{\s*\n\s*if \(e\.key === 'Enter' \|\| e\.key === ' '\)/, "a real button activates on Enter/Space natively; the hand-rolled handler must be removed");

  const html = renderToStaticMarkup(React.createElement(WhichPatientQuestion, { question: patientQuestion, showVotes: false }));
  assert.match(html, /<button type="button" class="answer-bar"/, "the option must render as a real <button type=\"button\">");
  assert.doesNotMatch(html, /<div class="answer-bar" role="button"/, "must not still render as a div impersonating a button");
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="A: First fixture reply\."/);
});
