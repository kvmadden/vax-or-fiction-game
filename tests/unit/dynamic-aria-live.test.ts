import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Question } from "../../src/screens/Question";
import type { Question as QuestionData } from "../../src/data/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../");

test("Task 4.3 / A11Y-04 / JUDGE-A06: Question.tsx declares sr-only aria-live polite atomic region", () => {
  const filePath = path.join(repoRoot, "src/screens/Question.tsx");
  const content = fs.readFileSync(filePath, "utf8");
  assert.match(
    content,
    /className=["'][^"']*sr-only[^"']*["'][^>]*aria-live=["']polite["'][^>]*aria-atomic=["']true["']|aria-live=["']polite["'][^>]*aria-atomic=["']true["'][^>]*className=["'][^"']*sr-only[^"']*["']/,
    "Question.tsx must render an invisible polite atomic live region with className='sr-only'"
  );
});

test("Task 4.3 / A11Y-04 / JUDGE-A06: ScaledStage.tsx declares sr-only aria-live polite atomic region", () => {
  const filePath = path.join(repoRoot, "src/components/ScaledStage.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  assert.match(
    content,
    /className=["'][^"']*sr-only[^"']*["'][^>]*aria-live=["']polite["'][^>]*aria-atomic=["']true["']|aria-live=["']polite["'][^>]*aria-atomic=["']true["'][^>]*className=["'][^"']*sr-only[^"']*["']/,
    "ScaledStage.tsx must render an invisible polite atomic live region with className='sr-only'"
  );
});

test("Task 4.3 / A11Y-04 / JUDGE-A06: Question.tsx implements required countdown announcements (10s and 5s)", () => {
  const questionState = fs.readFileSync(path.join(repoRoot, "src/screens/question-state.ts"), "utf8");

  assert.match(
    questionState,
    /["']10 seconds remaining["']/,
    "Question.tsx must announce '10 seconds remaining' when countdown hits 10s"
  );
  assert.match(
    questionState,
    /["']5 seconds remaining["']/,
    "Question.tsx must announce '5 seconds remaining' when countdown hits 5s"
  );
});

test("Task 4.3 / A11Y-04 / JUDGE-A06: Question.tsx announces the lock and the reveal in the shared status words", () => {
  const questionState = fs.readFileSync(path.join(repoRoot, "src/screens/question-state.ts"), "utf8");
  const vocabulary = fs.readFileSync(path.join(repoRoot, "src/engine/vote-status.ts"), "utf8");

  // PRES-01/11: at lock the region says "Votes locked. 3 votes.", the same words as the stage
  // rail, the HUD chip and the phone eyebrow, never "Revealing answer." while nothing is revealed.
  assert.match(
    questionState,
    /voteStatusAnnouncement\(\s*["']locked["']/,
    "Question.tsx must announce the lock through the shared vote-status vocabulary"
  );
  assert.match(
    questionState,
    /voteStatusAnnouncement\(\s*["']revealed["']/,
    "Question.tsx must replace the locked announcement after the answer appears"
  );
  assert.doesNotMatch(questionState, /Revealing answer/, "the lock announcement must not promise a reveal");
  assert.match(vocabulary, /["']Votes locked["']/, "the shared vocabulary carries 'Votes locked'");
  assert.match(vocabulary, /["']Answer revealed\.["']/, "the shared vocabulary carries 'Answer revealed.'");
});

test("Task 4.3 / A11Y-04 / JUDGE-A06: Question.tsx formats slide change announcement with number, total, and title", () => {
  const filePath = path.join(repoRoot, "src/screens/Question.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  // Format: "Question {num} of {total}: {title}."
  assert.match(
    content,
    /Question\s+.*of.*:/i,
    "Question.tsx must format slide announcement matching 'Question {num} of {total}: {title}.'"
  );
});

test("Task 4.3 (Round 2): ScaledStage only announces non-question slides to prevent dual-region double-speaking", () => {
  const filePath = path.join(repoRoot, "src/components/ScaledStage.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  // Must check isQuestion and set empty announcement for questions
  assert.match(
    content,
    /isQuestion/,
    "ScaledStage.tsx must identify question slides"
  );
  assert.match(
    content,
    /if \(isQuestion\) return ""/,
    "ScaledStage.tsx must suppress announcements for question slides so Question.tsx alone announces them"
  );
  // Ensure ScaledStage does not duplicate question formatting logic
  assert.doesNotMatch(
    content,
    /Question \$\{qNum\} of \$\{qCount\}/,
    "ScaledStage.tsx must not duplicate question formatting logic"
  );
});

// A11Y-06. The sr-only region said only "Answer revealed." with no way to learn what the answer
// was, while the same reveal card already shows the correct choice visually right next to it.
function srOnlyText(html: string): string {
  const match = html.match(/<div class="sr-only" aria-live="polite" aria-atomic="true">([^<]*)<\/div>/);
  assert.ok(match, "the sr-only polite atomic live region must render");
  return match![1];
}

test("A11Y-06: the reveal live region names the correct choice, for every question kind", () => {
  const binary: QuestionData = { id: "a06-binary", type: "question", kind: "binary", statement: "Fixture statement.", answer: true } as unknown as QuestionData;
  const binaryHtml = renderToStaticMarkup(React.createElement(Question, { question: binary, phase: "revealed", autoDeliberateDelayMs: 0 }));
  assert.equal(srOnlyText(binaryHtml), "Answer revealed. Correct choice: TRUE.");

  // W3: a myth was announced as "Correct choice: <myth text>", which also doubled the period
  // when the authored statement already ended in one. The announcement must now say what the
  // card itself says ("The myth: ...", trimmed to a single trailing period).
  const myth: QuestionData = {
    id: "a06-myth", type: "question", kind: "myth-among-three", statement: "Fixture myth.",
    statements: ["First statement.", "Second statement.", "Third statement, the myth."], mythIndex: 2,
  } as unknown as QuestionData;
  const mythHtml = renderToStaticMarkup(React.createElement(Question, { question: myth, phase: "revealed", autoDeliberateDelayMs: 0 }));
  assert.equal(srOnlyText(mythHtml), "Answer revealed. The myth: Third statement, the myth.");

  // W3: which-patient's spoken-reply beat gets the same "say what the card says" treatment,
  // matching the visible "Better reply" eyebrow next to the quoted reply.
  const patient: QuestionData = {
    id: "a06-patient", type: "question", kind: "which-patient", statement: "A patient says: \"Fixture line.\"", reply: true,
    choices: ["First fixture reply.", "Second fixture reply, the best one."], bestIndex: 1,
  } as unknown as QuestionData;
  const patientHtml = renderToStaticMarkup(React.createElement(Question, { question: patient, phase: "revealed", autoDeliberateDelayMs: 0 }));
  // QUOTE-PERIOD (round 7): the quoted reply keeps both of its quotes, and since it already ends
  // in a period inside the closing quote, the announcement adds no second one.
  assert.equal(srOnlyText(patientHtml), "Answer revealed. Better reply: “Second fixture reply, the best one.”");

  // W3: order gets its own sentence instead of being glued behind "Correct choice:", matching
  // the card's own "Correct order" heading.
  const order: QuestionData = {
    id: "a06-order", type: "question", kind: "order", statement: "Fixture order.", steps: ["First", "Second", "Third"],
  } as unknown as QuestionData;
  const orderHtml = renderToStaticMarkup(React.createElement(Question, { question: order, phase: "revealed", autoDeliberateDelayMs: 0 }));
  assert.equal(srOnlyText(orderHtml), "Answer revealed. Correct order.");
});

test("A11Y-06: the reveal live region stays exactly 'Answer revealed.' when there is no question to name", () => {
  const html = renderToStaticMarkup(React.createElement(Question, { question: null, phase: "revealed", autoDeliberateDelayMs: 0 }));
  assert.equal(srOnlyText(html), "Answer revealed.");
});

test("Task 4.3 (Round 2): Question.tsx derives countdown warnings without effect-driven local state", () => {
  const filePath = path.join(repoRoot, "src/screens/Question.tsx");
  const content = fs.readFileSync(filePath, "utf8");
  const questionState = fs.readFileSync(path.join(repoRoot, "src/screens/question-state.ts"), "utf8");

  assert.match(
    content,
    /questionAnnouncement\(/,
    "Question.tsx must derive its live-region text from current question state"
  );
  assert.match(
    questionState,
    /remainingSeconds\s*<=\s*10\s*&&\s*remainingSeconds\s*>\s*5/,
    "question-state.ts must derive the 10s boundary"
  );
  assert.match(
    questionState,
    /remainingSeconds\s*<=\s*5\s*&&\s*remainingSeconds\s*>\s*0/,
    "question-state.ts must derive the 5s boundary"
  );
  assert.doesNotMatch(content, /setAnnouncementText|announced10Ref|announced5Ref/);
});

test("Task 4.3 (Round 2): Question.tsx derives voting closure announcements from effective phase", () => {
  const filePath = path.join(repoRoot, "src/screens/Question.tsx");
  const content = fs.readFileSync(filePath, "utf8");
  const questionState = fs.readFileSync(path.join(repoRoot, "src/screens/question-state.ts"), "utf8");

  assert.match(content, /phase:\s*effectivePhase/);
  assert.match(questionState, /phase === "locked"/);
  assert.match(questionState, /phase === "revealed"/);
  assert.doesNotMatch(content, /prevEffectivePhaseRef|setAnnouncementText/);
});
