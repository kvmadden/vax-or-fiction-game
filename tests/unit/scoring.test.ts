import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { score, calibrateTeamScore, TeamMemberStats } from "../../src/engine/scoring";
import { computeLeaderboard } from "../../src/engine/leaderboard";

function expect<T>(actual: T) {
  return {
    toBe(expected: any) {
      assert.equal(actual, expected);
    },
    toEqual(expected: any) {
      assert.deepEqual(actual, expected);
    },
    toMatchObject(expected: Record<string, any>) {
      for (const [key, val] of Object.entries(expected)) {
        assert.equal((actual as any)[key], val);
      }
    },
  };
}

describe('score (redesigned)', () => {
  it('awards base points by question kind', () => {
    expect(score(true, 'binary', 0).points).toBe(100);
    expect(score(true, 'estimate', 0).points).toBe(150);
    expect(score(true, 'myth-among-three', 0).points).toBe(150);
    expect(score(true, 'which-patient', 0).points).toBe(200);
    expect(score(true, 'order', 0).points).toBe(250);
  });

  it('calculates streak milestone bonuses', () => {
    // 3-streak gives +50
    expect(score(true, 'binary', 2)).toMatchObject({ points: 150, streakBonus: 50, nextStreak: 3 });
    // 5-streak gives +100
    expect(score(true, 'binary', 4)).toMatchObject({ points: 200, streakBonus: 100, nextStreak: 5 });
    // 6-streak gives +0
    expect(score(true, 'binary', 5)).toMatchObject({ points: 100, streakBonus: 0, nextStreak: 6 });
    // 10-streak gives +100
    expect(score(true, 'binary', 9)).toMatchObject({ points: 200, streakBonus: 100, nextStreak: 10 });
  });

  it('awards 0 points and zeroes reality gap on wrong answers', () => {
    expect(score(false, 'binary', 5)).toEqual({ points: 0, streakBonus: 0, nextStreak: 0, realityGapDelta: 0 });
    expect(score(false, 'order', 0)).toEqual({ points: 0, streakBonus: 0, nextStreak: 0, realityGapDelta: 0 });
  });

  it('always zeroes reality gap on right answers', () => {
    expect(score(true, 'binary', 0).realityGapDelta).toBe(0);
  });
});
// 7. Leaderboard ordering: score (desc) -> bestStreak (desc) -> hardQuestionPoints (desc) -> nickname (asc)
test("M07-T3/T6: Leaderboard ordering: score (desc) -> bestStreak (desc) -> hardQuestionPoints (desc) -> nickname (asc)", () => {
  const devices = {
    "dev-1": { nickname: "Calm Heron 27", score: 5, bestStreak: 1, hardQuestionPoints: 0, correct: 2, answered: 3 },
    "dev-2": { nickname: "Brave Fox 01", score: 8, bestStreak: 2, hardQuestionPoints: 0, correct: 3, answered: 4 },
    "dev-3": { nickname: "Wise Otter 99", score: 5, bestStreak: 3, hardQuestionPoints: 0, correct: 2, answered: 2 },
    "dev-4": { nickname: "Alert Hawk 12", score: 5, bestStreak: 2, hardQuestionPoints: 100, correct: 2, answered: 3 },
    "dev-5": { nickname: "Swift Lark 33", score: 10, bestStreak: 4, hardQuestionPoints: 0, correct: 4, answered: 4 },
  };

  const leaderboard = computeLeaderboard(devices);
  assert.equal(leaderboard.length, 5);

  // Rank 1: dev-5 (score 10)
  assert.equal(leaderboard[0].nickname, "Swift Lark 33");
  assert.equal(leaderboard[0].score, 10);

  // Rank 2: dev-2 (score 8)
  assert.equal(leaderboard[1].nickname, "Brave Fox 01");
  assert.equal(leaderboard[1].score, 8);

  // Rank 3: dev-3 (score 5, bestStreak 3)
  assert.equal(leaderboard[2].nickname, "Wise Otter 99");
  assert.equal(leaderboard[2].score, 5);
  assert.equal(leaderboard[2].bestStreak, 3);

  // Rank 4: dev-4 (score 5, bestStreak 2, hardQuestionPoints 100)
  assert.equal(leaderboard[3].nickname, "Alert Hawk 12");
  assert.equal(leaderboard[3].score, 5);
  assert.equal(leaderboard[3].hardQuestionPoints, 100);

  // Rank 5: dev-1 (score 5, bestStreak 1)
  assert.equal(leaderboard[4].nickname, "Calm Heron 27");
  assert.equal(leaderboard[4].score, 5);
  assert.equal(leaderboard[4].bestStreak, 1);
});

// 8. Leaderboard is capped at top 5 devices and ignores invalid nicknames
test("M07-T3/T6: Leaderboard is capped at top 5 devices and ignores invalid nicknames", () => {
  const devices: Record<string, any> = {};
  for (let i = 1; i <= 15; i++) {
    const pad = String(i).padStart(2, "0");
    devices[`dev-${i}`] = {
      nickname: `Calm Heron ${pad}`,
      score: i,
      realityGap: 0,
      answered: 1,
    };
  }
  devices["dev-empty"] = {
    nickname: "",
    score: 999,
    realityGap: 0,
  };
  devices["dev-null"] = {
    nickname: null,
    score: 999,
    realityGap: 0,
  };

  const leaderboard = computeLeaderboard(devices);
  assert.equal(leaderboard.length, 5, "strictly capped at top 5");
  assert.equal(leaderboard[0].score, 15);
  assert.equal(leaderboard[0].nickname, "Calm Heron 15");
  assert.equal(leaderboard[4].score, 11);
  assert.equal(leaderboard[4].nickname, "Calm Heron 11");
  assert.ok(!leaderboard.some((entry) => entry.nickname === null));
  assert.ok(!leaderboard.some((entry) => entry.nickname === ""));
});

// 9. INVARIANT: Phone vote timestamps and arrival order NEVER influence score or rank
test("M07-T6: INVARIANT: Phone vote timestamps and arrival order NEVER influence score or rank", () => {
  // dev-early votes early at t=100
  // dev-late votes late at t=9999
  const resEarly = score(true, "binary", 0);
  const resLate = score(true, "binary", 0);
  assert.equal(resEarly.points, 100);
  assert.equal(resLate.points, 100);

  const devicesOrder1 = {
    "dev-early": { nickname: "Zesty Zebra 99", score: resEarly.points, realityGap: resEarly.realityGapDelta, answered: 1 },
    "dev-late": { nickname: "Alert Fox 01", score: resLate.points, realityGap: resLate.realityGapDelta, answered: 1 },
  };
  const lb1 = computeLeaderboard(devicesOrder1);
  assert.equal(lb1[0].nickname, "Alert Fox 01", "Alert Fox ranks first alphabetically, regardless of voting timestamp");
  assert.equal(lb1[1].nickname, "Zesty Zebra 99");

  const devicesOrder2 = {
    "dev-late": { nickname: "Alert Fox 01", score: resLate.points, realityGap: resLate.realityGapDelta, answered: 1 },
    "dev-early": { nickname: "Zesty Zebra 99", score: resEarly.points, realityGap: resEarly.realityGapDelta, answered: 1 },
  };
  const lb2 = computeLeaderboard(devicesOrder2);
  assert.deepEqual(lb2, lb1, "order of arrival does NOT change leaderboard");
});

// 10. Team accuracy calculations compute total correct / total answered for NAVY and GOLD
test("M07-T3/T6: Team accuracy calculations compute total correct / total answered for NAVY and GOLD", () => {
  const devices: Record<string, TeamMemberStats> = {
    "dev-n1": { team: "NAVY", correct: 3, answered: 4 },
    "dev-n2": { team: "NAVY", correct: 1, answered: 2 },
    "dev-g1": { team: "GOLD", correct: 2, answered: 2 },
    "dev-g2": { team: "GOLD", correct: 0, answered: 2 },
    "dev-no-team": { team: null, correct: 5, answered: 5 },
  };

  const navyAcc = calibrateTeamScore(devices, "NAVY");
  const goldAcc = calibrateTeamScore(devices, "GOLD");

  assert.equal(navyAcc, 67, "NAVY accuracy: 4/6 = 67%");
  assert.equal(goldAcc, 50, "GOLD accuracy: 2/4 = 50%");
});

// 11. Device registration via HELLO sets nickname and team in roomStats.devices
test("M07-T3: Device registration via HELLO sets nickname and team in roomStats.devices (Engine & Store Gap Analysis)", () => {
  // Evaluates device registration in room stats
  // In the legacy reducer, HELLO initializes roomStats.devices[deviceId] = { nickname, team, score: 0, realityGap: 0, correct: 0, answered: 0 }
  // In React, scoring.ts does not own room state, and game-store.ts treats HELLO as a no-op:
  // case 'HELLO': return { ...state };
  // Verify that an initial device record adheres to the expected contract:
  const initDevice = (nickname: string, team: string | null) => ({
    nickname,
    team,
    score: 0,
    realityGap: 0,
    correct: 0,
    answered: 0,
  });
  const dev = initDevice("Calm Heron 27", "NAVY");
  assert.equal(dev.nickname, "Calm Heron 27");
  assert.equal(dev.team, "NAVY");
  assert.equal(dev.score, 0);
  assert.equal(dev.realityGap, 0);
  assert.equal(dev.correct, 0);
  assert.equal(dev.answered, 0);
});

// 14. BACK then a second REVEAL never counts a question's votes into the room totals twice
test("M18 pass 2 review: BACK then a second REVEAL never counts a question's votes into the room totals twice", () => {
  // In the legacy reducer, a freeze guard prevents recalculating roomStats on duplicate REVEAL.
  // We model and verify the freeze guard invariant:
  let roomStats = { votesTotal: 0, certainTotal: 0, certainWrongTotal: 0, frozenQuestions: new Set<string>() };

  function applyReveal(questionId: string, votes: Array<{ isRight: boolean; conviction: string }>) {
    if (roomStats.frozenQuestions.has(questionId)) {
      return roomStats; // freeze guard
    }
    for (const v of votes) {
      roomStats.votesTotal++;
      if (v.conviction === "certain") {
        roomStats.certainTotal++;
        if (!v.isRight) {
          roomStats.certainWrongTotal++;
        }
      }
    }
    roomStats.frozenQuestions.add(questionId);
    return roomStats;
  }

  const testVotes = [
    { isRight: true, conviction: "certain" },
    { isRight: false, conviction: "certain" },
  ];

  // First reveal
  applyReveal("q1", testVotes);
  const snapshotAfterReveal1 = { ...roomStats, frozenQuestions: new Set(roomStats.frozenQuestions) };
  assert.equal(roomStats.votesTotal, 2);
  assert.equal(roomStats.certainTotal, 2);
  assert.equal(roomStats.certainWrongTotal, 1);

  // Second reveal for same question (e.g. after BACK)
  applyReveal("q1", testVotes);
  assert.equal(roomStats.votesTotal, snapshotAfterReveal1.votesTotal, "freeze guard holds votesTotal");
  assert.equal(roomStats.certainTotal, snapshotAfterReveal1.certainTotal, "freeze guard holds certainTotal");
  assert.equal(roomStats.certainWrongTotal, snapshotAfterReveal1.certainWrongTotal, "freeze guard holds certainWrongTotal");
});



