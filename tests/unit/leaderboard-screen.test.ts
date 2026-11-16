import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Leaderboard } from '../../src/screens/Leaderboard';
import { ScoreBoard } from '../../src/components/show/ScoreBoard';
import { computeStageLanes, questionDisplayNumber } from '../../src/engine/leaderboard';
import { RoomContext } from '../../src/presentation/RoomContext';

function renderScreen(): string {
  return renderToStaticMarkup(React.createElement(Leaderboard));
}

test('the projected screen starts with a readable empty standings board', () => {
  // React's server renderer uses Zustand's initial snapshot. This tests the
  // actual default screen; populated states are covered through ScoreBoard.
  const html = renderScreen();
  assert.match(html, /data-role="leaderboard-screen"/);
  assert.match(html, /aria-label="Standings"/);
  assert.match(html, /data-format="widescreen"/);
  assert.match(html, /<span>STANDINGS<\/span>/);
  assert.match(html, /data-role="score-board"[^>]*data-count="0"/);
  assert.match(html, /data-role="score-board-empty"/);
  assert.match(html, /Locked-in guesses land here\./);
  assert.doesNotMatch(html, /data-role="score-board-lane"/);
});

test('the screen honors its format and class and shows the presenter room code', () => {
  const room = { roomId: 'ABCD', connectionStatus: 'connected' as const, error: null };
  const html = renderToStaticMarkup(React.createElement(
    RoomContext.Provider,
    { value: room },
    React.createElement(Leaderboard, { format: 'portrait', className: 'custom-stage' }),
  ));
  assert.match(html, /class="leaderboard-screen screen leaderboard custom-stage"/);
  assert.match(html, /data-format="portrait"/);
  assert.match(html, /aria-label="Standings"/);
  assert.match(html, /class="join-card__code">ABCD<\/strong>/);
  assert.match(html, /class="show-footer__room">ROOM ABCD<\/span>/);
});

test('the stage standings render the five highest-scoring answered players without device IDs', () => {
  const player = (nickname: string, score: number, answered = 1) => ({
    nickname, score, answered, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null,
  });
  const lanes = computeStageLanes({
    'private-device-1': player('Ada', 600),
    'private-device-2': player('Ben', 500),
    'private-device-3': player('Cleo', 400),
    'private-device-4': player('Drew', 300),
    'private-device-5': player('Eva', 200),
    'private-device-6': player('Finn', 100),
    'private-device-7': player('Never answered', 999, 0),
  });
  const html = renderToStaticMarkup(React.createElement(ScoreBoard, { entries: lanes, tone: 'stage' }));
  const names = [...html.matchAll(/class="score-board__name">([^<]+)<\/span>/g)]
    .map((match) => match[1]);
  assert.deepEqual(names, ['Ada', 'Ben', 'Cleo', 'Drew', 'Eva']);
  assert.match(html, /data-role="score-board"[^>]*data-count="5"/);
  assert.match(html, /aria-label="1\. Ada, 600 pts"/);
  assert.doesNotMatch(html, /Finn|Never answered|private-device-/);
});

test('the board announces a real question cutoff, never an invented one', () => {
  const slide = { id: 'q4', type: 'question', kind: 'binary', answer: true, displayNumber: 4 };
  const through = questionDisplayNumber(slide);
  assert.equal(through, 4);
  assert.equal(questionDisplayNumber({ id: 'title', type: 'title' }), null);
  const entries = computeStageLanes({
    one: { nickname: 'Ada', score: 42, answered: 1, bestStreak: 0, hardQuestionPoints: 0 },
  });
  const atQuestion = renderToStaticMarkup(React.createElement(ScoreBoard, { entries, tone: 'stage', through }));
  assert.match(atQuestion, /data-through="4"/);
  assert.match(atQuestion, /class="score-board__kicker">Through 4<\/p>/);
  const noQuestion = renderToStaticMarkup(React.createElement(ScoreBoard, {
    entries, tone: 'stage', through: questionDisplayNumber({ id: 'closing', type: 'closing' }),
  }));
  assert.match(noQuestion, /data-through="final"/);
  assert.match(noQuestion, /class="score-board__kicker">The top 1<\/p>/);
  assert.doesNotMatch(noQuestion, /Through [0-9]/);
});
