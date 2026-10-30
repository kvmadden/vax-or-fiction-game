import type { Question, SlideEntry, TeamSide } from '../data/types';
import { buildClosingRecap } from '../engine/closing-recap';
import { computeLeaderboard, rankLeaderboard } from '../engine/leaderboard';
import { isQuestionSlide, questionKind } from '../engine/kinds';
import { acceptsAttendeeInput } from '../engine/attendee-input';
import type { GameState, SeenDeviceState } from '../store/game-store';
import { getQuestionInstanceId } from '../store/game-store';
import type { AttendeeState, PublicReveal, PublicRoomState, PublicShowdown } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { isWireLineEmphasis, wirePhrases } from './emphasis-bound';
import {
  projectPublicQuestion,
  projectPublicReveal,
  type OrderScramble,
  type PublicQuestionProjection,
} from './projection';

function asQuestion(value: SlideEntry | undefined): Question | null {
  return isQuestionSlide(value) ? value as unknown as Question : null;
}

/**
 * 8.6 blocker fix: projectPublicQuestion draws a fresh random scramble whenever it is not handed
 * one, which is the right permissive default for a direct caller (a preview, a test) but is
 * exactly wrong on the live wire, where the host calls this module twice for the same occurrence
 * -- once to publish the room state, again to decode each incoming vote -- and two silent fresh
 * draws never agree, so every vote decodes to null. game-store.ts now arms a scramble on every
 * reducer path that can leave a REGULAR order question live (rearmQuestion, CONFIRM_RESTART_RUN,
 * and mergePersistedGameState's withArmedOrderScramble on reload), so an armed, length-matched
 * scramble should always be here for the regular (non-showdown) path. If it is not, that is a
 * real bug in one of those arming paths, not a case to paper over: fail loudly in development,
 * and in production decline to project the order question at all (questionProjection stays null
 * for that slide) rather than hand out a scramble that will not agree with the next call.
 *
 * This gate applies only to projectGameState's regular projection, not to publicShowdown's
 * recap question. No phone screen renders or submits against showdown.question at all (confirmed
 * by reading PhoneShowdown in src/phone/PhoneSuite.tsx: it is finalist-pick UI only), so a
 * showdown recap's order steps carry no live encode/decode risk, and plenty of legitimate test
 * and preview code injects a showdown object directly without arming one. enterShowdown still
 * arms a real showdown's scrambles for whenever that changes.
 *
 * It also only applies while a vote against this exact occurrence could still land: once it is
 * settled, or votes are locked, or the phase itself has moved past entering/deliberating, no
 * phone can submit a new vote for it, so an unarmed occurrence there is at worst a cosmetic
 * inconsistency between two publishes, never the live encode/decode risk this exists to catch.
 * Plenty of real, pre-existing test and preview code jumps straight to a revealed/explaining/
 * locked snapshot (skipping the arming reducers entirely) to test rendering, not voting.
 */
function voteAgainstOccurrenceCouldStillLand(state: GameState, occurrence: string): boolean {
  if (state.settledQuestionInstances?.[occurrence]) return false;
  return acceptsAttendeeInput(state) && !state.votesLocked && ['entering', 'deliberating'].includes(state.phase);
}

function armedOrderScramble(state: GameState, occurrence: string, question: Question): OrderScramble | null {
  const scramble = state.orderScrambles?.[occurrence];
  const stepCount = (question.steps ?? []).length;
  if (scramble && scramble.tokens.length === stepCount && scramble.order.length === stepCount) return scramble;
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      `[ACCOUNTS-SPEC 8.6] order question "${question.id}" (occurrence ${occurrence}) has no armed scramble while a vote against it could still land. `
      + 'game-store.ts must arm one before this state reaches projectGameState/publicShowdown -- '
      + 'never draw one here, or a phone\'s encode and a later decode will disagree.',
    );
  }
  return null;
}

/**
 * projectPublicQuestion for a question at a known occurrence, except an order-kind question with
 * no armed scramble, while a vote against it could still land, in production projects as null
 * entirely (armedOrderScramble's dev-throw covers development) rather than silently drawing one
 * that will not survive the next call.
 */
function questionOrNullIfUnarmed(
  state: GameState,
  occurrence: string,
  question: Question,
  position: { number: number; total: number },
): PublicQuestionProjection | null {
  if (questionKind(question) !== 'order' || !voteAgainstOccurrenceCouldStillLand(state, occurrence)) {
    return projectPublicQuestion(question, occurrence, position.number, position.total, state.orderScrambles?.[occurrence]);
  }
  const scramble = armedOrderScramble(state, occurrence, question);
  return scramble ? projectPublicQuestion(question, occurrence, position.number, position.total, scramble) : null;
}

function questionPosition(run: SlideEntry[], slideIndex: number): { number: number; total: number } {
  const questions = run.filter((slide) => asQuestion(slide));
  const current = run[slideIndex];
  return { number: Math.max(current ? questions.indexOf(current) + 1 : 1, 1), total: questions.length };
}

function numericTeamScores(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, number> = {};
  for (const [team, raw] of Object.entries(value)) {
    const score = typeof raw === 'number' ? raw : raw && typeof raw === 'object' && 'score' in raw ? Number(raw.score) : Number.NaN;
    if (Number.isFinite(score)) result[team] = score;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function attendeeRank(devices: Record<string, SeenDeviceState>, deviceId: string): number | null {
  const attendee = devices[deviceId];
  if (!attendee || attendee.answered < 1 || !attendee.nickname?.trim()) return null;
  const count = Object.keys(devices).length;
  const ranked = rankLeaderboard(computeLeaderboard(devices, count));
  const entry = ranked.find((c) =>
    c.nickname === attendee.nickname &&
    c.score === attendee.score &&
    c.bestStreak === attendee.bestStreak &&
    c.hardQuestionPoints === attendee.hardQuestionPoints
  ) ?? ranked.find((c) => c.nickname === attendee.nickname);
  return entry ? entry.rank : null;
}

function publicShowdown(state: GameState): { showdown: PublicShowdown | null; questionProjection: PublicQuestionProjection | null } {
  const showdown = state.showdown;
  if (!showdown) return { showdown: null, questionProjection: null };
  const selectedId = showdown.questionIds[showdown.questionIndex] ?? null;
  const selected = selectedId ? state.run.map(asQuestion).find((question) => question?.id === selectedId) ?? null : null;
  const position = selected ? questionPosition(state.run, state.run.findIndex((slide) => slide.id === selected.id)) : { number: 1, total: showdown.questionIds.length };
  // Permissive on purpose (see this file's doc comment on armedOrderScramble): no phone screen
  // ever renders or submits against a showdown recap's order steps, so an unarmed occurrence here
  // (common in tests and previews that inject state.showdown directly) is not a live-wire risk.
  let questionProjection: PublicQuestionProjection | null = null;
  if (selected) {
    const occurrence = `${showdown.id}:${showdown.questionIndex}:${selected.id}`;
    questionProjection = projectPublicQuestion(selected, occurrence, position.number, position.total, state.orderScrambles?.[occurrence]);
  }
  return {
    showdown: {
      id: showdown.id,
      stage: showdown.stage,
      finalists: showdown.finalists.map(({ ticket, name, score, duelPoints }) => ({ ticket, name, score, duelPoints })),
      predictions: { ...showdown.predictionCounts },
      question: questionProjection?.question ?? null,
      winner: showdown.winner,
    },
    questionProjection,
  };
}

/**
 * The closing beat travels in the public `reveal` slot, which every validator (client guards, local relay, the
 * production relay's SQL) already admits at phase `closing`: the room line as answerLabel, the takeaway heading as
 * explanation, the takeaway lines newline-joined, and each line's deciding words as takeawayLineEmphasis, one list per
 * line in the same order. Aggregate only, and nothing per participant (VOF-12, VOF-21).
 */
export const CLOSING_REVEAL_TOKEN = 'closing';

function closingReveal(state: GameState): PublicReveal | null {
  if (state.phase !== 'closing') return null;
  const recap = buildClosingRecap(state.run, state.roomStats, { offline: Boolean(state.offlineMode) });
  if (!recap.hasAnswers && recap.takeaways.length === 0) return null;
  // One list per line, and only when some line has phrases. A takeaway that carried a newline of its own would split
  // into more lines than lists on the phone, which then marks nothing rather than the wrong line.
  const lineEmphasis = recap.takeaways.map((entry) => wirePhrases(entry.emphasis) ?? []);
  return {
    answerLabel: recap.hasAnswers ? `The room got ${recap.accuracy}% right.` : 'Thanks for playing.',
    answerToken: CLOSING_REVEAL_TOKEN,
    explanation: recap.takeaways.length >= 3 ? 'Three to take back to the counter' : recap.takeaways.length > 0 ? 'To take back to the counter' : '',
    takeaway: recap.takeaways.map((entry) => entry.text).join('\n'),
    citations: [],
    ...(lineEmphasis.some((phrases) => phrases.length > 0) && isWireLineEmphasis(lineEmphasis) ? { takeawayLineEmphasis: lineEmphasis } : {}),
  };
}

export interface GameNetworkProjection {
  roomState: PublicRoomState;
  questionProjection: PublicQuestionProjection | null;
}

export function projectGameState(state: GameState, roomId: string, revision: number, now = Date.now()): GameNetworkProjection {
  const slide = state.run[state.slideIndex];
  const current = asQuestion(slide);
  const occurrence = getQuestionInstanceId(state);
  const position = questionPosition(state.run, state.slideIndex);
  const regularProjection = current && occurrence
    ? questionOrNullIfUnarmed(state, occurrence, current, position)
    : null;
  const showdownProjection = publicShowdown(state);
  const questionProjection = state.phase === 'showdown' ? showdownProjection.questionProjection : regularProjection;
  const ordered = (state.leaderboardEnabled || state.phase === 'closing')
    ? rankLeaderboard(computeLeaderboard(state.seenDevices))
    : [];
  const leaderboard = ordered.map((entry) => ({
    name: entry.nickname, score: entry.score, rank: entry.rank, team: entry.team,
  }));
  const timerRemaining = state.timer.running && Number.isFinite(state.timer.endsAt)
    ? Math.max(0, Number(state.timer.endsAt) - now)
    : Math.max(0, state.timer.remainingMs);

  return {
    roomState: {
      version: PROTOCOL_VERSION,
      roomId,
      sessionId: state.sessionId,
      revision,
      phase: state.phase,
      slideIndex: state.slideIndex,
      slideCount: state.run.length,
      question: current?.id ?? (typeof slide?.id === 'string' ? slide.id : null),
      questionData: questionProjection?.question ?? null,
      reveal: state.phase === 'closing' ? closingReveal(state) : current && ['revealed', 'explaining'].includes(state.phase) ? projectPublicReveal(current) : null,
      votesLocked: !acceptsAttendeeInput(state) || Boolean(state.votesLocked) || !['entering', 'deliberating'].includes(state.phase),
      timerSeconds: state.timer.enabled ? Math.ceil(timerRemaining / 1_000) : 0,
      timerDurationSeconds: state.timer.enabled ? Math.ceil(Math.max(0, state.timer.durationMs) / 1_000) : 0,
      timerRunning: state.timer.enabled && state.timer.running,
      participants: Object.keys(state.seenDevices).length,
      teamScores: numericTeamScores(state.roomStats?.teams),
      leaderboard,
      showdown: showdownProjection.showdown,
      hostConnected: true,
    },
    questionProjection,
  };
}

function attendeeCommitments(state: GameState, deviceId: string): string[] {
  const values: string[] = [];
  for (const perQuestion of Object.values(state.commitments ?? {})) {
    if (!perQuestion || typeof perQuestion !== 'object' || Array.isArray(perQuestion)) continue;
    const value = (perQuestion as Record<string, unknown>)[deviceId];
    if (typeof value === 'string' && value.trim()) values.push(value);
  }
  return [...new Set(values)];
}

export function projectAttendeeState(
  state: GameState,
  deviceId: string,
  questionProjection: PublicQuestionProjection | null,
): AttendeeState {
  const device = state.seenDevices[deviceId];
  const occurrence = getQuestionInstanceId(state);
  const current = asQuestion(state.run[state.slideIndex]);
  const rawVote = current ? state.pollVoters[current.id]?.[deviceId] : null;
  const settled = occurrence ? state.settledResults[occurrence]?.[deviceId] : null;
  // A canonical order choice ('a-b-c'...) IS the answer key (8.6), unlike every other kind's
  // canonical token, which is only a position letter. If encodeChoice cannot encode it -- no
  // projection armed, or (in production, with no armed scramble) questionProjection is null --
  // the old `?? choice` fallback would echo the raw canonical letters straight onto the wire,
  // recreating the exact leak this fix closed. Every other kind keeps that fallback: its
  // canonical token carries no correctness info to leak.
  const encode = (choice: unknown) => {
    if (typeof choice !== 'string') return '';
    const encoded = questionProjection?.encodeChoice(choice);
    if (encoded != null) return encoded;
    return current && questionKind(current) === 'order' ? '' : choice;
  };
  const team: TeamSide | null = device?.team === 'NAVY' || device?.team === 'GOLD' ? device.team : null;
  return {
    sessionId: state.sessionId,
    registered: Boolean(device),
    // W8: this projection is deviceId-scoped and only ever reaches the owning device's own phone, so
    // it carries the raw, as-typed name. Every room-facing surface (the wire leaderboard, the stage)
    // keeps reading the filtered `nickname` on the seenDevices record instead.
    nickname: device?.rawNickname ?? device?.nickname ?? '',
    team,
    vote: occurrence && rawVote && typeof rawVote.choice === 'string' ? {
      questionInstanceId: occurrence,
      choice: encode(rawVote.choice),
      conviction: typeof rawVote.conviction === 'string' ? rawVote.conviction : 'fairly-sure',
    } : null,
    result: occurrence && settled ? {
      questionInstanceId: occurrence,
      choice: encode(settled.choice),
      isCorrect: settled.isRight,
      points: settled.score,
      // Optional on the wire (STREAK-PILL): only sent when this answer actually earned a bonus,
      // so an unbonused round keeps the exact four-key shape every relay accepted before this
      // change. src/network/guards.ts, server/room-relay.mjs and the production migration all
      // accept the key as optional, never required, so an old stored/cached result with no
      // streakBonus at all stays valid.
      ...(settled.streakBonus > 0 ? { streakBonus: settled.streakBonus } : {}),
    } : null,
    score: device?.score ?? 0,
    correct: device?.correct ?? 0,
    answered: device?.answered ?? 0,
    accuracy: device && device.answered > 0 ? Math.round((device.correct / device.answered) * 100) : null,
    bestStreak: device?.bestStreak ?? 0,
    rank: attendeeRank(state.seenDevices, deviceId),
    totalParticipants: Object.values(state.seenDevices).filter(
      (device) => Boolean(device && typeof device.nickname === 'string' && device.nickname.trim().length > 0 && device.answered > 0)
    ).length,
    commitments: attendeeCommitments(state, deviceId),
  };
}
