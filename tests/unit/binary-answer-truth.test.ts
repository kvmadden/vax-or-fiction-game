import test from "node:test";
import assert from "node:assert/strict";
import { evalAnswer } from "../../src/engine/scoring";
import { questionKind, rightToken } from "../../src/engine/kinds";
import { BUNDLED_DECKS } from "../../src/data/decks/index.ts";
import { SOLO_DECKS } from "../../src/data/decks/topics/index.ts";
import type { Deck, Question } from "../../src/data/types";

// QA-FUNC-03. The stage marks a binary answer correct through rightToken, and the room is scored
// through evalAnswer. They must never disagree, and no shipped binary question may lack a boolean answer.

function binaryAnswerProblems(decks: readonly Deck[]): string[] {
  return decks.flatMap((deck) => deck.questions
    .filter((question) => questionKind(question) === "binary" && typeof question.answer !== "boolean")
    .map((question) => `${deck.id}:${question.id} answer=${String(question.answer)}`));
}

test("the scorer agrees with the stage when a binary answer is not a boolean (QA-FUNC-03)", () => {
  for (const answer of [undefined, null, "false", 0]) {
    const question = { id: "qx", kind: "binary", statement: "Fixture statement.", answer } as unknown as Question;
    const staged = rightToken(question);
    const other = staged === "true" ? "false" : "true";
    assert.equal(evalAnswer(question, staged), true, `answer=${String(answer)}: the choice the stage marks correct scores as correct`);
    assert.equal(evalAnswer(question, other), false, `answer=${String(answer)}: the other choice scores as wrong`);
  }
  const authoredTrue = { id: "qt", kind: "binary", statement: "Fixture statement.", answer: true } as unknown as Question;
  const authoredFalse = { id: "qf", kind: "binary", statement: "Fixture statement.", answer: false } as unknown as Question;
  assert.equal(evalAnswer(authoredTrue, "true"), true);
  assert.equal(evalAnswer(authoredTrue, "false"), false);
  assert.equal(evalAnswer(authoredFalse, "false"), true);
  assert.equal(evalAnswer(authoredFalse, "true"), false);
  assert.equal(evalAnswer(authoredTrue, "TRUE"), false, "only the lowercase wire token counts");
});

test("every bundled and solo binary question carries a boolean answer (QA-FUNC-03)", async () => {
  const soloDecks = await Promise.all(Object.values(SOLO_DECKS).map((load) => load()));
  const decks = [...BUNDLED_DECKS, ...soloDecks];
  const binaryCount = decks.flatMap((deck) => deck.questions).filter((question) => questionKind(question) === "binary").length;
  console.log(`BINARY_ANSWER_COVERAGE decks=${decks.length} binaryQuestions=${binaryCount}`);
  assert.equal(decks.length, BUNDLED_DECKS.length + Object.keys(SOLO_DECKS).length, "every deck loaded");
  assert.ok(binaryCount > 0, "the sweep reached binary questions");
  assert.deepEqual(binaryAnswerProblems(decks), []);
  assert.deepEqual(
    binaryAnswerProblems([{ id: "control", questions: [{ id: "qx", kind: "binary", statement: "Control.", answer: undefined }] } as unknown as Deck]),
    ["control:qx answer=undefined"],
    "the checker flags a binary question with no boolean answer",
  );
});
