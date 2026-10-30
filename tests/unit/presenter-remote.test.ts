import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  generateRemoteKey,
  isRemoteKey,
  parseRemoteCommand,
  parseRemoteToken,
  remoteCommandNickname,
  remoteControllerUrl,
  remoteHostLine,
  remotePadModel,
  remotePairNickname,
  ROOM_CURATED15_TIMER_SECONDS,
} from '../../src/network/presenter-remote';
import { PresenterPairing } from '../../src/screens/PresenterPairing';
import type { PublicRoomState } from '../../src/network/protocol';
import { presentationBundle } from './css-declarations';

const key = 'REMOTEKEYREMOTEKEYREMOTE';

test('remote pairing keys and command nicknames stay inside HELLO limits', () => {
  assert.equal(isRemoteKey(key), true);
  assert.equal(isRemoteKey('short'), false);
  assert.equal(generateRemoteKey().length, 24);
  assert.equal(remotePairNickname(key), `pair:${key}`);
  assert.ok(remotePairNickname(key).length <= 40);
  assert.equal(parseRemoteCommand(remoteCommandNickname('ADVANCE')), 'ADVANCE');
  assert.equal(parseRemoteCommand('Ada'), null);
  assert.equal(ROOM_CURATED15_TIMER_SECONDS, 30);
  assert.deepEqual(parseRemoteToken(`AB3D.${key}`), { roomId: 'AB3D', key });
  assert.equal(remoteControllerUrl('https://vaxorfiction.com', 'AB3D', key), `https://vaxorfiction.com/remote?room=AB3D&key=${key}`);
});

test('the phone pad labels lock and reveal from public room state', () => {
  const posedState = {
    version: 1, roomId: 'AB3D', sessionId: 'run', revision: 1, phase: 'deliberating',
    slideIndex: 2, slideCount: 17, question: 'q4', votesLocked: false, timerSeconds: 30,
    timerDurationSeconds: 30, timerRunning: true, participants: 4, teamScores: null,
    leaderboard: [], showdown: null, hostConnected: true, reveal: null,
    questionData: {
      id: 'q4', questionInstanceId: 'q4:1', kind: 'binary', statement: 'Test',
      number: 1, total: 15, options: [],
    },
  } as PublicRoomState;
  const posed = remotePadModel(posedState);
  assert.equal(posed.canLock, true);
  assert.equal(posed.canReveal, false);
  assert.match(posed.statusLine, /Q1 of 15/);
  assert.match(posed.statusLine, /Voting open/);

  const lockedModel = remotePadModel({ ...posedState, votesLocked: true });
  assert.equal(lockedModel.canLock, false);
  assert.equal(lockedModel.canReveal, true);

  const title = remotePadModel({ ...posedState, phase: 'entering', question: 'title', questionData: null, votesLocked: true });
  assert.equal(title.statusLine, 'Title');
  assert.equal(title.advanceLabel, 'Next');
  assert.equal(title.canLock, false);
  assert.equal(title.onQuestion, false);
  const instructions = remotePadModel({ ...posedState, phase: 'entering', question: 'instructions', questionData: null, votesLocked: true });
  assert.equal(instructions.statusLine, 'Instructions');
  assert.equal(instructions.onQuestion, false);
  const revealed = remotePadModel({ ...posedState, phase: 'revealed', votesLocked: true });
  assert.equal(revealed.advanceLabel, 'Explain');

  const setup = remotePadModel({ ...posedState, phase: 'preFlight', questionData: null });
  assert.equal(setup.statusLine, 'Setup');
  assert.equal(setup.isSetup, true);
  assert.equal(setup.coachLine, 'Tap Next to start');
  assert.equal(setup.advanceLabel, 'Next');
  assert.equal(remoteHostLine({ paired: true, hostConnected: true, roomId: 'ledq' }), 'Driving room LEDQ');
  assert.equal(remoteHostLine({ paired: true, hostConnected: false, roomId: 'ledq' }), 'Waiting for laptop...');
  assert.equal(remoteHostLine({ paired: false, hostConnected: false, roomId: 'ledq' }), 'Scan the laptop QR to pair');
});

test('FAC-01: the phone pad can pause a live, unlocked countdown', () => {
  const posedState = {
    version: 1, roomId: 'AB3D', sessionId: 'run', revision: 1, phase: 'deliberating',
    slideIndex: 2, slideCount: 17, question: 'q4', votesLocked: false, timerSeconds: 30,
    timerDurationSeconds: 30, timerRunning: true, participants: 4, teamScores: null,
    leaderboard: [], showdown: null, hostConnected: true, reveal: null,
    questionData: {
      id: 'q4', questionInstanceId: 'q4:1', kind: 'binary', statement: 'Test',
      number: 1, total: 15, options: [],
    },
  } as PublicRoomState;
  assert.equal(remotePadModel(posedState).canPause, true, 'a question in progress can be paused');
  assert.equal(remotePadModel({ ...posedState, votesLocked: true }).canPause, false, 'locked votes stop the countdown, so pause has nothing to do');
  assert.equal(remotePadModel({ ...posedState, phase: 'preFlight', questionData: null }).canPause, false, 'setup has no countdown');
  assert.equal(remotePadModel(null).canPause, false);
  // W9: a question with the timer off has no countdown to pause either, so Pause must not stay enabled.
  assert.equal(remotePadModel({ ...posedState, timerDurationSeconds: 0 }).canPause, false, 'a question with no timer has nothing to pause');
});

test('W9 (FAC-01): the pause control labels itself Resume while the clock is stopped mid-question', () => {
  const posedState = {
    version: 1, roomId: 'AB3D', sessionId: 'run', revision: 1, phase: 'deliberating',
    slideIndex: 2, slideCount: 17, question: 'q4', votesLocked: false, timerSeconds: 30,
    timerDurationSeconds: 30, timerRunning: true, participants: 4, teamScores: null,
    leaderboard: [], showdown: null, hostConnected: true, reveal: null,
    questionData: {
      id: 'q4', questionInstanceId: 'q4:1', kind: 'binary', statement: 'Test',
      number: 1, total: 15, options: [],
    },
  } as PublicRoomState;
  assert.equal(remotePadModel(posedState).pauseLabel, 'Pause', 'the clock is running, so the control still reads Pause');
  const stoppedMidQuestion = remotePadModel({ ...posedState, timerRunning: false, timerSeconds: 12 });
  assert.equal(stoppedMidQuestion.pauseLabel, 'Resume', 'stopped with time still on the clock reads Resume');
  // `entering` poses the question before its clock has ever run, so the clock sits stopped at its full
  // duration. That is not a pause, and the phone agrees (PhoneSuite.tsx isDiscussionPaused needs the
  // clock below its duration), so the pad keeps reading Pause.
  const enteringBeforeTheClockRuns = remotePadModel({ ...posedState, phase: 'entering', timerRunning: false, timerSeconds: 30 });
  assert.equal(enteringBeforeTheClockRuns.pauseLabel, 'Pause', 'a clock that has not run yet is not paused, so it reads Pause');
  // ADD_TIME raises the time left, never the duration, so a clock paused after the host added time can
  // sit above its own duration. Once deliberation has started, a stopped clock with time left is paused
  // wherever it sits, including at exactly its duration within the first second (the seconds round up).
  assert.equal(remotePadModel({ ...posedState, timerRunning: false, timerSeconds: 35 }).pauseLabel, 'Resume', 'paused after the host added time (35 of 30) still reads Resume');
  assert.equal(remotePadModel({ ...posedState, timerRunning: false, timerSeconds: 30 }).pauseLabel, 'Resume', 'paused within the first second of deliberation still reads Resume');
  assert.equal(remotePadModel({ ...posedState, phase: 'entering', timerRunning: false, timerSeconds: 45 }).pauseLabel, 'Pause', 'time added before the clock ever ran is still not a pause');
  assert.equal(remotePadModel({ ...posedState, phase: 'entering', timerRunning: false, timerSeconds: 12 }).pauseLabel, 'Resume', 'a clock started early with P and stopped again reads Resume');
  const naturallyExpired = remotePadModel({ ...posedState, timerRunning: false, timerSeconds: 0 });
  assert.equal(naturallyExpired.pauseLabel, 'Pause', 'a clock that ran out on its own is not a manual pause, so it stays Pause');
  const noTimer = remotePadModel({ ...posedState, timerDurationSeconds: 0, timerRunning: false, timerSeconds: 0 });
  assert.equal(noTimer.pauseLabel, 'Pause', 'a question with no timer at all is never mid-pause');
  assert.equal(remotePadModel(null).pauseLabel, 'Pause');
});

test('FAC-04: the phone pad exposes the two duel finalists only during the showdown duel stage', () => {
  const base = {
    version: 1, roomId: 'AB3D', sessionId: 'run', revision: 1, phase: 'showdown',
    slideIndex: 2, slideCount: 17, question: 'showdown', votesLocked: true, timerSeconds: 0,
    timerDurationSeconds: 0, timerRunning: false, participants: 4, teamScores: null,
    leaderboard: [], hostConnected: true, reveal: null, questionData: null,
  } as unknown as PublicRoomState;
  const duel = remotePadModel({
    ...base,
    showdown: {
      id: 'sd1', stage: 'duel', question: null, winner: null,
      finalists: [
        { ticket: 'ticket-a', name: 'Alex', score: 300, duelPoints: 1 },
        { ticket: 'ticket-b', name: 'Bailey', score: 250, duelPoints: 0 },
      ],
      predictions: {},
    },
  });
  assert.deepEqual(duel.showdownFinalists, [{ ticket: 'ticket-a', name: 'Alex' }, { ticket: 'ticket-b', name: 'Bailey' }]);

  const lineup = remotePadModel({
    ...base,
    showdown: {
      id: 'sd1', stage: 'lineup', question: null, winner: null,
      finalists: [
        { ticket: 'ticket-a', name: 'Alex', score: 300, duelPoints: 0 },
        { ticket: 'ticket-b', name: 'Bailey', score: 250, duelPoints: 0 },
      ],
      predictions: {},
    },
  });
  assert.equal(lineup.showdownFinalists, null, 'the award buttons are duel-stage only, not lineup or result');
  assert.equal(remotePadModel({ ...base, showdown: null }).showdownFinalists, null);
  assert.equal(remotePadModel(null).showdownFinalists, null);
});

test('RemoteSuite shows fat word-labeled controls and never the unavailable stub', () => {
  const source = fs.readFileSync(new URL('../../src/phone/RemoteSuite.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Remote view unavailable/);
  assert.match(source, /\{pad\.advanceLabel\}/);
  for (const label of ['Back', 'Lock votes', 'Reveal', 'Mute']) {
    assert.match(source, new RegExp(`>${label}<`));
  }
  assert.match(source, /data-remote-command="PAUSE"/);
  // W9: the pause control's own label is dynamic (Pause / Resume), not a fixed string.
  assert.match(source, /\{pad\.pauseLabel\}/);
  assert.match(source, /data-remote-command="AWARD_A"/);
  assert.match(source, /data-remote-command="AWARD_B"/);
  assert.match(source, /data-role="remote-showdown-actions"/);
  assert.match(source, /pad\.showdownFinalists && pad\.showdownFinalists\.length === 2/);
  assert.match(source, /: 'End'/);
  assert.match(source, /data-role="presenter-remote"/);
  assert.match(source, /data-remote-command="ADVANCE"/);
  // F-25 (premium phone pass): coachLine and hostLine no longer render as two stacked elements
  // that could disagree. Both still feed the single `instruction` line.
  assert.match(source, /pad\.coachLine/);
  assert.match(source, /const instruction = paired/);
  assert.match(source, /remote-pad-scroll/);
  // Code review: the instruction line's look follows its source (paired coach vs. hostLine), through
  // data-paired, but data-role stays the fixed "remote-coach" regardless, for test and a11y hooks.
  assert.match(source, /data-role="remote-coach" data-paired=\{paired \? 'true' : 'false'\}/);
  assert.match(source, /remoteHostLine/);
  assert.match(source, /data-remote-command="LOCK"/);
  assert.match(source, /data-remote-command="REVEAL"/);
  // F-25 (premium phone pass): the join chip reads "Join {code}" directly now, on the status
  // row, not a sr-only "Audience join" label on the top bar.
  assert.match(source, /remote-pad__join-chip/);
  assert.match(source, />Join \{joinCode\}</);
  assert.match(source, /Private controller/);
  assert.doesNotMatch(source, /roomCode=\{roomId/);
  const css = presentationBundle();
  assert.match(css, /\.remote-pad__btn \{\s*width:\s*100%;\s*min-height:\s*56px/);
  // F-24 (premium phone pass): the kicker sits in .remote-pad__topbar now, at 16px (a status
  // label beside the connection dot, not a standalone 20px display line), and the join code
  // moved from a big standalone number into a small mono chip beside it. [^}]*, not [\s\S]*, so
  // each assertion is pinned to its own rule body and cannot match past the closing brace into a
  // later rule that happens to share a property value.
  assert.match(css, /\.remote-pad__kicker \{[^}]*font-size:\s*16px/);
  assert.match(css, /\.remote-pad__join-chip \{[^}]*font-family:\s*var\(--kit-font-mono\)/);
  // The clicker's status heading and instruction line: a big status, a gold coach line that goes muted until paired,
  // both stepping up by height bucket (remote-clicker.css).
  const clicker = fs.readFileSync(new URL('../../src/styles/remote-clicker.css', import.meta.url), 'utf8');
  assert.match(clicker, /\.remote-clicker__status \{[^}]*font-size:\s*var\(--phone-remote-status\)/);
  assert.match(clicker, /--phone-remote-status:\s*48px/);
  assert.match(clicker, /\.remote-clicker__line \{[^}]*color:\s*var\(--color-gold\)[^}]*font-size:\s*var\(--phone-remote-line\)/);
  assert.match(clicker, /\.remote-clicker__line\[data-paired="false"\] \{[^}]*color:\s*var\(--color-ink-muted\)/);
  assert.match(clicker, /--phone-remote-line:\s*22px/);
  assert.match(css, /max-height:\s*100dvh/);
  assert.match(css, /\.remote-pad__btn--primary \{[^}]*min-height:\s*64px/);
  assert.match(css, /--color-verdict-true/);
  assert.doesNotMatch(css, /#9ae6a5/);
  assert.match(source, /presenter-cue-map/);
});

test('private presenter QR is labeled so it cannot be confused with the audience join code', () => {
  const html = renderToStaticMarkup(React.createElement(PresenterPairing, {
    remoteUrl: `https://vaxorfiction.com/remote?room=AB3D&key=${key}`,
    paired: false,
    onContinue: () => {},
  }));
  assert.match(html, /Do not mirror this screen yet/i);
  assert.match(html, /presenter controller|presenter remote/i);
  assert.match(html, /data-role="presenter-remote-qr"/);
  assert.match(html, /data-qr-kind="presenter-private"/);
  assert.match(html, />Private</);
  assert.match(html, /Private presenter (phone|controller)/);
  assert.match(html, /Keep it off the projector/);
  assert.doesNotMatch(html, /\/join\?room=/);
});

test('A11Y-04: the pairing connected status announces itself to a screen reader', () => {
  const waiting = renderToStaticMarkup(React.createElement(PresenterPairing, {
    remoteUrl: `https://vaxorfiction.com/remote?room=AB3D&key=${key}`,
    paired: false,
    onContinue: () => {},
  }));
  const connected = renderToStaticMarkup(React.createElement(PresenterPairing, {
    remoteUrl: `https://vaxorfiction.com/remote?room=AB3D&key=${key}`,
    paired: true,
    onContinue: () => {},
  }));
  for (const html of [waiting, connected]) {
    assert.match(
      html,
      /data-role="presenter-pairing-status"[^>]*role="status"[^>]*aria-live="polite"|data-role="presenter-pairing-status"[^>]*aria-live="polite"[^>]*role="status"/,
      'the status paragraph must announce itself, in either attribute order',
    );
  }
  assert.match(waiting, />Waiting for your device\.\.\.</);
  assert.match(connected, />Controller device connected\.</);
});
