// Solo play (VOF-44, 2026-09-15): one person, the game store in the page, the phone screens fed the host's own
// phone projection. Topics are subjects drawn from the thirteen classic decks. No room, no relay, no presentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SOLO_DECKS, SOLO_GROUPS, SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import { isHeldBundledQuestion } from '../../src/data/decks/index.ts';
import { flagshipDeck } from '../../src/data/decks/flagship.ts';
import { kindEyebrow } from '../../src/engine/kinds.ts';
import { score } from '../../src/engine/scoring.ts';
import { useGameStore } from '../../src/store/game-store.ts';
import {
  SOLO_DEVICE_ID, dealTopicRound, isSoloHeld, isolateSoloStore, loadSoloPool, projectSolo, recordSoloVote, revealSoloAnswer, soloOutcomes, soloStep,
  startSoloRound, takeSoloStep,
} from '../../src/solo/solo-game.ts';
import { shouldPlayRevealSfx } from '../../src/engine/audio-lifecycle.ts';
import type { Deck, Question } from '../../src/data/types.ts';

const KINDS = ['binary', 'estimate', 'myth-among-three', 'order', 'which-patient'];
const current = () => useGameStore.getState();
const topicNamed = (id: string) => {
  const found = SOLO_TOPICS.find((entry) => entry.id === id);
  assert.ok(found, `topic ${id} exists`);
  return found;
};
const pool = (id: string) => loadSoloPool(topicNamed(id));
const deck = (id: string): Promise<Deck> => SOLO_DECKS[id]!();
const questionOf = (source: { questions: Question[] }, id: string) => source.questions.find((entry) => entry.id === id) as Question;
const norm = (text: unknown) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

test('ten topics by subject, each with its own name (2026-09-15)', () => {
  assert.deepEqual(SOLO_TOPICS.map((entry) => entry.label), [
    'Flu', 'RSV', 'Shingles', 'Pneumococcal', 'HPV', 'Hepatitis B', 'Tetanus and whooping cough', 'At the counter', 'What to say', 'The big picture',
  ]);
  assert.equal(new Set(SOLO_TOPICS.map((entry) => entry.id)).size, SOLO_TOPICS.length);
  assert.equal(Object.keys(SOLO_DECKS).length, 13, 'thirteen decks: the polish stands for the flagship almost everywhere, and the flagship deck itself is registered too, for its own q17 (VOF-77)');
});

// The flagship deck's other 19 questions are deliberately not dealt in solo: only its own q17 joins The big
// picture (VOF-77, docs/QUESTION-BANK.md 9.2), never the rest of the raw deck the flagship polish already
// stands in for. So the completeness sweep below exempts every flagship question but q17 by name.
const FLAGSHIP_EXEMPT_FROM_COMPLETENESS = new Set(Array.from({ length: 20 }, (_, index) => `flagship:q${index + 1}`)).difference(new Set(['flagship:q17']));

test('every question of every solo deck sits in exactly one topic, and a question two decks share plays once', async () => {
  const decks = new Map<string, Deck>();
  for (const [deckId, load] of Object.entries(SOLO_DECKS)) decks.set(deckId, await load());
  const listed = new Map<string, string>();
  const byText = new Map<string, string>();
  for (const entry of SOLO_TOPICS) {
    for (const [deckId, questionId] of entry.picks) {
      const key = `${deckId}:${questionId}`;
      assert.equal(listed.has(key), false, `${key} is listed in ${listed.get(key)} and ${entry.id}`);
      listed.set(key, entry.id);
      const question = decks.get(deckId)?.questions.find((item) => item.id === questionId);
      assert.ok(question, `${key} resolves`);
      const text = norm(question.statement || question.scenario);
      assert.equal(byText.has(text), false, `${key} repeats ${byText.get(text)}`);
      byText.set(text, key);
    }
  }
  const missing = [...decks].flatMap(([deckId, source]) => source.questions
    .filter((question) => !listed.has(`${deckId}:${question.id}`) && !byText.has(norm(question.statement || question.scenario)) && !FLAGSHIP_EXEMPT_FROM_COMPLETENESS.has(`${deckId}:${question.id}`))
    .map((question) => `${deckId}:${question.id}`));
  assert.deepEqual(missing, [], 'every question has a topic, except the flagship deck\'s 19 questions VOF-77 deliberately leaves solo-only to its own q17');
  assert.equal(listed.size, 150, 'every question once: 146 play in solo (145 plus flagship:q17), and 4 held ones stay listed for when their holds lift');
});

test('a round deals the whole topic (VOF-68): every playable question once, no repeats, in one go', async () => {
  for (const entry of SOLO_TOPICS) {
    const ready = await loadSoloPool(entry);
    assert.ok(ready.sequence.length >= 5, `${entry.id} deals ${ready.sequence.length}`);
    assert.ok(ready.rotation.length > 0, `${entry.id} has a rotation to deal`);
    assert.equal(new Set(ready.rotation).size, ready.rotation.length, `${entry.id}'s rotation carries no repeat`);
    // Every core question always plays (9.2). A question with no bank record yet plays as core too, so nothing
    // the backfill has not reached silently drops out of the round.
    assert.ok(ready.rotation.every((id) => ready.sequence.includes(id)), `${entry.id}'s rotation only ever deals a playable question`);
    const firstPlay = dealTopicRound(ready, 0);
    assert.deepEqual([...firstPlay].sort(), [...ready.rotation].sort(), `${entry.id}'s first play deals its whole rotation, just reordered for kind variety`);
  }
});

test('every topic loads into the store exactly as dealt', async () => {
  isolateSoloStore();
  for (const entry of SOLO_TOPICS) {
    const ready = await loadSoloPool(entry);
    assert.deepEqual(startSoloRound(ready, ready.sequence), ready.sequence, `${entry.id} plays every question it deals`);
  }
});

test("holds stay out, and a shared q-number never holds another deck's question", async () => {
  // VOF-74 (content fix batch 2, pneumococcal-q1): released, its evidence re-checked and confirmed, so it now
  // plays like any other solo question.
  const pneumococcal = await pool('pneumococcal');
  assert.ok(pneumococcal.questions.some((question) => question.id === 'pneumococcal-q1'), 'q1 stays listed');
  assert.ok(pneumococcal.sequence.includes('pneumococcal-q1'), 'q1 is released and plays');
  // VOF-74 (content fix batch 2, vof-q11): released, its evidence re-checked and confirmed.
  assert.ok((await pool('shingles')).sequence.includes('vax-or-fiction-q11'), 'the late second Shingrix dose is released and plays');
  const rsv = await pool('rsv');
  for (const id of ['vax-or-fiction-q26', 'vax-or-fiction-q32']) {
    assert.ok(rsv.questions.some((question) => question.id === id), `${id} stays listed`);
    assert.equal(rsv.sequence.includes(id), false, `${id} asks about October in Ohio (VOF-32)`);
  }
  // Control: Season 2 q16 shares q16 and plate-q16 with the host decks' held question, and it still plays in
  // solo. VOF-74 (content fix batch 2, flagship-q16) released that live hold, so this installs a temporary one on
  // the same flagshipDeck q16 (isHeldBundledQuestion reads `deck.heldQuestionIds` off this live, singleton
  // object) purely to keep exercising the cross-deck collision this control checks.
  const seasonTwo = await deck('season-2');
  const tetanus = questionOf(seasonTwo, 'q16');
  const heldBefore = flagshipDeck.heldQuestionIds;
  flagshipDeck.heldQuestionIds = ['q16'];
  try {
    assert.equal(isHeldBundledQuestion(tetanus), true, 'unstamped, it collides with the host hold');
  } finally {
    flagshipDeck.heldQuestionIds = heldBefore;
  }
  assert.equal(isSoloHeld(seasonTwo, tetanus), false);
  assert.ok((await pool('tetanus')).sequence.includes('season-2-q16'));
  assert.ok((await pool('what-to-say')).sequence.includes('art-of-the-offer-q16'), 'play offers q16');
});

test('art of the offer plays as which reply is better: a posed question, the scenario, and two spoken lines', async () => {
  const offers = await deck('art-of-the-offer');
  assert.equal(offers.questions.length, 20);
  assert.equal(offers.heldQuestionIds, undefined);
  for (const question of offers.questions) {
    assert.equal(question.kind, 'which-patient', question.id);
    assert.ok(typeof question.statement === 'string' && question.statement.trim().length > 0, `${question.id} poses a real question`);
    assert.ok(typeof question.scenario === 'string' && question.scenario.trim().length > 0, `${question.id} keeps its scenario`);
    assert.equal(question.choices?.length, 2, question.id);
    assert.ok(question.bestIndex === 0 || question.bestIndex === 1, `${question.id} marks the line that fits`);
  }
  const betterFirst = offers.questions.filter((question) => question.bestIndex === 0).length;
  assert.ok(betterFirst >= 7 && betterFirst <= 13, `the better line leads ${betterFirst} of 20`);
});

test('a solo round runs in the page: answer, straight through to the combined reveal, next, then a score, with no timer and no showdown', async () => {
  isolateSoloStore();
  const ready = await pool('hepatitis-b');
  const ids = dealTopicRound(ready, 0);
  assert.equal(startSoloRound(ready, ids).length, ids.length);
  assert.equal(current().phase, 'entering');
  assert.equal(current().leaderboardEnabled, false);
  assert.equal(current().showdownEnabled, false);
  let view = projectSolo(current());
  assert.equal(view.roomState.timerSeconds, 0);
  assert.equal(view.roomState.timerRunning, false);
  assert.equal(view.roomState.votesLocked, false);
  assert.equal(view.attendeeState.registered, true);
  const convictions = ['certain', 'fairly-sure', 'hunch'] as const;
  let expected = 0;
  let streak = 0;
  for (const [index, id] of ids.entries()) {
    view = projectSolo(current());
    assert.equal(view.roomState.questionData?.id, id, `question ${index + 1} is ${id}`);
    assert.equal(view.roomState.questionData?.number, index + 1, 'the header counts from one');
    assert.equal(view.roomState.questionData?.total, ids.length, 'out of the round just dealt');
    assert.equal(soloStep(current(), view), null, 'nothing to move on before a reveal');
    const question = questionOf(ready, id);
    assert.equal(question.kind ?? 'binary', 'binary', `${id} is true or false`);
    const right = index % 4 !== 3;
    const conviction = convictions[index % 3];
    assert.equal(recordSoloVote(view, String(right ? question.answer : !question.answer), conviction), true);
    // A tap reveals right away in solo (VOF-W7): SoloSuite pairs a successful vote with revealSoloAnswer,
    // which this test calls the same way, straight through to the combined verdict-and-reason screen.
    revealSoloAnswer();
    view = projectSolo(current());
    assert.equal(current().phase, 'explaining', 'the vote settles straight through to the combined reveal');
    assert.equal(view.attendeeState.result?.isCorrect, right, `${id} scores as ${right ? 'right' : 'wrong'}`);
    const scoreResult = score(right, question.kind, streak);
    expected += scoreResult.points;
    streak = scoreResult.nextStreak;
    const step = soloStep(current(), view);
    assert.equal(step, index === ids.length - 1 ? 'score' : 'next');
    takeSoloStep(step as 'score' | 'next');
  }
  view = projectSolo(current());
  assert.equal(current().phase, 'closing');
  assert.equal(current().showdown, null);
  assert.equal(view.attendeeState.answered, ids.length);
  assert.equal(view.attendeeState.correct, ids.filter((_, index) => index % 4 !== 3).length);
  assert.equal(view.attendeeState.score, expected);
  assert.deepEqual(soloOutcomes(current()), ids.map((_, index) => index % 4 !== 3), 'the close lists right and wrong in the order played');
  startSoloRound(ready, dealTopicRound(ready, 1, [ids]));
  assert.equal(projectSolo(current()).attendeeState.score, 0, 'the next round starts from zero');
});

test('the reveal sting fires exactly once a question through a real solo round (VOF-W7)', async () => {
  // AudioPlayer only ever sees the phase its own render observed, before and after a batch of
  // dispatches -- exactly what this test captures around revealSoloAnswer(), the same call
  // SoloSuite pairs with every recorded vote.
  isolateSoloStore();
  const ready = await pool('hepatitis-b');
  const ids = dealTopicRound(ready, 0);
  assert.ok(ids.length >= 3, 'the round is long enough to prove "exactly once", not "at least once"');
  assert.equal(startSoloRound(ready, ids).length, ids.length);
  let stings = 0;
  for (const id of ids) {
    const view = projectSolo(current());
    const question = questionOf(ready, id);
    assert.equal(recordSoloVote(view, String(question.answer), 'certain'), true);
    const before = current().phase;
    revealSoloAnswer();
    const after = current().phase;
    assert.equal(after, 'explaining', `${id} settles straight through to the combined reveal`);
    if (shouldPlayRevealSfx({ prevPhase: before, phase: after, solo: true })) stings += 1;
    const step = soloStep(current(), projectSolo(current()));
    takeSoloStep(step as 'score' | 'next');
  }
  assert.equal(stings, ids.length, `the reveal sting fired once a question, ${ids.length} of them, not ${stings}`);
});

test('a recorded answer can be revealed without a confidence tap', async () => {
  isolateSoloStore();
  const ready = await pool('hepatitis-b');
  const ids = dealTopicRound(ready, 0);
  assert.ok(ids[0]);
  startSoloRound(ready, [ids[0]]);
  const question = questionOf(ready, ids[0]);
  const view = projectSolo(current());
  assert.equal(recordSoloVote(view, String(question.answer), 'fairly-sure'), true);
  revealSoloAnswer();
  assert.equal(current().phase, 'explaining', 'the vote alone is enough to settle straight through to the reveal');
});

test('the picker groups every topic exactly once', () => {
  const grouped = SOLO_GROUPS.flatMap((group) => group.ids);
  assert.deepEqual([...grouped].sort(), SOLO_TOPICS.map((topic) => topic.id).sort());
  assert.equal(new Set(grouped).size, grouped.length, 'no topic sits in two groups');
});

test('solo text stays on the 16px phone floor', () => {
  const sheet = readFileSync(resolve('src/styles/solo.css'), 'utf8');
  const sizes = [...sheet.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length >= 12, `the scan read ${sizes.length} font sizes`);
  assert.deepEqual(sizes.filter((size) => size < 16), [], 'every solo font size is 16px or more');
});

test('a first round deals every question type its whole topic has, and each question once', async () => {
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const kindOf = (id: string) => pool.questions.find((question) => question.id === id)?.kind ?? 'binary';
    const round = new Set(dealTopicRound(pool, 0).map(kindOf));
    // The stronger check: every kind anywhere in the topic's playable sequence, not just what made the rotation --
    // today the two always agree (checked against every real topic here), but this is what would actually catch a
    // kind that only ever showed up in an excluded twin.
    for (const kind of new Set(pool.sequence.map(kindOf))) assert.ok(round.has(kind), `${topic.id} round one deals ${kind}`);
    assert.equal(new Set(pool.sequence).size, pool.sequence.length, `${topic.id} deals each question once`);
  }
});

test('a spoken offer asks which reply is better, on the stage and on the phone', async () => {
  const offers = await pool('what-to-say');
  const replies = offers.sequence.map((id) => questionOf(offers, id)).filter((question) => question.kind === 'which-patient');
  assert.ok(replies.length > 0, 'What to say deals reply questions');
  for (const question of replies) assert.equal(kindEyebrow(question), 'WHICH REPLY IS BETTER?', `${question.id} asks for a reply`);
  isolateSoloStore();
  startSoloRound(offers, [replies[0].id]);
  assert.equal(projectSolo(current()).roomState.questionData?.reply, true, 'the phone learns the choices are replies');
});

test('an order answer arrives as opaque step tokens and still scores, because solo decodes it first', async () => {
  isolateSoloStore();
  const counter = await pool('at-the-counter');
  const order = counter.questions.find((question) => question.kind === 'order' && counter.sequence.includes(question.id));
  assert.ok(order, 'At the counter deals an order question');
  startSoloRound(counter, [order.id]);
  const view = projectSolo(current());
  const canonical = (order.steps ?? []).map((_, index) => String.fromCharCode(97 + index)).join('-');
  const phoneRight = view.questionProjection?.encodeChoice(canonical);
  assert.ok(phoneRight && phoneRight !== canonical, 'the phone never sees the canonical order');
  // Control: the phone's own tokens straight into the store are dropped without a word.
  current().dispatch({ type: 'RECORD_VOTE', deviceId: SOLO_DEVICE_ID, choice: phoneRight, questionId: order.id });
  assert.equal(current().pollVoters[order.id]?.[SOLO_DEVICE_ID], undefined);
  assert.equal(recordSoloVote(view, phoneRight, 'certain'), true);
  revealSoloAnswer();
  assert.equal(projectSolo(current()).attendeeState.result?.isCorrect, true);
  assert.equal(projectSolo(current()).attendeeState.score, 250);
});

test('every kind reaches the phone with no presenter note, discussion prompt or patient line', async () => {
  isolateSoloStore();
  const kinds = new Set<string>();
  let checked = 0;
  for (const entry of SOLO_TOPICS) {
    const ready = await loadSoloPool(entry);
    startSoloRound(ready, ready.sequence);
    for (const id of ready.sequence) {
      const question = questionOf(ready, id);
      kinds.add(question.kind ?? 'binary');
      const shown = [question.statement, question.scenario, question.reveal, question.takeaway, ...(question.choices ?? []), ...(question.statements ?? []), ...(question.steps ?? [])];
      const hidden = [question.presenterNote, question.discussionPrompt, question.patientConversation]
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0 && !shown.includes(text));
      // Walks the same three phases a two-tap round passes through (entering, revealed, explaining) by
      // dispatching the store's own actions directly, since this scan checks what each phase shows rather
      // than solo's own two-tap step labels.
      for (const action of ['REVEAL', 'ADVANCE', 'ADVANCE'] as const) {
        const seen = JSON.stringify(projectSolo(current()));
        for (const text of hidden) assert.equal(seen.includes(text), false, `${id} keeps "${text.slice(0, 40)}" off the phone`);
        checked += hidden.length;
        current().dispatch({ type: action });
      }
    }
  }
  assert.ok(checked > 300, `the scan checked ${checked} private lines`);
  assert.deepEqual([...kinds].sort(), KINDS);
});

test('nothing under src/solo reaches the relay, the live links or the presentation', () => {
  const files = readdirSync('src/solo').filter((name) => /\.tsx?$/.test(name));
  assert.ok(files.length >= 3, `the scan sees the solo files: ${files.join(', ')}`);
  for (const name of files) {
    const source = readFileSync(`src/solo/${name}`, 'utf8');
    assert.doesNotMatch(source, /presentation\/PresentationSuite|network\/(?:usePhoneLink|useLiveLink|live-link|host-live-link|configured-room|production-room|room-socket|transport|phone-link)\b/, name);
  }
});
