// The whole-topic dealer (VOF-68, docs/QUESTION-BANK.md section 9): the rotation a topic deals, the kind-variety
// order, the opening rotation, and the second-play twin swap. Pure functions, scripted fixtures -- no store, no deck
// loads -- so a scenario the real bank data does not happen to hit today still gets a real RED to prove the guard
// fires, not just an assertion that trusts it. Real-topic checks at the bottom run the same functions against every
// shipped topic, through solo-game.ts's own loadSoloPool and dealTopicRound, so nothing here can drift from what a
// round actually deals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopicRotation, dealTopicPlay, estimatedPlayableCount, orderKindVariety, passesSoloPickerGate, rotateOpening, type SoloMeta,
} from '../../src/solo/dealer.ts';
import { dealTopicRound, loadSoloPool } from '../../src/solo/solo-game.ts';
import { orderForClimb } from '../../src/solo/pace/pace-recap.ts';
import { SOLO_HOLDS, SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import type { Question, QuestionKind } from '../../src/data/types.ts';
import type { RuntimeMeta } from '../../src/data/bank/types.ts';

function q(id: string, kind: QuestionKind): Question {
  return { id, kind, reveal: '' } as Question;
}

function rtMeta(conceptId: string, rotation: 'core' | 'alternate', kind: QuestionKind, difficulty: RuntimeMeta['difficulty'] = 'easy'): RuntimeMeta {
  return { subject: 'flu', kind, textVersion: 1, difficulty, conceptId, rotation, status: 'live', skill: 'recall', audience: 'everyone' };
}

test('buildTopicRotation: every core question plays, plus every alternate whose concept nothing else covers', () => {
  const meta: SoloMeta = new Map([
    ['core-a', rtMeta('concept-a', 'core', 'binary')],
    ['core-b', rtMeta('concept-b', 'core', 'binary')],
    ['alt-a', rtMeta('concept-a', 'alternate', 'binary')], // twin of core-a: excluded
    ['alt-c', rtMeta('concept-c', 'alternate', 'estimate')], // a concept core never covers: included
  ]);
  const sequence = ['core-a', 'core-b', 'alt-a', 'alt-c'];
  const rotation = buildTopicRotation(sequence, meta);
  assert.deepEqual([...rotation].sort(), ['alt-c', 'core-a', 'core-b'].sort(), 'core-a and core-b always play, alt-a gives way to core-a\'s own concept, alt-c has nowhere else to play from');
});

test('buildTopicRotation: two alternates of the same concept only ever lend the round one of them', () => {
  const meta: SoloMeta = new Map([
    ['core-a', rtMeta('concept-a', 'core', 'binary')],
    ['alt-x', rtMeta('concept-b', 'alternate', 'estimate')],
    ['alt-y', rtMeta('concept-b', 'alternate', 'estimate')],
  ]);
  const sequence = ['core-a', 'alt-x', 'alt-y'];
  const rotation = buildTopicRotation(sequence, meta);
  assert.deepEqual(rotation, ['core-a', 'alt-x'], 'the first alternate for concept-b wins a place, the second is a redundant twin of it, not of core');
});

test('buildTopicRotation: a question with no bank record yet plays as core, under its own id as its concept', () => {
  const rotation = buildTopicRotation(['draft-1'], new Map());
  assert.deepEqual(rotation, ['draft-1'], 'the backfill has not reached it, so it plays -- today\'s behavior, kept because the spec is silent here');
});

test('buildTopicRotation: 9.4\'s true-or-false cap is met by construction -- an alternate is only ever added for a concept nothing else covers, so a growing topic with many core true-or-false questions still plays every one of them, never shrunk to seven', () => {
  const questions = Array.from({ length: 9 }, (_, index) => q(`core-${index}`, 'binary'));
  const meta: SoloMeta = new Map(questions.map((question, index) => [question.id, rtMeta(`concept-${index}`, 'core', 'binary')]));
  const rotation = buildTopicRotation(questions.map((question) => question.id), meta);
  assert.equal(rotation.length, 9, 'every core true-or-false question plays, past the seven-of-twenty figure 9.4 names for a fully grown topic');
});

test('orderKindVariety: no two of the same kind back to back where the pool allows it', () => {
  const questions = [q('a', 'binary'), q('b', 'binary'), q('c', 'binary'), q('d', 'estimate')];
  const meta: SoloMeta = new Map();
  const ordered = orderKindVariety(['a', 'b', 'c', 'd'], questions, meta);
  assert.equal(ordered[0], 'a');
  const kindOf = (id: string) => questions.find((question) => question.id === id)?.kind;
  for (let index = 1; index < ordered.length; index += 1) {
    if (kindOf(ordered[index]) === kindOf(ordered[index - 1])) {
      // Only acceptable when the pool truly has nothing else left to place there (three binaries, one estimate:
      // the estimate can only break one adjacent pair).
      assert.ok(index >= 2, `${ordered[index]} sits back to back with ${ordered[index - 1]} even though the pool had room to avoid it`);
    }
  }
  assert.equal(new Set(ordered).size, 4, 'every id dealt is still there, once');
});

test('orderKindVariety: a fix does not trade one collision for another right after it', () => {
  // a, a, b, a: the naive fix for index 1 (a next to a) could pull the only non-a id (b) forward, but b is
  // already right there at index 2 -- swapping index 1 with index 2 changes nothing. The real fix has to reach
  // past it, or accept that three a's and one b cannot fully avoid a repeat.
  const questions = [q('a1', 'binary'), q('a2', 'binary'), q('b', 'estimate'), q('a3', 'binary')];
  const meta: SoloMeta = new Map();
  const ordered = orderKindVariety(['a1', 'a2', 'b', 'a3'], questions, meta);
  assert.equal(new Set(ordered).size, 4);
  const kindOf = (id: string) => questions.find((question) => question.id === id)?.kind;
  const collisions = ordered.slice(1).filter((id, index) => kindOf(id) === kindOf(ordered[index])).length;
  assert.ok(collisions <= 1, `at most one unavoidable collision with three of one kind and one of another, saw ${collisions}`);
});

test('orderKindVariety: a lone kind stays inside the round when both ends can use a repeated kind', () => {
  const questions = [q('a1', 'binary'), q('a2', 'binary'), q('b', 'estimate'), q('a3', 'binary'), q('c', 'order'), q('d', 'which-patient')];
  const meta: SoloMeta = new Map();
  const ordered = orderKindVariety(questions.map((question) => question.id), questions, meta);
  const kindOf = (id: string) => questions.find((question) => question.id === id)?.kind;
  const counts = new Map<QuestionKind, number>();
  for (const question of questions) counts.set(question.kind!, (counts.get(question.kind!) ?? 0) + 1);
  const expected = Math.max(0, 2 * Math.max(...counts.values()) - questions.length - 1);
  const pairs = ordered.slice(1).filter((id, index) => kindOf(id) === kindOf(ordered[index])).length;
  assert.equal(pairs, expected, 'the order uses the minimum possible same-kind pairs');
  assert.ok((counts.get(kindOf(ordered[0])!) ?? 0) > 1, 'the opening kind is not a lone kind');
  assert.ok((counts.get(kindOf(ordered.at(-1)!)!) ?? 0) > 1, 'the closing kind is not a lone kind');
});

test('dealTopicPlay: levels fill the first, middle and final thirds when the pool supports each band', () => {
  const levels: RuntimeMeta['difficulty'][] = [
    'hard', 'easy', 'expert', 'medium', 'medium', 'expert', 'easy', 'hard',
    'hard', 'easy', 'medium', 'expert', 'easy', 'medium', 'hard', 'expert',
  ];
  const questions = levels.map((_, index) => q(`q${index}`, 'binary'));
  const ids = questions.map((question) => question.id);
  const meta: SoloMeta = new Map(levels.map((level, index) => [ids[index]!, rtMeta(`concept-${index}`, 'core', 'binary', level)]));
  const ordered = dealTopicPlay(ids, ids, questions, meta, 0);
  const first = Math.round(ordered.length / 3);
  const second = Math.round(ordered.length / 3);
  const actualLevels = ordered.map((id) => meta.get(id)?.difficulty);
  assert.ok(actualLevels.slice(0, first).every((level) => level === 'easy' || level === 'medium'), `first third uses easy and medium, saw ${actualLevels.slice(0, first)}`);
  assert.ok(actualLevels.slice(first, first + second).every((level) => level === 'medium' || level === 'hard'), `middle third uses medium and hard, saw ${actualLevels.slice(first, first + second)}`);
  assert.ok(actualLevels.slice(first + second).every((level) => level === 'hard' || level === 'expert'), `final third uses hard and expert, saw ${actualLevels.slice(first + second)}`);
  assert.deepEqual([...ordered].sort(), [...ids].sort(), 'difficulty ordering keeps every dealt id once');
});

test('rotateOpening: a later play opens on a different question than any play already dealt this visit', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const first = rotateOpening(ids, 0);
  assert.deepEqual(first, ids, 'play 0 is not rotated');
  const second = rotateOpening(ids, 1, [first]);
  assert.notDeepEqual(second.slice(0, 3), first.slice(0, 3), 'the second play opens on different questions');
  // A control that forces the rare coincidence: a history entry that happens to equal what the plain rotation
  // would have produced, so rotateOpening must nudge further to actually avoid repeating it exactly.
  const wouldCoincide = rotateOpening(ids, 1, [second]);
  assert.notDeepEqual(wouldCoincide, second, 'avoids exactly repeating a given earlier order, even when the plain rotation would have landed on it');
});

test('rotateOpening: a stride of 3 alone repeats on a short round -- a coprime stride does not', () => {
  // The big picture: 6 questions. A fixed stride of 3 makes play 2's shift (2*3=6, 6%6=0) land right back on
  // play 0's own order. rotateOpening must pick a stride that actually cycles through a round this short.
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const plays = [rotateOpening(ids, 0)];
  for (let playIndex = 1; playIndex <= 4; playIndex += 1) plays.push(rotateOpening(ids, playIndex, plays));
  const stringified = plays.map((play) => play.join(','));
  assert.equal(new Set(stringified).size, stringified.length, `every one of ${plays.length} plays of a 6-question round opens on an order none of the earlier plays used, saw ${JSON.stringify(stringified)}`);
});

test('dealTopicPlay: a second play swaps in a same-kind twin, keeping the round\'s own length and kind mix', () => {
  const questions = [q('core-a', 'binary'), q('alt-a', 'binary'), q('core-b', 'estimate')];
  const meta: SoloMeta = new Map([
    ['core-a', rtMeta('concept-a', 'core', 'binary')],
    ['alt-a', rtMeta('concept-a', 'alternate', 'binary')],
    ['core-b', rtMeta('concept-b', 'core', 'estimate')],
  ]);
  const sequence = questions.map((question) => question.id);
  const rotation = buildTopicRotation(sequence, meta); // ['core-a', 'core-b']
  const firstPlay = dealTopicPlay(rotation, sequence, questions, meta, 0);
  assert.deepEqual([...firstPlay].sort(), ['core-a', 'core-b'], 'a first play deals the rotation as built');
  const secondPlay = dealTopicPlay(rotation, sequence, questions, meta, 1, [firstPlay]);
  assert.equal(secondPlay.length, firstPlay.length, 'same length');
  assert.equal(secondPlay.includes('alt-a'), true, 'core-a gave its place to its same-concept twin');
  assert.equal(secondPlay.includes('core-a'), false);
  assert.equal(secondPlay.includes('core-b'), true, 'concept-b has no twin, so it plays every time');
  const thirdPlay = dealTopicPlay(rotation, sequence, questions, meta, 2, [firstPlay, secondPlay]);
  assert.equal(thirdPlay.includes('core-a'), true, 'a third play returns to the core (9.5)');
  assert.equal(thirdPlay.includes('alt-a'), false);
});

test('dealTopicPlay: an alternate authored before its own core in pool order still swaps in at play 1, not play 2 (the review\'s pick-order bug)', () => {
  // alt-a sits FIRST in pick order, core-a second -- the bug this guards against built its twin list in pick
  // order, so list[0] was whichever came first in the pool, not whichever the round actually dealt. That made
  // play 1 a no-op (core stayed) and play 2 the real swap, backwards from 9.5.
  const questions = [q('alt-a', 'binary'), q('core-a', 'binary')];
  const meta: SoloMeta = new Map([
    ['alt-a', rtMeta('concept-a', 'alternate', 'binary')],
    ['core-a', rtMeta('concept-a', 'core', 'binary')],
  ]);
  const sequence = ['alt-a', 'core-a'];
  const rotation = buildTopicRotation(sequence, meta);
  assert.deepEqual(rotation, ['core-a'], 'core always wins the rotation slot, regardless of pick order');
  const play0 = dealTopicPlay(rotation, sequence, questions, meta, 0);
  const play1 = dealTopicPlay(rotation, sequence, questions, meta, 1, [play0]);
  const play2 = dealTopicPlay(rotation, sequence, questions, meta, 2, [play0, play1]);
  assert.deepEqual(play0, ['core-a']);
  assert.deepEqual(play1, ['alt-a'], 'play 1 swaps to the twin, even though the twin was authored before its own core');
  assert.deepEqual(play2, ['core-a'], 'play 2 returns to the core');
});

test('dealTopicPlay: a topic with no twin at all still reshuffles, rather than repeating the same order', () => {
  const questions = [q('a', 'binary'), q('b', 'binary'), q('c', 'binary'), q('d', 'binary')];
  const meta: SoloMeta = new Map(questions.map((question, index) => [question.id, rtMeta(`concept-${index}`, 'core', 'binary')]));
  const sequence = questions.map((question) => question.id);
  const rotation = buildTopicRotation(sequence, meta);
  const firstPlay = dealTopicPlay(rotation, sequence, questions, meta, 0);
  const secondPlay = dealTopicPlay(rotation, sequence, questions, meta, 1, [firstPlay]);
  assert.deepEqual([...secondPlay].sort(), [...firstPlay].sort(), 'the same four questions, every time -- no twins to swap');
  assert.notDeepEqual(secondPlay, firstPlay, 'but a different order, so the topic still reshuffles (9.5)');
});

test('dealTopicPlay: a concept\'s twin of a different kind never swaps in, so a play never changes the round\'s own kind mix', () => {
  const questions = [q('core-a', 'binary'), q('alt-a', 'estimate')];
  const meta: SoloMeta = new Map([
    ['core-a', rtMeta('concept-a', 'core', 'binary')],
    ['alt-a', rtMeta('concept-a', 'alternate', 'estimate')], // same concept, a different kind
  ]);
  const sequence = questions.map((question) => question.id);
  const rotation = buildTopicRotation(sequence, meta); // core-a only: alt-a's concept is already covered
  const play0 = dealTopicPlay(rotation, sequence, questions, meta, 0);
  const secondPlay = dealTopicPlay(rotation, sequence, questions, meta, 1, [play0]);
  assert.deepEqual(secondPlay, ['core-a'], 'alt-a is never offered as a swap target: it is a different kind than its concept\'s core question');
});

test('passesSoloPickerGate: ten or more playable questions, or The big picture, which is exempt while it waits to split (9.2)', () => {
  assert.equal(passesSoloPickerGate('flu', 9), false);
  assert.equal(passesSoloPickerGate('flu', 10), true);
  assert.equal(passesSoloPickerGate('flu', 19), true);
  assert.equal(passesSoloPickerGate('big-picture', 5), true, 'The big picture is exempt outright');
});

test('estimatedPlayableCount: picks minus solo-wide holds', () => {
  const picks: [string, string][] = [['vax-or-fiction', 'q26'], ['vax-or-fiction', 'q1'], ['rsv', 'q1']];
  assert.equal(estimatedPlayableCount(picks, { 'vax-or-fiction': ['q26', 'q32'] }), 2);
});

// -- Real-data checks: every shipped topic, through solo-game.ts's own loadSoloPool and dealTopicRound. --

test('spec 9.5 on real data: no play opens with the same first three questions as the play before it', async () => {
  // The variety pass rebuilds the order after the opening rotation (2c28501), so the rule is checked on the dealt
  // rounds themselves, the way SoloSuite deals them, not on rotateOpening alone.
  let compared = 0;
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const history: string[][] = [];
    for (let play = 0; play < 4; play += 1) {
      const dealt = dealTopicRound(pool, play, history);
      if (play > 0) {
        compared += 1;
        assert.notDeepEqual(dealt.slice(0, 3), history[play - 1]!.slice(0, 3), `${topic.id}: play ${play} opens like play ${play - 1}`);
      }
      history.push([...dealt]);
    }
  }
  assert.equal(compared, SOLO_TOPICS.length * 3, 'every topic compared three consecutive pairs');
  assert.ok(SOLO_TOPICS.length >= 10, 'the check saw the shipped topics');
});


test('estimatedPlayableCount agrees with the real, dynamically loaded count on the picker gate answer, for every topic today', async () => {
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const estimate = estimatedPlayableCount(topic.picks, SOLO_HOLDS);
    const estimatedAnswer = passesSoloPickerGate(topic.id, estimate);
    const realAnswer = passesSoloPickerGate(topic.id, pool.sequence.length);
    assert.equal(estimatedAnswer, realAnswer, `${topic.id}: the static estimate (${estimate} playable) and the real count (${pool.sequence.length} playable) must agree on the picker gate, even where the raw counts differ by a deck-authored hold the estimate cannot see`);
  }
});

test('every real topic: play 1 swaps each twinned concept to its alternate, never keeping the core, and play 2 returns to the core', async () => {
  let topicsWithATwin = 0;
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const byConceptKind = new Map<string, string[]>();
    for (const id of pool.sequence) {
      const question = pool.questions.find((entry) => entry.id === id);
      const record = pool.meta.get(id);
      const key = `${record?.conceptId ?? id}::${record?.kind ?? question?.kind ?? 'binary'}`;
      const group = byConceptKind.get(key);
      if (group) group.push(id); else byConceptKind.set(key, [id]);
    }
    const play0 = dealTopicRound(pool, 0);
    const play1 = dealTopicRound(pool, 1, [play0]);
    const play2 = dealTopicRound(pool, 2, [play0, play1]);
    let twinsInThisTopic = 0;
    for (const roundId of pool.rotation) {
      const question = pool.questions.find((entry) => entry.id === roundId);
      const record = pool.meta.get(roundId);
      const key = `${record?.conceptId ?? roundId}::${record?.kind ?? question?.kind ?? 'binary'}`;
      const group = byConceptKind.get(key) ?? [roundId];
      const twins = group.filter((candidate) => candidate !== roundId);
      if (twins.length === 0) continue;
      twinsInThisTopic += 1;
      assert.equal(play1.includes(roundId), false, `${topic.id} ${roundId}: play 1 must swap its core out, not keep it`);
      assert.ok(twins.some((twin) => play1.includes(twin)), `${topic.id} ${roundId}: play 1 must deal one of its own twins (${twins.join(', ')})`);
      assert.equal(play2.includes(roundId), true, `${topic.id} ${roundId}: play 2 must return to the core`);
    }
    if (twinsInThisTopic > 0) topicsWithATwin += 1;
    else assert.equal(topic.id, 'big-picture', `${topic.id} has no twinned concept to check -- only The big picture is expected to be twin-free today`);
  }
  assert.ok(topicsWithATwin >= 9, `at least nine of the ten topics carry a real twin to check, saw ${topicsWithATwin}`);
});

// The two concepts the review named by id, checked directly rather than only through the loop above.
test('rsv-senior-recommendation and counter-coadministration-general (named by the review) swap correctly at play 1', async () => {
  const rsv = await loadSoloPool(SOLO_TOPICS.find((topic) => topic.id === 'rsv')!);
  const counter = await loadSoloPool(SOLO_TOPICS.find((topic) => topic.id === 'at-the-counter')!);
  for (const pool of [rsv, counter]) {
    const targetConcept = pool === rsv ? 'rsv-senior-recommendation' : 'counter-coadministration-general';
    const roundId = pool.rotation.find((id) => pool.meta.get(id)?.conceptId === targetConcept);
    assert.ok(roundId, `${targetConcept} is in the rotation`);
    const play0 = dealTopicRound(pool, 0);
    const play1 = dealTopicRound(pool, 1, [play0]);
    assert.equal(play1.includes(roundId!), false, `${targetConcept}: play 1 swaps its core out`);
  }
});

test('every real topic: plays 0 to 3 each carry no repeated id, no repeated concept, and the same length', async () => {
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const plays: string[][] = [];
    for (let playIndex = 0; playIndex <= 3; playIndex += 1) plays.push(dealTopicRound(pool, playIndex, plays));
    for (const [index, play] of plays.entries()) {
      assert.equal(play.length, pool.rotation.length, `${topic.id} play ${index}: same length as the rotation`);
      assert.equal(new Set(play).size, play.length, `${topic.id} play ${index}: no repeated id`);
      const concepts = play.map((id) => pool.meta.get(id)?.conceptId ?? id);
      assert.equal(new Set(concepts).size, concepts.length, `${topic.id} play ${index}: no repeated concept`);
    }
  }
});

test('every real topic and opening rotation: adjacent same-kind pairs equal the mathematical minimum', async () => {
  const failures: string[] = [];
  let topicsChecked = 0;
  let roundsChecked = 0;
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const history: string[][] = [];
    topicsChecked += 1;
    for (let playIndex = 0; playIndex <= Math.min(pool.rotation.length, 6); playIndex += 1) {
      const ids = dealTopicRound(pool, playIndex, history);
      const counts = new Map<QuestionKind, number>();
      for (const id of ids) {
        const question = pool.questions.find((entry) => entry.id === id);
        const kind = pool.meta.get(id)?.kind ?? question?.kind ?? 'binary';
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
      const actual = ids.slice(1).filter((id, index) => {
        const prior = pool.questions.find((entry) => entry.id === ids[index]);
        const current = pool.questions.find((entry) => entry.id === id);
        const priorKind = pool.meta.get(ids[index]!)?.kind ?? prior?.kind ?? 'binary';
        const currentKind = pool.meta.get(id)?.kind ?? current?.kind ?? 'binary';
        return priorKind === currentKind;
      }).length;
      const expected = Math.max(0, 2 * Math.max(...counts.values()) - ids.length - 1);
      if (actual !== expected) failures.push(`${topic.id} play ${playIndex + 1}: expected ${expected}, saw ${actual}`);
      roundsChecked += 1;
      history.push(ids);
    }
  }
  console.log(`SOLO_DEALER_PAIR_COVERAGE topics=${topicsChecked}/${SOLO_TOPICS.length} rounds=${roundsChecked} failures=${failures.length}`);
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('every real topic rotation with level support fills the three difficulty bands', async () => {
  const failures: string[] = [];
  const supportedTopics = new Set<string>();
  let roundsChecked = 0;
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const history: string[][] = [];
    for (let playIndex = 0; playIndex <= Math.min(pool.rotation.length, 6); playIndex += 1) {
      const ids = dealTopicRound(pool, playIndex, history);
      const firstEnd = Math.round(ids.length / 3);
      const secondEnd = firstEnd * 2;
      const finalSize = ids.length - secondEnd;
      const levels = ids.map((id) => pool.meta.get(id)?.difficulty ?? 'pending');
      const counts = new Map<string, number>();
      for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1);
      const easy = counts.get('easy') ?? 0;
      const medium = counts.get('medium') ?? 0;
      const hard = counts.get('hard') ?? 0;
      const expert = counts.get('expert') ?? 0;
      const supported = easy <= firstEnd && easy + medium >= firstEnd
        && expert <= finalSize && hard + expert >= finalSize;
      if (supported) {
        supportedTopics.add(topic.id);
        roundsChecked += 1;
        const matches = [
          levels.slice(0, firstEnd).every((level) => level === 'easy' || level === 'medium'),
          levels.slice(firstEnd, secondEnd).every((level) => level === 'medium' || level === 'hard'),
          levels.slice(secondEnd).every((level) => level === 'hard' || level === 'expert'),
        ];
        if (matches.some((match) => !match)) failures.push(`${topic.id} play ${playIndex + 1}: ${levels.join(',')}`);
      }
      history.push(ids);
    }
  }
  console.log(`SOLO_LEVEL_BAND_COVERAGE topics=${supportedTopics.size} rounds=${roundsChecked} failures=${failures.length}`);
  assert.ok(supportedTopics.has('pneumococcal'), 'the real pneumococcal rotation is covered');
  assert.ok(roundsChecked > 0, 'at least one real rotation has enough levels to fill every band');
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('real Climb orders stay unique until each topic rotation runs out', async () => {
  const failures: string[] = [];
  let topicsChecked = 0;
  let roundsChecked = 0;
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    const history: string[][] = [];
    topicsChecked += 1;
    for (let playIndex = 0; playIndex < Math.min(pool.rotation.length, 7); playIndex += 1) {
      const climbed = dealTopicRound(pool, playIndex, history, (ids) => orderForClimb(ids, pool.questions, pool.meta));
      if (history.some((past) => past.length === climbed.length && past.every((id, index) => id === climbed[index]))) {
        failures.push(topic.id + ' play ' + (playIndex + 1));
      }
      history.push(climbed);
      roundsChecked += 1;
    }
  }
  console.log('SOLO_CLIMB_HISTORY_COVERAGE topics=' + topicsChecked + '/' + SOLO_TOPICS.length + ' rounds=' + roundsChecked + ' repeats=' + failures.length);
  assert.deepEqual(failures, [], failures.join(', '));
});

test('a ten-question Climb can repeat after its ten distinct rotations run out', () => {
  const questions = Array.from({ length: 10 }, (_, index) => q('climb-' + index, 'binary'));
  const ids = questions.map((question) => question.id);
  const meta: SoloMeta = new Map(ids.map((id, index) => [id, rtMeta('concept-' + index, 'core', 'binary')]));
  const history: string[][] = [];
  for (let playIndex = 0; playIndex <= ids.length; playIndex += 1) {
    history.push(dealTopicPlay(
      ids,
      ids,
      questions,
      meta,
      playIndex,
      history,
      (candidate) => orderForClimb(candidate, questions, meta),
    ));
  }
  assert.equal(new Set(history.slice(0, 10).map((play) => play.join(','))).size, 10, 'ten question orders stay distinct through play 10');
  assert.ok(history.slice(0, 10).some((play) => play.join(',') === history[10]?.join(',')), 'play 11 repeats only after all ten rotations');
});

test('The big picture keeps six distinct Climb orders and may repeat on play 7', async () => {
  const topic = SOLO_TOPICS.find((entry) => entry.id === 'big-picture');
  assert.ok(topic, 'The big picture stays as the short-round control');
  const pool = await loadSoloPool(topic);
  const history: string[][] = [];
  for (let playIndex = 0; playIndex <= pool.rotation.length; playIndex += 1) {
    history.push(dealTopicRound(pool, playIndex, history, (ids) => orderForClimb(ids, pool.questions, pool.meta)));
  }
  assert.equal(new Set(history.slice(0, 6).map((play) => play.join(','))).size, 6, 'six questions give six distinct Climb orders');
  assert.ok(history.slice(0, 6).some((play) => play.join(',') === history[6]?.join(',')), 'the seventh Climb play repeats only after its rotations run out');
});

test('The big picture keeps its six distinct rotations and may repeat on play 7', async () => {
  const topic = SOLO_TOPICS.find((entry) => entry.id === 'big-picture');
  assert.ok(topic, 'The big picture stays as the short-round control');
  const pool = await loadSoloPool(topic);
  const history: string[][] = [];
  for (let playIndex = 0; playIndex <= pool.rotation.length; playIndex += 1) history.push(dealTopicRound(pool, playIndex, history));
  assert.equal(new Set(history.slice(0, 6).map((play) => play.join(','))).size, 6, 'six ids give six distinct rotations');
  assert.deepEqual(history[6], history[0], 'the seventh play repeats only after its rotations run out');
});
