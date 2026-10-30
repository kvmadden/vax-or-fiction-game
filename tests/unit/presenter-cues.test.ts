import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { remotePadModel } from '../../src/network/presenter-remote';
import type { PublicRoomState } from '../../src/network/protocol';
import {
  PRESENTER_CUE_LEAK_NEEDLES,
  PRESENTER_CUES,
  presenterCueFor,
  remoteCueCard,
} from '../../src/phone/presenter-cue-map';
import { RemotePad } from '../../src/phone/RemoteSuite';
import { presentationBundle } from './css-declarations';

const CURATED15_IDS = ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16', 'q10', 'q8', 'q2', 'q25', 'q18', 'q31', 'q15'];

const posedState = {
  version: 1, roomId: 'AB3D', sessionId: 'run', revision: 1, phase: 'deliberating',
  slideIndex: 2, slideCount: 17, question: 'q4', votesLocked: false, timerSeconds: 30,
  timerDurationSeconds: 30, timerRunning: true, participants: 4, teamScores: null,
  leaderboard: [], showdown: null, hostConnected: true, reveal: null,
  questionData: {
    id: 'q4', questionInstanceId: 'q4:1', kind: 'binary', statement: 'HPV causes more throat cancers in men than cervical cancers in women.',
    number: 1, total: 15, options: [],
  },
} as PublicRoomState;

test('Curated 15 cue map covers every live id with a short topic, key, and tip', () => {
  assert.deepEqual(Object.keys(PRESENTER_CUES), CURATED15_IDS);
  for (const id of CURATED15_IDS) {
    const cue = presenterCueFor(id);
    assert.ok(cue, `${id} has a presenter cue`);
    assert.ok(cue!.topic.length > 0 && cue!.topic.length <= 48, `${id} topic stays one short line`);
    assert.ok(cue!.key.length > 0, `${id} has a key`);
    assert.ok(cue!.tip.length > 0, `${id} has a tip`);
  }
  for (const dropped of ['q12', 'q20', 'q29']) {
    assert.equal(presenterCueFor(dropped), null, `${dropped} is not on today’s Curated 15`);
  }
});

test('the cue card shows the key while voting is still open', () => {
  const pad = remotePadModel(posedState);
  const card = remoteCueCard(posedState, pad.onQuestion);
  assert.equal(pad.onQuestion, true);
  assert.match(pad.statusLine, /Q1 of 15/);
  assert.match(pad.statusLine, /Voting open/);
  assert.equal(card.cue?.key, 'TRUE');
  assert.equal(card.topic, 'HPV cancers in men');
  const html = renderToStaticMarkup(React.createElement(RemotePad, {
    pad, topic: card.topic, cue: card.cue, joinCode: 'AB3D', hostLine: 'Driving room AB3D', paired: true, hostDown: false, disabled: false, endArmed: false,
    participants: 4, timerSeconds: 30,
    onAdvance() {}, onBack() {}, onLock() {}, onReveal() {}, onPause() {}, onMute() {}, onEnd() {}, onAwardA() {}, onAwardB() {},
  }));
  assert.match(html, /data-role="presenter-cue"/);
  assert.match(html, /data-role="presenter-cue-key"[^>]*>[\s\S]*TRUE/);
  assert.match(html, /data-has-cue="true"/);
  // F-25 (premium phone pass): the join chip reads "Join AB3D" directly now, not a sr-only
  // "Audience join" label.
  assert.match(html, /data-role="remote-audience-join"[^>]*>Join AB3D/);
  assert.doesNotMatch(html, /This phone drives the laptop/);
});

test('lobby, title, and instructions stay tiny status with no fake keys', () => {
  const titleState = { ...posedState, phase: 'entering', question: 'title', questionData: null, votesLocked: true } as PublicRoomState;
  const titlePad = remotePadModel(titleState);
  const titleCard = remoteCueCard(titleState, titlePad.onQuestion);
  assert.equal(titlePad.statusLine, 'Title');
  assert.equal(titlePad.onQuestion, false);
  assert.equal(titleCard.cue, null);
  assert.equal(titleCard.topic, null);

  const html = renderToStaticMarkup(React.createElement(RemotePad, {
    pad: titlePad, topic: titleCard.topic, cue: titleCard.cue, paired: true, disabled: false, endArmed: false, participants: 4, timerSeconds: 0,
    onAdvance() {}, onBack() {}, onLock() {}, onReveal() {}, onMute() {}, onEnd() {},
  }));
  assert.doesNotMatch(html, /data-role="presenter-cue"/);
  assert.doesNotMatch(html, />Key</);
  assert.match(html, /This device drives the show/);
});

test('a live question without a cue map entry never invents a key from the public statement', () => {
  const other = {
    ...posedState,
    question: 'q99',
    questionData: { ...posedState.questionData!, id: 'q99', statement: 'A public stem the audience already sees.' },
  } as PublicRoomState;
  const pad = remotePadModel(other);
  const card = remoteCueCard(other, pad.onQuestion);
  assert.equal(card.cue, null);
  assert.equal(card.topic, 'A public stem the audience already sees.');
  const html = renderToStaticMarkup(React.createElement(RemotePad, {
    pad, topic: card.topic, cue: card.cue, paired: true, disabled: false, endArmed: false, participants: 4, timerSeconds: 30,
    onAdvance() {}, onBack() {}, onLock() {}, onReveal() {}, onMute() {}, onEnd() {},
  }));
  assert.match(html, /data-role="presenter-cue-topic"/);
  assert.doesNotMatch(html, /data-role="presenter-cue-key"/);
});

test('audience phone sources never import the presenter cue map', () => {
  const audience = [
    'src/phone/PhoneSuite.tsx',
    'src/phone/PhoneVote.tsx',
    'src/phone/PhoneReveal.tsx',
    'src/phone/PhoneJoin.tsx',
    'src/phone/PhoneLayout.tsx',
    'src/phone/PhoneClosing.tsx',
    'src/network/projection.ts',
    'src/network/protocol.ts',
    'src/network/game-projection.ts',
  ];
  const root = process.cwd();
  for (const relative of audience) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /presenter-cue-map/, `${relative} must not import the remote cue map`);
    for (const needle of PRESENTER_CUE_LEAK_NEEDLES) {
      assert.equal(source.includes(needle), false, `${relative} must not contain ${needle}`);
    }
  }
  const phoneSuite = fs.readFileSync(path.join(root, 'src/phone/PhoneSuite.tsx'), 'utf8');
  assert.doesNotMatch(phoneSuite, /from ['"]\.\/RemoteSuite['"]/, 'PhoneSuite must not re-export RemoteSuite');
  const remote = fs.readFileSync(path.join(root, 'src/phone/RemoteSuite.tsx'), 'utf8');
  assert.match(remote, /from ['"]\.\/presenter-cue-map['"]/);
});

test('the remote pad pins its controls and only the middle above them gives way', () => {
  const css = presentationBundle();
  const clicker = fs.readFileSync(path.join(process.cwd(), 'src/styles/remote-clicker.css'), 'utf8');
  assert.match(css, /\.remote-shell\.phone-shell \.phone-app-content\[data-role="phone-content"\] \{[\s\S]*overflow:\s*hidden !important/);
  assert.match(clicker, /\.remote-clicker \{[^}]*overflow:\s*hidden/);
  // The pad never scrolls: the middle (status, instruction, cue) may shrink and clip, never the controls.
  assert.match(clicker, /\.remote-clicker__middle \{[^}]*flex:\s*0 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden/);
  // F-24 (premium phone pass): the join code rides the status row as a mono chip.
  assert.match(css, /\.remote-pad__join-chip/);
  assert.match(clicker, /\.remote-clicker__key-text,\n\.phone-live-shell\.remote-shell \.remote-clicker__tip-text \{[^}]*overflow:\s*hidden/);
  assert.match(clicker, /\.remote-clicker__key-text \{[^}]*-webkit-line-clamp:\s*var\(--phone-remote-key-lines\)/);
  assert.match(clicker, /\.remote-clicker__tip-text \{[^}]*-webkit-line-clamp:\s*3/);
  assert.match(clicker, /\.remote-clicker__controls \{[^}]*flex:\s*1 0 auto/);
  // The controls live outside the clipping middle, so Next cannot be trapped by overflow:hidden.
  assert.doesNotMatch(clicker, /\.remote-clicker__controls \{[^}]*overflow-y:\s*(auto|scroll)/);
});
