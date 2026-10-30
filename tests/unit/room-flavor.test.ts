// Game night on every screen (VOF-88, VOF-89 calls 15 and 16). The room decides the reveal line and
// the room streak, the big screen celebrates only a room that was right, and every animation in the
// rollout's stylesheet has a calm reduced motion version.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { isRightChoice, rightToken, kindOptions } from '../../src/engine/kinds';
import {
  ARRIVAL_KICKER, REVEAL_ROOM_RIGHT_LINE, REVEAL_ROOM_WRONG_LINE, questionIndexInRun, roomOutcome, roomRevealLine,
  roomStreakAt, roomStreakLine, showsRoomStreak,
} from '../../src/engine/room-flavor';
import { Question } from '../../src/screens/Question';
import { RoomContext } from '../../src/presentation/RoomContext';
import { useGameStore } from '../../src/store/game-store';

const binary = vaxOrFictionDeck.questions.filter((q) => q.kind === 'binary');

test('VOF-89 call 16: the proposed lines, word for word', () => {
  assert.equal(ARRIVAL_KICKER, 'Here comes one to argue about.');
  assert.equal(REVEAL_ROOM_RIGHT_LINE, 'Most of the room called it.');
  assert.equal(REVEAL_ROOM_WRONG_LINE, 'This one caught most of us.');
  assert.equal(roomStreakLine(3), '3 in a row for the room.');
  assert.equal(roomStreakLine(5), '5 in a row for the room.', 'the number is the real room streak');
});

test('the room is right at the streak rule (60% or more), wrong below half, and silent in between', () => {
  const q = binary[0]!;
  const rightSide = rightToken(q)!;
  const wrongSide = rightSide === 'true' ? 'false' : 'true';
  const at = (right: number, wrong: number) => roomOutcome(q, { [rightSide]: right, [wrongSide]: wrong });
  assert.equal(at(6, 4), 'right');
  assert.equal(at(12, 2), 'right');
  assert.equal(at(59, 41), null, 'a 59% room keeps its streak rule and is not called right');
  assert.equal(at(1, 1), null, 'a tie says nothing');
  assert.equal(at(4, 6), 'wrong');
  assert.equal(at(0, 0), null, 'no votes, no room line');
  // The store drops a vote whose token the question does not offer (`validChoice`), so the stage must too:
  // three of three real votes right is a right room, whatever else the tally carries.
  assert.equal(roomOutcome(q, { [rightSide]: 3, bogus: 3 }), 'right', 'a token the question does not offer is not a vote');
  assert.equal(roomOutcome(q, { bogus: 5 }), null, 'only tokens the question offers make a room');
  assert.equal(roomOutcome(q, undefined), null);
  assert.equal(roomOutcome(null, { true: 9 }), null);
  assert.equal(roomRevealLine('right'), REVEAL_ROOM_RIGHT_LINE);
  assert.equal(roomRevealLine('wrong'), REVEAL_ROOM_WRONG_LINE);
  assert.equal(roomRevealLine(null), null);
});

test('the pill shows only on a right reveal three or more running, never on a wrong one', () => {
  assert.equal(showsRoomStreak('right', 3), true);
  assert.equal(showsRoomStreak('right', 2), false);
  assert.equal(showsRoomStreak('wrong', 4), false);
  assert.equal(showsRoomStreak(null, 4), false);
});

/** A real estimate question, with a tolerance wide enough that the range next to the right one also scores. */
function tolerantEstimate() {
  const source = vaxOrFictionDeck.questions.find((item) => item.kind === 'estimate')!;
  const options = kindOptions(source)!;
  const right = rightToken(source)!;
  const at = options.findIndex((o) => o.token === right);
  const neighbour = options[at + 1] ?? options[at - 1]!;
  const value = Number(source.estimate!.value);
  // Far enough to reach into the neighbouring range, and no further.
  const reach = neighbour.min! >= value ? neighbour.min! - value + 0.5 : value - neighbour.max! + 0.5;
  const question = { ...source, id: 'estimate-with-tolerance', estimate: { ...source.estimate!, tolerance: reach } };
  assert.ok(isRightChoice(question, neighbour.token) && neighbour.token !== right, 'the fixture admits a neighbouring range');
  const far = options.find((o) => !isRightChoice(question, o.token))!;
  return { question, right, neighbour: neighbour.token, far: far.token };
}

test('the stage counts the room streak exactly the way the store settles it, a skip, an estimate and Back included', () => {
  // A real run through the reducer: right, right, skipped (a real SKIP), right, wrong, right, then an
  // estimate the room got right only through its tolerance, then right.
  const estimate = tolerantEstimate();
  const run = [...binary.slice(0, 6), estimate.question, binary[6]!];
  const plan: Array<'right' | 'wrong' | 'skip' | 'neighbour'> = ['right', 'right', 'skip', 'right', 'wrong', 'right', 'neighbour', 'right'];
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ offlineMode: false, interactionMode: 'polling', run: run as never, slideIndex: 0, settledQuestionInstances: {}, settledResults: {} } as never);
  const dispatch = (action: unknown) => useGameStore.getState().dispatch(action as never);
  const seen: Array<{ index: number; store: number; stage: number; outcome: string | null }> = [];
  plan.forEach((step, index) => {
    const q = run[index]!;
    if (step === 'skip') {
      // The host's real Skip. Phones are in and nobody has voted, so the reducer arms on the first
      // press and skips on the second, the same two presses the presenter makes.
      useGameStore.setState({ slideIndex: index, phase: 'deliberating', votesLocked: false } as never);
      const before = useGameStore.getState();
      dispatch({ type: 'SKIP' });
      if (useGameStore.getState().slideIndex === before.slideIndex) dispatch({ type: 'SKIP' });
      const after = useGameStore.getState();
      assert.notEqual(after.slideIndex, before.slideIndex, 'the reducer skipped the question');
      assert.equal(after.roomStats.questions[q.id], undefined, 'a skipped question is never settled');
      assert.equal(after.roomStats.streak, before.roomStats.streak, 'a skip leaves the store streak alone');
      return;
    }
    let votes: Record<string, number>;
    if (step === 'neighbour') votes = { [estimate.neighbour]: 7, [estimate.far]: 3 };
    else {
      const right = rightToken(q)!;
      const wrong = kindOptions(q)!.map((o) => o.token).find((t) => t !== right)!;
      votes = step === 'right' ? { [right]: 7, [wrong]: 3 } : { [right]: 3, [wrong]: 7 };
    }
    const voters: Record<string, { choice: string }> = {};
    let n = 0;
    for (const [token, count] of Object.entries(votes)) for (let k = 0; k < count; k += 1) voters[`d-${index}-${n++}`] = { choice: token };
    useGameStore.setState({ slideIndex: index, phase: 'locked', votesLocked: true, pollVotes: { ...useGameStore.getState().pollVotes, [q.id]: votes }, pollVoters: { ...useGameStore.getState().pollVoters, [q.id]: voters } } as never);
    dispatch({ type: 'REVEAL' });
    const state = useGameStore.getState();
    const outcome = roomOutcome(q, votes);
    const stage = outcome === 'right' ? roomStreakAt(state.run as never, index, state.roomStats.questions, true) : 0;
    seen.push({ index, store: state.roomStats.streak, stage, outcome });
  });
  assert.equal(seen.length, 7, 'every settled question was compared');
  for (const row of seen) assert.equal(row.stage, row.store, `question ${row.index + 1}: stage ${row.stage} against the store's ${row.store}`);
  assert.deepEqual(seen.map((r) => r.stage), [1, 2, 3, 0, 1, 2, 3], 'a skip leaves the streak alone and a wrong room ends it');
  assert.equal(seen[5]!.outcome, 'right', 'a room inside the estimate tolerance is right on the stage, as it is in the store');
  // The pill, by the pure rule: never on one or two running, there at three, never on a wrong room.
  assert.deepEqual(seen.map((r) => showsRoomStreak(r.outcome as never, r.stage)), [false, false, true, false, false, false, true]);
  // Back to question 4 after the run: the stage still reads that reveal's own streak, 3, not the latest.
  const state = useGameStore.getState();
  assert.equal(roomStreakAt(state.run as never, 3, state.roomStats.questions, true), 3);
});

test('a question the store settles counts in the walk whatever shape its slide has', () => {
  // `kind` is optional on a question: a legacy binary slide carries only its `answer`. The store settles it
  // like any other, so a wrong room on one must end the streak on the stage too.
  const { kind: _kind, ...kindless } = binary[2]! as unknown as Record<string, unknown>;
  const run = [binary[0]!, binary[1]!, kindless, binary[3]!];
  const stats = {
    [binary[0]!.id]: { correctPct: 84 }, [binary[1]!.id]: { correctPct: 84 }, [binary[2]!.id]: { correctPct: 30 },
  };
  assert.equal(roomStreakAt(run as never, 3, stats, true), 1, 'a wrong room on a kindless question ends the streak');
  const allRight = { ...stats, [binary[2]!.id]: { correctPct: 84 } };
  assert.equal(roomStreakAt(run as never, 3, allRight, true), 4, 'and a right room on one extends it');
  // A slide that was never settled (the title, a skipped question) is simply not counted.
  assert.equal(roomStreakAt([{ id: 'title', type: 'title' }, ...run] as never, 4, allRight, true), 4);
});

test('a question finds its own place in the run after the slide index has moved on', () => {
  const run = [{ id: 'title', type: 'title' }, { id: 'a', kind: 'binary' }, { id: 'b', kind: 'binary' }, { id: 'c', kind: 'binary' }];
  assert.equal(questionIndexInRun(run, 2, 'b'), 2, 'the live slide');
  assert.equal(questionIndexInRun(run, 3, 'b'), 2, 'leaving the stage after an Advance');
  assert.equal(questionIndexInRun(run, 1, 'b'), 2, 'leaving the stage after a Back');
  assert.equal(questionIndexInRun(run, 3, 'zzz'), -1);
  assert.equal(questionIndexInRun(null, 0, 'a'), -1);
  // The streak at the leaving card's own index, not the slide the show has moved to.
  const stats = { a: { correctPct: 80 }, b: { correctPct: 80 } };
  assert.equal(roomStreakAt(run, questionIndexInRun(run, 4, 'c'), stats, true), 3);
});

function revealMarkup(votes: Record<string, number>, props: Record<string, unknown> = {}) {
  const q = binary[0]!;
  return renderToStaticMarkup(React.createElement(RoomContext.Provider, { value: { roomId: 'TEST', connectionStatus: 'connected' as const, error: null } },
    React.createElement(Question, { question: q, phase: 'revealed', votes, format: 'widescreen', interactionMode: 'polling', autoDeliberateDelayMs: 0, showTimer: false, ...props })));
}

test('the reveal card names the room by outcome, in its eyebrow slot above the verdict', () => {
  const q = binary[0]!;
  const right = rightToken(q)!;
  const wrong = right === 'true' ? 'false' : 'true';
  const called = revealMarkup({ [right]: 12, [wrong]: 2 });
  assert.match(called, /data-role="room-reveal-line"[^>]*>Most of the room called it\.</);
  assert.ok(called.indexOf('room-reveal-line') < called.indexOf('canonical-verdict'), 'the line sits above the verdict');
  assert.match(called, /data-room-outcome="right"/);
  const caught = revealMarkup({ [right]: 2, [wrong]: 12 });
  assert.match(caught, /data-role="room-reveal-line"[^>]*>This one caught most of us\.</);
  assert.match(caught, /data-room-outcome="wrong"/);
  const split = revealMarkup({ [right]: 5, [wrong]: 5 });
  assert.doesNotMatch(split, /room-reveal-line|data-room-outcome/);
  const handsUp = revealMarkup({ [right]: 12, [wrong]: 2 }, { interactionMode: 'facilitator' });
  assert.doesNotMatch(handsUp, /room-reveal-line|data-room-outcome/, 'a hands-up room has no tally to call');
});

test('the arrival kicker sits directly above the stem on every kind, and never replaces the type kicker', () => {
  const kinds = ['binary', 'myth-among-three', 'estimate', 'order', 'which-patient'];
  for (const kind of kinds) {
    const q = vaxOrFictionDeck.questions.find((item) => item.kind === kind)!;
    const html = renderToStaticMarkup(React.createElement(RoomContext.Provider, { value: { roomId: 'TEST', connectionStatus: 'connected' as const, error: null } },
      React.createElement(Question, { question: q, phase: 'deliberating', format: 'widescreen', interactionMode: 'polling', autoDeliberateDelayMs: 0, showTimer: false })));
    const kicker = html.indexOf('data-role="arrival-kicker"');
    assert.ok(kicker > 0, `${kind}: the arrival kicker renders`);
    const next = html.slice(kicker).match(/<(h1|p)[^>]*>/g)?.[0] ?? '';
    assert.match(next, /<h1/, `${kind}: the next heading after the arrival kicker is the stem`);
    assert.match(html, /data-role="question-kicker"[^>]*><span class="question-source-kicker__words">(Make your call|Pick the myth|Estimate|Put in order|Which reply is better|Patient scenario)</, `${kind}: VOF-05's type kicker still shows`);
  }
});

// An entrance may fade its element in, but it must let go of it: it fills backwards only, and only its first
// keyframe states an opacity. Anything later in the keyframes would lift a dimmed element (a sat-out phone's
// steps) to full strength for a moment before it settles.
test('an entrance fills backwards and states an opacity in its first keyframe only', () => {
  const css = readFileSync(new URL('../../src/styles/game-night.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // These two rest invisible and show only while their animation runs, so their keyframes own the opacity.
  const showsThenHides = new Set(['gn-arrival-line', 'gn-gold-burst']);
  const blocks = [...css.matchAll(/@keyframes\s+(gn-[\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
  assert.ok(blocks.length >= 9, `the check sees the rollout's keyframes (${blocks.length})`);
  const late: string[] = [];
  for (const [, name, body] of blocks) {
    if (showsThenHides.has(name!)) continue;
    const frames = [...body!.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    frames.forEach((frame, index) => {
      if (index > 0 && /(^|;|\s)opacity\s*:/.test(frame[2]!)) late.push(`${name} ${frame[1]!.trim()}`);
    });
  }
  assert.deepEqual(late, [], 'these keyframes state an opacity after the first one');
  // A looping animation (the phone's cone) has no end to hold past, so only the one-shot entrances count.
  const uses = [...css.matchAll(/animation\s*:\s*(gn-[\w-]+)([^;}]*)/g)].filter((use) => !/\binfinite\b/.test(use[2]!));
  assert.ok(uses.length >= 12, `the check sees the rollout's entrances (${uses.length})`);
  const held = uses.filter((use) => !/\bbackwards\b/.test(use[2]!) || /\b(both|forwards)\b/.test(use[2]!)).map((use) => use[0]);
  assert.deepEqual(held, [], 'these animations hold a state past their end');
});

// Every selector that animates in game-night.css has a reduced motion rule that stops it.
test('every animation the rollout adds has a calm reduced motion version', () => {
  const css = readFileSync(new URL('../../src/styles/game-night.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const reduceAt = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(reduceAt > 0, 'the reduced motion block exists');
  const main = css.slice(0, reduceAt);
  const reduced = css.slice(reduceAt);
  const animated: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = rule.exec(main); m; m = rule.exec(main)) {
    if (m[1]!.trim().startsWith('@') || /^\s*(from|to|\d+%)/.test(m[1]!)) continue;
    if (!/(^|;|\s)animation(-name)?\s*:\s*(?!none)/.test(m[2]!)) continue;
    for (const selector of m[1]!.split(/,(?![^(]*\))/)) {
      const s = selector.trim();
      // A delay-only rule (nth-child stagger) animates nothing of its own.
      if (/:nth-child|~ |\+ /.test(s) && !/animation\s*:/.test(m[2]!)) continue;
      animated.push(s);
    }
  }
  assert.ok(animated.length >= 12, `the check sees the rollout's animations (${animated.length})`);
  const stoppedSelectors = new Set<string>();
  const stopRule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = stopRule.exec(reduced); m; m = stopRule.exec(reduced)) {
    if (!/animation\s*:\s*none/.test(m[2]!)) continue;
    for (const selector of m[1]!.replace(/@media[^{]*\{/, '').split(/,(?![^(]*\))/)) stoppedSelectors.add(selector.trim());
  }
  const missing = animated.filter((s) => !stoppedSelectors.has(s) && !stoppedSelectors.has(s.replace(/:nth-child\([^)]*\)/, '')));
  assert.deepEqual(missing, [], 'these animate with no reduced motion stop');
});
