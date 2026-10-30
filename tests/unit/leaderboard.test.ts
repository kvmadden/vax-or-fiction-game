import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLeaderboard, computeStageLanes, rankLeaderboard } from '../../src/engine/leaderboard';

function expect<T>(actual: T) {
  return {
    toBe(expected: any) {
      assert.equal(actual, expected);
    },
    toEqual(expected: any) {
      assert.deepEqual(actual, expected);
    },
  };
}

describe('leaderboard tiebreakers', () => {
  it('sorts by score DESC, then bestStreak DESC, then hardQuestionPoints DESC', () => {
    const devices = {
      d1: { nickname: 'A', score: 100, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'B', score: 100, bestStreak: 3, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
      d3: { nickname: 'C', score: 100, bestStreak: 3, hardQuestionPoints: 200, realityGap: 0, team: null, answered: 1 },
      d4: { nickname: 'D', score: 500, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    expect(board[0].nickname).toBe('D');
    expect(board[1].nickname).toBe('C');
    expect(board[2].nickname).toBe('B');
    expect(board[3].nickname).toBe('A');
  });

  it('ignores realityGap when resolving ties', () => {
    const devices = {
      d1: { nickname: 'LowerStreakZeroGap', score: 100, bestStreak: 1, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'HigherStreakHighGap', score: 100, bestStreak: 4, hardQuestionPoints: 0, realityGap: 5, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    expect(board[0].nickname).toBe('HigherStreakHighGap');
    expect(board[1].nickname).toBe('LowerStreakZeroGap');
  });

  it('includes hardQuestionPoints on LeaderboardEntry', () => {
    const devices = {
      d1: { nickname: 'Alex', score: 300, bestStreak: 2, hardQuestionPoints: 200, realityGap: 0, team: 'NAVY', answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    expect(board[0].hardQuestionPoints).toBe(200);
    expect(board[0].score).toBe(300);
    expect(board[0].nickname).toBe('Alex');
    expect(board[0].team).toBe('NAVY');
  });

  it('falls back to nickname ASC when score, bestStreak, and hardQuestionPoints are equal', () => {
    const devices = {
      d1: { nickname: 'Yusuf', score: 100, bestStreak: 2, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'Adam', score: 100, bestStreak: 2, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    expect(board[0].nickname).toBe('Adam');
    expect(board[1].nickname).toBe('Yusuf');
  });

  // B3 (VOF-12) and W3: the shared entry is what the wire projection, the showdown finalists and the
  // Closing archive build from, so it carries no device identity (the phone's persistent id) and no
  // joinedAt (nothing reads it since the wire entry became name, score, rank and team).
  it('the shared entry carries only display and tiebreak fields, never a device id or joinedAt (B3, W3)', () => {
    const devices = {
      'c0ffee00-0000-4000-8000-000000000001': { nickname: 'Ada', score: 100, bestStreak: 1, hardQuestionPoints: 0, realityGap: 0, team: 'NAVY', answered: 1, joinedAt: 1000 },
    };
    const board = computeLeaderboard(devices as any);
    assert.equal(board.length, 1, 'test setup: the device reaches the board');
    assert.deepEqual(Object.keys(board[0]!).sort(), ['bestStreak', 'hardQuestionPoints', 'nickname', 'realityGap', 'score', 'team']);
    assert.deepEqual(Object.keys(rankLeaderboard(board)[0]!).sort(), ['bestStreak', 'hardQuestionPoints', 'nickname', 'rank', 'realityGap', 'score', 'team']);
  });

  // W3: NIT-7's rows no longer need joinedAt. The phone keys each row by rank and place
  // (leaderboardRowKey, pinned by phone-leaderboard-keys.test.ts), and the stage keys each lane by
  // computeStageLanes' laneKey (the MOT-VQA-09 test below).

  it('attaches competition ranks with rankLeaderboard where true ties share ranks', () => {
    const devices = {
      d1: { nickname: 'Alice', score: 200, bestStreak: 3, hardQuestionPoints: 100, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'Bob', score: 200, bestStreak: 3, hardQuestionPoints: 100, realityGap: 0, team: null, answered: 1 },
      d3: { nickname: 'Charlie', score: 100, bestStreak: 1, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    const ranked = rankLeaderboard(board);
    // Alice and Bob are true ties (same score, bestStreak, hardQuestionPoints)
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it('differentiates competition ranks when score is equal but bestStreak differs', () => {
    const devices = {
      d1: { nickname: 'HighStreak', score: 200, bestStreak: 5, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'LowStreak', score: 200, bestStreak: 2, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    const ranked = rankLeaderboard(board);
    expect(ranked[0].nickname).toBe('HighStreak');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].nickname).toBe('LowStreak');
    expect(ranked[1].rank).toBe(2);
  });

  it('differentiates competition ranks when score and bestStreak are equal but hardQuestionPoints differ', () => {
    const devices = {
      d1: { nickname: 'HighHard', score: 200, bestStreak: 3, hardQuestionPoints: 200, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'LowHard', score: 200, bestStreak: 3, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    const ranked = rankLeaderboard(board);
    expect(ranked[0].nickname).toBe('HighHard');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].nickname).toBe('LowHard');
    expect(ranked[1].rank).toBe(2);
  });

  it('shares competition rank even if realityGap differs when score, bestStreak, and hardQuestionPoints match', () => {
    const devices = {
      d1: { nickname: 'PlayerA', score: 200, bestStreak: 3, hardQuestionPoints: 100, realityGap: 0, team: null, answered: 1 },
      d2: { nickname: 'PlayerB', score: 200, bestStreak: 3, hardQuestionPoints: 100, realityGap: 4, team: null, answered: 1 },
    };

    const board = computeLeaderboard(devices as any);
    const ranked = rankLeaderboard(board);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
  });

  it('drops a named joiner who never answered and keeps a wrong answer at zero', () => {
    const devices = {
      joined: { nickname: 'Pat', score: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 0 },
      missed: { nickname: 'Ada', score: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };
    const board = computeLeaderboard(devices as any);
    expect(board.map((entry) => entry.nickname)).toEqual(['Ada']);
  });

  // MOT-VQA-09 (approved as flair, 2026-09-25): ScoreBoard used to key rows by
  // `${rank}-${nickname}`, so a reorder always looked like a fresh row to React (nothing to FLIP-
  // animate) and two players sharing a nickname could collide on the same key. The lane key is the
  // devices record's own key, stable across any score/rank change and unique by construction. B3: it
  // lives only on the stage board's lanes, never on the shared entry (the shape test above).
  it('keys each stage lane by its devices record, stable across a rank change and unrelated to nickname', () => {
    const devices = {
      'device-1': { nickname: 'Sam', score: 100, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
      'device-2': { nickname: 'Sam', score: 50, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0, team: null, answered: 1 },
    };
    const lanes = computeStageLanes(devices as any);
    expect(lanes.map((lane) => lane.laneKey).sort()).toEqual(['device-1', 'device-2']);
    // Two devices sharing a nickname still resolve to two distinct keys (the bug a nickname-only key would hit).
    expect(new Set(lanes.map((lane) => lane.laneKey)).size).toBe(2);
    const before = lanes.find((lane) => lane.nickname === 'Sam' && lane.score === 100)!;
    const lanesAfterScoreChange = computeStageLanes({
      ...devices,
      'device-2': { ...devices['device-2'], score: 200 },
    } as any);
    const after = lanesAfterScoreChange.find((lane) => lane.laneKey === before.laneKey)!;
    // device-1 dropped from rank 1 to rank 2 when device-2 overtook it, but its lane key did not move.
    expect(after.laneKey).toBe(before.laneKey);
    expect(before.rank).toBe(1);
    expect(after.rank).toBe(2);
    // The lanes rank exactly like the shared board they are built from.
    expect(lanes.map(({ laneKey: _laneKey, ...entry }) => entry)).toEqual(rankLeaderboard(computeLeaderboard(devices as any)));
  });
});
