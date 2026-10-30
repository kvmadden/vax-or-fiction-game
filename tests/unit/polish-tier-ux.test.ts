import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { Question as QuestionScreen } from "../../src/screens/Question";
import { Showdown } from "../../src/screens/Showdown";
import { PhoneVote } from "../../src/phone/PhoneVote";
import { BinaryQuestion } from "../../src/screens/questions/BinaryQuestion";
import { MythAmongThree } from "../../src/screens/questions/MythAmongThree";
import { Question } from "../../src/data/types";

const chromeCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/question-chrome.css"), "utf8");

const mockBinaryQuestionFalse: Question = {
  id: "q-binary-false",
  kind: "binary",
  format: "binary",
  topic: "Safety",
  statement: "MMR causes autism.",
  answer: false,
  verdict: false,
  explanation: "No epidemiological connection found.",
  evidence: "Extensive population studies demonstrate zero increased risk.",
  pearl: "Highlight robust cohort studies.",
};

const mockBinaryQuestionTrue: Question = {
  id: "q-binary-true",
  kind: "binary",
  format: "binary",
  topic: "Immunology",
  statement: "Tdap booster is recommended during every pregnancy.",
  answer: true,
  verdict: true,
  explanation: "Maternal antibodies transfer transplacentally.",
  evidence: "ACIP recommends Tdap during 27-36 weeks gestation.",
  pearl: "Protects newborns before primary series.",
};

const mockMythQuestion: Question = {
  id: "q-myth-test",
  kind: "myth-among-three",
  format: "myth-among-three",
  topic: "Vaccine Myths",
  statement: "Identify the false clinical assertion among the three statements.",
  options: [
    { label: "Option A", isMyth: false, text: "Natural immunity varies significantly by antigen." },
    { label: "Option B", isMyth: true, text: "Vaccines overwhelm infant immune systems." },
    { label: "Option C", isMyth: false, text: "Adjuvants enhance immune response to inactivated antigens." },
  ],
  answer: "b",
  verdict: "b",
  explanation: "Infants encounter thousands of antigens daily.",
  evidence: "The infant immune system has theoretical capacity for ~10,000 vaccines.",
  pearl: "Address maternal anxiety with immunological evidence.",
};

// Reveal settles on a dedicated result beat and the next advance shows the explanation (2026-09-14 operator
// direction, docs/product-completion-2026-09-14/ARCHITECT-BRIEF.md, "answer layout and pacing"), so reveal
// guarantees are checked on the beats Question renders.
const stage = (question: Question, phase: "revealed" | "explaining", extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(QuestionScreen, { question, phase, autoDeliberateDelayMs: 0, ...extra }));
const beat = (html: string, name: "result" | "explanation") => {
  const section = html.match(new RegExp(`<section[^>]*data-stage-beat="${name}"[\\s\\S]*?</section>`))?.[0];
  assert.ok(section, `the ${name} beat renders, so the checks on it are not vacuous`);
  assert.equal(section.match(/<section\b/g)?.length, 1, `the ${name} slice is the whole beat (a nested section would cut it short)`);
  return section;
};
const BEATS = [["revealed", "result"], ["explaining", "explanation"]] as const;

describe("Task 5.5 / Defect POLISH-01: Polish-Tier UX Enhancements", () => {
  it("POLISH-01 (Recipe 1): the result and explanation beats keep audience discussion asks off the stage", () => {
    const question = { ...mockBinaryQuestionFalse, discussionPrompt: "What makes you say that?" };
    for (const [phase, name] of BEATS) {
      const html = stage(question, phase);
      beat(html, name);
      assert.ok(!html.includes('data-role="discussion-prompt-pill"'));
      assert.ok(!html.includes("What makes you say that?"), `the ${name} beat must not ask the audience for reasons`);
    }
  });

  it("POLISH-01 (Recipe 1): Showdown.tsx renders functional duel deliberation pill with min 44px touch target and reacts to props/timer", () => {
    const htmlActive = renderToString(
      React.createElement(Showdown, {
        stage: "duel",
        isDiscussionPaused: false,
      })
    );
    assert.ok(
      htmlActive.includes('data-role="showdown-discussion-pill"'),
      "Showdown.tsx must render data-role=\"showdown-discussion-pill\""
    );
    assert.ok(
      htmlActive.includes("showdown-discussion-pill"),
      "Showdown.tsx discussion pill must have showdown-discussion-pill class"
    );
    assert.match(
      chromeCss,
      /\.showdown-discussion-pill\s*\{[\s\S]*?min-height:\s*44px/,
      "Showdown.tsx discussion pill must enforce 44px min touch target via CSS"
    );
    assert.ok(
      htmlActive.includes("Discussion open"),
      "Showdown.tsx must display one accurate discussion status"
    );
    // PILL-REVIEW: WCAG 2.5.3 label-in-name. The pill's accessible name must start with its
    // visible text ("Discussion open" / "Discussion paused"), so a speech-input or screen-reader
    // user hears the same name they can read and say. An aria-label here would silently replace
    // that name instead of supplementing it.
    const activePillMarkup = htmlActive.match(/<button[^>]*data-role="showdown-discussion-pill"[^>]*>/)?.[0];
    assert.ok(activePillMarkup, "showdown-discussion-pill button markup must be present");
    assert.ok(
      !activePillMarkup.includes("aria-label"),
      "showdown-discussion-pill must not carry an aria-label that overrides its visible text"
    );

    const htmlPaused = renderToString(
      React.createElement(Showdown, {
        stage: "duel",
        isDiscussionPaused: true,
      })
    );
    assert.ok(
      htmlPaused.includes("Discussion paused"),
      "Showdown.tsx must display one accurate paused status"
    );
    assert.ok(
      htmlPaused.includes('aria-pressed="true"'),
      "Showdown.tsx discussion pill must indicate pressed state when paused"
    );
    assert.doesNotMatch(
      `${htmlActive}${htmlPaused}`,
      /What makes you say that|Duel Deliberation|Discuss Evidence/i,
      "Showdown.tsx must not expose facilitator discussion prompts to participants"
    );
  });

  it("POLISH-01 (Recipe 1): MythAmongThree.tsx keeps audience discussion asks off the question stage", () => {
    const htmlActive = renderToString(
      React.createElement(MythAmongThree, {
        question: mockMythQuestion,
        isDiscussionPaused: false,
        interactive: true,
      })
    );
    assert.ok(!htmlActive.includes('data-role="deliberation-discussion-toggle"'));
    assert.ok(!htmlActive.includes("What makes you say that?"));
  });

  it("POLISH-01 (Recipe 2): Showdown.tsx renders a darkened duel evidence card and one pause status", () => {
    const htmlPaused = renderToString(
      React.createElement(Showdown, {
        stage: "duel",
        isDiscussionPaused: true,
      })
    );
    assert.ok(!htmlPaused.includes('data-role="showdown-discussion-banner"'));
    assert.ok(
      htmlPaused.includes('data-role="duel-evidence-card"'),
      "Showdown.tsx must have data-role=\"duel-evidence-card\""
    );
    assert.ok(
      htmlPaused.includes("Discussion paused"),
      "Showdown.tsx must render one paused status"
    );
    assert.ok(
      htmlPaused.includes("showdown-evidence-card--paused"),
      "Showdown.tsx must apply showdown-evidence-card--paused class when paused"
    );
    assert.match(
      chromeCss,
      /\.showdown-evidence-card--paused\s*\{[\s\S]*?background-color:\s*color-mix\(in srgb, var\(--color-void\) 90%, black\)/,
      "Showdown.tsx must darken duel card background via CSS when paused"
    );

    const htmlNotPaused = renderToString(
      React.createElement(Showdown, {
        stage: "duel",
        isDiscussionPaused: false,
      })
    );
    assert.ok(
      !htmlNotPaused.includes('data-role="showdown-discussion-banner"'),
      "Showdown.tsx must not render discussion banner when not paused"
    );
  });

  it("POLISH-01 (Recipe 2): PhoneVote.tsx renders darkened background and PAUSED status without an audience prompt", () => {
    const htmlPaused = renderToString(
      React.createElement(PhoneVote, {
        isDiscussionPaused: true,
        kind: "binary",
        questionText: "Is MMR safe?",
      })
    );
    assert.ok(
      htmlPaused.includes('data-discussion-paused="true"'),
      "PhoneVote.tsx must expose data-discussion-paused attribute"
    );
    assert.ok(
      htmlPaused.includes("color-mix(in srgb, var(--color-void) 92%, black)"),
      "PhoneVote.tsx must darken container background during discussion pause"
    );
    assert.ok(
      htmlPaused.includes("PAUSED FOR DISCUSSION"),
      "PhoneVote.tsx must update status label to 'PAUSED FOR DISCUSSION'"
    );
    assert.ok(
      !htmlPaused.includes('data-role="phone-discussion-prompt"'),
      "PhoneVote.tsx must not render an audience discussion prompt"
    );
    assert.ok(
      !htmlPaused.includes("What makes you say that?"),
      "PhoneVote.tsx must not tell the audience what to discuss"
    );

    const htmlNotPaused = renderToString(
      React.createElement(PhoneVote, {
        isDiscussionPaused: false,
        kind: "binary",
        questionText: "Is MMR safe?",
      })
    );
    assert.ok(
      !htmlNotPaused.includes('data-discussion-paused="true"'),
      "PhoneVote.tsx must not expose data-discussion-paused when not paused"
    );
    assert.ok(
      !htmlNotPaused.includes("PAUSED FOR DISCUSSION"),
      "PhoneVote.tsx must not show paused status when active"
    );
  });

  it("binary results identify the correct answer without a verdict sticker in every format", () => {
    // The design call rejected the sticker treatment on 2026-09-14. Keep the outcome
    // available to assistive technology and preserve both choices and tallies.
    for (const format of ["widescreen", "square", "portrait"] as const) {
      for (const question of [mockBinaryQuestionTrue, mockBinaryQuestionFalse]) {
        const html = stage(question, "revealed", { format, interactionMode: "polling", votes: { true: 3, false: 1 } });
        const result = beat(html, "result");
        const verdict = question.answer ? "TRUE" : "FALSE";
        assert.ok(!html.includes('data-role="answer-stamp"'));
        assert.doesNotMatch(html, /the evidence says/i);
        assert.match(result, new RegExp(`data-role="canonical-verdict"[^>]*>${verdict}</h1>`), "the result names the correct answer");
        assert.match(result, new RegExp(`data-correct="true" aria-label="${verdict}: `), "the split marks the correct answer for assistive technology");
        assert.ok(result.includes(">75%<") && result.includes(">25%<"), "both vote results remain available");
      }
    }
  });

  it("binary result teaches the answer without repeating the posed prompt, explanation keeps it (FAC-08)", () => {
    const question = { ...mockBinaryQuestionTrue, statement: "The complete posed statement.", takeaway: "The concise reveal.", reveal: "The full supporting explanation belongs in the source view." };
    const posed = renderToString(React.createElement(BinaryQuestion, { question }));
    // STAGE-SPEC pass 4c-1: the widow guard now decides whether to join the stem's last two words
    // from a real measurement of how the text actually wraps (widow-guard.ts), which never runs
    // in a DOM-free SSR render, so the posed stem here is the plain, unmodified statement.
    assert.ok(posed.includes(question.statement));
    assert.ok(!posed.includes(question.takeaway));
    const result = beat(stage(question, "revealed"), "result");
    assert.ok(!result.includes(question.statement), "the result does not repeat the posed prompt");
    const explanation = beat(stage(question, "explaining"), "explanation");
    assert.ok(explanation.includes(question.takeaway));
    // FAC-08 (design call 2026-09-25): binary now keeps the statement on the explanation beat,
    // matching estimate and order (previously the only two kinds that did).
    assert.ok(explanation.includes(question.statement), "the explanation keeps the posed prompt for context");
    assert.ok(explanation.includes(question.reveal), "the explanation still teaches why");
    const fallback = beat(stage({ ...question, takeaway: undefined }, "explaining"), "explanation");
    assert.ok(fallback.includes(question.reveal), "a card without authored short copy retains its explanation");
  });

  it("POLISH-01 (Recipe 3): the binary result is headed in plain language", () => {
    const html = stage(mockBinaryQuestionTrue, "revealed");
    beat(html, "result");
    assert.match(html, /data-role="question-kicker"><span class="question-source-kicker__words">The answer</, "the result uses a plain-language answer heading");
    assert.doesNotMatch(html, /the evidence says/i, "no redundant 'THE EVIDENCE SAYS' verdict banner");
  });

  it("POLISH-01 / SR-05: MythAmongThree.tsx has no audience discussion control or emoji", () => {
    const html = renderToString(
      React.createElement(MythAmongThree, {
        question: mockMythQuestion,
        isDiscussionPaused: true,
      })
    );
    assert.ok(
      !html.includes("💬"),
      "MythAmongThree.tsx must not contain hardcoded Unicode emoji '💬' (SR-05 glyphs doctrine)"
    );
    assert.ok(!html.includes('data-role="deliberation-discussion-toggle"'));
  });
});
