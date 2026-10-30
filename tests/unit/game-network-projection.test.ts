import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { Question } from '../../src/data/types';
import type { GameState } from '../../src/store/game-store';
import { projectAttendeeState, projectGameState } from '../../src/network/game-projection';
import { randomOrderScramble } from '../../src/network/projection';

function fixtureState(): GameState {
  const question: Question = {
    id: 'q-order', kind: 'order', statement: 'Arrange synthetic steps', answer: true,
    steps: ['First', 'Second', 'Third'], reveal: 'Explanation', takeaway: 'Takeaway',
    presenterNote: 'private note',
  };
  return {
    sessionId: 'run-1',
    run: [question as never],
    slideIndex: 0,
    phase: 'deliberating',
    leaderboardEnabled: false,
    votesLocked: false,
    timer: { durationMs: 30_000, remainingMs: 20_000, running: true, enabled: true, visible: true, pauseReason: null, generation: 1, endsAt: 20_000 },
    seenDevices: {
      alpha: { nickname: 'Ada', team: 'NAVY', joinedAt: 1, score: 5, answered: 2, correct: 2, streak: 2, bestStreak: 2, realityGap: 0 },
      beta: { nickname: 'Ben', team: 'GOLD', joinedAt: 2, score: 5, answered: 2, correct: 1, streak: 0, bestStreak: 1, realityGap: 1 },
    },
    pollVoters: { 'q-order': { alpha: { choice: 'a-b-c', conviction: 'certain' } } },
    settledResults: {},
    commitments: {},
    roomStats: { teams: { NAVY: { score: 5 }, GOLD: { score: 5 } } },
    showdown: null,
    // 8.6: projectGameState throws in development if an order question's occurrence has no armed
    // scramble (a real bug everywhere but here, since this fixture skips the store's own arming
    // reducers entirely), so this hand-built fixture arms one itself, matching what
    // rearmQuestion would have drawn for this exact occurrence (run-1:0:q-order).
    orderScrambles: { 'run-1:0:q-order': randomOrderScramble(3) },
    dispatch: () => {},
  } as unknown as GameState;
}

test('game projection with default rankings off does not publish room leaderboard, but attendee still receives rank', () => {
  const state = fixtureState();
  const projected = projectGameState(state, 'Room_A', 7, 1_000);
  assert.equal(projected.roomState.roomId, 'Room_A');
  assert.equal(projected.roomState.revision, 7);
  assert.equal(projected.roomState.timerSeconds, 19);
  assert.equal(projected.roomState.participants, 2);
  assert.deepEqual(projected.roomState.leaderboard, []);
  assert.equal(projectAttendeeState(state, 'alpha', projected.questionProjection).rank, 1);
  assert.doesNotMatch(JSON.stringify(projected.roomState), /private note|presenterNote|"answer"/);
});

test('explicitly enabled rankings publish actual room and attendee rank', () => {
  const state = fixtureState();
  state.leaderboardEnabled = true;
  const projected = projectGameState(state, 'Room_A', 7, 1_000);
  assert.deepEqual(projected.roomState.leaderboard.map(({ name, rank }) => ({ name, rank })), [
    { name: 'Ada', rank: 1 }, { name: 'Ben', rank: 2 },
  ]);
  assert.equal(projectAttendeeState(state, 'alpha', projected.questionProjection).rank, 1);
});

test('attendee projection returns acknowledged vote tokens and only that attendee result', () => {
  const state = fixtureState();
  state.leaderboardEnabled = true;
  const projected = projectGameState(state, 'Room_A', 1);
  const attendee = projectAttendeeState(state, 'alpha', projected.questionProjection);
  assert.equal(attendee.registered, true);
  assert.equal(attendee.nickname, 'Ada');
  assert.ok(attendee.vote?.choice.startsWith('s'), 'canonical order letters are re-encoded for the phone');
  assert.equal(attendee.score, 5);
  assert.equal(attendee.rank, 1);
  assert.equal(attendee.totalParticipants, 2);
  assert.equal(attendee.accuracy, 100);
  assert.equal(attendee.result, null);
});

// W8 / TW-1: the room-wide leaderboard is filtered, but the owning device's own attendee projection
// shows the name the player actually typed, not the neutral fallback (filter only the surfaces the
// room sees). The production relay (supabase/migrations, vof_relay) rejects any room state,
// question, reveal, showdown or attendee-state object whose keys it does not recognize, at every
// nested level, so a field added on the wire here but not there silently stops every room update
// (or one attendee's own phone) in production. b575c47 is exactly that story: NIT-7 widened the
// wire leaderboard entry (adding joinedAt) in the client guard and the local dev relay together, so
// the two agreed with each other and hid the drift from every local test, while the untouched
// production SQL contract would have rejected every scored broadcast from the first vote onward.
// These read the newest migration that (create or replace) defines each validator, never assuming
// which file holds the truth, isolate that one function's own body (a migration can define more
// than one function, so scanning the whole file risks matching a different function's own
// has_only_keys call), and hold the host's and each attendee's real projection to exactly what is
// accepted, at every level, through the same JSON serialization the wire actually uses (a key whose
// value is explicitly `undefined` is present to Object.keys but absent once JSON.stringify drops it,
// so checking the raw object could pass or fail for the wrong reason).
function migrationFiles(): URL[] {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  return fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort().map((name) => new URL(name, dir));
}

/** The body (the text from `create (or replace) function vof_relay.<name>(` to that function's own
 * closing `$$;`) of whichever migration most recently defines vof_relay.<name>. */
function relayFunctionBody(name: string): string {
  const files = migrationFiles();
  const defining = files.filter((url) => new RegExp(`function vof_relay\\.${name}\\(`).test(fs.readFileSync(url, 'utf8')));
  assert.ok(defining.length > 0, `a migration defines vof_relay.${name}`);
  const sql = fs.readFileSync(defining.at(-1)!, 'utf8');
  const body = sql.match(new RegExp(`create (?:or replace )?function vof_relay\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  assert.ok(body, `found vof_relay.${name}'s own function body`);
  return body[0];
}

const sqlKeys = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();

/** The Nth has_only_keys(subject, array[allowed], array[required]) call in a function body whose
 * subject text matches exactly, so a bare `value` can never accidentally match a longer expression
 * like `value->'teamScores'`. */
function hasOnlyKeysRule(body: string, subject: string, occurrence = 0): { allowed: string[]; required: string[] } {
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`has_only_keys\\(\\s*${escaped}\\s*,\\s*array\\[([^\\]]+)\\]\\s*,\\s*array\\[([^\\]]+)\\]`, 'g');
  const matches = [...body.matchAll(re)];
  assert.ok(matches.length > occurrence, `has_only_keys(${subject}, ...) occurrence ${occurrence} not found (${matches.length} present)`);
  const [, allowedText, requiredText] = matches[occurrence]!;
  return { allowed: sqlKeys(allowedText), required: sqlKeys(requiredText) };
}

/** Round-trips `value` through JSON (the wire's own serialization) before asserting its keys sit
 * between `rule.required` (nothing missing) and `rule.allowed` (nothing extra), matching exactly
 * what vof_relay.has_only_keys enforces. */
function assertKeyParity(label: string, value: unknown, rule: { allowed: string[]; required: string[] }): void {
  const wire = JSON.parse(JSON.stringify(value));
  assert.ok(wire && typeof wire === 'object' && !Array.isArray(wire), `${label}: must be a plain object on the wire`);
  const actual = Object.keys(wire).sort();
  const missing = rule.required.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !rule.allowed.includes(key));
  assert.deepEqual(missing, [], `${label}: missing required key(s) the production relay demands (${missing.join(', ')}); has ${actual.join(', ')}`);
  assert.deepEqual(extra, [], `${label}: key(s) the production relay would reject (${extra.join(', ')}); allowed ${rule.allowed.join(', ')}`);
}

test('assertKeyParity catches a missing required key and an extra key alike, and never a JSON-stripped undefined (control)', () => {
  const rule = { allowed: ['a', 'b', 'c'], required: ['a', 'b'] };
  assert.doesNotThrow(() => assertKeyParity('clean', { a: 1, b: 2 }, rule));
  assert.throws(() => assertKeyParity('missing', { a: 1 }, rule), /missing required key/);
  assert.throws(() => assertKeyParity('extra', { a: 1, b: 2, z: 9 }, rule), /key\(s\) the production relay would reject/);
  assert.doesNotThrow(() => assertKeyParity('undefined-stripped', { a: 1, b: 2, c: undefined }, rule),
    'a key present only as undefined must read as absent, matching JSON.stringify, not as an extra key');
});

test('every wire leaderboard entry has exactly the keys the production relay accepts, required included', () => {
  const rule = hasOnlyKeysRule(relayFunctionBody('valid_room_state'), 'item');
  assert.ok(rule.allowed.length >= 4, `parsed the production leaderboard keys (${rule.allowed.join(', ')})`);
  const state = fixtureState();
  state.leaderboardEnabled = true;
  state.seenDevices = {
    alpha: { nickname: 'Player', team: 'NAVY', joinedAt: 111, score: 5, answered: 2, correct: 2, streak: 2, bestStreak: 2, realityGap: 0 },
    beta: { nickname: 'Player', team: 'GOLD', joinedAt: 222, score: 5, answered: 2, correct: 1, streak: 2, bestStreak: 2, realityGap: 0 },
  } as any;
  const { leaderboard } = projectGameState(state, 'Room_A', 1).roomState;
  assert.equal(leaderboard.length, 2, 'the fixture reaches the wire leaderboard');
  for (const entry of leaderboard) assertKeyParity('leaderboard[]', entry, rule);
});

test('the projected room state uses only top-level keys the production relay accepts, required included', () => {
  const rule = hasOnlyKeysRule(relayFunctionBody('valid_room_state'), 'value');
  assert.ok(rule.allowed.includes('leaderboard') && rule.allowed.includes('phase'), 'parsed the production top-level keys');
  const projected = projectGameState(fixtureState(), 'Room_A', 1).roomState;
  assertKeyParity('roomState', projected, rule);
});

test('teamScores key parity (production relay valid_room_state)', () => {
  const rule = hasOnlyKeysRule(relayFunctionBody('valid_room_state'), "value->'teamScores'");
  const projected = projectGameState(fixtureState(), 'Room_A', 1).roomState;
  assert.ok(projected.teamScores, 'the default fixture reaches the wire with teamScores populated');
  assertKeyParity('teamScores', projected.teamScores, rule);
});

function stateWithEstimateQuestion(): GameState {
  const question = {
    id: 'q-estimate', kind: 'estimate', statement: 'Estimate the percentage', answer: true,
    estimate: { value: 40, unit: '%', tolerance: 5, ranges: [{ label: 'Low', min: 0, max: 30 }, { label: 'High', min: 31, max: 100 }] },
    reveal: 'Explanation', takeaway: 'Takeaway',
  } as unknown as Question;
  return { ...fixtureState(), run: [question as never], slideIndex: 0 } as GameState;
}

test('questionData key parity at every level, including an options item with min/max and unit (production relay valid_public_question)', () => {
  const body = relayFunctionBody('valid_public_question');
  const topRule = hasOnlyKeysRule(body, 'value');
  const optionRule = hasOnlyKeysRule(body, 'item');
  assert.ok(topRule.allowed.includes('unit') && !topRule.required.includes('unit'), 'unit must be allowed but optional at the top level');
  const projected = projectGameState(stateWithEstimateQuestion(), 'Room_A', 1).roomState;
  assertKeyParity('questionData', projected.questionData, topRule);
  const options = (projected.questionData as any).options as Array<Record<string, unknown>>;
  assert.ok(options.length >= 2 && options.some((option) => option.min !== undefined), 'the estimate fixture reaches the wire with a min/max option');
  for (const option of options) assertKeyParity('questionData.options[]', option, optionRule);
});

test('questionData steps key parity, order kind (production relay valid_public_question)', () => {
  const stepRule = hasOnlyKeysRule(relayFunctionBody('valid_public_question'), 'item', 1);
  // The default fixture question is an order kind, which carries steps instead of options.
  const projected = projectGameState(fixtureState(), 'Room_A', 1).roomState;
  const steps = (projected.questionData as any).steps as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(steps) && steps.length > 0, 'the default order fixture reaches the wire with steps');
  for (const step of steps) assertKeyParity('questionData.steps[]', step, stepRule);
});

function stateWithRevealedCitations(): GameState {
  const question = {
    id: 'q-cited', kind: 'binary', statement: 'Something citeable', answer: true,
    reveal: 'Explanation body', takeaway: 'Takeaway line',
    citations: [
      { publisher: 'cdc-mmwr-7245', shortDisplayLine: 'CDC MMWR 74(5)', url: 'https://www.cdc.gov/mmwr/volumes/74/wr/example.htm' },
      { publisher: 'who-fact-sheet', shortDisplayLine: 'WHO fact sheet' },
    ],
  } as unknown as Question;
  return { ...fixtureState(), run: [question as never], slideIndex: 0, phase: 'revealed', votesLocked: true } as GameState;
}

test('reveal key parity, including a citation with and without its optional url (production relay valid_reveal)', () => {
  const body = relayFunctionBody('valid_reveal');
  const topRule = hasOnlyKeysRule(body, 'value');
  const citationRule = hasOnlyKeysRule(body, 'item');
  assert.ok(citationRule.allowed.includes('url') && !citationRule.required.includes('url'), 'a citation url is allowed but optional');
  const projected = projectGameState(stateWithRevealedCitations(), 'Room_A', 1).roomState;
  assertKeyParity('reveal', projected.reveal, topRule);
  const citations = (projected.reveal as any).citations as Array<Record<string, unknown>>;
  assert.equal(citations.length, 2, 'both citations reach the wire');
  assert.ok(citations.some((c) => 'url' in c) && citations.some((c) => !('url' in c)), 'both the with-url and without-url shapes are exercised');
  for (const citation of citations) assertKeyParity('reveal.citations[]', citation, citationRule);
});

// The emphasis and reply keys (supabase/migrations/20260929140000_...emphasis_reply.sql): a question, a reveal and a
// closing recap that carry every one of them must still sit inside the newest production has_only_keys rule.
function stateWithEmphasis(phase: string, slideIndex = 0): GameState {
  const emphasized = (id: string, extra: Record<string, unknown>) => ({
    id, type: 'question', statement: `Synthetic stem ${id}, only once.`, reveal: `Synthetic reveal ${id}, every time.`,
    takeaway: `Synthetic takeaway ${id}, always.`, emphasis: ['only'], revealEmphasis: ['every time'], takeawayEmphasis: ['always'], ...extra,
  });
  const run = [
    emphasized('q-patient', { kind: 'which-patient', statement: 'Which reply is better, only once?', choices: ['First', 'Second'], bestIndex: 0, reply: true }),
    emphasized('q-two', { kind: 'binary', answer: true }),
    emphasized('q-three', { kind: 'binary', answer: false, takeawayEmphasis: undefined }),
  ];
  return { ...fixtureState(), run: run as never, slideIndex, phase, votesLocked: phase !== 'deliberating', orderScrambles: {} } as unknown as GameState;
}

test('questionData, reveal and closing recap carrying every emphasis key and the reply flag keep key parity with the production relay', () => {
  const questionRule = hasOnlyKeysRule(relayFunctionBody('valid_public_question'), 'value');
  const revealRule = hasOnlyKeysRule(relayFunctionBody('valid_reveal'), 'value');
  const voting = projectGameState(stateWithEmphasis('deliberating'), 'Room_A', 1).roomState;
  assert.equal(voting.questionData?.reply, true, 'the fixture reaches the wire with the reply flag');
  assert.deepEqual(voting.questionData?.emphasis, ['only'], 'and with its stem phrases');
  assertKeyParity('questionData', voting.questionData, questionRule);

  const revealed = projectGameState(stateWithEmphasis('revealed'), 'Room_A', 2).roomState;
  assert.deepEqual([revealed.reveal?.explanationEmphasis, revealed.reveal?.takeawayEmphasis], [['every time'], ['always']], 'the reveal carries both lists');
  assertKeyParity('reveal', revealed.reveal, revealRule);

  const closing = projectGameState(stateWithEmphasis('closing', 2), 'Room_A', 3).roomState;
  assert.deepEqual(closing.reveal?.takeaway.split('\n'), ['Synthetic takeaway q-patient, always.', 'Synthetic takeaway q-two, always.', 'Synthetic takeaway q-three, always.']);
  assert.deepEqual(closing.reveal?.takeawayLineEmphasis, [['always'], ['always'], []], 'one list per line, in line order, empty where a line has none');
  assert.equal(closing.reveal?.explanationEmphasis, undefined, 'the closing heading is not a reveal, so it carries no reveal phrases');
  assertKeyParity('closing reveal', closing.reveal, revealRule);

  const bare = projectGameState({ ...stateWithEmphasis('closing', 2), run: stateWithEmphasis('closing').run.map((slide) => ({ ...slide, takeawayEmphasis: undefined })) } as GameState, 'Room_A', 4).roomState;
  assert.equal(bare.reveal && 'takeawayLineEmphasis' in bare.reveal, false, 'a closing with no phrases on any line sends no key at all');
});

function stateWithShowdown(): GameState {
  const state = fixtureState();
  return {
    ...state,
    phase: 'showdown',
    showdown: {
      id: `${state.sessionId}:showdown`, stage: 'duel',
      finalists: [
        { ticket: 'a', name: 'Ada', score: 12, duelPoints: 2 },
        { ticket: 'b', name: 'Ben', score: 9, duelPoints: 1 },
      ],
      predictions: { alpha: 'a' }, predictionCounts: { a: 1 },
      questionIds: [], questionIndex: 0, winner: 'a', tie: false, isRecap: false,
    },
  } as unknown as GameState;
}

test('showdown key parity, including a finalist (production relay valid_showdown)', () => {
  const body = relayFunctionBody('valid_showdown');
  const topRule = hasOnlyKeysRule(body, 'value');
  const finalistRule = hasOnlyKeysRule(body, 'item.value');
  const projected = projectGameState(stateWithShowdown(), 'Room_A', 1).roomState;
  assertKeyParity('showdown', projected.showdown, topRule);
  const finalists = (projected.showdown as any).finalists as Array<Record<string, unknown>>;
  assert.equal(finalists.length, 2, 'both finalists reach the wire');
  for (const finalist of finalists) assertKeyParity('showdown.finalists[]', finalist, finalistRule);
});

test("attendee state key parity, including a populated vote and result (production relay's attendee validator)", () => {
  const body = relayFunctionBody('valid_attendee_state');
  const topRule = hasOnlyKeysRule(body, 'value');
  const voteRule = hasOnlyKeysRule(body, "value->'vote'");
  const resultRule = hasOnlyKeysRule(body, "value->'result'");
  const state = fixtureState();
  state.phase = 'revealed';
  state.votesLocked = true;
  state.settledResults = {
    'run-1:0:q-order': { alpha: { choice: 'a-b-c', conviction: 'certain', isRight: true, score: 3, realityGapDelta: 0 } },
  };
  const projected = projectGameState(state, 'Room_A', 2);
  const attendee = projectAttendeeState(state, 'alpha', projected.questionProjection);
  assertKeyParity('attendeeState', attendee, topRule);
  assert.ok(attendee.vote, 'the fixture reaches the wire with a populated vote');
  assertKeyParity('attendeeState.vote', attendee.vote, voteRule);
  assert.ok(attendee.result, 'the fixture reaches the wire with a populated result');
  assertKeyParity('attendeeState.result', attendee.result, resultRule);
});

test('a flagged name reaches the room leaderboard filtered but the owning attendee sees their own raw name', () => {
  const state = fixtureState();
  state.leaderboardEnabled = true;
  state.seenDevices = {
    alpha: { nickname: 'Player', rawNickname: 'total bastard', team: 'NAVY', joinedAt: 1, score: 5, answered: 2, correct: 2, streak: 2, bestStreak: 2, realityGap: 0 } as never,
    beta: { nickname: 'Ben', team: 'GOLD', joinedAt: 2, score: 5, answered: 2, correct: 1, streak: 0, bestStreak: 1, realityGap: 1 },
  };
  const projected = projectGameState(state, 'Room_A', 1);
  assert.deepEqual(projected.roomState.leaderboard.map((entry) => entry.name), ['Player', 'Ben']);
  const attendee = projectAttendeeState(state, 'alpha', projected.questionProjection);
  assert.equal(attendee.nickname, 'total bastard', "the device's own attendee state carries its raw name");
});

test('revealed attendee projection uses settled truth and leaves unanswered people empty', () => {
  const state = fixtureState();
  state.phase = 'revealed';
  state.votesLocked = true;
  state.settledResults = {
    'run-1:0:q-order': { alpha: { choice: 'a-b-c', conviction: 'certain', isRight: true, score: 3, realityGapDelta: 0 } },
  };
  const projected = projectGameState(state, 'Room_A', 2);
  const alpha = projectAttendeeState(state, 'alpha', projected.questionProjection);
  const beta = projectAttendeeState(state, 'beta', projected.questionProjection);
  assert.deepEqual(alpha.result && { isCorrect: alpha.result.isCorrect, points: alpha.result.points }, { isCorrect: true, points: 3 });
  assert.equal(beta.result, null);
});

// 2026-09-14 design critique, item 9: at closing the public `reveal` slot carries the room line and the takeaways
// (aggregate only) so the phone can end where the stage ends; every validator already admits reveal at closing.
test('closing projects the room line and takeaways through the public reveal slot, aggregate only', () => {
  const base = fixtureState();
  const second: Question = { id: 'q-two', kind: 'binary', statement: 'Second', answer: false, reveal: 'Why', takeaway: 'Second lesson.' } as Question;
  const state = {
    ...base,
    phase: 'closing',
    slideIndex: 2,
    run: [base.run[0], second as never, { id: 'closing', type: 'closing', title: 'Closing' } as never],
    offlineMode: false,
    roomStats: {
      ...base.roomStats, votesTotal: 4, accuracy: 50, bestStreak: 1,
      questions: {
        'q-order': { kind: 'order', choices: { 'a-b-c': 2 }, trueCount: 0, falseCount: 0, correctPct: 100, majorityWrong: false },
        'q-two': { kind: 'binary', choices: { true: 1, false: 1 }, trueCount: 1, falseCount: 1, correctPct: 0, majorityWrong: true },
      },
    },
  } as unknown as GameState;
  const projected = projectGameState(state, 'Room_A', 9, 1_000);
  assert.deepEqual(projected.roomState.reveal, {
    answerLabel: 'The room got 50% right.',
    answerToken: 'closing',
    explanation: 'To take back to the counter',
    takeaway: 'Second lesson.\nTakeaway',
    citations: [],
  });
  assert.doesNotMatch(JSON.stringify(projected.roomState), /private note/, 'presenter-only note never leaves the host');
  assert.equal(projected.roomState.leaderboard.length, 2, 'closing phase carries the final room leaderboard');
  const offline = projectGameState({ ...state, offlineMode: true } as GameState, 'Room_A', 9, 1_000);
  assert.equal(offline.roomState.reveal?.answerLabel, 'Thanks for playing.', 'offline never publishes a score');
  const silent = projectGameState({ ...state, run: [{ id: 'closing', type: 'closing', title: 'Closing' } as never], roomStats: { ...state.roomStats, votesTotal: 0, questions: {} } } as GameState, 'Room_A', 9, 1_000);
  assert.equal(silent.roomState.reveal, null, 'nothing to say means no closing reveal');
});

test('title and instructions project their slide id without questionData so phones can wait on the opening', () => {
  const title = projectGameState({
    ...fixtureState(),
    phase: 'entering',
    slideIndex: 0,
    run: [
      { id: 'title', type: 'title', title: 'Vax or Fiction?' } as never,
      { id: 'instructions', type: 'instructions', title: 'Talk first.' } as never,
      fixtureState().run[0],
    ],
  } as GameState, 'ROOM', 1, 1_000);
  assert.equal(title.roomState.question, 'title');
  assert.equal(title.roomState.questionData, null);
  const instructions = projectGameState({
    ...fixtureState(),
    phase: 'entering',
    slideIndex: 1,
    run: [
      { id: 'title', type: 'title', title: 'Vax or Fiction?' } as never,
      { id: 'instructions', type: 'instructions', title: 'Talk first.' } as never,
      fixtureState().run[0],
    ],
  } as GameState, 'ROOM', 1, 1_000);
  assert.equal(instructions.roomState.question, 'instructions');
  assert.equal(instructions.roomState.questionData, null);
});

test('totalParticipants in attendee projection counts only devices with non-empty nickname and answered > 0', () => {
  const state = fixtureState();
  state.seenDevices = {
    alpha: { nickname: 'Ada', team: 'NAVY', joinedAt: 1, score: 100, answered: 2, correct: 2, streak: 2, bestStreak: 2, realityGap: 0, hardQuestionPoints: 0 },
    beta: { nickname: 'Ben', team: 'GOLD', joinedAt: 2, score: 50, answered: 1, correct: 1, streak: 0, bestStreak: 1, realityGap: 0, hardQuestionPoints: 0 },
    ghostEmpty: { nickname: '', team: null, joinedAt: 3, score: 0, answered: 2, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    ghostWhitespace: { nickname: '   ', team: null, joinedAt: 4, score: 0, answered: 1, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    ghostZeroAnswered: { nickname: 'Casper', team: null, joinedAt: 5, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    ghostUndefinedNick: { nickname: undefined as unknown as string, team: null, joinedAt: 6, score: 0, answered: 1, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
  };
  const projected = projectGameState(state, 'Room_A', 1);
  const attendee = projectAttendeeState(state, 'alpha', projected.questionProjection);
  assert.equal(attendee.totalParticipants, 2);
});

test('attendee rank uses rankLeaderboard tiebreakers and calculates rank regardless of leaderboardEnabled', () => {
  const state = fixtureState();
  state.leaderboardEnabled = false;
  state.seenDevices = {
    d1: { nickname: 'StreakChamp', team: 'NAVY', joinedAt: 1, score: 100, answered: 2, correct: 2, streak: 3, bestStreak: 3, hardQuestionPoints: 0, realityGap: 0 },
    d2: { nickname: 'LowerStreak', team: 'GOLD', joinedAt: 2, score: 100, answered: 2, correct: 2, streak: 1, bestStreak: 1, hardQuestionPoints: 0, realityGap: 0 },
    d3: { nickname: 'HardChamp', team: 'NAVY', joinedAt: 3, score: 80, answered: 2, correct: 1, streak: 1, bestStreak: 1, hardQuestionPoints: 100, realityGap: 0 },
    d4: { nickname: 'RegularQ', team: 'GOLD', joinedAt: 4, score: 80, answered: 2, correct: 1, streak: 1, bestStreak: 1, hardQuestionPoints: 0, realityGap: 0 },
    d5: { nickname: 'NoAnswers', team: null, joinedAt: 5, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0 },
  };
  const projected = projectGameState(state, 'Room_A', 1);
  assert.equal(projectAttendeeState(state, 'd1', projected.questionProjection).rank, 1);
  assert.equal(projectAttendeeState(state, 'd2', projected.questionProjection).rank, 2);
  assert.equal(projectAttendeeState(state, 'd3', projected.questionProjection).rank, 3);
  assert.equal(projectAttendeeState(state, 'd4', projected.questionProjection).rank, 4);
  assert.equal(projectAttendeeState(state, 'd5', projected.questionProjection).rank, null);
});

// STREAK-PILL: the `> 0` gate on result.streakBonus (never surfacing an unearned bonus as an
// explicit 0) is otherwise untested. Always sending streakBonus, or gating with `>= 0` instead of
// `> 0`, would survive every other test in this file, since none asserts the exact key set.
test('an unbonused settled result has exactly the original four result keys, and a bonused one adds streakBonus', () => {
  const state = fixtureState();
  state.phase = 'revealed';
  state.votesLocked = true;
  state.settledResults = {
    'run-1:0:q-order': {
      alpha: { choice: 'a-b-c', conviction: 'certain', isRight: true, score: 3, streakBonus: 0, realityGapDelta: 0 },
      beta: { choice: 'a-b-c', conviction: 'certain', isRight: true, score: 150, streakBonus: 50, realityGapDelta: 0 },
    },
  };
  const projected = projectGameState(state, 'Room_A', 1);
  const unbonused = projectAttendeeState(state, 'alpha', projected.questionProjection);
  const bonused = projectAttendeeState(state, 'beta', projected.questionProjection);
  assert.deepEqual(Object.keys(unbonused.result ?? {}).sort(), ['choice', 'isCorrect', 'points', 'questionInstanceId'],
    'a 0 (unearned) bonus never surfaces as an explicit key');
  assert.deepEqual(Object.keys(bonused.result ?? {}).sort(), ['choice', 'isCorrect', 'points', 'questionInstanceId', 'streakBonus']);
  assert.equal(bonused.result?.streakBonus, 50);
});

test('closing phase populates public roomState.leaderboard even when leaderboardEnabled is false', () => {
  const state = fixtureState();
  state.phase = 'closing';
  state.leaderboardEnabled = false;
  const projected = projectGameState(state, 'Room_A', 10);
  assert.equal(projected.roomState.leaderboard.length, 2);
  assert.deepEqual(projected.roomState.leaderboard.map(({ name, rank }) => ({ name, rank })), [
    { name: 'Ada', rank: 1 },
    { name: 'Ben', rank: 2 },
  ]);
});

test('attendee rank differentiates duplicate nicknames deterministically using score, bestStreak, and hardQuestionPoints', () => {
  const state = fixtureState();
  state.seenDevices = {
    d1: { nickname: 'Alex', team: 'NAVY', joinedAt: 1, score: 200, answered: 2, correct: 2, streak: 4, bestStreak: 4, hardQuestionPoints: 100, realityGap: 0 },
    d2: { nickname: 'Alex', team: 'GOLD', joinedAt: 2, score: 200, answered: 2, correct: 2, streak: 2, bestStreak: 2, hardQuestionPoints: 100, realityGap: 0 },
  };
  const projected = projectGameState(state, 'Room_A', 1);
  assert.equal(projectAttendeeState(state, 'd1', projected.questionProjection).rank, 1);
  assert.equal(projectAttendeeState(state, 'd2', projected.questionProjection).rank, 2);
});

