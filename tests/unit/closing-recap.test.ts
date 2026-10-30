import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Closing, type ClosingBeatId } from '../../src/screens/Closing';
import type { RoomStatsState } from '../../src/data/types';
import { buildClosingRecap } from '../../src/engine/closing-recap';
import { useGameStore } from '../../src/store/game-store';

// Closing reads the run through its store hook, and server rendering returns the store's initial state, so every
// case here follows the default Curated 8 run (CURATED8_QUESTION_IDS in game-store.ts, q35 first and q20 second).

const emptyRoom: RoomStatsState = {
  questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0,
  swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0,
};
const renderRecap = (roomStats: RoomStatsState, activeBeat: ClosingBeatId = 'accuracy') =>
  renderToStaticMarkup(React.createElement(Closing, { roomStats, activeBeat }));
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, role: string) => (html.match(new RegExp(`data-role="${role}"`, 'g')) ?? []).length;

test('zero recorded answers produces an unscored recap, even when stale aggregate values exist', () => {
  const html = renderRecap({ ...emptyRoom, accuracy: 75, bestStreak: 3, mythsBusted: 2 });
  assert.match(text(html), /Nobody locked in a guess/);
  assert.match(text(html), /No phone votes to score/);
  assert.doesNotMatch(html, /data-role="reality-accuracy"/);
  assert.doesNotMatch(text(html), /\d+\s*%|myths busted|in a row/i);
  // The takeaways still close the show: the run's authored lines, in order, with no split card to score.
  assert.equal(count(html, 'closing-takeaway'), 3, 'three takeaways from the run');
  assert.equal(count(html, 'closing-split'), 0, 'no votes, no split');
  assert.match(text(html), /Assess severity rather than treating every symptom as a stop sign\./);
});

test('recorded answers retain the actual room accuracy and response count', () => {
  const html = renderRecap({ ...emptyRoom, votesTotal: 4, accuracy: 75, bestStreak: 2, mythsBusted: 1 });
  assert.match(html, /data-role="reality-accuracy"[^>]*>75%/);
  assert.match(text(html), /4 (?:recorded )?answers/i);
  assert.match(html, /data-role="closing-restart"/);
  assert.match(html, /data-role="closing-complete"/);
  assert.doesNotMatch(text(html), /myths? busted|in a row/i, 'no hard-wired stat tile (mythsBusted is never incremented)');
  assert.equal(count(html, 'closing-stat-tile'), 0);
  assert.doesNotMatch(html, /data-role="closing-show-takeaways"/, 'no split means the takeaways stay on this page');
  assert.ok(count(html, 'closing-takeaway') > 0, 'scored recap without a split still shows takeaways');
});

test('the question the room missed most leads the closing, with its accuracy and its takeaway first', () => {
  const html = renderRecap({
    ...emptyRoom, votesTotal: 8, accuracy: 62, bestStreak: 2,
    questions: {
      q35: { kind: 'binary', choices: { true: 1, false: 3 }, trueCount: 1, falseCount: 3, correctPct: 25, majorityWrong: true },
      q20: { kind: 'estimate', choices: { c: 4 }, trueCount: 0, falseCount: 0, correctPct: 100, majorityWrong: false },
    },
  });
  assert.equal(count(html, 'closing-split'), 1);
  assert.match(html, /data-role="closing-split-pct"[^>]*>25%/);
  assert.match(text(html), /The one that split us most A mild cold, even with a low fever, does not by itself require delaying an inactivated flu shot\./);
  assert.match(html, /data-role="closing-show-takeaways"/, 'the scored overview has a visible route to the complete list');
  assert.equal(count(html, 'closing-takeaway'), 0, 'the scored overview leaves the complete list for its dedicated local page');
  const recap = buildClosingRecap(useGameStore.getState().run, {
    ...emptyRoom, votesTotal: 8, accuracy: 62,
    questions: {
      q35: { kind: 'binary', choices: { true: 1, false: 3 }, trueCount: 1, falseCount: 3, correctPct: 25, majorityWrong: true },
      q20: { kind: 'estimate', choices: { c: 4 }, trueCount: 0, falseCount: 0, correctPct: 100, majorityWrong: false },
    },
  });
  assert.deepEqual(recap.takeaways.map((takeaway) => takeaway.questionId), ['q35', 'q20'], 'only revealed questions, most-missed first');
  assert.match(text(html), /62% of our answers were right · 8 answers/);
});

test('every legacy closing beat renders the concise recap without invented clinical findings', () => {
  for (const beat of ['accuracy', 'myths', 'streak', 'team-gap', 'adoption', 'all'] as ClosingBeatId[]) {
    const output = text(renderRecap(emptyRoom, beat));
    assert.match(output, /Nobody locked in a guess/, beat);
    assert.match(output, /No phone votes to score/, beat);
    assert.doesNotMatch(output, /reactogenicity|efficacy|clinical consensus|adoption|practice readiness|35%|contraindications|clinical pearl|full dashboard/i, beat);
  }
});

test('stage closing displays 1st place room champion at the top with trophy icon and points on recap', () => {
  const html = renderToStaticMarkup(React.createElement(Closing, {
    roomStats: { ...emptyRoom, votesTotal: 6, accuracy: 80, bestStreak: 3 },
    leaderboard: [
      { nickname: 'Sarah T.', score: 450, realityGap: 0, hardQuestionPoints: 200, bestStreak: 3, team: null },
      { nickname: 'Marcus', score: 350, realityGap: 0, hardQuestionPoints: 150, bestStreak: 2, team: null },
      { nickname: 'Elena', score: 200, realityGap: 0, hardQuestionPoints: 100, bestStreak: 1, team: null },
    ],
  }));

  assert.match(html, /data-role="closing-champion"/);
  assert.match(text(html), /1st Place/);
  assert.match(text(html), /Sarah T\./);
  assert.match(text(html), /450 pts/);
  assert.match(html, /lucide-trophy/);
  assert.match(html, /data-role="reality-accuracy"[^>]*>80%/);
  assert.match(text(html), /80% of our answers were right/);
});

test('stage closing displays 1st place at the top of the podium leaderboard on scores slide', () => {
  const html = renderToStaticMarkup(React.createElement(Closing, {
    initialPage: 'scores',
    roomStats: { ...emptyRoom, votesTotal: 6, accuracy: 80, bestStreak: 3 },
    leaderboard: [
      { nickname: 'Sarah T.', score: 450, realityGap: 0, hardQuestionPoints: 200, bestStreak: 3, team: null },
      { nickname: 'Marcus', score: 350, realityGap: 0, hardQuestionPoints: 150, bestStreak: 2, team: null },
      { nickname: 'Elena', score: 200, realityGap: 0, hardQuestionPoints: 100, bestStreak: 1, team: null },
    ],
  }));

  assert.match(html, /data-role="closing-scores"/);
  // N7 (premium-host pass): the scores slide used to carry its own champion banner directly
  // above the podium, repeating the board's own rank-1 lane (same name, same score, same gold
  // highlight) in a card whose content ended well short of its own right edge. Removed. Rank 1
  // reads from the board itself now, not a duplicate banner.
  assert.doesNotMatch(html, /data-role="closing-champion"/);
  assert.match(text(html), /Sarah T\./);
  assert.match(text(html), /450 pts/);
  assert.match(html, /data-role="closing-podium"/);
  assert.match(html, /data-role="score-board"/);
  assert.match(html, /data-rank="1"[^>]*aria-label="1\. Sarah T\., 450 pts"/);
});

test('stage closing extracts champion from seenDevices in store when no prop passed', () => {
  useGameStore.setState({
    seenDevices: {
      dev1: { nickname: 'PharmD Alex', score: 500, answered: 3, correct: 3, streak: 3, bestStreak: 3, hardQuestionPoints: 200, realityGap: 0, joinedAt: 1 },
      dev2: { nickname: 'Nurse Jordan', score: 350, answered: 3, correct: 2, streak: 1, bestStreak: 2, hardQuestionPoints: 100, realityGap: 0, joinedAt: 2 },
    },
  });
  const html = renderToStaticMarkup(React.createElement(Closing, {
    roomStats: { ...emptyRoom, votesTotal: 6, accuracy: 83, bestStreak: 3 },
  }));
  assert.match(html, /data-role="closing-champion"/);
  assert.match(text(html), /PharmD Alex/);
  assert.match(text(html), /500 pts/);
});

test('stage closing hides champion banner on recap when scores are disabled', () => {
  const html = renderToStaticMarkup(React.createElement(Closing, {
    leaderboardEnabled: false,
    roomStats: { ...emptyRoom, votesTotal: 6, accuracy: 80, bestStreak: 3 },
    leaderboard: [
      { nickname: 'Sarah T.', score: 450, realityGap: 0, hardQuestionPoints: 200, bestStreak: 3, team: null },
      { nickname: 'Marcus', score: 350, realityGap: 0, hardQuestionPoints: 150, bestStreak: 2, team: null },
    ],
  }));
  assert.doesNotMatch(html, /data-role="closing-champion"/);
  assert.doesNotMatch(text(html), /Sarah T\./);
});

test('stage closing podium on scores slide renders at most top 3 entries', () => {
  const html = renderToStaticMarkup(React.createElement(Closing, {
    initialPage: 'scores',
    roomStats: { ...emptyRoom, votesTotal: 10, accuracy: 80, bestStreak: 3 },
    leaderboard: [
      { nickname: 'P1', score: 500, realityGap: 0, hardQuestionPoints: 200, bestStreak: 3, team: null },
      { nickname: 'P2', score: 400, realityGap: 0, hardQuestionPoints: 150, bestStreak: 2, team: null },
      { nickname: 'P3', score: 300, realityGap: 0, hardQuestionPoints: 100, bestStreak: 1, team: null },
      { nickname: 'P4', score: 200, realityGap: 0, hardQuestionPoints: 50, bestStreak: 1, team: null },
      { nickname: 'P5', score: 100, realityGap: 0, hardQuestionPoints: 0, bestStreak: 1, team: null },
    ],
  }));
  assert.match(html, /data-role="closing-podium"/);
  assert.match(html, /<div class="closing-source-header"><span>STANDINGS<\/span><\/div>/);
  // Verify only top 3 lanes are rendered
  const laneMatches = (html.match(/data-role="score-board-lane"/g) ?? []).length;
  assert.equal(laneMatches, 3, 'Top 3 podium must render exactly 3 lanes');
  assert.match(text(html), /P1/);
  assert.match(text(html), /P2/);
  assert.match(text(html), /P3/);
  assert.doesNotMatch(text(html), /P4/);
  assert.doesNotMatch(text(html), /P5/);
});


