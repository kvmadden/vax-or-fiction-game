import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreBoard } from '../../src/components/show/ScoreBoard';
import type { StageLeaderboardLane } from '../../src/engine/leaderboard';

// WARNING-5 (premium-host-fix-3): render proofs for kickerFor (ScoreBoard.tsx:20-24) and the
// empty-board aria-label (ScoreBoard.tsx:58 area), which had no direct test.
function lane(nickname: string, score: number, rank: number): StageLeaderboardLane {
  return { laneKey: nickname, nickname, score, rank, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null };
}

test('closing tone with 3 entries shows "The top 3", never "Through N"', () => {
  const entries = [lane('Player 1', 500, 1), lane('Player 2', 460, 2), lane('Player 3', 420, 3)];
  const html = renderToStaticMarkup(React.createElement(ScoreBoard, { entries, tone: 'closing', through: 8 }));
  assert.match(html, /class="score-board__kicker">The top 3</);
  assert.doesNotMatch(html, /Through 8/);
  assert.match(html, /data-count="3"/);
  assert.match(html, /aria-label="Top 3\. The top 3\."/);
});

test('an empty board shows a hidden "waiting" label and no kicker, at any tone', () => {
  for (const tone of ['stage', 'closing', 'phone'] as const) {
    const html = renderToStaticMarkup(React.createElement(ScoreBoard, { entries: [], tone }));
    assert.doesNotMatch(html, /score-board__kicker/, `${tone}: no kicker on an empty board`);
    assert.match(html, /aria-label="Top 5\. The board is waiting\."/, `${tone}: the hidden label still reads`);
    assert.match(html, /data-role="score-board-empty"/, `${tone}: the visible empty copy renders too`);
    assert.doesNotMatch(html, />The top 0</, `${tone}: N7's "The top 0" regression stays fixed`);
  }
});
