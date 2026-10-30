import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BinaryQuestion } from "../../src/screens/questions/BinaryQuestion";
import { MythAmongThree } from "../../src/screens/questions/MythAmongThree";
import { WhichPatientQuestion } from "../../src/screens/questions/WhichPatientQuestion";
import type { Question } from "../../src/data/types";

// A11Y-07. Once the host locks a question, the stage shows each choice's live percentage and
// vote count in a sighted-only span next to it. The button/option's own aria-label stayed a
// static "True" / "A: <statement>" the whole time, so a screen-reader user never hears the
// same counts a sighted person can already see. The label must include the same numbers the
// visible stat-slot shows, gated by the same displayVotes flag, and must not leak them before
// lock (VOF-21: voting stays blind until lock).

const binaryQuestion: Question = { id: "aria-binary", type: "question", kind: "binary", statement: "Fixture binary statement.", answer: true } as unknown as Question;
const mythQuestion: Question = {
  id: "aria-myth", type: "question", kind: "myth-among-three",
  statement: "Fixture myth statement.",
  statements: ["First fixture statement.", "Second fixture statement.", "Third fixture statement, the myth."],
  mythIndex: 2,
} as unknown as Question;
const patientQuestion: Question = {
  id: "aria-patient", type: "question", kind: "which-patient",
  statement: "Which reply fits the fixture scenario?",
  choices: ["First fixture reply.", "Second fixture reply, the best one.", "Third fixture reply."],
  bestIndex: 1,
} as unknown as Question;

test("A11Y-07: BinaryQuestion's aria-label includes the vote stats once shown, and stays plain before", () => {
  const before = renderToStaticMarkup(React.createElement(BinaryQuestion, { question: binaryQuestion, showVotes: false }));
  assert.match(before, /aria-label="True"/, "before lock, the label must stay exactly what it always was");
  assert.match(before, /aria-label="False"/);
  assert.doesNotMatch(before, /aria-label="True:/, "must not leak vote stats before lock (VOF-21)");

  const after = renderToStaticMarkup(React.createElement(BinaryQuestion, {
    question: binaryQuestion, showVotes: true, votes: { true: 17, false: 6 },
  }));
  // 17 of 23 = 74%, 6 of 23 = 26%, matching the visible .answer-bar__pct/.answer-bar__votes spans.
  assert.match(after, /aria-label="True: 74%, 17 votes"/, "the accessible name must carry the same stats the sighted stat-slot shows");
  assert.match(after, /aria-label="False: 26%, 6 votes"/);
});

test("A11Y-07: BinaryQuestion's aria-label says '1 vote', never '1 votes'", () => {
  const after = renderToStaticMarkup(React.createElement(BinaryQuestion, {
    question: binaryQuestion, showVotes: true, votes: { true: 1, false: 0 },
  }));
  assert.match(after, /aria-label="True: 100%, 1 vote"/);
  assert.doesNotMatch(after, /1 votes/);
});

test("A11Y-07: MythAmongThree's aria-label includes the vote stats once shown, and stays plain before", () => {
  const before = renderToStaticMarkup(React.createElement(MythAmongThree, { question: mythQuestion, showVotes: false }));
  assert.match(before, /aria-label="A: First fixture statement\."/, "before lock, the label must stay exactly what it always was");
  assert.doesNotMatch(before, /aria-label="A: First fixture statement\.,/, "must not leak vote stats before lock (VOF-21)");

  const after = renderToStaticMarkup(React.createElement(MythAmongThree, {
    question: mythQuestion, showVotes: true, votes: { a: 5, b: 3, c: 12 },
  }));
  // total 20: a=25%, b=15%, c=60%.
  assert.match(after, /aria-label="A: First fixture statement\., 25%, 5 votes"/);
  assert.match(after, /aria-label="C: Third fixture statement, the myth\., 60%, 12 votes"/);
});

test("A11Y-07: WhichPatientQuestion's aria-label includes the vote stats once shown, and stays plain before", () => {
  const before = renderToStaticMarkup(React.createElement(WhichPatientQuestion, { question: patientQuestion, showVotes: false }));
  assert.match(before, /aria-label="A: First fixture reply\."/, "before lock, the label must stay exactly what it always was");
  assert.doesNotMatch(before, /aria-label="A: First fixture reply\.,/, "must not leak vote stats before lock (VOF-21)");

  const after = renderToStaticMarkup(React.createElement(WhichPatientQuestion, {
    question: patientQuestion, showVotes: true, votes: { a: 4, b: 11, c: 2 },
  }));
  // total 17: a=24%, b=65%, c=12%.
  assert.match(after, /aria-label="A: First fixture reply\., 24%, 4 votes"/);
  assert.match(after, /aria-label="B: Second fixture reply, the best one\., 65%, 11 votes"/);
});
