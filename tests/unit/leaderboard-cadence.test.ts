import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  LEADERBOARD_INTERVAL,
  LEADERBOARD_LIMIT,
  INTERVAL_LEADERBOARD_MODE_ID,
  computeLeaderboard,
  computeStageLanes,
  rankLeaderboard,
  shouldShowIntervalLeaderboard,
  isIntervalLeaderboardMode,
  leaderboardIntervalForCount,
} from '../../src/engine/leaderboard';
import { advance, back } from '../../src/engine/state-machine';
import { getAudioLifecycleDecision } from '../../src/engine/audio-lifecycle';
import { isQuestionSlide, rightToken } from '../../src/engine/kinds';
import { useGameStore } from '../../src/store/game-store';
import { ScoreBoard } from '../../src/components/show/ScoreBoard';
import { Closing } from '../../src/screens/Closing';
import { remotePadModel } from '../../src/network/presenter-remote';
import type { GameState } from '../../src/data/types';
import type { PublicRoomState } from '../../src/network/protocol';

function questionSlide(displayNumber: number, displayCount = 15, id = `q-${displayNumber}`) {
  return {
    id,
    type: 'question',
    kind: 'binary',
    prompt: `Question ${displayNumber}`,
    answer: true,
    displayNumber,
    displayCount,
  };
}

function explainingState(displayNumber: number, overrides: Record<string, unknown> = {}): GameState {
  return {
    phase: 'explaining',
    slideIndex: 0,
    run: [questionSlide(displayNumber)],
    leaderboardEnabled: true,
    modeId: INTERVAL_LEADERBOARD_MODE_ID,
    ...overrides,
  } as GameState;
}

// The stage board renders computeStageLanes' rows, each carrying the lane key ScoreBoard glides it by.
function rankedBoard() {
  return computeStageLanes({
    a: { nickname: 'Avery', score: 14, realityGap: 0, answered: 1 },
    b: { nickname: 'Blair', score: 11, realityGap: 1, answered: 1 },
    c: { nickname: 'Casey', score: 9, realityGap: 0, answered: 1 },
    d: { nickname: 'Drew', score: 6, realityGap: 2, answered: 1 },
    e: { nickname: 'Eden', score: 4, realityGap: 0, answered: 1 },
    f: { nickname: 'Fin', score: 3, realityGap: 0, answered: 1 },
  });
}

test('interval boards are Top 5, every five questions, Curated 15 only', () => {
  assert.equal(LEADERBOARD_LIMIT, 5);
  assert.equal(LEADERBOARD_INTERVAL, 5);
  assert.equal(INTERVAL_LEADERBOARD_MODE_ID, 'curated15');
  const base = { leaderboardEnabled: true, modeId: 'curated15' as const };
  for (const n of [5, 10]) {
    assert.equal(shouldShowIntervalLeaderboard({
      ...base,
      run: [questionSlide(n)],
      slideIndex: 0,
    }), true, `Q${n} shows the board`);
  }
  for (const n of [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15]) {
    assert.equal(shouldShowIntervalLeaderboard({
      ...base,
      run: [questionSlide(n)],
      slideIndex: 0,
    }), false, `Q${n} does not show the board`);
  }
  assert.equal(shouldShowIntervalLeaderboard({
    ...base,
    leaderboardEnabled: false,
    run: [questionSlide(5)],
    slideIndex: 0,
  }), false, 'scores off never shows an interval board');
  assert.equal(shouldShowIntervalLeaderboard({
    ...base,
    modeId: 'demo',
    run: [questionSlide(5, 12)],
    slideIndex: 0,
  }), false, 'other modes keep scores off-stage until closing');
});

test('W5: a hands-up room never opens an interval board, since there are no phone votes to rank', () => {
  const base = { leaderboardEnabled: true, modeId: 'curated15' as const, run: [questionSlide(5)], slideIndex: 0 };
  // Nit (premium-host-fix-3): this message called the default (no interactionMode set at all) a
  // "polling" case, which it never was. Relabeled to say what the state actually is, and a real
  // interactionMode: 'polling' case sits next to it so "polling" is an explicit assertion
  // somewhere in this test, not implied by an unset field.
  assert.equal(shouldShowIntervalLeaderboard(base), true, 'an unset interactionMode still shows the board at Q5 (the default is not hands-up)');
  assert.equal(shouldShowIntervalLeaderboard({ ...base, interactionMode: 'polling' }), true, 'explicit polling still shows the board');
  assert.equal(shouldShowIntervalLeaderboard({ ...base, interactionMode: 'facilitator' }), false, 'hands-up skips the board');
  // Nit (premium-host-fix-3): offlineMode checked independently of interactionMode, so a desynced
  // room (offline true, interactionMode still carrying a stale 'polling') stays skipped too.
  assert.equal(shouldShowIntervalLeaderboard({ ...base, interactionMode: 'polling', offlineMode: true }), false, 'offlineMode alone skips the board even with a stale polling interactionMode');
  assert.equal(shouldShowIntervalLeaderboard({ ...base, interactionMode: 'polling', offlineMode: false }), true, 'a real online polling room still opens the board');
});

test('WARNING-9 (premium-host-fix-3): advance() never lands on the leaderboard phase for a hands-up room', () => {
  // The atlas used to force-set phase:'leaderboard' directly on a hands-up room to capture an
  // "empty" board. W5 (above) means a real facilitator-mode room's advance() never transitions
  // there at all, so that capture was testing a state no real action can reach. This proves the
  // real transition path, not just the helper function in isolation.
  const slide = questionSlide(5);
  const state = {
    phase: 'explaining' as const, modeId: 'curated15' as const, leaderboardEnabled: true,
    interactionMode: 'facilitator' as const, offlineMode: true,
    run: [slide], slideIndex: 0,
  };
  const next = advance(state as any);
  assert.notEqual(next?.phase, 'leaderboard', 'a hands-up room advancing past a Q5 must not open the board');
  const pollingState = { ...state, interactionMode: 'polling' as const, offlineMode: false };
  const pollingNext = advance(pollingState as any);
  assert.equal(pollingNext?.phase, 'leaderboard', 'the same slide with polling on still opens the board, proving this is a real branch, not a broken test');
});

test('curated8 interval board appears after Q4 (Halftime) and never after terminal Q8', () => {
  assert.equal(isIntervalLeaderboardMode('curated8'), true);
  assert.equal(isIntervalLeaderboardMode('curated15'), true);
  assert.equal(isIntervalLeaderboardMode('demo'), false);
  assert.equal(isIntervalLeaderboardMode(null), false);
  assert.equal(isIntervalLeaderboardMode(undefined), false);

  assert.equal(leaderboardIntervalForCount(8), 4);
  assert.equal(leaderboardIntervalForCount(10), 4);
  assert.equal(leaderboardIntervalForCount(15), 5);
  assert.equal(leaderboardIntervalForCount(undefined), 5);
  assert.equal(leaderboardIntervalForCount(null), 5);

  const base = { leaderboardEnabled: true, modeId: 'curated8' };
  for (const n of [1, 2, 3, 5, 6, 7]) {
    assert.equal(shouldShowIntervalLeaderboard({
      ...base,
      run: [questionSlide(n, 8)],
      slideIndex: 0,
    }), false, `Q${n} of 8 does not show the board`);
  }

  assert.equal(shouldShowIntervalLeaderboard({
    ...base,
    run: [questionSlide(4, 8)],
    slideIndex: 0,
  }), true, 'Q4 of 8 shows the Halftime board');

  assert.equal(shouldShowIntervalLeaderboard({
    ...base,
    run: [questionSlide(8, 8)],
    slideIndex: 0,
  }), false, 'Q8 of 8 (terminal) does not show interval board because closing carries final Top 5');

  assert.equal(shouldShowIntervalLeaderboard({
    ...base,
    leaderboardEnabled: false,
    run: [questionSlide(4, 8)],
    slideIndex: 0,
  }), false, 'scores off never shows Halftime board');
});

test('tied scores share a competition rank so two firsts both sit at 1', () => {
  const ranked = rankLeaderboard(computeLeaderboard({
    a: { nickname: 'Ada', score: 12, realityGap: 0, answered: 1 },
    b: { nickname: 'Bo', score: 12, realityGap: 0, answered: 1 },
    c: { nickname: 'Cy', score: 8, realityGap: 1, answered: 1 },
  }));
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 1);
  assert.equal(ranked[2].rank, 3);
  assert.equal(computeLeaderboard({
    a: { nickname: 'Ada', score: 1, realityGap: 0, answered: 1 },
    b: { nickname: 'Bo', score: 2, realityGap: 0, answered: 1 },
    c: { nickname: 'Cy', score: 3, realityGap: 0, answered: 1 },
    d: { nickname: 'Di', score: 4, realityGap: 0, answered: 1 },
    e: { nickname: 'Ed', score: 5, realityGap: 0, answered: 1 },
    f: { nickname: 'Fay', score: 6, realityGap: 0, answered: 1 },
  }).length, 5);
});

test('explaining Q5 goes to the board, back returns to entering, next leaves the board', () => {
  const q5 = explainingState(5);
  const toBoard = advance(q5);
  assert.equal(toBoard?.phase, 'leaderboard');
  assert.equal(toBoard?.slideIndex, undefined);

  const onBoard = { ...q5, phase: 'leaderboard' as const };
  assert.deepEqual(back(onBoard), { phase: 'entering', direction: 'backward' });

  const onward = advance({
    ...onBoard,
    run: [questionSlide(5), questionSlide(6, 15, 'q-6')],
  });
  assert.equal(onward?.phase, 'entering');
  assert.equal(onward?.slideIndex, 1);

  const q4 = advance(explainingState(4));
  assert.notEqual(q4?.phase, 'leaderboard');
  const last = advance(explainingState(15));
  assert.notEqual(last?.phase, 'leaderboard');
});

test('Curated 15 with scores on hits Top 5 after Q5 and Q10, never after every question, and closes without showdown', () => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState({
    ...initial,
    sessionId: 'cadence-run',
    showdownEnabled: false,
    showdown: null,
    seenDevices: {},
    pollVotes: {},
    pollVoters: {},
    settledQuestionInstances: {},
    settledResults: {},
  }, true);
  const dispatch = () => useGameStore.getState().dispatch;
  dispatch()({ type: 'APPLY_PRESET', presetId: 'curated15' });
  dispatch()({ type: 'HELLO', deviceId: 'ada', nickname: 'Ada' });
  dispatch()({ type: 'HELLO', deviceId: 'bo', nickname: 'Bo' });
  dispatch()({ type: 'ENTER_LOBBY' });

  const boards: number[] = [];
  const played: string[] = [];
  let previousScore = 0;
  for (let step = 0; step < 120 && useGameStore.getState().phase !== 'closing'; step += 1) {
    const before = useGameStore.getState();
    if (before.phase === 'entering' && isQuestionSlide(before.run[before.slideIndex])) {
      const slide = before.run[before.slideIndex];
      played.push(slide.id);
      dispatch()({ type: 'VOTE', deviceId: 'ada', token: rightToken(slide), conviction: 'certain' });
      dispatch()({ type: 'VOTE', deviceId: 'bo', token: rightToken(slide), conviction: 'certain' });
      dispatch()({ type: 'REVEAL' });
      const after = useGameStore.getState();
      const ada = after.seenDevices.ada;
      assert.ok(ada.score > previousScore, 'kind points accumulate question to question');
      previousScore = ada.score;
      assert.notEqual(after.phase, 'leaderboard', 'reveal never jumps to the board');
      continue;
    }
    dispatch()({ type: 'ADVANCE' });
    const state = useGameStore.getState();
    assert.notEqual(state.phase, 'showdown', 'Curated 15 Next never opens Showdown');
    if (state.phase === 'leaderboard') {
      const n = Number((state.run[state.slideIndex] as { displayNumber?: number }).displayNumber);
      boards.push(n);
    }
  }

  assert.equal(played.length, 15);
  assert.deepEqual(boards, [5, 10], 'the board is Q5 and Q10 only');
  assert.equal(useGameStore.getState().phase, 'closing');
  assert.equal(useGameStore.getState().showdown, null);
  assert.equal(useGameStore.getState().showdownEnabled, false);
  assert.equal(useGameStore.getState().seenDevices.ada.score, 2650);
  assert.equal(useGameStore.getState().leaderboardEnabled, true);
});

test('curated8 explaining Q4 goes to the board, back returns to entering, terminal Q8 does not', () => {
  const q4 = {
    phase: 'explaining',
    slideIndex: 0,
    run: [questionSlide(4, 8)],
    leaderboardEnabled: true,
    modeId: 'curated8',
  } as GameState;
  const toBoard = advance(q4);
  assert.equal(toBoard?.phase, 'leaderboard');
  assert.equal(toBoard?.slideIndex, undefined);

  const onBoard = { ...q4, phase: 'leaderboard' as const };
  assert.deepEqual(back(onBoard), { phase: 'entering', direction: 'backward' });

  const onward = advance({
    ...onBoard,
    run: [questionSlide(4, 8), questionSlide(5, 8, 'q-5')],
  });
  assert.equal(onward?.phase, 'entering');
  assert.equal(onward?.slideIndex, 1);

  const q3 = advance({
    ...q4,
    run: [questionSlide(3, 8)],
  });
  assert.notEqual(q3?.phase, 'leaderboard');

  const q8 = advance({
    ...q4,
    run: [questionSlide(8, 8)],
  });
  assert.notEqual(q8?.phase, 'leaderboard');
});

test('Curated 8 with scores on hits Top 5 after Q4 only, never after every question, and closes without showdown', () => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState({
    ...initial,
    sessionId: 'cadence-run-8',
    modeId: 'curated8',
    activePresetId: 'curated8',
    showdownEnabled: false,
    showdown: null,
    seenDevices: {},
    pollVotes: {},
    pollVoters: {},
    settledQuestionInstances: {},
    settledResults: {},
  }, true);
  const dispatch = () => useGameStore.getState().dispatch;
  dispatch()({ type: 'APPLY_PRESET', presetId: 'curated8' });
  dispatch()({ type: 'HELLO', deviceId: 'ada', nickname: 'Ada' });
  dispatch()({ type: 'HELLO', deviceId: 'bo', nickname: 'Bo' });
  dispatch()({ type: 'ENTER_LOBBY' });

  const boards: number[] = [];
  const played: string[] = [];
  for (let step = 0; step < 120 && useGameStore.getState().phase !== 'closing'; step += 1) {
    const before = useGameStore.getState();
    if (before.phase === 'entering' && isQuestionSlide(before.run[before.slideIndex])) {
      const slide = before.run[before.slideIndex];
      played.push(slide.id);
      dispatch()({ type: 'VOTE', deviceId: 'ada', token: rightToken(slide), conviction: 'certain' });
      dispatch()({ type: 'VOTE', deviceId: 'bo', token: rightToken(slide), conviction: 'certain' });
      dispatch()({ type: 'REVEAL' });
      continue;
    }
    dispatch()({ type: 'ADVANCE' });
    const state = useGameStore.getState();
    assert.notEqual(state.phase, 'showdown', 'Curated 8 Next never opens Showdown');
    if (state.phase === 'leaderboard') {
      const n = Number((state.run[state.slideIndex] as { displayNumber?: number }).displayNumber);
      boards.push(n);
    }
  }

  assert.equal(played.length, 8);
  assert.deepEqual(boards, [4], 'the board is Q4 only for curated8');
  assert.equal(useGameStore.getState().phase, 'closing');
  assert.equal(useGameStore.getState().showdown, null);
  assert.equal(useGameStore.getState().showdownEnabled, false);
  assert.equal(useGameStore.getState().leaderboardEnabled, true);
});

test('the Top 5 board golds #1, names the room, and is not a table', () => {
  const entries = rankedBoard();
  assert.equal(entries[0].rank, 1);
  assert.equal(entries.length, 5);
  // Every lane needs its own key (MOT-VQA-09), so React must not warn about a missing or repeated one.
  const warnings: string[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  let html: string;
  try {
    html = renderToStaticMarkup(React.createElement(ScoreBoard, { entries, through: 5, tone: 'stage' }));
  } finally {
    console.error = consoleError;
  }
  assert.deepEqual(warnings.filter((warning) => /key/i.test(warning)), [], 'each stage lane renders with its own key');
  assert.match(html, /data-role="score-board"/);
  assert.match(html, /data-rank="1"/);
  assert.match(html, /Avery/);
  assert.match(html, /Through 5/);
  assert.doesNotMatch(html, /<table/i);
  assert.doesNotMatch(html, /<h1[^>]*>Top 5<\/h1>/, 'chrome already says Top 5, the lanes carry the names');
  const firstLane = html.match(/data-role="score-board-lane"[^>]*data-rank="1"[\s\S]*?<\/li>/);
  assert.ok(firstLane, 'rank 1 is a named lane');
  assert.match(firstLane![0], /Avery/);
  const empty = renderToStaticMarkup(React.createElement(ScoreBoard, { entries: [], through: 5, tone: 'stage' }));
  assert.match(empty, /data-role="score-board-empty"/);
  assert.match(empty, /The board is waiting\./);
});

test('closing still opens on the recap, with Top 5 as an extra page', () => {
  const html = renderToStaticMarkup(React.createElement(Closing, {
    leaderboardEnabled: true,
    leaderboard: [{ nickname: 'Avery', score: 12, realityGap: 0 }],
    roomStats: {
      questions: {
        q4: { kind: 'binary', choices: { true: 1, false: 3 }, trueCount: 1, falseCount: 3, correctPct: 25, majorityWrong: true },
      },
      accuracy: 62,
      streak: 0,
      bestStreak: 2,
      mythsBusted: 0,
      votesTotal: 8,
    },
  }));
  assert.match(html, /data-closing-page="recap"/);
  assert.match(html, /data-role="closing-overview"/);
  assert.doesNotMatch(html, /data-role="closing-scores"/);
  assert.match(html, /data-role="closing-show-scores"/);
  assert.match(html, />Top 5</);
});

test('leaderboard audio and the presenter remote stay on the Top 5 beat', () => {
  assert.deepEqual(getAudioLifecycleDecision({ phase: 'leaderboard', timerRunning: false }), {
    role: 'menu-soft',
    loop: true,
  });
  const pad = remotePadModel({
    version: 1, roomId: 'AB3D', sessionId: 'run', revision: 1, phase: 'leaderboard',
    slideIndex: 6, slideCount: 17, question: 'q16', votesLocked: true, timerSeconds: 0,
    timerDurationSeconds: 30, timerRunning: false, participants: 4, teamScores: null,
    leaderboard: [{ name: 'Avery', score: 12, rank: 1, team: null }],
    showdown: null, hostConnected: true, reveal: null,
    questionData: {
      id: 'q16', questionInstanceId: 'q16:1', kind: 'binary', statement: 'Test',
      number: 5, total: 15, options: [],
    },
  } as PublicRoomState);
  assert.equal(pad.statusLine, 'Top 5');
  assert.equal(pad.advanceLabel, 'Next');
  assert.equal(pad.canLock, false);
  assert.equal(pad.canReveal, false);
});
