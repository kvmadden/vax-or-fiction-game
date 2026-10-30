import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClosingRecap, recapHeadline } from '../../src/engine/closing-recap';
import type { Question, RoomStatsState, SlideEntry } from '../../src/data/types';

// 2026-09-14 design critique, item 9: the closing ends on the room's three best takeaways from revealed questions,
// with "the one that split us most" from the same stats; no hard-wired "myths busted" zero.
const question = (id: string, takeaway: string, extra: Partial<Question> = {}): Question => ({
  id, kind: 'binary', statement: `${id} statement`, answer: true, reveal: `${id} reveal`, takeaway, ...extra,
} as Question);
const stats = (correctPct: number, votes: number): RoomStatsState['questions'][string] => ({
  kind: 'binary', choices: { true: Math.round(votes * correctPct / 100), false: votes - Math.round(votes * correctPct / 100) },
  trueCount: 0, falseCount: 0, correctPct, majorityWrong: correctPct < 50,
});
const run: SlideEntry[] = [
  { id: 'title', type: 'title', title: 'Vax or Fiction?' } as SlideEntry,
  question('q1', 'First lesson.') as unknown as SlideEntry,
  question('q2', 'Second lesson.') as unknown as SlideEntry,
  question('q3', 'Third lesson.') as unknown as SlideEntry,
  question('q4', 'Fourth lesson.') as unknown as SlideEntry,
  question('q5', 'Fifth lesson.') as unknown as SlideEntry,
];
const room = (questions: RoomStatsState['questions'], votesTotal: number, accuracy: number): RoomStatsState => ({
  questions, accuracy, streak: 1, bestStreak: 2, mythsBusted: 0, swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal,
});

test('takeaways rank the revealed questions most-missed first and name the split', () => {
  const recap = buildClosingRecap(run, room({ q1: stats(100, 3), q2: stats(33, 3), q3: stats(67, 3), q4: stats(0, 3) }, 12, 50));
  assert.equal(recap.hasAnswers, true);
  assert.equal(recap.accuracy, 50);
  assert.equal(recap.answers, 12);
  assert.equal(recap.revealed, 4, 'q5 was never revealed');
  assert.deepEqual(recap.takeaways.map((entry) => entry.questionId), ['q4', 'q2', 'q3']);
  assert.deepEqual(recap.takeaways.map((entry) => entry.text), ['Fourth lesson.', 'Second lesson.', 'Third lesson.']);
  assert.deepEqual(recap.split, { questionId: 'q4', number: 4, headline: 'q4 statement', correctPct: 0, votes: 3 });
});

test('a room that got everything right has no split; ties fall back to run order', () => {
  const recap = buildClosingRecap(run, room({ q1: stats(100, 4), q2: stats(100, 4), q3: stats(100, 4) }, 12, 100));
  assert.equal(recap.split, null);
  assert.deepEqual(recap.takeaways.map((entry) => entry.questionId), ['q1', 'q2', 'q3']);
});

test('one voter cannot split a room, but the takeaways still lead with what that voter missed', () => {
  const recap = buildClosingRecap(run, room({ q1: stats(100, 1), q2: stats(0, 1) }, 2, 50));
  assert.equal(recap.split, null);
  assert.deepEqual(recap.takeaways.map((entry) => entry.questionId), ['q2', 'q1']);
});

test("a zero-vote run is a truthful no-response recap with the run's takeaways in order", () => {
  const recap = buildClosingRecap(run, room({ q1: stats(0, 0), q2: stats(0, 0) }, 0, 0));
  assert.equal(recap.hasAnswers, false);
  assert.equal(recap.accuracy, null, 'never 0% presented as performance (VOF-22)');
  assert.equal(recap.split, null);
  assert.deepEqual(recap.takeaways.map((entry) => entry.questionId), ['q1', 'q2'], 'only revealed questions, in run order');
  const untouched = buildClosingRecap(run, room({}, 0, 0));
  assert.deepEqual(untouched.takeaways.map((entry) => entry.questionId), ['q1', 'q2', 'q3'], 'nothing revealed falls back to the run');
});

test('offline play never scores, even with stale aggregate numbers', () => {
  const recap = buildClosingRecap(run, room({ q1: stats(20, 5) }, 5, 20), { offline: true });
  assert.equal(recap.hasAnswers, false);
  assert.equal(recap.accuracy, null);
  assert.equal(recap.split, null);
  assert.deepEqual(recap.takeaways.map((entry) => entry.questionId), ['q1']);
});

test('questions without a takeaway are skipped and the cap is honoured', () => {
  const sparse: SlideEntry[] = [question('a', ''), question('b', 'B.'), question('c', 'C.'), question('d', 'D.'), question('e', 'E.')] as unknown as SlideEntry[];
  const recap = buildClosingRecap(sparse, room({}, 0, 0), { limit: 2 });
  assert.deepEqual(recap.takeaways.map((entry) => entry.text), ['B.', 'C.']);
  assert.deepEqual(buildClosingRecap(sparse, room({}, 0, 0), { limit: 0 }).takeaways, []);
  assert.deepEqual(buildClosingRecap([], null).takeaways, []);
  assert.equal(buildClosingRecap(undefined, undefined).hasAnswers, false);
});

test('the recap headline is the myth line for a myth-among-three and the statement otherwise', () => {
  const myth = question('m', 'Myth lesson.', { kind: 'myth-among-three', statement: 'The shingles vaccine', statements: ['Two doses.', 'For 50 and older.', 'Not needed after shingles.'], mythIndex: 2, answer: undefined });
  assert.equal(recapHeadline(myth), 'Not needed after shingles.');
  assert.equal(recapHeadline(question('b', 'x', { statement: 'Plain statement.' })), 'Plain statement.');
  assert.equal(recapHeadline(question('w', 'x', { kind: 'which-patient', statement: '', scenario: 'A scenario line.', choices: ['a', 'b'], bestIndex: 0, answer: undefined })), 'A scenario line.');
});
