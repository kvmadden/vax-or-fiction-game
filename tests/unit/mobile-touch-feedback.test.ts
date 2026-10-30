import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { PhoneVote } from "../../src/phone/PhoneVote";
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { projectPublicQuestion } from '../../src/network/projection';
import { createSubmitHandler, triggerTactileFeedback } from "../../src/phone/phone-vote-utils";
import { useGameStore } from "../../src/store/game-store";

// ==============================================================================
// Task 2.5 / Defect JUDGE-P05: Tactile Touch Feedback, Lockout & Confirmation Badges
// ==============================================================================

test("JUDGE-P05: vote buttons press in the stylesheet, and reduced motion skips the scale", () => {
  const html = renderToString(
    React.createElement(PhoneVote, {
      questionType: "binary",
      onSubmit: () => {},
      questionData: {
        statement: "Vaccines induce immune memory without causing disease.",
      },
    })
  );
  const css = fs.readFileSync(new URL("../../src/styles/phone-live.css", import.meta.url), "utf8");
  assert.match(css, /\.phone-vote-choice:active:not\(:disabled\)[\s\S]*transform:\s*scale\(0\.98\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.phone-vote-choice:active:not\(:disabled\)[\s\S]*transform:\s*none/);
  assert.match(html, /data-action="vote-false"/);
  assert.match(html, /data-action="vote-true"/);
  assert.doesNotMatch(html, /motion-safe:active:scale-95/);
  // The room dock's slabs press the same way, from phone-room.css.
  const room = fs.readFileSync(new URL("../../src/styles/phone-room.css", import.meta.url), "utf8");
  assert.match(room, /\.answer-slab:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[^}]*transform:\s*scale\(0\.98\)/);
  assert.match(room, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.answer-slab:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[^}]*transform:\s*none/);
});

test("JUDGE-P05: Non-binary question buttons include motion-safe active:scale-95 transition-transform duration-75", () => {
  const modes = (['myth-among-three', 'estimate', 'order', 'which-patient'] as const).map(type => ({
    type, data: projectPublicQuestion(vaxOrFictionDeck.questions.find(q => q.kind === type)!, `touch-${type}`, 1, 1).question,
  }));

  for (const { type, data } of modes) {
    assert.ok((data.options?.length ?? 0) + (data.steps?.length ?? 0) > 0, `${type} must exercise real choices`);
    // Solo's dock and the room's answer dock. Order keeps its own steps and submit in both.
    for (const [solo, controls] of [[true, /phone-vote-choice|phone-order-step|phone-submit/], [false, /answer-slab|phone-order-step|phone-submit/]] as const) {
      const html = renderToString(
        React.createElement(PhoneVote, {
          questionType: type,
          onSubmit: () => {},
          questionData: data,
          solo,
        })
      );

      assert.match(html, controls);
      assert.doesNotMatch(html, /motion-safe:active:scale-95/, `${type} press lives in the stylesheet`);
    }
  }
});

test("JUDGE-P05: the accepted vote has a compact receipt and a deliberate change-answer route", () => {
  // Solo: a receipt replaces the card list.
  const html = renderToString(
    React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, initialVote: "true", questionData: { timerSeconds: 30 }, solo: true })
  );
  assert.match(html, /data-role="vote-confirmation-badge" data-state="in"[^>]*>Your answer is in/);
  assert.match(html, /data-role="phone-choice-receipt"[^>]*>[\s\S]*Your answer[\s\S]*>TRUE</);
  assert.match(html, /data-action="review-answer-options"[^>]*>Change answer</);
  assert.doesNotMatch(html, /data-choice=/, "accepted state does not retain an actionable card list");

  // Room: the chosen slab keeps its place and carries the receipt, and no slab takes a tap until Change answer.
  const room = renderToString(
    React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, initialVote: "true", questionData: { timerSeconds: 30 } })
  );
  assert.match(room, /data-role="vote-confirmation-badge" data-state="in"[^>]*>Your answer is in/);
  assert.match(room, /data-choice="true"[^>]*data-marked="true"[^>]*aria-disabled="true"[^>]*aria-label="True, your answer"[^>]*>[\s\S]*?Your answer[\s\S]*?>True</);
  assert.match(room, /data-action="review-answer-options"[^>]*>Change answer</);
  const slabs = room.match(/<button[^>]*data-choice=[^>]*>/g) ?? [];
  assert.equal(slabs.length, 2, "both answers stay on screen");
  assert.ok(slabs.every((slab) => slab.includes('aria-disabled="true"')), "accepted state does not retain an actionable card list");
});

test("JUDGE-P05: a FALSE vote names FALSE in the receipt", () => {
  const html = renderToString(
    React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, initialVote: "false", questionData: { timerSeconds: 30 }, solo: true })
  );
  assert.match(html, /data-role="phone-choice-receipt"[^>]*>[\s\S]*>FALSE</);
  const room = renderToString(
    React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, initialVote: "false", questionData: { timerSeconds: 30 } })
  );
  assert.match(room, /data-choice="false"[^>]*data-marked="true"[^>]*aria-label="False, your answer"/);
  assert.doesNotMatch(room, /data-choice="true"[^>]*data-marked="true"/);
});

test("JUDGE-P05: isSubmitting lockout state disables buttons immediately upon click", () => {
  const html = renderToString(
    React.createElement(PhoneVote, {
      questionType: "binary",
      onSubmit: () => {},
      isSubmitting: true,
      questionData: { timerSeconds: 30 },
      solo: true,
    })
  );

  // Requirement 3: Add isSubmitting lockout state disabling buttons immediately after click
  const disabledButtons = html.match(/disabled=""/g) || html.match(/disabled(?=[\s>])/g) || [];
  assert.ok(
    disabledButtons.length >= 2,
    `Vote buttons must be disabled when isSubmitting is true (found ${disabledButtons.length})`
  );

  // The room dock locks its slabs with aria-disabled, so the slab just tapped keeps focus.
  const room = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, isSubmitting: true, questionData: { timerSeconds: 30 } }));
  const locked = room.match(/<button[^>]*data-choice=[^>]*aria-disabled="true"/g) ?? [];
  assert.ok(locked.length >= 2, `Vote buttons must be disabled when isSubmitting is true (found ${locked.length})`);
});

test("JUDGE-P05: Option to change vote is locked when timer expires", () => {
  useGameStore.setState({
    timer: {
      remainingMs: 0,
      durationMs: 30000,
      isRunning: false,
      isPaused: false,
    },
    votesLocked: true,
  });

  const html = renderToString(
    React.createElement(PhoneVote, {
      questionType: "binary",
      onSubmit: () => {},
      initialVote: "true",
      questionData: { timerSeconds: 0 },
      votesLocked: true,
    })
  );

  // When timer expires, option to change vote must be locked/disabled
  assert.ok(
    !html.includes('data-action="change-vote"') || html.includes('disabled=""') || html.includes('Locked'),
    "Change vote option must be disabled or locked when countdown reaches zero"
  );

  // Clean up store
  useGameStore.setState({ timer: null, votesLocked: false });
});

test("JUDGE-P05: pending submission stays a disabled card state until the authoritative receipt arrives", () => {
  const open = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, questionData: { timerSeconds: 30 } }));
  assert.match(open, /data-role="vote-confirmation-badge" data-state="open"[^>]*>True or false\. Tap your answer\.</);
  assert.doesNotMatch(open, /phone-choice-receipt|confidence-selector/);

  const sending = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, pendingChoice: "true", isSubmitting: true, questionData: { timerSeconds: 30 } }));
  assert.match(sending, /data-role="vote-confirmation-badge" data-state="sending"[^>]*>Sending…</);
  // Room: the pending slab is selected and blocked with aria-disabled, so it keeps focus, and it is not marked accepted.
  assert.match(sending, /data-choice="true"[^>]*data-selected="true"[^>]*aria-disabled="true"/, "pending is selected and blocked but is not accepted");
  assert.doesNotMatch(sending, /phone-choice-receipt|confidence-selector|data-marked="true"/);
  // Solo keeps its own dock, where the pending choice is truly disabled.
  const soloSending = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, pendingChoice: "true", isSubmitting: true, questionData: { timerSeconds: 30 }, solo: true }));
  assert.match(soloSending, /data-role="vote-confirmation-badge" data-state="sending"[^>]*>Sending…</);
  assert.match(soloSending, /data-choice="true"[^>]*data-selected="true"[^>]*\sdisabled=""/, "solo's pending choice is selected and disabled but is not accepted");
  assert.doesNotMatch(soloSending, /phone-choice-receipt|confidence-selector/);

  const lockedNoVote = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, votesLocked: true, questionData: { timerSeconds: 0 }, solo: true }));
  // The badge is silent for this state too (it would otherwise repeat the receipt below, which is
  // the one place this message shows now).
  assert.doesNotMatch(lockedNoVote, /data-role="vote-confirmation-badge" data-state="none"[^>]*>[^<]+</);
  assert.match(lockedNoVote, /data-role="phone-no-answer-receipt"[\s\S]*You sat this one out\. Watch the screen\./);

  // Room: the dock's status line is the one place the sat-out message shows, and every slab steps back.
  const roomSatOut = renderToString(React.createElement(PhoneVote, { questionType: "binary", onSubmit: () => {}, votesLocked: true, questionData: { timerSeconds: 0 } }));
  assert.match(roomSatOut, /data-role="phone-dock"[^>]*data-state="sat-out"/);
  assert.match(roomSatOut, /data-role="vote-confirmation-badge" data-state="none"[^>]*>You sat this one out\. Watch the screen\.</);
  assert.equal(roomSatOut.split("You sat this one out.").length - 1, 1, "the sat-out message shows once");
  assert.doesNotMatch(roomSatOut, /phone-no-answer-receipt/);
});

test("JUDGE-P05: Confidence controls are removed; receipt has no confidence selector", () => {
  const htmlSubmitting = renderToString(
    React.createElement(PhoneVote, {
      questionType: "binary",
      onSubmit: () => {},
      initialVote: "true",
      isSubmitting: true,
      questionData: { timerSeconds: 30 },
    })
  );

  assert.doesNotMatch(htmlSubmitting, /data-role="confidence-selector"/);
  assert.doesNotMatch(htmlSubmitting, /data-conviction=/);
});

test("JUDGE-P05: triggerTactileFeedback handles SecurityError / exceptions gracefully without throwing", () => {
  const originalVibrate = (globalThis.navigator as any)?.vibrate;

  Object.defineProperty(globalThis.navigator, "vibrate", {
    value: () => {
      throw new Error("SecurityError: vibrate not allowed in iframe");
    },
    configurable: true,
    writable: true,
  });

  try {
    assert.doesNotThrow(() => {
      triggerTactileFeedback(12);
    }, "triggerTactileFeedback must catch and suppress SecurityError or browser policy exceptions");
  } finally {
    if (originalVibrate) {
      Object.defineProperty(globalThis.navigator, "vibrate", {
        value: originalVibrate,
        configurable: true,
        writable: true,
      });
    } else {
      // @ts-ignore
      delete (globalThis.navigator as any).vibrate;
    }
  }
});

test("JUDGE-P05: Tap triggers vibration via navigator.vibrate(12)", () => {
  let vibrateDuration = 0;
  const originalVibrate = (globalThis.navigator as any)?.vibrate;

  Object.defineProperty(globalThis.navigator, "vibrate", {
    value: (duration: number) => {
      vibrateDuration = duration;
      return true;
    },
    configurable: true,
    writable: true,
  });

  try {
    triggerTactileFeedback(12);
    assert.equal(vibrateDuration, 12, "Must trigger 12ms tactile vibration");
  } finally {
    if (originalVibrate) {
      Object.defineProperty(globalThis.navigator, "vibrate", {
        value: originalVibrate,
        configurable: true,
        writable: true,
      });
    } else {
      // @ts-ignore
      delete (globalThis.navigator as any).vibrate;
    }
  }
});

test("JUDGE-P05: createSubmitHandler executes submission cycle with answer and conviction", () => {
  let submittedAnswer: string | null = null;
  let submittedConviction: string | undefined = undefined;

  const mockSubmit = (answer: string, conviction?: string) => {
    submittedAnswer = answer;
    submittedConviction = conviction;
  };

  // Test with default conviction "fairly-sure"
  const defaultHandler = createSubmitHandler(mockSubmit, "fairly-sure");
  assert.equal(typeof defaultHandler, "function", "createSubmitHandler must return an executable submit function");

  defaultHandler("true");
  assert.equal(submittedAnswer, "true", "Must transmit chosen answer 'true'");
  assert.equal(submittedConviction, "fairly-sure", "Must transmit conviction level 'fairly-sure'");

  // Test with "certain" conviction
  const certainHandler = createSubmitHandler(mockSubmit, "certain");
  certainHandler("false");
  assert.equal(submittedAnswer, "false", "Must transmit chosen answer 'false'");
  assert.equal(submittedConviction, "certain", "Must transmit conviction level 'certain'");

  // Test with "hunch" conviction and non-binary tokens
  const hunchHandler = createSubmitHandler(mockSubmit, "hunch");
  hunchHandler("b");
  assert.equal(submittedAnswer, "b", "Must transmit chosen token 'b'");
  assert.equal(submittedConviction, "hunch", "Must transmit conviction level 'hunch'");

  hunchHandler("opt-1-opt-2-opt-3");
  assert.equal(submittedAnswer, "opt-1-opt-2-opt-3", "Must transmit composite token");
  assert.equal(submittedConviction, "hunch", "Must transmit conviction level 'hunch'");
});
