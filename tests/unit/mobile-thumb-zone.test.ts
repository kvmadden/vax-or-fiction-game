import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { PhoneVote } from "../../src/phone/PhoneVote";
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { projectPublicQuestion } from '../../src/network/projection';
import { createSubmitHandler } from "../../src/phone/phone-vote-utils";
// ==============================================================================
// Task 2.4 / Defect JUDGE-P04: Invert Mobile Thumb Zone Ergonomics
// ==============================================================================

test("JUDGE-P04: the question screen keeps the prompt before clear answer controls", () => {
  // A room phone answers on the answer dock. Solo keeps its thumb-zone dock. Both hold the prompt first.
  for (const solo of [false, true]) {
    const html = renderToString(
      React.createElement(PhoneVote, {
        questionType: "binary", onSubmit: () => {}, solo,
        questionData: { statement: "Vaccines induce immune memory without causing disease." },
      })
    );
    const actions = solo ? 'data-role="thumb-zone-actions"' : 'data-role="phone-dock"';

    assert.ok(html.includes('data-screen="question"'), "PhoneVote identifies the dedicated question screen");
    assert.ok(html.includes('data-role="phone-vote-top"'), "the question screen has a prompt region");
    assert.ok(html.includes('data-role="question-stem"') && html.includes("Vaccines induce immune memory"));
    assert.ok(html.includes('data-role="timer-ring"'), "the status row owns the timer");
    assert.ok(html.includes(actions), `binary answer controls remain present (${solo ? "solo" : "room"})`);
    assert.ok(html.includes('data-choice="true"') && html.includes('data-choice="false"'), "both answers are targets");
    assert.ok(html.includes("False") && html.includes("True"));
    assert.doesNotMatch(html, /data-role="confidence-selector"/, "confidence is not a pre-answer field");

    const topPos = html.indexOf('data-role="question-stem"');
    const actionsPos = html.indexOf(actions);
    assert.ok(topPos !== -1 && actionsPos !== -1 && topPos < actionsPos, "prompt precedes the answer controls in normal flow");
  }
});

test("JUDGE-P04: Action buttons use design tokens and meet large thumb target height", () => {
  // Solo's thumb-zone dock carries its tokens inline.
  const solo = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, solo: true }));
  assert.ok(solo.includes("var(--color-answer-false)"), "False uses the answer-false token");
  assert.ok(solo.includes("var(--color-answer-true)"), "True uses the answer-true token");
  assert.ok(solo.includes("var(--kit-space-64)"), "thumb-zone choices keep the 64px floor");

  // The room dock's slabs take the same tokens from phone-room.css, on a floor above 64.
  const room = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {} }));
  assert.match(room, /class="answer-slab answer-slab--binary answer-slab--true"/);
  assert.match(room, /class="answer-slab answer-slab--binary answer-slab--false"/);
  const css = readFileSync("src/styles/phone-room.css", "utf8");
  assert.match(css, /\.answer-slab--true \{[^}]*border-color:\s*var\(--color-answer-true\)/, "True uses the answer-true token");
  assert.match(css, /\.answer-slab--false \{[^}]*border-color:\s*var\(--color-answer-false\)/, "False uses the answer-false token");
  const floor = Number(/\.answer-slab \{[^}]*min-height:\s*(\d+)px/.exec(css)?.[1]);
  assert.ok(floor >= 64, `answer slabs keep a floor of 64px or more (found ${floor})`);
});

test("JUDGE-P04: Non-binary modes do not render duplicate internal h3 headings", () => {
  const modes = (['myth-among-three', 'estimate', 'order', 'which-patient'] as const).map(type => ({
    type, data: projectPublicQuestion(vaxOrFictionDeck.questions.find(q => q.kind === type)!, `thumb-${type}`, 1, 1).question,
  }));

  for (const { type, data } of modes) {
    assert.ok((data.options?.length ?? 0) + (data.steps?.length ?? 0) > 0, `${type} must exercise real choices`);
    const html = renderToString(
      React.createElement(PhoneVote, {
        questionType: type,
        onSubmit: () => {},
        questionData: data,
      })
    );

    // Exactly one h3 tag should exist per render (the resolvedQuestionStem in phone-vote-top)
    const matches = html.match(/<h3/g) || [];
    assert.equal(
      matches.length,
      1,
      `Mode "${type}" should have exactly 1 h3 tag (question stem), found ${matches.length}`
    );
    assert.doesNotMatch(html, /data-role="confidence-selector"/, "confidence waits for an accepted answer");
  }
});

test("JUDGE-P04: Timer display renders 0s when countdown reaches zero and does not reset to 30s", () => {
  const html = renderToString(
    React.createElement(PhoneVote, {
      questionType: "binary",
      onSubmit: () => {},
      questionData: { timerSeconds: 30 },
      timerSeconds: 0,
      votesLocked: true,
    })
  );

  assert.ok(
    html.includes("0<!-- -->s") || html.includes(">0s<"),
    "Timer must render 0s when remainingMs is 0, not 30s"
  );
  assert.match(html, /data-role="timer-ring"[^>]*>0(?:<!-- -->)?s</, "the locked timer preserves the supplied zero");
  assert.doesNotMatch(html, />30(?:<!-- -->)?s</, "the legacy question timer does not replace zero");

});

test("JUDGE-P04: createSubmitHandler transmits answer and selectedConviction together", () => {
  let submittedAnswer: string | null = null;
  let submittedConviction: string | undefined = undefined;

  const mockSubmit = (ans: string, conv?: string) => {
    submittedAnswer = ans;
    submittedConviction = conv;
  };

  const handler = createSubmitHandler(mockSubmit, "certain");
  assert.equal(typeof handler, "function", "createSubmitHandler must return a function");

  handler("false");
  assert.equal(submittedAnswer, "false", "Must transmit chosen answer");
  assert.equal(submittedConviction, "certain", "Must transmit selected conviction level");

  const handler2 = createSubmitHandler(mockSubmit, "hunch");
  handler2("true");
  assert.equal(submittedAnswer, "true", "Must transmit chosen answer");
  assert.equal(submittedConviction, "hunch", "Must transmit selected conviction level");
});
