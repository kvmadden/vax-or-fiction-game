import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneJoin } from '../../src/phone/PhoneJoin';
import { PhoneScreens, type PhoneLink } from '../../src/phone/PhoneSuite';
import { PhoneVote } from '../../src/phone/PhoneVote';
import { PhoneReveal } from '../../src/phone/PhoneReveal';
import {
  JOIN_CONNECTING,
  JOIN_NAME_ERROR,
  joinNextStatus,
  HOST_DOWN_STAY,
  LOCKED_SAT_OUT,
  LOCKED_WAIT,
  RECONNECT_IN_FIVE,
  REVEAL_MISSED,
  REVEAL_PENDING,
  ROOM_OFFLINE,
} from '../../src/phone/phone-live-copy';
import { PresenterPairing } from '../../src/screens/PresenterPairing';
import type { AttendeeState, PublicQuestion, PublicRoomState } from '../../src/network/protocol';
import { presentationBundle } from './css-declarations';

const css = (name: string) => name === 'presentation.css' ? presentationBundle() : fs.readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8');

const question: PublicQuestion = {
  id: 'q4',
  questionInstanceId: 'run:0:q4',
  kind: 'binary',
  statement: 'Synthetic live question.',
  number: 1,
  total: 15,
  options: [
    { token: 'true', label: 'True', text: 'True' },
    { token: 'false', label: 'False', text: 'False' },
  ],
};

const reveal = {
  answerLabel: 'TRUE',
  answerToken: 'true',
  explanation: 'Because the evidence says so.',
  takeaway: 'Talk it through, then look it up.',
  citations: [{ label: 'CDC', url: 'https://www.cdc.gov' }],
};

function room(over: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    version: 1,
    roomId: 'AB3D',
    sessionId: 'run',
    revision: 1,
    phase: 'lobby',
    slideIndex: 0,
    slideCount: 17,
    question: null,
    votesLocked: false,
    timerSeconds: 30,
    timerDurationSeconds: 30,
    timerRunning: true,
    participants: 30,
    teamScores: null,
    leaderboard: [],
    showdown: null,
    hostConnected: true,
    reveal: null,
    questionData: null,
    ...over,
  };
}

function attendee(over: Partial<AttendeeState> = {}): AttendeeState {
  return {
    sessionId: 'run',
    registered: true,
    nickname: 'Maria',
    team: null,
    vote: null,
    result: null,
    score: 0,
    correct: 0,
    answered: 0,
    accuracy: null,
    bestStreak: 0,
    rank: null,
    totalParticipants: 30,
    commitments: [],
    ...over,
  };
}

function link(over: Partial<PhoneLink> = {}): PhoneLink {
  return {
    roomState: null,
    attendeeState: null,
    connectionStatus: 'connected',
    error: null,
    pending: false,
    votePending: false,
    join() {},
    sendVote() {},
    sendReaction() {},
    sendPrediction() {},
    retry() {},
    ...over,
  };
}

const screens = (over: Partial<PhoneLink> = {}, roomId = 'AB3D') =>
  renderToStaticMarkup(React.createElement(PhoneScreens, {
    roomId,
    deviceId: 'device-live',
    link: link(over),
  }));

test('join copy tells a dropped room it will retry in about 5 seconds', () => {
  assert.equal(joinNextStatus({ hostDown: false, reconnecting: true, loading: true }), RECONNECT_IN_FIVE);
  assert.equal(joinNextStatus({ hostDown: true, reconnecting: false, loading: false }), HOST_DOWN_STAY);
  assert.equal(joinNextStatus({ hostDown: false, reconnecting: false, loading: true }), JOIN_CONNECTING);
  assert.match(RECONNECT_IN_FIVE, /about 5 seconds/);
  assert.doesNotMatch(JOIN_NAME_ERROR, /please enter/i);
});

test('/join?room= uses fat tap targets, a clear error, and reconnect wording', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneJoin, {
    initialRoomCode: 'AB3D',
    connectionStatus: 'reconnecting',
    isLoading: true,
    errorMessage: ROOM_OFFLINE,
  }));
  assert.match(html, /data-role="phone-join"/);
  assert.match(html, /data-role="join-error-banner"/);
  assert.match(html, /Couldn(?:'|&#x27;)t reach the room/);
  assert.match(html, /data-reconnect="true"/);
  assert.match(html, /about 5 seconds/);
  assert.match(html, /data-role="join-submit-btn"/);
  assert.match(html, /data-role="nickname-input"[^>]*aria-invalid="true"/);
  assert.match(html, /What(?:'|&#x27;)s your best prediction\?/);
  const sheet = css('presentation.css');
  assert.match(sheet, /\.phone-name-card__row input,\n\s*\.phone-name-card__row button \{[^}]*min-height:\s*56px/s);
  assert.match(sheet, /\.phone-code-card button \{[^}]*min-height:\s*64px/s);
  assert.match(css('phone-critique.css'), /\.phone-live-shell \.phone-join-continue,[\s\S]*min-height:\s*56px/);
});

test('A11Y-12: only the dynamic join-next status is a live region, not the heading or the 2 static steps under it', () => {
  // F-18 (premium phone pass): the heading text is fixed ("What happens next") now, so the
  // live region moved off it onto a dedicated visible status line, shown only while the status
  // is not "Connected" (the app bar's own dot already covers the quiet, connected case).
  const html = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: 'AB3D', isLoading: true }));
  assert.match(html, /data-role="phone-join-next"/);
  assert.doesNotMatch(html, /data-role="phone-join-next"[^>]*aria-live/, 'the section itself must carry no aria-live, or the 2 static steps re-announce on every status change');
  assert.doesNotMatch(html, /<h2[^>]*aria-live/, 'the heading text no longer changes, so it should not claim to be a live region');
  assert.match(html, /<p class="phone-join-next-status" data-role="join-next-status" aria-live="polite"/, 'the dynamic connection status carries the live region instead');
  assert.match(html, /Connecting to the room/, 'the status renders as visible text, not color alone');

  // Fresh-review finding: this paragraph now stays mounted through every status, Connected
  // included, and only its text toggles. An aria-live region only announces a text change inside
  // an element already in the DOM, not the element's own arrival, so unmounting and remounting it
  // on every status change had stopped it announcing anything at all.
  const connected = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: 'AB3D' }));
  assert.match(connected, /<p class="phone-join-next-status" data-role="join-next-status" aria-live="polite"[^>]*><\/p>/, 'a Connected status keeps the live region mounted, empty, so screen readers stay listening on it');
});

test('join → vote → lock → reveal stays readable for a 30-phone room', () => {
  const joining = screens({
    connectionStatus: 'reconnecting',
    pending: true,
    roomState: room(),
  });
  assert.match(joining, /data-role="phone-join"/);
  assert.match(joining, /about 5 seconds/);

  const waiting = screens({
    roomState: room({ phase: 'lobby' }),
    attendeeState: attendee(),
  });
  // The seat greets the player by name, under the wait's own kicker.
  assert.match(waiting, /data-role="phone-waiting"[\s\S]*>You(?:'|&#x27;)re in<[\s\S]*>Maria</);

  const voting = screens({
    pending: true,
    roomState: room({
      phase: 'deliberating',
      question: 'q4',
      questionData: question,
      timerRunning: true,
    }),
    attendeeState: attendee(),
  });
  assert.match(voting, /data-role="phone-vote-container"/);
  assert.match(voting, /True or false\. Tap your answer\./);

  const sending = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionType: 'binary',
    questionData: question,
    pendingChoice: 'true',
    isSubmitting: true,
    onSubmit() {},
  }));
  assert.match(sending, /data-choice="true"[^>]*data-selected="true"/);
  assert.match(sending, /data-state="sending"[^>]*>Sending…/);
  assert.match(css('presentation.css'), /\.phone-vote-choice\[data-selected="true"\]::after \{[^}]*content:\s*"Picked"/s);
  assert.match(css('presentation.css'), /\.phone-vote-choice\[data-selected="true"\]:disabled \{[^}]*opacity:\s*1/s);

  const inHand = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionType: 'binary',
    questionData: question,
    initialVote: 'true',
    onSubmit() {},
  }));
  assert.doesNotMatch(inHand, /data-role="confidence-selector"/);
  assert.doesNotMatch(inHand, /phone-conviction-row/);
  assert.match(inHand, /data-action="review-answer-options"[^>]*>Change answer/);
  assert.doesNotMatch(inHand, /Now pick how sure you are/);

  const locked = screens({
    roomState: room({
      phase: 'locked',
      question: 'q4',
      questionData: question,
      votesLocked: true,
      timerRunning: false,
      timerSeconds: 0,
    }),
    attendeeState: attendee({
      vote: { questionInstanceId: question.questionInstanceId, choice: 'true', conviction: 'fairly-sure' },
    }),
  });
  // F-05, the room's answer dock: the locked state says it once, in the dock's status line, and the answer itself
  // carries the weight, marked in place.
  assert.match(locked, /data-role="phone-dock"[^>]*data-state="locked"/);
  assert.match(locked, /data-role="vote-confirmation-badge"[^>]*data-state="locked"[^>]*>Locked in\. Watch the screen\.</);
  assert.equal(locked.split('Watch the screen.').length - 1, 1, 'the locked message shows once');
  assert.match(locked, /data-choice="true"[^>]*data-marked="true"/);
  assert.doesNotMatch(locked, /data-role="confidence-selector"/);
  assert.doesNotMatch(locked, /Now pick how sure you are/);
  // F-05, the solo dock: the badge stays silent and the gold line below it says it once.
  const soloLocked = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionType: 'binary',
    questionData: question,
    initialVote: 'true',
    votesLocked: true,
    solo: true,
    onSubmit() {},
  }));
  assert.doesNotMatch(soloLocked, /data-role="vote-confirmation-badge"[^>]*data-state="locked"[^>]*>[^<]+</);
  assert.ok(soloLocked.includes(LOCKED_WAIT));
  assert.match(soloLocked, /data-role="phone-choice-receipt"[^>]*data-locked="true"/);
  assert.doesNotMatch(soloLocked, /data-role="confidence-selector"/);

  const satOut = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionType: 'binary',
    questionData: question,
    votesLocked: true,
    onSubmit() {},
  }));
  assert.ok(satOut.includes(LOCKED_SAT_OUT));

  const right = screens({
    roomState: room({
      phase: 'revealed',
      question: 'q4',
      questionData: question,
      votesLocked: true,
      reveal,
    }),
    attendeeState: attendee({
      vote: { questionInstanceId: question.questionInstanceId, choice: 'true', conviction: 'fairly-sure' },
      result: { questionInstanceId: question.questionInstanceId, choice: 'true', isCorrect: true, points: 2 },
    }),
  });
  assert.match(right, /data-role="phone-reveal-outcome"[^>]*>That(?:'|&#x27;)s right/);
  assert.match(right, /You said True/);
  assert.doesNotMatch(right, /Incorrect|INCORRECT/);

  const missed = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal,
    question,
    attendee: attendee({
      result: { questionInstanceId: question.questionInstanceId, choice: 'false', isCorrect: false, points: 0 },
    }),
  }));
  assert.ok(missed.includes(REVEAL_MISSED));
  assert.match(missed, /data-outcome="missed"/);

  const explaining = screens({
    roomState: room({
      phase: 'explaining',
      question: 'q4',
      questionData: question,
      votesLocked: true,
      reveal,
    }),
    attendeeState: attendee({
      result: { questionInstanceId: question.questionInstanceId, choice: 'true', isCorrect: true, points: 2 },
    }),
  });
  assert.match(explaining, />EXPLANATION</);
  assert.match(explaining, /Talk it through, then look it up\./);
  assert.doesNotMatch(explaining, /text-sm/);
  assert.match(css('presentation.css'), /\.phone-reveal-outcome \{[^}]*font-size:\s*24px/s);
  assert.match(css('phone-critique.css'), /\.phone-reveal-surface \.phone-takeaway-card p:first-of-type \{[^}]*font-size:\s*20px/s);
});

test('a message on its way that is not a vote never holds the answer dock, so a first tap on the next question counts', () => {
  // The 2026-10-05 live walk: the relay refused a phone's reaction on a reveal, so its ACK never came, the phone kept it pending
  // for 8 s, and every slab of the next question's dock was blocked while it looked open. A first tap there did nothing.
  const open = room({ phase: 'deliberating', question: 'q4', questionData: question });
  const slabs = (html: string) => html.match(/<button[^>]*data-choice=[^>]*>/g) ?? [];
  const reactionOnItsWay = screens({ pending: true, votePending: false, roomState: open, attendeeState: attendee() });
  assert.equal(slabs(reactionOnItsWay).length, 2);
  assert.ok(slabs(reactionOnItsWay).every((slab) => !slab.includes('aria-disabled')), 'a reaction on its way leaves every slab open to a tap');
  assert.match(reactionOnItsWay, /data-role="phone-dock"[^>]*data-state="open"/);
  // A vote on its way still holds the dock, as it always has, so one tap cannot send an answer twice.
  const voteOnItsWay = screens({ pending: true, votePending: true, roomState: open, attendeeState: attendee() });
  assert.ok(slabs(voteOnItsWay).length === 2 && slabs(voteOnItsWay).every((slab) => slab.includes('aria-disabled="true"')), 'a vote on its way holds the dock');
});

test('private presenter QR is gold-labeled and never the audience join mark', () => {
  const html = renderToStaticMarkup(React.createElement(PresenterPairing, {
    remoteUrl: 'https://vaxorfiction.com/remote?room=AB3D&key=REMOTEKEYREMOTEKEYREMOTE',
    paired: false,
    onContinue() {},
  }));
  assert.match(html, /data-qr-kind="presenter-private"/);
  assert.match(html, /data-role="presenter-pairing-private"/);
  assert.match(html, />Private</);
  assert.match(html, /Not the audience join code/);
  assert.match(html, /Private controller for you/);
  assert.doesNotMatch(html, /\/join\?room=/);
  const preflight = fs.readFileSync(new URL('../../src/screens/Preflight.tsx', import.meta.url), 'utf8');
  assert.match(preflight, /data-qr-kind="audience"/);
  assert.match(preflight, /data-role="audience-join-qr"/);
  const sheet = css('presentation.css');
  assert.match(sheet, /\.presenter-pairing__qr \{[^}]*border:\s*3px solid var\(--color-gold\)/s);
  assert.match(sheet, /\.presenter-pairing__private \{[^}]*background-color:\s*var\(--color-gold\)/s);
  const audienceQr = sheet.match(/\.setup-room-qr \{[^}]+\}/s)?.[0] ?? '';
  assert.doesNotMatch(audienceQr, /color-gold/);
});

test('pending reveal copy stays plain while the personal result catches up', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal,
    question,
    attendee: attendee({
      vote: { questionInstanceId: question.questionInstanceId, choice: 'true', conviction: 'fairly-sure' },
    }),
  }));
  assert.ok(html.includes(REVEAL_PENDING));
  assert.doesNotMatch(html, /Updating your result/);
});

test('code join keeps ---- placeholder and paints VaxOrFiction.com', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneJoin, {}));
  assert.match(html, /placeholder="----"/);
  assert.match(html, /data-role="room-code-input"/);
  assert.doesNotMatch(html, /class="phone-join-host"/);
  assert.doesNotMatch(html, /class="phone-code-card__host"/);
  const sheet = css('presentation.css');
  assert.match(sheet, /\.phone-code-card button \{[^}]*min-height:\s*64px/s);
});
