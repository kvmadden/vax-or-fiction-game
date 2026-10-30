import assert from 'node:assert/strict';
import test from 'node:test';
import type { Question } from '../../src/data/types';
import {
  projectPublicQuestion,
  projectPublicReveal,
  randomOrderScramble,
  validateAttendeeState,
  validatePublicRoomState,
  validateClientEnvelope,
} from '../../src/network/projection';

const baseQuestion: Question = {
  id: 'fixture',
  kind: 'binary',
  statement: 'Synthetic test statement',
  answer: true,
  reveal: 'Synthetic explanation',
  takeaway: 'Synthetic takeaway',
  presenterNote: 'private host note',
  citations: [
    { id: 'safe', publisher: 'Example', shortDisplayLine: 'Safe source', url: 'https://example.test/source' },
    { id: 'unsafe', publisher: 'Unsafe', shortDisplayLine: 'Unsafe source', url: 'javascript:alert(1)' },
  ],
};

test('public question projection supports all five kinds without answer-bearing fields', () => {
  const fixtures: Question[] = [
    baseQuestion,
    { ...baseQuestion, id: 'myth', kind: 'myth-among-three', statements: ['One', 'Two', 'Three'], mythIndex: 1 },
    { ...baseQuestion, id: 'estimate', kind: 'estimate', estimate: { value: 50, tolerance: 5, unit: '%', ranges: [{ label: 'Low', min: 0, max: 39 }, { label: 'Middle', min: 40, max: 60 }] } },
    { ...baseQuestion, id: 'order', kind: 'order', steps: ['First', 'Second', 'Third'] },
    { ...baseQuestion, id: 'patient', kind: 'which-patient', choices: ['Patient one', 'Patient two'], bestIndex: 1 },
  ];

  for (const question of fixtures) {
    const { question: projected } = projectPublicQuestion(question, `session:2:${question.id}`, 2, 5);
    const serialized = JSON.stringify(projected);
    assert.equal(projected.kind, question.kind ?? 'binary');
    assert.doesNotMatch(serialized, /private host note|mythIndex|bestIndex|tolerance|"answer"|"reveal"|presenterNote/);
  }
});

test('order projection exposes opaque random tokens and decodes a submitted permutation host-side', () => {
  const question: Question = { ...baseQuestion, id: 'order', kind: 'order', steps: ['First', 'Second', 'Third'] };
  // 8.6: reload stability now comes from the host's cached scramble (game-store.ts's
  // orderScrambles), not from recomputing it from questionInstanceId, so both calls here pass
  // the same scramble explicitly, the way the live wire does.
  const scramble = randomOrderScramble(3);
  const first = projectPublicQuestion(question, 'run:3:order', 1, 1, scramble);
  const second = projectPublicQuestion(question, 'run:3:order', 1, 1, scramble);
  const publicTokens = first.question.steps?.map((step) => step.token) ?? [];

  assert.deepEqual(first.question, second.question, 'reload keeps the occurrence token mapping stable');
  assert.equal(new Set(publicTokens).size, 3);
  assert.ok(publicTokens.every((token) => /^s[0-9a-z]+$/.test(token)));
  assert.ok(publicTokens.every((token) => !['a', 'b', 'c'].includes(token)), 'canonical order letters are not exposed');

  const tokenForText = new Map(first.question.steps?.map((step) => [step.text, step.token]));
  const submitted = ['First', 'Second', 'Third'].map((text) => tokenForText.get(text)).join('-');
  assert.equal(first.decodeChoice(submitted), 'a-b-c');
  assert.equal(first.decodeChoice(`${publicTokens[0]}-${publicTokens[0]}-${publicTokens[1]}`), null);
});

test('two draws of a random order scramble differ in tokens and, over repeated draws, in display order', () => {
  const first = randomOrderScramble(3);
  const second = randomOrderScramble(3);
  assert.notDeepEqual(first.tokens, second.tokens, 'tokens are drawn fresh, not derived from anything stable');
  // The permutation space for 3 items is small (2 non-identity permutations excluded is not
  // possible here), so check over many draws that the order is not pinned to one value.
  const orders = new Set(Array.from({ length: 40 }, () => randomOrderScramble(4).order.join('-')));
  assert.ok(orders.size > 1, 'display order varies across draws instead of being fixed');
  for (let i = 0; i < 40; i += 1) {
    const draw = randomOrderScramble(4);
    assert.notEqual(draw.order.join('-'), 'a-b-c-d', 'never draws the correct order itself');
  }
});

test('reveal projection allowlists public explanation fields and safe citation schemes', () => {
  const reveal = projectPublicReveal(baseQuestion);
  assert.equal(reveal.answerToken, 'true');
  assert.deepEqual(reveal.citations, [
    { label: 'Safe source', url: 'https://example.test/source' },
    { label: 'Unsafe source' },
  ]);
  assert.doesNotMatch(JSON.stringify(reveal), /presenterNote|private host note/);
});

test('phone questions preserve a separate scenario without repeating fallback copy', () => {
  const applied = { ...baseQuestion, kind: 'which-patient' as const,
    statement: 'A 70-year-old wants a flu shot. What now?',
    scenario: 'No high-dose, recombinant or adjuvanted product is available.',
    choices: ['Another age-appropriate vaccine after screening.', 'Wait for another visit.'], bestIndex: 0,
  };
  const projected = projectPublicQuestion(applied, 'case-1', 1, 1).question;
  assert.equal(projected.statement, `${applied.statement}\n\n${applied.scenario}`);
  assert.equal(projectPublicQuestion({ ...applied, scenario: applied.statement }, 'case-2', 1, 1).question.statement, applied.statement);
  assert.equal(projectPublicQuestion({ ...applied, scenario: 'Choose the best answer.' }, 'case-3', 1, 1).question.statement, applied.statement);
  assert.equal(projectPublicQuestion({ ...applied, statement: undefined }, 'case-4', 1, 1).question.statement, applied.scenario);
});

test('client validation accepts a current vote and rejects stale, locked, spoofed, and invalid-kind votes', () => {
  const { question, decodeChoice } = projectPublicQuestion(baseQuestion, 'run-1:4:fixture', 1, 1);
  const common = {
    version: 1 as const,
    type: 'VOTE' as const,
    roomId: 'Room_A',
    sessionId: 'run-1',
    deviceId: 'device_1',
    messageId: 'message_1',
    questionInstanceId: question.questionInstanceId,
    choice: 'true',
    conviction: 'certain',
  };
  const context = { interactionMode: 'polling', offlineMode: false, roomId: 'Room_A', sessionId: 'run-1', deviceId: 'device_1', phase: 'deliberating', votesLocked: false, question, decodeChoice };

  assert.deepEqual(validateClientEnvelope(common, context), { ok: true, message: common, decodedChoice: 'true' });
  assert.match(validateClientEnvelope({ ...common, sessionId: 'old-run' }, context).reason ?? '', /stale session/i);
  assert.match(validateClientEnvelope(common, { ...context, votesLocked: true }).reason ?? '', /closed/i);
  assert.match(validateClientEnvelope({ ...common, deviceId: 'device_2' }, context).reason ?? '', /device/i);
  assert.match(validateClientEnvelope({ ...common, choice: 'a' }, context).reason ?? '', /choice/i);
});

test('a vote the relay took while its question was open passes the host lock, and no other closed vote does', () => {
  // Over the production relay the host hears of a vote on its next exchange, which can come after its own lock. The host link
  // marks such a vote takenWhileOpen when the relay took it before the lock (src/network/host-live-link.ts).
  const { question, decodeChoice } = projectPublicQuestion(baseQuestion, 'run-1:4:fixture', 1, 1);
  const vote = { version: 1 as const, type: 'VOTE' as const, roomId: 'Room_A', sessionId: 'run-1', deviceId: 'device_1', messageId: 'message_1', questionInstanceId: question.questionInstanceId, choice: 'true', conviction: 'certain' };
  const locked = { interactionMode: 'polling', offlineMode: false, roomId: 'Room_A', sessionId: 'run-1', deviceId: 'device_1', phase: 'deliberating', votesLocked: true, question, decodeChoice };
  assert.deepEqual(validateClientEnvelope(vote, { ...locked, takenWhileOpen: true }), { ok: true, message: vote, decodedChoice: 'true' });
  assert.equal(validateClientEnvelope(vote, { ...locked, phase: 'entering', takenWhileOpen: true }).ok, true, 'a lock before the stage has posed the question');
  assert.equal(validateClientEnvelope(vote, locked).reason, 'Voting is closed', 'a closed vote the relay took after the lock stays refused');
  assert.equal(validateClientEnvelope(vote, { ...locked, takenWhileOpen: false }).reason, 'Voting is closed');
  for (const phase of ['revealed', 'explaining', 'leaderboard', 'closing']) {
    assert.equal(validateClientEnvelope(vote, { ...locked, phase, takenWhileOpen: true }).reason, 'Voting is closed', `nothing changes a count once it has been ${phase}`);
  }
  assert.equal(validateClientEnvelope({ ...vote, questionInstanceId: 'run-1:3:other' }, { ...locked, takenWhileOpen: true }).reason, 'Stale question', 'it is still this question only');
  assert.equal(validateClientEnvelope(vote, { ...locked, interactionMode: 'offline', takenWhileOpen: true }).reason, 'Phone voting is off');
});

test('client validation bounds profiles, reactions, predictions, and identifiers', () => {
  const context = { interactionMode: 'polling', offlineMode: false, roomId: 'Room_A', sessionId: 'run-1', deviceId: 'device_1', phase: 'lobby', votesLocked: true, question: null, decodeChoice: (choice: string) => choice };
  const base = { version: 1 as const, roomId: 'Room_A', sessionId: 'run-1', deviceId: 'device_1', messageId: 'message_1' };

  assert.equal(validateClientEnvelope({ ...base, type: 'HELLO', nickname: 'Ada', team: 'NAVY' }, context).ok, true);
  assert.match(validateClientEnvelope({ ...base, type: 'HELLO', nickname: 'x'.repeat(41) }, context).reason ?? '', /nickname/i);
  const reactionQuestion = projectPublicQuestion(baseQuestion, 'run-1:4:fixture', 1, 1).question;
  const reactionContext = { ...context, question: reactionQuestion, phase: 'explaining' };
  const reaction = { ...base, type: 'REACTION', reaction: 'knew-it', questionInstanceId: reactionQuestion.questionInstanceId };
  assert.equal(validateClientEnvelope(reaction, reactionContext).ok, true);
  assert.equal(validateClientEnvelope(reaction, { ...reactionContext, phase: 'revealed' }).ok, true);
  assert.equal(validateClientEnvelope({ ...reaction, questionInstanceId: undefined }, reactionContext).ok, false, 'unscoped legacy reaction');
  assert.equal(validateClientEnvelope({ ...reaction, questionInstanceId: 'prior-occurrence' }, reactionContext).ok, false, 'late prior reaction');
  for (const phase of ['entering', 'deliberating', 'closing', 'lobby', 'showdown']) assert.equal(validateClientEnvelope(reaction, { ...reactionContext, phase }).ok, false, phase);
  assert.match(validateClientEnvelope({ ...reaction, reaction: 'x'.repeat(65) }, reactionContext).reason ?? '', /reaction/i);
  assert.match(validateClientEnvelope({ ...base, type: 'PREDICT_WINNER', winner: 'not-a-ticket', showdownId: 'wrong' }, { ...context, showdownId: 'show-1', finalistTickets: ['finalist-1'] }).reason ?? '', /showdown/i);
  assert.match(validateClientEnvelope({ ...base, type: 'HELLO', messageId: '!' }, context).reason ?? '', /message/i);
});

test('public room-state validator rejects unexpected fields and pre-reveal answers', () => {
  const state = {
    version: 1 as const,
    roomId: 'Room_A',
    sessionId: 'run-1',
    revision: 4,
    phase: 'lobby',
    slideIndex: 0,
    slideCount: 2,
    question: null,
    questionData: null,
    reveal: null,
    votesLocked: true,
    timerSeconds: 0,
    timerDurationSeconds: 0,
    timerRunning: false,
    participants: 0,
    teamScores: null,
    leaderboard: [],
    showdown: null,
    hostConnected: true,
  };
  assert.equal(validatePublicRoomState(state, 'Room_A'), true);
  assert.equal(validatePublicRoomState({ ...state, answer: true }, 'Room_A'), false);
  assert.equal(validatePublicRoomState({ ...state, reveal: projectPublicReveal(baseQuestion) }, 'Room_A'), false);
  assert.equal(validatePublicRoomState({ ...state, phase: 'revealed', reveal: projectPublicReveal(baseQuestion) }, 'Room_A'), true);
  assert.equal(validatePublicRoomState({ ...state, roomId: 'Room_B' }, 'Room_A'), false);
});

test('attendee-state validator accepts the targeted shape and rejects foreign fields', () => {
  const attendee = {
    sessionId: 'run-1', registered: true, nickname: 'Ada', team: 'NAVY', vote: null, result: null,
    score: 3, correct: 1, answered: 1, accuracy: 100, bestStreak: 1, rank: 1, totalParticipants: 1, commitments: [],
  };
  assert.equal(validateAttendeeState(attendee, 'run-1'), true);
  assert.equal(validateAttendeeState({ ...attendee, otherDeviceHistory: [] }, 'run-1'), false);
  assert.equal(validateAttendeeState({ ...attendee, sessionId: 'old-run' }, 'run-1'), false);
});

// STREAK-PILL: streakBonus is optional on attendee.result. An old four-key result (no
// streakBonus at all, exercised above) must keep validating. A populated one must validate only
// within scoring.ts's real bound (see MAX_STREAK_BONUS), and a bad value must be rejected, not
// silently clamped or dropped.
test('attendee-state validator accepts an optional bounded streakBonus and rejects an invalid one', () => {
  const attendee = {
    sessionId: 'run-1', registered: true, nickname: 'Ada', team: 'NAVY', vote: null,
    result: { questionInstanceId: 'run-1:0:q', choice: 'true', isCorrect: true, points: 150 },
    score: 3, correct: 1, answered: 1, accuracy: 100, bestStreak: 1, rank: 1, totalParticipants: 1, commitments: [],
  };
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: 50 } }, 'run-1'), true);
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: 100 } }, 'run-1'), true);
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: 0 } }, 'run-1'), true);
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: 101 } }, 'run-1'), false, 'above scoring.ts\'s real maximum');
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: -1 } }, 'run-1'), false, 'negative');
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: 12.5 } }, 'run-1'), false, 'non-integer');
  assert.equal(validateAttendeeState({ ...attendee, result: { ...attendee.result, streakBonus: '50' } }, 'run-1'), false, 'wrong type');
});

test('PH-02: phones receive option, scenario, range and step TEXT while every answer field stays withheld', () => {
  const myth = projectPublicQuestion({ ...baseQuestion, id: 'myth', kind: 'myth-among-three', statement: undefined, statements: ['Vaccines are tested', 'Vaccines cause the flu', 'Boosters exist'], mythIndex: 1 } as Question, 's:1:myth', 1, 4).question;
  assert.deepEqual(myth.options.map((option) => [option.label, option.text]), [['A', 'Vaccines are tested'], ['B', 'Vaccines cause the flu'], ['C', 'Boosters exist']]);

  const patient = projectPublicQuestion({ ...baseQuestion, id: 'patient', kind: 'which-patient', statement: undefined, scenario: 'A patient says they had shingles last year.', choices: ['First reply', 'Second reply'], bestIndex: 1 } as Question, 's:1:patient', 2, 4).question;
  assert.equal(patient.statement, 'A patient says they had shingles last year.', 'a scenario-only question carries its scenario as the statement');
  assert.deepEqual(patient.options.map((option) => [option.label, option.text]), [['A', 'First reply'], ['B', 'Second reply']]);

  // A spoken-reply question carries its marker and its quotes, and still sends only the keys the room accepts.
  const reply = projectPublicQuestion({ ...baseQuestion, id: 'reply', kind: 'which-patient', statement: 'Which reply is better?', scenario: 'A patient asks, “Can I get both today?”', choices: ['First reply', 'Second reply'], bestIndex: 0, reply: true } as Question, 's:1:reply', 2, 4).question;
  assert.equal(reply.reply, true, 'the spoken-reply marker reaches the room phone');
  assert.equal('reply' in patient, false, 'a patient scenario without a reply cue sends no marker');

  const estimate = projectPublicQuestion({ ...baseQuestion, id: 'estimate', kind: 'estimate', estimate: { value: 50, tolerance: 5, unit: '%', ranges: [{ label: 'Under 40%', min: 0, max: 39 }, { label: '40 to 60%', min: 40, max: 60 }] } } as Question, 's:1:estimate', 3, 4).question;
  assert.deepEqual(estimate.options.map((option) => [option.label, option.min, option.max]), [['Under 40%', 0, 39], ['40 to 60%', 40, 60]]);
  assert.equal(estimate.unit, '%');

  const order = projectPublicQuestion({ ...baseQuestion, id: 'order', kind: 'order', steps: ['Screen', 'Counsel', 'Administer', 'Document'] } as Question, 's:1:order', 4, 4).question;
  assert.deepEqual(new Set((order.steps ?? []).map((step) => step.text)), new Set(['Screen', 'Counsel', 'Administer', 'Document']));
  assert.notDeepEqual((order.steps ?? []).map((step) => step.text), ['Screen', 'Counsel', 'Administer', 'Document'], 'the correct order is scrambled before lock');

  for (const projected of [myth, patient, reply, estimate, order]) {
    const serialized = JSON.stringify(projected);
    assert.doesNotMatch(serialized, /mythIndex|bestIndex|"value"|tolerance|isMyth|"answer"|"reveal"|takeaway|presenterNote|patientConversation/, `${projected.kind} leaks an answer-bearing field`);
    assert.ok(!Object.keys(projected).some((key) => !['id', 'questionInstanceId', 'kind', 'statement', 'number', 'total', 'options', 'steps', 'unit', 'reply', 'emphasis'].includes(key)),
      `${projected.kind} must only carry keys the production relay RPC accepts`);
  }
});

test('every question in every deck projects to a room state the room validator accepts', async (t) => {
  const { BUNDLED_DECKS } = await import('../../src/data/decks');
  const { SOLO_DECKS } = await import('../../src/data/decks/topics');
  const { asksForReply } = await import('../../src/engine/kinds');
  const { PROTOCOL_VERSION } = await import('../../src/network/protocol');
  const decks = [...BUNDLED_DECKS, ...(await Promise.all(Object.values(SOLO_DECKS).map((load) => load())))];
  let checked = 0;
  let replies = 0;
  let flagged = 0;
  let stems = 0;
  let reveals = 0;
  for (const deck of decks) {
    for (const source of deck.questions) {
      const { question: questionData } = projectPublicQuestion(source, `run-1:${source.id}`, 1, deck.questions.length);
      const state = {
        version: PROTOCOL_VERSION, roomId: 'Room_A', sessionId: 'run-1', revision: 1, phase: 'entering', slideIndex: 0, slideCount: 1,
        question: source.id, questionData, reveal: null, votesLocked: false, timerSeconds: 0, timerDurationSeconds: 0, timerRunning: false,
        participants: 0, teamScores: null, leaderboard: [], showdown: null, hostConnected: true,
      };
      assert.equal(validatePublicRoomState(state, 'Room_A'), true, `${deck.id} ${source.id} would be refused by the room`);
      // The revealed beat carries the reveal's and the takeaway's phrases, and the room must take that state too.
      const reveal = projectPublicReveal(source);
      assert.equal(validatePublicRoomState({ ...state, phase: 'revealed', votesLocked: true, reveal }, 'Room_A'), true, `${deck.id} ${source.id} reveal would be refused by the room`);
      // Shipped content never loses its marks to the wire bound (wirePhrases drops a list that would not fit).
      assert.equal(questionData.emphasis?.length ?? 0, source.emphasis?.length ?? 0, `${deck.id} ${source.id} stem phrases reach the wire`);
      assert.equal((reveal.explanationEmphasis?.length ?? 0) + (reveal.takeawayEmphasis?.length ?? 0),
        (source.revealEmphasis?.length ?? 0) + (source.takeawayEmphasis?.length ?? 0), `${deck.id} ${source.id} reveal phrases reach the wire`);
      checked += 1;
      if (asksForReply(source)) replies += 1;
      if (questionData.reply) flagged += 1;
      if (questionData.emphasis) stems += 1;
      if (reveal.explanationEmphasis || reveal.takeawayEmphasis) reveals += 1;
    }
  }
  t.diagnostic(`checked ${checked} questions in ${decks.length} decks, ${replies} of them spoken replies (${flagged} flagged on the wire), ${stems} with stem phrases and ${reveals} with reveal phrases`);
  assert.ok(decks.length >= 12 && replies > 0, `the sweep saw ${decks.length} decks and ${replies} reply questions`);
  assert.ok(flagged > 0 && stems > 0 && reveals > 0, `the sweep saw every new key reach the wire (${flagged} flags, ${stems} stems, ${reveals} reveals)`);
});

test('the room validator takes the optional reply and phrase keys only in their bounded shapes', () => {
  const question = projectPublicQuestion(baseQuestion, 'run-1:q', 1, 1).question;
  const room = {
    version: 1 as const, roomId: 'Room_A', sessionId: 'run-1', revision: 1, phase: 'revealed', slideIndex: 0, slideCount: 1,
    question: 'fixture', questionData: question, reveal: projectPublicReveal(baseQuestion), votesLocked: true, timerSeconds: 0,
    timerDurationSeconds: 0, timerRunning: false, participants: 0, teamScores: null, leaderboard: [], showdown: null, hostConnected: true,
  };
  const accepts = (patch: { questionData?: Record<string, unknown>; reveal?: Record<string, unknown> }) => validatePublicRoomState({
    ...room,
    questionData: { ...room.questionData, ...patch.questionData },
    reveal: { ...room.reveal, ...patch.reveal },
  }, 'Room_A');
  const phrase = (length: number) => 'x'.repeat(length);
  assert.equal(accepts({}), true, 'the old shape, with none of the new keys, still validates');
  assert.equal(accepts({ questionData: { reply: true, emphasis: ['only'] } }), true);
  assert.equal(accepts({ questionData: { reply: false } }), true, 'reply is a boolean, not only true');
  assert.equal(accepts({ questionData: { reply: 'yes' } }), false, 'reply of the wrong type');
  assert.equal(accepts({ questionData: { emphasis: 'only' } }), false, 'emphasis that is not a list');
  assert.equal(accepts({ questionData: { emphasis: [7] } }), false, 'a phrase that is not a string');
  assert.equal(accepts({ questionData: { emphasis: [''] } }), false, 'an empty phrase');
  assert.equal(accepts({ questionData: { emphasis: Array.from({ length: 8 }, () => 'a') } }), true, 'eight phrases, the bound itself');
  assert.equal(accepts({ questionData: { emphasis: Array.from({ length: 9 }, () => 'a') } }), false, 'nine phrases');
  assert.equal(accepts({ questionData: { emphasis: [phrase(128)] } }), true, 'a phrase of 128 characters, the bound itself');
  assert.equal(accepts({ questionData: { emphasis: [phrase(129)] } }), false, 'a phrase of 129 characters');
  assert.equal(accepts({ questionData: { emphasis: ['😀'.repeat(128)] } }), true, 'the bound counts code points, as Postgres char_length does');
  assert.equal(accepts({ questionData: { revealEmphasis: ['only'] } }), false, 'a reveal key is not a question key');
  assert.equal(accepts({ reveal: { explanationEmphasis: ['only'], takeawayEmphasis: ['every'], takeawayLineEmphasis: [['every'], [], ['only']] } }), true);
  assert.equal(accepts({ reveal: { takeawayEmphasis: [null] } }), false, 'a null phrase');
  assert.equal(accepts({ reveal: { takeawayLineEmphasis: ['every'] } }), false, 'lines must be lists of phrases');
  assert.equal(accepts({ reveal: { takeawayLineEmphasis: Array.from({ length: 16 }, () => []) } }), true, 'sixteen lines, the bound itself');
  assert.equal(accepts({ reveal: { takeawayLineEmphasis: Array.from({ length: 17 }, () => []) } }), false, 'seventeen lines');
  assert.equal(accepts({ reveal: { emphasis: ['only'] } }), false, 'a question key is not a reveal key');
});
