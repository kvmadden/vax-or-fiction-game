import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Leaderboard, type LeaderboardProps } from '../../src/screens/Leaderboard';
import { RoomContext } from '../../src/presentation/RoomContext';
import { useGameStore, type SeenDeviceState } from '../../src/store/game-store';

type State = ReturnType<typeof useGameStore.getState>;
type Room = React.ContextType<typeof RoomContext>;

function player(nickname: string, score: number, answered = 1): SeenDeviceState {
  return {
    nickname, score, answered, team: null, joinedAt: 1,
    correct: 0, streak: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0,
  };
}

function renderLeaderboard(
  overrides: Partial<Pick<State, 'seenDevices' | 'run' | 'slideIndex' | 'offlineMode'>> = {},
  props: LeaderboardProps = {},
  room?: Room,
): string {
  const previous = useGameStore.getState();
  try {
    useGameStore.setState({
      seenDevices: {},
      run: [{ id: 'title', type: 'title', title: 'Welcome' }] as State['run'],
      slideIndex: 0,
      offlineMode: false,
      ...overrides,
    });
    const screen = React.createElement(Leaderboard, props);
    return renderToStaticMarkup(room
      ? React.createElement(RoomContext.Provider, { value: room }, screen)
      : screen);
  } finally {
    useGameStore.setState(previous, true);
  }
}

test('the screen shows a readable waiting state before anyone has answered', () => {
  const html = renderLeaderboard();
  assert.match(html, /data-role="leaderboard-screen"/);
  assert.match(html, /aria-label="Standings"/);
  assert.match(html, /<span>STANDINGS<\/span>/);
  assert.match(html, /data-role="score-board"[^>]*data-count="0"/);
  assert.match(html, /data-role="score-board-empty"/);
  assert.match(html, /Locked-in guesses land here\./);
  assert.doesNotMatch(html, /data-role="score-board-lane"/);
});

test('the screen displays the five highest-scoring people who actually answered', () => {
  const seenDevices = {
    'private-device-1': player('Ada', 600),
    'private-device-2': player('Ben', 500),
    'private-device-3': player('Cleo', 400),
    'private-device-4': player('Drew', 300),
    'private-device-5': player('Eva', 200),
    'private-device-6': player('Finn', 100),
    'private-device-7': player('Never answered', 999, 0),
  };
  const html = renderLeaderboard({ seenDevices });
  const names = [...html.matchAll(/class="score-board__name">([^<]+)<\/span>/g)]
    .map((match) => match[1]);
  assert.deepEqual(names, ['Ada', 'Ben', 'Cleo', 'Drew', 'Eva']);
  assert.match(html, /data-role="score-board"[^>]*data-count="5"/);
  assert.match(html, /aria-label="1\. Ada, 600 pts"/);
  assert.doesNotMatch(html, /Finn|Never answered|private-device-/);
});

test('a question slide names the standings cutoff and preserves room and screen chrome', () => {
  const run = [{
    id: 'q4', type: 'question', kind: 'binary', answer: true,
    statement: 'Synthetic test question', displayNumber: 4,
  }] as unknown as State['run'];
  const room: Room = { roomId: 'ABCD', connectionStatus: 'connected', error: null };
  const html = renderLeaderboard(
    { run, slideIndex: 0, seenDevices: { one: player('Ada', 42) } },
    { format: 'portrait', className: 'custom-stage' },
    room,
  );
  assert.match(html, /class="leaderboard-screen screen leaderboard custom-stage"/);
  assert.match(html, /data-format="portrait"/);
  assert.match(html, /data-through="4"/);
  assert.match(html, /aria-label="Standings through question 4"/);
  assert.match(html, /class="score-board__kicker">Through 4<\/p>/);
  assert.match(html, /class="join-card__code">ABCD<\/strong>/);
});

test('non-question slides do not announce an invented question cutoff', () => {
  const html = renderLeaderboard({ seenDevices: { one: player('Ada', 42) } });
  assert.match(html, /aria-label="Standings"/);
  assert.match(html, /data-through="final"/);
  assert.match(html, /class="score-board__kicker">The top 1<\/p>/);
  assert.doesNotMatch(html, /Standings through question|Through [0-9]/);
});
