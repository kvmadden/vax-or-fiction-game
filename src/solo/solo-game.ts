import type { Deck, Question } from '../data/types';
import type { RuntimeMeta } from '../data/bank/types';
import { isHeldBundledQuestion } from '../data/decks';
import { bankMetaFor } from '../data/bank';
import { SOLO_DECKS, SOLO_HOLDS, type SoloTopic } from '../data/decks/topics';
import { isQuestionSlide } from '../engine/kinds';
import { getQuestionInstanceId, runForQuestions, useGameStore } from '../store/game-store';
import { projectAttendeeState, projectGameState } from '../network/game-projection';
import type { PublicQuestionProjection } from '../network/projection';
import type { AttendeeState, PublicRoomState } from '../network/protocol';
import { buildTopicRotation, dealTopicPlay, type SoloMeta } from './dealer';

type GameState = ReturnType<typeof useGameStore.getState>;

/** The one local player, and the room id the projection echoes back. Neither ever leaves the page. */
export const SOLO_DEVICE_ID = 'solo-player';
export const SOLO_ROOM_ID = 'solo';

/**
 * Solo never saves over, or resumes, a hosted run in this browser. From here on the store keeps its game in memory,
 * the same move the editorial review makes before it previews cards.
 */
export function isolateSoloStore(): void {
  useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
  useGameStore.setState({ ...useGameStore.getInitialState(), run: [] }, true);
}

/** A question solo never deals: held by its own deck or by solo, or carrying a statement a host deck holds. */
export function isSoloHeld(deck: Deck, question: Question): boolean {
  return (deck.heldQuestionIds ?? []).includes(question.id) || (SOLO_HOLDS[deck.id] ?? []).includes(question.id)
    || isHeldBundledQuestion({ ...question, deckId: deck.id });
}

/** A topic ready to play: its questions from every deck it draws on, the whole-topic rotation (9.2), and the order
 *  solo deals the playable ones in. */
export interface SoloPool {
  id: string;
  /**
   * Re-keyed `deck-question`, so two decks' q16 never collide in one run. Each question names its deck, which keeps
   * holds scoped to it, and carries its own deck's citations. Plain `Question` objects: a question's bank record
   * lives only in `meta`, never spread onto the question itself (4.7).
   */
  questions: Question[];
  /** Each playable id's bank record, or null while the backfill has not reached it yet. */
  meta: Map<string, RuntimeMeta | null>;
  /** Playable ids in dealing order. Held questions stay in `questions` and out of here. */
  sequence: string[];
  /** The topic's whole rotation (9.2): every core question, plus every alternate whose concept nothing else in the
   *  round already covers. A round always deals this in full (VOF-68) -- see `dealTopicRound` for the order. */
  rotation: string[];
}

export async function loadSoloPool(topic: SoloTopic): Promise<SoloPool> {
  const deckIds = [...new Set(topic.picks.map(([deckId]) => deckId))];
  const decks = new Map(await Promise.all(deckIds.map(async (deckId) => {
    const load = SOLO_DECKS[deckId];
    if (!load) throw new Error(`${topic.id} draws on an unknown deck, ${deckId}`);
    return [deckId, await load()] as const;
  })));
  const questions: Question[] = [];
  const meta = new Map<string, RuntimeMeta | null>();
  const sequence: string[] = [];
  for (const [deckId, questionId] of topic.picks) {
    const deck = decks.get(deckId)!;
    const question = deck.questions.find((entry) => entry.id === questionId);
    if (!question) throw new Error(`${topic.id} lists ${questionId}, which ${deckId} does not have`);
    const sources = new Map((deck.citations ?? []).map((citation) => [citation.id, citation]));
    const id = `${deckId}-${questionId}`;
    questions.push({
      ...question,
      id,
      deckId,
      citations: question.citations ?? (question.sourceIds ?? []).flatMap((source) => sources.get(source) ? [sources.get(source)!] : []),
    } as Question);
    meta.set(id, bankMetaFor(deckId, questionId));
    if (!isSoloHeld(deck, question)) sequence.push(id);
  }
  return { id: topic.id, questions, meta, sequence, rotation: buildTopicRotation(sequence, meta) };
}

/**
 * How many questions a round of this topic deals: its whole rotation, which every play deals in full (VOF-68). The
 * topic picker shows this number, so it always matches the round that follows the tap, never the topic's raw pick
 * count, which estimatedPlayableCount overcounts.
 */
export async function soloRoundLength(topic: SoloTopic): Promise<number> {
  return (await loadSoloPool(topic)).rotation.length;
}

/**
 * The round dealt for one play of a topic (VOF-68, section 9.5). `playIndex` is 0 for this topic's first play in
 * the page visit, 1 for its second, and so on -- tracked in memory only, for the visit, as today (9.4). `history`
 * is every order already dealt for this topic this visit, so a later play never repeats one exactly. A round
 * always plays the whole rotation; only its order, and from the second play on its twin-swapped set, change.
 */
export function dealTopicRound(
  pool: SoloPool,
  playIndex: number,
  history: readonly (readonly string[])[] = [],
  finalOrder?: (ids: readonly string[]) => string[],
): string[] {
  return dealTopicPlay(pool.rotation, pool.sequence, pool.questions, pool.meta as SoloMeta, playIndex, history, finalOrder);
}

/**
 * Starts a round of these questions for the one local player, with no timer, no audio and no final showdown, and returns
 * the ids the store actually loaded. An empty run starts nothing: APPLY_PRESET would ignore it, and the restart would
 * replay the last round under this topic's name.
 */
export function startSoloRound(pool: SoloPool, questionIds: readonly string[]): string[] {
  // Only questions the pool deals can load, so a held one never reaches a run, whoever asks for it by id.
  const playable = new Set(pool.sequence);
  const byId = new Map(pool.questions.filter((question) => playable.has(question.id)).map((question) => [question.id, question]));
  const questions = questionIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question));
  // Every question already carries its citations and its deck, so the run needs nothing more from a deck.
  const run = runForQuestions({ id: pool.id, citations: [], staticSlides: [] }, questions, { opening: false, stampDeck: true });
  if (run.length === 0) return [];
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'SET_OFFLINE_MODE', enabled: false });
  dispatch({ type: 'SET_INTERACTION_MODE', mode: 'polling' });
  // Interval Top 5 is a hosted Curated 15 beat. Solo inherits that host default
  // (modeId curated15, scores on) and must not pause after every five questions.
  dispatch({ type: 'APPLY_PRESET', preset: { id: 'solo', settings: { run, leaderboardEnabled: false } } });
  dispatch({ type: 'RECORD_HELLO', deviceId: SOLO_DEVICE_ID, nickname: 'You' });
  dispatch({ type: 'CONFIRM_RESTART_RUN' });
  return useGameStore.getState().run.map((slide) => String(slide.id));
}

export interface SoloView {
  roomState: PublicRoomState;
  attendeeState: AttendeeState;
  questionProjection: PublicQuestionProjection | null;
}

/** What the phone screens see: the host's own phone projection, for the one local player. */
export function projectSolo(state: GameState, revision = 0): SoloView {
  const { roomState, questionProjection } = projectGameState(state, SOLO_ROOM_ID, revision);
  const attendeeState = projectAttendeeState(state, SOLO_DEVICE_ID, questionProjection);
  // The reply flag and the stem, reveal and takeaway emphasis used to be added here, for solo alone, while the room
  // wire refused them. The room wire carries them now (projectPublicQuestion, projectPublicReveal and the closing
  // reveal, with the 20260929140000 relay migration), so solo reads the same projection a room phone reads.
  // STREAK-PILL: streakBonus took the same path earlier. projectAttendeeState carries it on `result` whenever it was
  // earned (server/room-relay.mjs, src/network/guards.ts and the Supabase migration accept it in lockstep), so solo
  // needs no override of its own.
  return { roomState, questionProjection, attendeeState };
}

/**
 * Records the player's answer and reports whether it landed. The phone sends an order answer as opaque step tokens,
 * so every choice is decoded to the store's own token first. Skip the decode and the store drops order answers silently.
 */
export function recordSoloVote(view: SoloView, choice: string, conviction?: string): boolean {
  const questionId = view.roomState.questionData?.id;
  const decoded = view.questionProjection?.decodeChoice(choice) ?? null;
  if (!questionId || !decoded) return false;
  useGameStore.getState().dispatch({ type: 'RECORD_VOTE', deviceId: SOLO_DEVICE_ID, choice: decoded, conviction, questionId });
  return useGameStore.getState().pollVoters[questionId]?.[SOLO_DEVICE_ID]?.choice === decoded;
}

export type SoloStep = 'next' | 'score';

/**
 * A tap reveals right away in solo (VOF-W7, 2026-09-27), so the one button only ever moves on from the
 * combined reveal-and-reason screen. It shows nothing while a question is still open or mid-reveal. `view`
 * is unused now that reveal itself is automatic (revealSoloAnswer), kept so callers do not need two shapes
 * of this function depending on which step is live.
 */
export function soloStep(state: GameState, _view: SoloView): SoloStep | null {
  if (state.phase === 'explaining') return state.slideIndex >= state.run.length - 1 ? 'score' : 'next';
  return null;
}

/** Moves past the combined reveal screen, onward to the next question or the score. */
export function takeSoloStep(_step: SoloStep): void {
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
}

/**
 * The moment an answer is accepted, solo settles it and walks straight to its explanation in one beat
 * (VOF-W7): no locked "Your answer is in" screen, and no separate "See why" step. REVEAL scores the
 * question and ADVANCE carries it on to 'explaining', which renders the verdict and the reason together.
 * Both dispatches land inside the same tap, so React never paints the screen in between.
 */
export function revealSoloAnswer(): void {
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'REVEAL' });
  dispatch({ type: 'ADVANCE' });
}

/** Right or wrong for each question of the round, in the order played, and null for one the player never answered. */
export function soloOutcomes(state: GameState): (boolean | null)[] {
  return state.run.flatMap((slide, slideIndex) => {
    if (!isQuestionSlide(slide)) return [];
    const occurrence = getQuestionInstanceId({ sessionId: state.sessionId, run: state.run, slideIndex });
    const settled = occurrence ? state.settledResults[occurrence]?.[SOLO_DEVICE_ID] : undefined;
    return [settled ? settled.isRight : null];
  });
}

/**
 * `soloOutcomes` plus each question's kind and takeaway, in the order played -- what the pace recaps
 * (src/solo/pace/pace-recap.ts) need to replay the round's scoring and list the missed cards. `ids` is the round
 * actually dealt (startSoloRound's own return value), so this never drifts from what is on screen.
 */
export function soloOutcomesDetailed(state: GameState, pool: SoloPool, ids: readonly string[]): { id: string; kind: NonNullable<Question['kind']>; isRight: boolean | null; takeaway?: string; takeawayEmphasis?: string[] }[] {
  const byId = new Map(pool.questions.map((question) => [question.id, question]));
  const outcomes = soloOutcomes(state);
  return ids.map((id, index) => {
    const question = byId.get(id);
    return {
      id,
      kind: question?.kind ?? 'binary',
      isRight: outcomes[index] ?? null,
      takeaway: question?.takeaway,
      ...(question?.takeawayEmphasis?.length ? { takeawayEmphasis: question.takeawayEmphasis } : {}),
    };
  });
}

/** The one local player's current streak, straight from the store -- what Run's live meter shows. */
export function soloStreak(state: GameState): number {
  return state.seenDevices[SOLO_DEVICE_ID]?.streak ?? 0;
}
