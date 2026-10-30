import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../../src/store/game-store';
import { projectGameState } from '../../src/network/game-projection';
import { remotePadModel } from '../../src/network/presenter-remote';
import { PhoneScreens, type PhoneLink } from '../../src/phone/PhoneSuite';
import type { AttendeeState, PublicRoomState } from '../../src/network/protocol';
import type { SlideEntry } from '../../src/data/types';

// PAUSED-AFTER-ADD-TIME. The phone showed "PAUSED FOR DISCUSSION" only for a stopped clock below its
// full duration. ADD_TIME raises the time left but never the duration, so a question the host paused
// and then gave more time (35 of 30) read as open on every phone, and so did a pause in the first
// second of deliberation, where the seconds round up to the full duration. The presenter remote
// already reads both as paused (W9, f72ed91). The phone must agree with it.

const questions = [
  { id: 'p-one', type: 'question', kind: 'binary', statement: 'First.', answer: true },
] as unknown as SlideEntry[];

function questionState(phase: 'entering' | 'deliberating', remainingMs: number, running: boolean) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    sessionId: 'pause-run',
    run: questions,
    slideIndex: 0,
    phase: phase as never,
    interactionMode: 'polling',
    offlineMode: false,
    votesLocked: false,
    pollVotes: {},
    pollVoters: {},
    seenDevices: {},
    settledQuestionInstances: {},
    settledResults: {},
    timer: {
      durationMs: 30_000, remainingMs, running, enabled: true, visible: true, pauseReason: running ? null : 'manual',
      generation: 0, endsAt: running ? Date.now() + remainingMs : null,
    },
  } as never);
}

function projected(): PublicRoomState {
  return projectGameState(useGameStore.getState(), 'AB3D', 2).roomState;
}

const attendee: AttendeeState = {
  sessionId: 'pause-run', registered: true, nickname: 'Maria', team: null, vote: null, result: null, score: 0,
  correct: 0, answered: 0, accuracy: null, bestStreak: 0, rank: null, totalParticipants: 1, commitments: [],
};

function phonePaused(roomState: PublicRoomState): boolean {
  const link: PhoneLink = {
    roomState, attendeeState: attendee, connectionStatus: 'connected', error: null, pending: false,
    join() {}, sendVote() {}, sendReaction() {}, sendPrediction() {}, retry() {},
  };
  const html = renderToStaticMarkup(React.createElement(PhoneScreens, { roomId: 'AB3D', deviceId: 'device-pause', link }));
  const match = html.match(/data-discussion-paused="(true|false)"/);
  assert.ok(match, 'test setup: the phone rendered its vote screen');
  return match[1] === 'true';
}

test('a question the host paused and then gave more time still reads paused on the phone (PAUSED-AFTER-ADD-TIME)', () => {
  questionState('deliberating', 20_000, true);
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'TOGGLE_PAUSE' });
  dispatch({ type: 'ADD_TIME', seconds: 15 });
  const room = projected();
  assert.equal(room.timerRunning, false, 'test setup: the clock is stopped');
  assert.equal(room.votesLocked, false, 'test setup: voting is still open');
  assert.equal(room.timerSeconds, 35, 'test setup: ADD_TIME raised the time left above the duration');
  assert.equal(room.timerDurationSeconds, 30, 'test setup: ADD_TIME left the duration alone');
  assert.equal(remotePadModel(room).pauseLabel, 'Resume', 'test setup: the presenter remote reads this as paused');
  assert.equal(phonePaused(room), true, 'the phone shows the pause after the host added time (35 of 30)');
});

test('a pause in the first second of deliberation reads paused on the phone (PAUSED-AFTER-ADD-TIME)', () => {
  questionState('deliberating', 29_500, true);
  useGameStore.getState().dispatch({ type: 'TOGGLE_PAUSE' });
  const room = projected();
  assert.equal(room.timerSeconds, 30, 'test setup: the seconds round up to the full duration');
  assert.equal(phonePaused(room), true, 'the phone shows a pause at 30 of 30 once deliberation has started');
});

test('every clock the phone already read correctly keeps its reading, and the phone agrees with the remote (PAUSED-AFTER-ADD-TIME)', () => {
  const cases: { name: string; phase: 'entering' | 'deliberating'; remainingMs: number; running: boolean; after?: string[]; paused: boolean }[] = [
    { name: 'paused mid question (20 of 30)', phase: 'deliberating', remainingMs: 20_000, running: true, after: ['TOGGLE_PAUSE'], paused: true },
    { name: 'running', phase: 'deliberating', remainingMs: 20_000, running: true, paused: false },
    { name: 'votes locked', phase: 'deliberating', remainingMs: 20_000, running: true, after: ['TOGGLE_PAUSE', 'LOCK_VOTES'], paused: false },
    { name: 'ran out on its own', phase: 'deliberating', remainingMs: 20_000, running: true, after: ['TIME_EXPIRED'], paused: false },
    { name: 'entering, the clock has not run (30 of 30)', phase: 'entering', remainingMs: 30_000, running: false, paused: false },
    { name: 'entering, time added before the clock ran (45 of 30)', phase: 'entering', remainingMs: 30_000, running: false, after: ['ADD_TIME'], paused: false },
    { name: 'entering, started early and stopped (12 of 30)', phase: 'entering', remainingMs: 12_000, running: false, paused: true },
  ];
  for (const item of cases) {
    questionState(item.phase, item.remainingMs, item.running);
    for (const type of item.after ?? []) useGameStore.getState().dispatch({ type, ...(type === 'ADD_TIME' ? { seconds: 15 } : {}) } as never);
    const room = projected();
    assert.equal(phonePaused(room), item.paused, `${item.name}: the phone reads ${item.paused ? 'paused' : 'not paused'}`);
    assert.equal(remotePadModel(room).pauseLabel === 'Resume', item.paused, `${item.name}: the presenter remote agrees with the phone`);
  }
});

test('a question with no timer never reads paused on the phone (PAUSED-AFTER-ADD-TIME)', () => {
  questionState('deliberating', 30_000, false);
  useGameStore.setState({ timer: { ...useGameStore.getState().timer, enabled: false, visible: false, pauseReason: 'disabled' } } as never);
  const room = projected();
  assert.equal(room.timerDurationSeconds, 0, 'test setup: the question has no timer');
  assert.equal(phonePaused(room), false, 'no clock, so no pause');
});

// Switching the timer on during deliberation (T) leaves a stopped clock at its full duration, the same
// public state as a pause in the first second, so the room cannot tell the two apart. The presenter remote
// already reads it as paused (W9, it offers Resume to start the clock), and the phone agrees with it.
test('a timer switched on during deliberation and not started yet reads paused, as the remote reads it (PAUSED-AFTER-ADD-TIME)', () => {
  questionState('deliberating', 30_000, false);
  useGameStore.setState({ timer: { ...useGameStore.getState().timer, enabled: false, visible: false, pauseReason: 'disabled' } } as never);
  useGameStore.getState().dispatch({ type: 'TOGGLE_TIMER' });
  const room = projected();
  assert.equal(room.timerDurationSeconds, 30, 'test setup: T switched the clock on');
  assert.equal(room.timerRunning, false, 'test setup: switching it on does not start it');
  assert.equal(room.timerSeconds, 30, 'test setup: the clock sits at its full duration');
  assert.equal(remotePadModel(room).pauseLabel, 'Resume', 'test setup: the presenter remote reads this as paused');
  assert.equal(phonePaused(room), true, 'the phone agrees with the remote');
});
