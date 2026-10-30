import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Question } from "../../src/screens/Question";
import { EstimateQuestion } from "../../src/screens/questions/EstimateQuestion";
import { PhoneVote } from "../../src/phone/PhoneVote";
import type { Question as QuestionData } from "../../src/data/types";

const question: QuestionData = {
  id: "privacy-fixture",
  kind: "binary",
  format: "binary",
  topic: "Privacy fixture",
  statement: "This is a synthetic clinical statement.",
  answer: true,
  verdict: true,
  explanation: "Synthetic explanation.",
  evidence: "Synthetic evidence.",
  pearl: "Synthetic takeaway.",
  discussionPrompt: "What makes you say that?",
};

const visibleText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
// Reveal settles on a dedicated result beat and the next advance shows the explanation (2026-09-14 operator
// direction, docs/product-completion-2026-09-14/ARCHITECT-BRIEF.md, "answer layout and pacing").
const beat = (html: string, name: "result" | "explanation") => {
  const section = html.match(new RegExp(`<section[^>]*data-stage-beat="${name}"[\\s\\S]*?</section>`))?.[0];
  assert.ok(section, `the ${name} beat renders, so the checks on it are not vacuous`);
  assert.equal(section.match(/<section\b/g)?.length, 1, `the ${name} slice is the whole beat (a nested section would cut it short)`);
  return section;
};
const BEATS = [["revealed", "result"], ["explaining", "explanation"]] as const;

test("open question stage does not render vote-derived attendee signals", () => {
  const html = renderToString(
    React.createElement(Question, {
      question,
      phase: "deliberating",
      votingWindow: "open",
      votes: { true: 17, false: 9 },
      interactionMode: "polling",
      showTimer: false,
    })
  );

  assert.ok(!html.includes("17 votes"), "open voting must not show a vote count");
  assert.ok(!html.includes("9 votes"), "open voting must not show a vote split");
  assert.ok(!html.includes("answer-bar__votes"), "open polling must not mount vote counts");
  assert.ok(!html.includes("answer-bar__pct"), "open polling must not mount vote percentages");
  assert.ok(!html.includes("What makes you say that?"), "question stage must not ask the audience for reasons");
  assert.ok(!html.includes("ROOM ACCURACY"), "room accuracy belongs only in recap");
});

test("open estimate stage with live room data shows the range labels but hides its distribution", () => {
  const estimateQuestion: QuestionData = {
    ...question,
    id: "privacy-estimate-live",
    kind: "estimate",
    estimate: {
      value: 50,
      tolerance: 5,
      unit: "%",
      ranges: [
        { label: "Low", min: 0, max: 39 },
        { label: "Middle", min: 40, max: 60 },
        { label: "High", min: 61, max: 100 },
      ],
    },
    answer: 50,
  };
  const html = renderToString(
    React.createElement(EstimateQuestion, {
      question: estimateQuestion,
      choices: { a: 11, b: 7, c: 3 },
      showVotes: false,
      showChoicesBeforeLock: false,
    })
  );

  assert.ok(!html.includes("TOTAL VOTE"));
  assert.ok(!html.includes("Room votes recorded"));
  assert.ok(!html.includes("11 votes"));
  assert.doesNotMatch(html, />\d+%<\/span>/, "open estimate controls must not expose percentages");
  assert.doesNotMatch(visibleText(html), /\b0\s*%/, "open estimate controls must not render placeholder percentages");
  // VF-02 / VOF-21: the room must see the five ranges to vote; only the
  // distribution (percentages, median, truth pills) stays hidden until lock.
  for (const label of ["Low", "Middle", "High"]) {
    assert.match(visibleText(html), new RegExp(`\\b${label}\\b`), `open estimate keeps range label ${label} visible for voting`);
  }
  assert.ok(!html.includes("TYPICAL ROOM ANSWER"), "open estimate must not mark the median range");
  assert.ok(!html.includes("TRUTH"), "open estimate must not mark the true range");
});

test("offline estimate stage keeps the authored hands-up choices visible without response signals", () => {
  const estimateQuestion: QuestionData = {
    ...question,
    id: "offline-estimate",
    kind: "estimate",
    estimate: {
      value: 50,
      tolerance: 5,
      unit: "%",
      ranges: [
        { label: "Low", min: 0, max: 39 },
        { label: "Middle", min: 40, max: 60 },
        { label: "High", min: 61, max: 100 },
      ],
    },
    answer: 50,
  };
  const html = renderToString(
    React.createElement(EstimateQuestion, {
      question: estimateQuestion,
      choices: {},
      showVotes: false,
      showChoicesBeforeLock: true,
    })
  );
  assert.match(visibleText(html), /Low/);
  assert.match(visibleText(html), /Middle/);
  assert.match(visibleText(html), /High/);
  assert.doesNotMatch(visibleText(html), /\b0\s*%/);
});

test("a binary result with no responses does not render empty vote meters", () => {
  const html = renderToString(
    React.createElement(Question, {
      question,
      phase: "revealed",
      votingWindow: "locked",
      votes: { true: 0, false: 0 },
      interactionMode: "polling",
      showTimer: false,
    })
  );

  const result = beat(html, "result");
  assert.ok(!result.includes('data-role="result-distribution"'), "no split renders without responses");
  assert.ok(!html.includes("answer-bar__pct"));
  assert.ok(!html.includes("answer-bar__votes"));
  assert.doesNotMatch(visibleText(html), /\b0\s*%/, "no placeholder percentage anywhere on the stage");
  assert.doesNotMatch(visibleText(html), /\b0 votes\b/i, "no zero vote count anywhere on the stage");
});

test("a locked estimate and its result with no responses do not render empty distribution numbers", () => {
  const estimateQuestion: QuestionData = {
    ...question,
    id: "privacy-estimate-empty",
    kind: "estimate",
    estimate: {
      value: 50,
      tolerance: 5,
      unit: "%",
      ranges: [
        { label: "Low", min: 0, max: 39 },
        { label: "Middle", min: 40, max: 60 },
        { label: "High", min: 61, max: 100 },
      ],
    },
    answer: 50,
  };
  const html = renderToString(
    React.createElement(EstimateQuestion, {
      question: estimateQuestion,
      choices: { a: 0, b: 0, c: 0 },
      showVotes: true,
    })
  );

  assert.ok(!html.includes("TOTAL VOTES"));
  assert.doesNotMatch(html, /aria-label="[^"]*0%, 0 votes"/);
  assert.doesNotMatch(html, />0%<\/span>/);
  assert.doesNotMatch(visibleText(html), /\b0\s*%/, "empty locked estimate must not render fake zero-percent results");
  assert.match(visibleText(html), /Low/);
  assert.match(visibleText(html), /Middle/);
  assert.match(visibleText(html), /High/);

  const resultPage = renderToString(
    React.createElement(Question, {
      question: estimateQuestion,
      phase: "revealed",
      votingWindow: "locked",
      votes: { a: 0, b: 0, c: 0 },
      interactionMode: "polling",
      showTimer: false,
    })
  );
  assert.ok(!beat(resultPage, "result").includes('data-role="result-distribution"'), "no split renders without responses");
  assert.doesNotMatch(visibleText(resultPage), /\b0\s*%/, "empty estimate result must not render fake zero-percent results anywhere on the stage");
});

test("question-kind stages keep authored discussion prompts off the audience surface", () => {
  const questionKinds: QuestionData[] = [
    {
      ...question,
      id: "privacy-myth",
      kind: "myth-among-three",
      options: [
        { label: "A", text: "One", isMyth: false },
        { label: "B", text: "Two", isMyth: true },
        { label: "C", text: "Three", isMyth: false },
      ],
      answer: "b",
    },
    {
      ...question,
      id: "privacy-estimate",
      kind: "estimate",
      estimate: { value: 50, tolerance: 5, unit: "%", ranges: [] },
      answer: 50,
    },
    {
      ...question,
      id: "privacy-order",
      kind: "order",
      steps: ["First", "Second"],
      answer: "a,b",
    },
    {
      ...question,
      id: "privacy-patient",
      kind: "which-patient",
      choices: ["First reply", "Second reply"],
      bestIndex: 1,
      answer: "b",
    },
  ];

  for (const kindQuestion of questionKinds) {
    const html = renderToString(
      React.createElement(Question, {
        question: kindQuestion,
        phase: "deliberating",
        votingWindow: "open",
        showTimer: false,
      })
    );
    assert.ok(!html.includes("What makes you say that?"), `${kindQuestion.kind} must not ask the audience for reasons`);
  }
});

test("result and explanation beats do not render audience discussion asks or room accuracy", () => {
  for (const [phase, name] of BEATS) {
    const html = renderToString(React.createElement(Question, { question, phase, votingWindow: "locked", showTimer: false }));
    beat(html, name);
    assert.ok(!html.includes("What makes you say that?"), `the ${name} beat must not ask the audience for reasons`);
    assert.ok(!html.includes("ROOM ACCURACY"), "room accuracy belongs only in recap");
  }
});

test("paused phone voting reports the pause without prompting the audience", () => {
  const html = renderToString(
    React.createElement(PhoneVote, {
      questionType: "binary",
      questionData: { id: "phone-private", kind: "binary", statement: "Synthetic statement", options: [] },
      isDiscussionPaused: true,
      votesLocked: false,
      onSubmit: () => {},
    })
  );

  assert.ok(html.includes("PAUSED FOR DISCUSSION"));
  assert.ok(!html.includes("What makes you say that?"));
  assert.ok(!html.includes("phone-discussion-prompt"));
});

test("audience result and explanation use plain-language headings instead of generic clinical jargon", () => {
  for (const [phase, name] of BEATS) {
    const html = renderToString(React.createElement(Question, { question, phase, votingWindow: "locked", showTimer: false }));
    beat(html, name);
    assert.match(html, new RegExp(`data-role="question-kicker"><span class="question-source-kicker__words">${name === "result" ? "The answer" : "Why it matters"}<`), `the ${name} beat is headed in plain language`);
    const text = html.replace(/&amp;/g, "&");
    for (const jargon of [
      "Clinical Evidence",
      "CLINICAL VERDICT",
      "Takeaway Pearl",
      "high-yield pearl",
      "chairside",
      "immunization records",
      "Peer-Reviewed Evidence & Guidelines",
      "Clinical evidence supports this recommendation",
    ]) {
      assert.ok(!text.includes(jargon), `the ${name} beat avoids "${jargon}"`);
    }
  }
});
