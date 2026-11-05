import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import {
  archiveRoomKey,
  buildArchiveRecap,
  buildArchiveSummary,
} from '../../src/network/game-archive';
import { useGameStore } from '../../src/store/game-store';

describe('game archive', () => {
  it('keeps classic six-character rooms unchanged', () => {
    assert.equal(archiveRoomKey('fe8ez8'), 'fe8ez8');
    assert.equal(archiveRoomKey('FE8EZ8'), 'fe8ez8');
  });

  it('maps four-character show codes onto the archive alphabet', () => {
    const key = archiveRoomKey('AB12');
    assert.match(key, /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    assert.equal(archiveRoomKey('AB12'), key);
    assert.notEqual(archiveRoomKey('AB12'), archiveRoomKey('CD34'));
  });

  it('builds standings, outcomes, and a recap payload for a closed room', () => {
    const summary = buildArchiveSummary({
      roomId: 'W7K2',
      deckId: 'vax-or-fiction',
      deckTitle: 'Vax or Fiction?',
      session: { startedAt: '2026-09-24T12:00:00.000Z', questions: [{ id: 'q1' }] },
      roomStats: {
        accuracy: 75,
        mythsBusted: 1,
        bestStreak: 3,
        votesTotal: 4,
        questions: {
          q1: { trueCount: 3, falseCount: 1, accuracyPct: 75 },
        },
        // TEAM-SCORES: the real store keys this NAVY/GOLD, uppercase (summarizeTeams,
        // game-store.ts:635-654), never lowercase. This fixture used to say navy/gold, which
        // happened to match the same casing the archive read at the time, so the round trip below
        // passed for the wrong reason and could not catch the mismatch a live room hits.
        teams: { NAVY: { score: 10 }, GOLD: { score: 8 } },
      },
      seenDevices: {
        a: { nickname: 'Ada', answered: 1, score: 12, bestStreak: 2, hardQuestionPoints: 1, realityGap: 0, team: 'NAVY' },
        b: { nickname: 'Bea', answered: 1, score: 8, bestStreak: 1, hardQuestionPoints: 0, realityGap: 1, team: 'GOLD' },
      },
      run: [
        {
          id: 'q1',
          kind: 'binary',
          statement: 'Prevnar protects only against pneumonia.',
          answer: false,
          reveal: 'More than lungs.',
        } as never,
      ],
      venue: 'room',
      teamsEnabled: true,
    }, () => new Date('2026-09-24T13:00:00.000Z'));

    assert.equal(summary.room, 'W7K2');
    assert.match(summary.archiveRoom, /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    assert.equal(summary.accuracyPct, 75);
    assert.equal(summary.standings[0]?.nickname, 'Ada');
    assert.equal(summary.standings[0]?.rank, 1);
    assert.equal(summary.outcomes[0]?.answerText, 'FALSE');
    assert.deepEqual(summary.teams, { navy: 10, gold: 8 });

    const recap = buildArchiveRecap({
      roomId: 'W7K2',
      roomStats: {
        accuracy: 75,
        votesTotal: 4,
        bestStreak: 3,
        questions: { q1: { trueCount: 3, falseCount: 1, accuracyPct: 75 } },
      },
      run: [
        {
          id: 'q1',
          kind: 'binary',
          statement: 'Prevnar protects only against pneumonia.',
          answer: false,
          reveal: 'More than lungs.',
          takeaway: 'Lungs. Bloodstream. Brain.',
        } as never,
      ],
      venue: 'room',
    }, summary);

    assert.equal(recap.deckId, 'vax-or-fiction');
    assert.equal(recap.standings[0]?.nickname, 'Ada');
    assert.equal(recap.answers.q1, 'FALSE');
  });

  it('archives the recap\'s takeaways and split without their display emphasis', () => {
    const snapshot = {
      roomId: 'W7K2',
      roomStats: {
        accuracy: 50,
        votesTotal: 4,
        bestStreak: 1,
        questions: { q1: { trueCount: 2, falseCount: 2, accuracyPct: 50, correctPct: 50, choices: { true: 2, false: 2 } } },
      },
      run: [
        {
          id: 'q1',
          kind: 'binary',
          statement: 'Prevnar protects only against pneumonia.',
          answer: false,
          reveal: 'More than lungs.',
          takeaway: 'Lungs. Bloodstream. Brain.',
          emphasis: ['only'],
          revealEmphasis: ['More than lungs'],
          takeawayEmphasis: ['Bloodstream'],
        } as never,
      ],
      venue: 'room' as const,
    };
    const summary = buildArchiveSummary({ ...snapshot, seenDevices: {}, leaderboardEnabled: false } as never, () => new Date('2026-09-29T13:00:00.000Z'));
    const recap = buildArchiveRecap(snapshot as never, summary);
    assert.ok(recap.takeaways.length > 0, 'fixture assumption: the recap has a takeaway to archive');
    for (const takeaway of recap.takeaways) assert.deepEqual(Object.keys(takeaway).sort(), ['correctPct', 'number', 'questionId', 'text']);
    if (recap.split) assert.deepEqual(Object.keys(recap.split).sort(), ['correctPct', 'headline', 'number', 'questionId', 'votes']);
    assert.doesNotMatch(JSON.stringify(recap), /[eE]mphasis/, 'no emphasis key reaches the stored row');
  });

  it('archives a real store state\'s team score under its own uppercase key (TEAM-SCORES)', () => {
    // TEAM-SCORES: not a hand-built roomStats this time either. One GOLD device answers the deck's
    // first (binary, 100-point) question correctly, a real REVEAL dispatch computes roomStats.teams
    // for real (summarizeTeams, game-store.ts:635-654), and the archive must carry that 100 through,
    // not read the wrong-case key and silently archive 0.
    useGameStore.setState(useGameStore.getInitialState(), true);
    const question = vaxOrFictionDeck.questions[0]!;
    useGameStore.setState({
      sessionId: 'run-team-scores', offlineMode: false, interactionMode: 'polling', teamsEnabled: true,
      run: [question] as never, slideIndex: 0, phase: 'locked', votesLocked: true,
      pollVotes: { [question.id]: { true: 0, false: 1 } },
      pollVoters: { [question.id]: { gilda: { choice: 'false', conviction: 'certain' } } },
      seenDevices: {
        gilda: { nickname: 'Gilda', team: 'GOLD', joinedAt: 1, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
      },
      settledQuestionInstances: {}, settledResults: {},
    } as never);
    useGameStore.getState().dispatch({ type: 'REVEAL' } as never);
    const state = useGameStore.getState();

    // Sanity: the real store really did key this uppercase and really did score 100.
    const rawTeams = state.roomStats.teams as unknown as Record<string, { score: number }>;
    assert.deepEqual(Object.keys(rawTeams).sort(), ['GOLD', 'NAVY'], 'the real store keys roomStats.teams uppercase');
    assert.equal(rawTeams.GOLD?.score, 100, 'one correct binary answer scores 100 (KIND_BASE_POINTS.binary)');

    const summary = buildArchiveSummary({
      roomId: 'TEAM', roomStats: state.roomStats as never, seenDevices: state.seenDevices, run: state.run,
      venue: 'room', teamsEnabled: true,
    });
    assert.deepEqual(summary.teams, { navy: 0, gold: 100 }, 'GOLD 100 must archive as 100, not 0');
  });

  it('archives each settled question accuracy from the real store producer (VOF-V1)', () => {
    const question = {
      id: 'synthetic-archive-accuracy',
      type: 'question',
      kind: 'binary',
      statement: 'Synthetic archive accuracy contract',
      answer: true,
      takeaway: 'Synthetic takeaway',
    } as never;

    for (const { label, choices, accuracyPct } of [
      { label: 'correct', choices: ['true'], accuracyPct: 100 },
      { label: 'incorrect', choices: ['false'], accuracyPct: 0 },
      { label: 'mixed', choices: ['true', 'false'], accuracyPct: 50 },
      { label: 'zero-vote', choices: [], accuracyPct: 0 },
    ]) {
      const initial = useGameStore.getInitialState();
      useGameStore.setState({
        ...initial,
        sessionId: `archive-${label}`,
        run: [question],
        slideIndex: 0,
        phase: 'deliberating',
        interactionMode: 'polling',
        offlineMode: false,
        votesLocked: false,
        seenDevices: {},
        pollVotes: {},
        pollVoters: {},
        settledQuestionInstances: {},
        settledResults: {},
      } as never, true);

      for (const [index, choice] of choices.entries()) {
        const deviceId = `synthetic-${label}-${index}`;
        useGameStore.getState().dispatch({ type: 'HELLO', deviceId, nickname: `Synthetic ${index}` } as never);
        useGameStore.getState().dispatch({ type: 'VOTE', questionId: question.id, deviceId, choice } as never);
      }
      useGameStore.getState().dispatch({ type: 'REVEAL' } as never);

      const settled = useGameStore.getState();
      assert.equal(settled.roomStats.questions[question.id]?.correctPct, accuracyPct, `${label} producer fixture`);
      const summary = buildArchiveSummary({
        roomId: 'SYNTHETIC',
        roomStats: settled.roomStats,
        seenDevices: settled.seenDevices,
        run: settled.run,
      } as never);
      assert.equal(summary.outcomes[0]?.accuracyPct, accuracyPct, `${label} archived accuracy`);
      assert.equal(summary.outcomes[0]?.votes, choices.length, `${label} archived votes`);
    }
  });
});
