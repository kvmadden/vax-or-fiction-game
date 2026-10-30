import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EstimateQuestion } from "../../src/screens/questions/EstimateQuestion";
import { Question } from "../../src/screens/Question";

const estimateQuestion = {
  id: "copy-estimate",
  kind: "estimate",
  statement: "How many people received the vaccine?",
  estimate: {
    value: 15,
    tolerance: 5,
    unit: "people",
    ranges: [
      { label: "0–10", min: 0, max: 10 },
      { label: "11–20", min: 11, max: 20 },
    ],
    truthLabel: "11–20",
  },
  answer: 15,
  reveal: "The source supports this answer.",
  takeaway: "Use the recommended schedule.",
} as any;

// Reveal settles on a dedicated result beat (docs/product-completion-2026-09-14/ARCHITECT-BRIEF.md, "answer layout and
// pacing"); the estimate rail and its room summary render while the question is locked.
const result = (question: any, votes?: Record<string, number>) => renderToStaticMarkup(
  React.createElement(Question, { question, phase: "revealed", autoDeliberateDelayMs: 0, interactionMode: "polling", votes }),
);

test("locked estimate rail uses plain room-summary labels", () => {
  const html = renderToStaticMarkup(
    React.createElement(EstimateQuestion, {
      question: estimateQuestion,
      choices: { a: 1, b: 3 },
      showVotes: true,
    }),
  );

  assert.match(html, /ROOM(?:'|&#x27;)S TYPICAL ANSWER/);
  assert.match(html, /ANSWER RANGES/);
  assert.doesNotMatch(html, /data-role="answer-stamp"/);
  assert.doesNotMatch(html, /ROOM MEDIAN|DISTRIBUTION RANGES|CANONICAL ESTIMATE/);
});

test("estimate result names the answer in plain language", () => {
  const html = result(estimateQuestion, { a: 1, b: 3 });

  assert.match(html, /data-stage-beat="result"/, "the result beat renders, so the checks below are not vacuous");
  assert.match(html, /data-role="canonical-verdict"[^>]*>15 people<\/h1>/);
  assert.doesNotMatch(html, /data-role="answer-stamp"/);
  assert.doesNotMatch(html, /ROOM MEDIAN|DISTRIBUTION RANGES|CANONICAL ESTIMATE/);
});

test("locked estimate rail calls an in-range room answer close enough", () => {
  const html = renderToStaticMarkup(
    React.createElement(EstimateQuestion, {
      question: estimateQuestion,
      choices: { a: 1, b: 3 },
      showVotes: true,
    }),
  );

  assert.match(html, /CLOSE ENOUGH/);
  assert.doesNotMatch(html, /IN TOLERANCE/);
});

test("order result uses direct answer language", () => {
  const html = result({
    id: "copy-order",
    type: "question",
    kind: "order",
    statement: "Put these steps in order.",
    steps: ["First", "Second", "Third"],
    reveal: "The source supports this answer.",
  });

  assert.match(html, /data-role="canonical-verdict"[^>]*>Correct order<\/h1>/);
  assert.doesNotMatch(html, /CANONICAL CLINICAL ORDER/i);
});
