import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneReveal } from '../../src/phone/PhoneReveal';
import { PhoneClosing } from '../../src/phone/PhoneClosing';
import type { AttendeeState, PublicQuestion, PublicReveal, PublicRoomState } from '../../src/network/protocol';

const sampleQuestion: PublicQuestion = {
  id: 'q-sample',
  questionInstanceId: 'inst-1',
  kind: 'binary',
  statement: 'Vaccination prevents disease transmission.',
  options: [
    { token: 'true', label: 'TRUE', text: 'True' },
    { token: 'false', label: 'FALSE', text: 'False' },
  ],
};

const sampleReveal: PublicReveal = {
  answerLabel: 'TRUE',
  answerToken: 'true',
  explanation: 'Vaccines trigger an immune response.',
  takeaway: 'Vaccines save lives.',
  citations: [],
};

test('PhoneReveal: displays Score and Rank summary bar when rank is valid', () => {
  const attendee: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'TestUser',
    team: null,
    vote: null,
    result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 100 },
    score: 350,
    correct: 3,
    answered: 3,
    accuracy: 100,
    bestStreak: 3,
    rank: 2,
    totalParticipants: 8,
    commitments: [],
  };

  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal: sampleReveal,
    question: sampleQuestion,
    attendee,
    solo: false,
  }));

  assert.match(html, /data-role="phone-reveal-score-bar"/);
  assert.match(html, /Score: 350 pts/);
  assert.match(html, /Rank: #2 of 8/);
});

test('PhoneReveal: omits Score and Rank summary bar when solo is true even if rank is valid', () => {
  const attendee: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'TestUser',
    team: null,
    vote: null,
    result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 100 },
    score: 350,
    correct: 3,
    answered: 3,
    accuracy: 100,
    bestStreak: 3,
    rank: 2,
    totalParticipants: 8,
    commitments: [],
  };

  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal: sampleReveal,
    question: sampleQuestion,
    attendee,
    solo: true,
  }));

  assert.doesNotMatch(html, /data-role="phone-reveal-score-bar"/);
});

test('PhoneReveal: omits Score and Rank summary bar when rank is null or totalParticipants is 0', () => {
  const attendee: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'TestUser',
    team: null,
    vote: null,
    result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 100 },
    score: 100,
    correct: 1,
    answered: 1,
    accuracy: 100,
    bestStreak: 1,
    rank: null,
    totalParticipants: 0,
    commitments: [],
  };

  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal: sampleReveal,
    question: sampleQuestion,
    attendee,
    solo: false,
  }));

  assert.doesNotMatch(html, /data-role="phone-reveal-score-bar"/);
});

test('PhoneReveal: renders +{points} pts and streak bonus badge for live room participants', () => {
  const attendeeWithStreak: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'StreakMaster',
    team: null,
    vote: null,
    result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 150, streakBonus: 50 },
    score: 450,
    correct: 3,
    answered: 3,
    accuracy: 100,
    bestStreak: 3,
    rank: 1,
    totalParticipants: 5,
    commitments: [],
  };

  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal: sampleReveal,
    question: sampleQuestion,
    attendee: attendeeWithStreak,
    solo: false,
  }));

  assert.match(html, />\+150 pts<\/span>/);
  assert.match(html, /data-role="streak-bonus-pill"/);
  assert.match(html, />\+50 Streak Bonus!<\/span>/);
});

test('PhoneReveal: omits streak bonus badge when streakBonus is 0 or undefined', () => {
  const attendeeNoStreak: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'Player',
    team: null,
    vote: null,
    result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 100, streakBonus: 0 },
    score: 100,
    correct: 1,
    answered: 1,
    accuracy: 100,
    bestStreak: 1,
    rank: 3,
    totalParticipants: 5,
    commitments: [],
  };

  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'result',
    reveal: sampleReveal,
    question: sampleQuestion,
    attendee: attendeeNoStreak,
    solo: false,
  }));

  assert.match(html, />\+100 pts<\/span>/);
  assert.doesNotMatch(html, /data-role="streak-bonus-pill"/);
});

test('PhoneClosing: a room close stands the champion on the podium above your own place and sentence', () => {
  const attendee: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'SecondPlace',
    team: null,
    vote: null,
    result: null,
    score: 1200,
    correct: 8,
    answered: 10,
    accuracy: 80,
    bestStreak: 4,
    rank: 2,
    totalParticipants: 5,
    commitments: [],
  };

  const room: PublicRoomState = {
    roomId: 'TEST',
    phase: 'closing',
    reveal: {
      answerLabel: 'The room got 80% right.',
      answerToken: 'closing',
      explanation: 'Key learnings',
      takeaway: 'Summary point 1',
      citations: [],
    },
    leaderboard: [
      { name: 'ChampionAlex', score: 2450, rank: 1, team: null },
      { name: 'SecondPlace', score: 1200, rank: 2, team: null },
    ],
  } as PublicRoomState;

  const html = renderToStaticMarkup(React.createElement(PhoneClosing, {
    attendee,
    room,
    solo: false,
  }));

  // The podium carries the champion, so the room close drops the banner that repeated it.
  assert.doesNotMatch(html, /data-role="phone-closing-champion-banner"/);
  assert.match(html, /data-place="1"[^>]*>[\s\S]*?ChampionAlex[\s\S]*?2450/);
  assert.match(html, /data-place="2" data-you="true"/);
  assert.match(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), /You placed #2 of 5 \(8 of 10 right · Best streak 4\)/);
});

test('PhoneClosing: displays celebratory 1st Place text with Trophy when attendee rank is 1', () => {
  const attendee: AttendeeState = {
    sessionId: 's1',
    registered: true,
    nickname: 'Winner',
    team: null,
    vote: null,
    result: null,
    score: 2500,
    correct: 10,
    answered: 10,
    accuracy: 100,
    bestStreak: 10,
    rank: 1,
    totalParticipants: 6,
    commitments: [],
  };

  const room: PublicRoomState = {
    roomId: 'TEST',
    phase: 'closing',
    reveal: null,
    leaderboard: [
      { name: 'Winner', score: 2500, rank: 1, team: null },
    ],
  } as PublicRoomState;

  const html = renderToStaticMarkup(React.createElement(PhoneClosing, {
    attendee,
    room,
    solo: false,
  }));

  assert.match(html, /data-role="phone-closing-personal"/);
  assert.match(html, /You won 1st Place!/);
  assert.doesNotMatch(html, /You placed #1 of 6/);
});
