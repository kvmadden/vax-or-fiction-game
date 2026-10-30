import test from "node:test";
import assert from "node:assert/strict";
import {
  createQuestionLocalState,
  localStateForQuestion,
  questionAnnouncement,
  updateLocalStateForQuestion,
} from "../../src/screens/question-state";

test("question-local state derives a clean session when the question identity changes", () => {
  const first = updateLocalStateForQuestion(createQuestionLocalState("q1"), "q1", {
    subPhase: "revealed",
    votingWindow: "locked",
    selectedChoice: "true",
  });

  assert.deepEqual(localStateForQuestion(first, "q2"), {
    questionId: "q2",
    subPhase: "entering",
    votingWindow: "open",
    selectedChoice: null,
  });
});

test("question announcements derive slide, countdown, lock, and reveal text from current state", () => {
  const base = {
    slideAnnouncement: "Question 2 of 5: Influenza vaccination.",
    votesIn: 3,
    phonesJoined: 4,
  };

  assert.equal(questionAnnouncement({ ...base, phase: "entering", remainingSeconds: 30 }), base.slideAnnouncement);
  assert.equal(questionAnnouncement({ ...base, phase: "deliberating", remainingSeconds: 10 }), "10 seconds remaining");
  assert.equal(questionAnnouncement({ ...base, phase: "deliberating", remainingSeconds: 5 }), "5 seconds remaining");
  assert.equal(questionAnnouncement({ ...base, phase: "locked", remainingSeconds: 0 }), "Votes locked. 3 votes.");
  assert.equal(questionAnnouncement({ ...base, phase: "revealed", remainingSeconds: 0 }), "Answer revealed.");
});

// A11Y-06. "Answer revealed." alone tells a screen-reader user nothing about what the answer
// actually was, while the sighted stage already shows the correct choice on the same card. The
// revealed announcement must name it when the caller supplies it, and must stay exactly
// "Answer revealed." (the test above) when it does not, so existing callers are unaffected.
test("the revealed announcement names the correct choice when supplied, and stays plain without it", () => {
  const base = {
    slideAnnouncement: "Question 2 of 5: Influenza vaccination.",
    votesIn: 3,
    phonesJoined: 4,
    remainingSeconds: 0,
  };
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "TRUE" }),
    "Answer revealed. Correct choice: TRUE.",
  );
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "" }),
    "Answer revealed.",
    "an empty answer text must not append a bare 'Correct choice: .'",
  );
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed" }),
    "Answer revealed.",
    "omitting the field entirely must not change the existing announcement",
  );
  // The extension must only ever apply to the revealed phase.
  assert.equal(
    questionAnnouncement({ ...base, phase: "locked", revealedAnswerText: "TRUE" }),
    "Votes locked. 3 votes.",
  );
});

// NIT (q16 punctuation): a trailing period alone was trimmed before the announcement added its
// own, but which-patient's spoken reply text is wrapped in curly quotes (engine/kinds.ts
// spokenReplyText), so the character right at the end is the closing quote, not the period, and
// the existing regex finds nothing to strip. q16's reveal announced "...still helps.".", a
// doubled period-then-quote-then-period reading like a stutter.
// QUOTE-PERIOD (round 7): trimming the closing quote fixed the doubled ending but left every
// which-patient announcement with an unbalanced opening quote, and the straight ' in the trim set
// also stripped a possessive plural's apostrophe. Nothing is trimmed now. The announcement adds
// its own period only when the text does not already end in terminal punctuation, optionally
// followed by closing quotes.
test("the revealed announcement keeps a quoted reply's quotes balanced and adds a period only when none ends the text", () => {
  const base = {
    slideAnnouncement: "Question 16 of 35: The better reply.",
    votesIn: 3,
    phonesJoined: 4,
    remainingSeconds: 0,
  };
  assert.equal(
    questionAnnouncement({
      ...base, phase: "revealed",
      revealedAnswerText: "“Having had it doesn’t protect you going forward, but the vaccine still helps.”",
      revealedAnswerLabel: "Better reply",
    }),
    "Answer revealed. Better reply: “Having had it doesn’t protect you going forward, but the vaccine still helps.”",
    "a quoted reply that already ends in a period keeps both quotes and gains no second period",
  );
  // A straight closing quote after the period is left alone the same way.
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "\"Fixture reply.\"", revealedAnswerLabel: "Better reply" }),
    "Answer revealed. Better reply: \"Fixture reply.\"",
  );
  // The sentence-form path (order's "Correct order") follows the same rule.
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "‘Third statement, the myth.’", revealedAnswerIsSentence: true }),
    "Answer revealed. ‘Third statement, the myth.’",
  );
  // A plain trailing period alone (no quote) keeps working exactly as before.
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "Third statement, the myth.", revealedAnswerIsSentence: true }),
    "Answer revealed. Third statement, the myth.",
  );
  // A possessive plural's apostrophe is not a closing quote to strip: the period goes after it.
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "Ask about the nurses'", revealedAnswerLabel: "Better reply" }),
    "Answer revealed. Better reply: Ask about the nurses'.",
  );
  // A question mark or exclamation mark already ends the sentence, quoted or not.
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "“Would you like it today?”", revealedAnswerLabel: "Better reply" }),
    "Answer revealed. Better reply: “Would you like it today?”",
  );
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "Not today!", revealedAnswerIsSentence: true }),
    "Answer revealed. Not today!",
  );
  // A quote with no terminal punctuation inside still gets the announcement's own period.
  assert.equal(
    questionAnnouncement({ ...base, phase: "revealed", revealedAnswerText: "“Take it now”", revealedAnswerLabel: "Better reply" }),
    "Answer revealed. Better reply: “Take it now”.",
  );
});
