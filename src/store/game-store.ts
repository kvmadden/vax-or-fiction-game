import { isHeldBundledQuestion } from '../data/decks';
import { acceptsAttendeeInput } from '../engine/attendee-input';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GamePhase,
  FormatId,
  InteractionMode,
  HudState,
  HelpState,
  LiveStatus,
  TimerState,
  ConsensusPct,
  SlideEntry,
  VoterEntry,
  Question,
  Deck,
  GameState as EngineGameState,
  RoomStatsState,
  QuestionStats,
  Participant,
} from '../data/types';

import { MAX_STREAK_BONUS, computeNextStreak, evalAnswer, score } from '../engine/scoring';
import { isQuestionSlide, isTerminalSlide, MAX_ORDER_STEPS, questionKind, validChoice } from '../engine/kinds';
import { UNREVEALED_PHASES, advance, back, isSetupPhase } from '../engine/state-machine';
import { INTRO_LANDING_GRACE_MS, isIntroCountdownBeat, isIntroCountdownRunning, isWithin } from '../engine/intro-countdown';
import { breakAlternatingPatterns } from '../engine/run-order';
import { computeLeaderboard } from '../engine/leaderboard';
import {
  armOrCommit,
  clearPresenterArm,
  shouldGuardShowdownAdvance,
  shouldGuardSkip,
  type PresenterArm,
} from '../engine/presenter-guards';
import { DEFAULT_DECK_ID as BUNDLED_DEFAULT_DECK_ID, defaultModeId, resolveBundledDeck } from '../data/decks';
import { useAudioStore } from '../engine/audio-store';
import { canonicalReaction } from '../engine/reactions';
import { filteredDisplayName } from '../engine/name-filter';
import { randomOrderScramble, ORDER_TOKEN_PATTERN, type OrderScramble } from '../network/projection';

export const VALID_TOKEN = /^[a-zA-Z0-9_-]+$/;

export function isValidVoteToken(token: unknown): token is string {
  return typeof token === 'string' && VALID_TOKEN.test(token);
}

export function getGameSessionStorageName(search?: string): string {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  return `vof-game-session:${new URLSearchParams(query).get('room') ?? ''}`;
}

export interface TimerWithDeadline extends TimerState {
  /** Absolute wall-clock deadline while the timer is running. */
  endsAt?: number | null;
}

export interface SeenDeviceState {
  nickname: string;
  /** W8: the name as typed, before the DEF-32 display filter. Only the owning device's own attendee
   * projection reads this (src/network/game-projection.ts), and every room-facing surface keeps
   * using `nickname`. Optional so state persisted before this field existed still hydrates. */
  rawNickname?: string;
  team: string | null;
  joinedAt: number;
  score: number;
  answered: number;
  correct: number;
  streak: number;
  bestStreak: number;
  realityGap: number;
  hardQuestionPoints: number;
}

export interface SettledVote extends VoterEntry {
  isRight: boolean;
  score: number;
  /** This one answer's own streak-bonus points, separate from its base score, so a phone can name the bonus on its own line. */
  streakBonus: number;
  realityGapDelta: number;
}

export interface ShowdownFinalist {
  ticket: string;
  name: string;
  score: number;
  duelPoints: number;
}

export interface GameShowdownState {
  id: string;
  stage: 'lineup' | 'duel' | 'result';
  finalists: ShowdownFinalist[];
  /** Private device-to-ticket choices; the public projection broadcasts counts only. */
  predictions: Record<string, string>;
  predictionCounts: Record<string, number>;
  questionIds: string[];
  questionIndex: number;
  winner: string | null;
  tie: boolean;
  isRecap: boolean;
}

function createSessionId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stoppedTimer(timer: TimerWithDeadline, pauseReason: TimerState['pauseReason'] = 'revealed'): TimerWithDeadline {
  return { ...timer, running: false, endsAt: null, pauseReason };
}

function currentQuestion(state: Pick<GameState, 'run' | 'slideIndex'>): Question | null {
  const candidate = state.run?.[state.slideIndex] as unknown as Question | undefined;
  return isQuestionSlide(candidate) ? candidate : null;
}

const DEFAULT_DECK_ID = BUNDLED_DEFAULT_DECK_ID;
/** Curated 8 is the host default (in the room + phone voting, 8 questions). */
const DEFAULT_MODE_ID = 'curated8';
/** Practice on the show deck rehearses Curated 8. Other decks still rehearse their full pace. */
const REHEARSAL_MODE_ID = 'rehearsal';
/** Only the standard (`full`) mode may vary predictable binary alternation; every other list stays authored. */
const PATTERN_BREAK_MODE_ID = 'full';
const BUILT_IN_PRESETS: Record<string, {
  formatId: FormatId;
  modeId: string;
  timerEnabled: boolean;
  discussionEnabled: boolean;
  twoTeams: boolean;
  leaderboardEnabled: boolean;
  interactionMode: InteractionMode;
  showdownEnabled?: boolean;
  reactionsEnabled: boolean;
}> = {
  curated8: { formatId: 'widescreen', modeId: 'curated8', timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: true, interactionMode: 'polling', showdownEnabled: false, reactionsEnabled: true },
  'curated8-room': { formatId: 'widescreen', modeId: 'curated8', timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: true, interactionMode: 'polling', showdownEnabled: false, reactionsEnabled: true },
  curated15: { formatId: 'widescreen', modeId: 'curated15', timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: true, interactionMode: 'polling', showdownEnabled: false, reactionsEnabled: true },
  'curated15-room': { formatId: 'widescreen', modeId: 'curated15', timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: true, interactionMode: 'polling', showdownEnabled: false, reactionsEnabled: true },
  standard: { formatId: 'widescreen', modeId: 'full', timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: false, interactionMode: 'polling', reactionsEnabled: false },
  huddle: { formatId: 'widescreen', modeId: 'lightning', timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: false, interactionMode: 'facilitator', reactionsEnabled: false },
  classroom: { formatId: 'square', modeId: 'full', timerEnabled: false, discussionEnabled: true, twoTeams: false, leaderboardEnabled: false, interactionMode: 'facilitator', reactionsEnabled: false },
  rehearsal: { formatId: 'widescreen', modeId: REHEARSAL_MODE_ID, timerEnabled: true, discussionEnabled: true, twoTeams: false, leaderboardEnabled: false, interactionMode: 'facilitator', reactionsEnabled: false },
};

const DEFAULT_PRESET_ID = 'curated8';

function timerForBuiltInPreset(presetId: string, timer: TimerWithDeadline): TimerWithDeadline {
  const builtIn = BUILT_IN_PRESETS[presetId];
  if (!builtIn) return timer;
  const sized = {
    ...timer,
    ...authoredTimerPatch({ selectedDeckId: DEFAULT_DECK_ID, deckId: DEFAULT_DECK_ID, modeId: builtIn.modeId }),
  };
  if (!builtIn.timerEnabled) {
    return { ...stoppedTimer(sized, 'disabled'), enabled: false, visible: false };
  }
  return { ...sized, enabled: true, visible: true, pauseReason: sized.pauseReason === 'disabled' ? null : sized.pauseReason };
}

/**
 * Curated 8, and a practice run of the show deck, play the show's hosted eight (VOF-85). The owner asked on 2026-09-29,
 * before a Teams game, for eight questions other than the eight Curated 8 had played: four flu, four kinds, all from the
 * show deck's newer expansion (q17 to q36). q25, q18 and q31 also sit in the back half of Curated 15, which is unchanged.
 */
export const CURATED8_QUESTION_IDS: readonly string[] = ['q35', 'q20', 'q25', 'q31', 'q18', 'q26', 'q29', 'q36'];

function playsCurated8(deck: Deck, modeId: string): boolean {
  return modeId === 'curated8' || (modeId === REHEARSAL_MODE_ID && Boolean(deck.modes.curated15));
}

function authoredModeIdFor(deck: Deck, modeId: string): string {
  if (playsCurated8(deck, modeId)) return 'curated15';
  if (modeId === REHEARSAL_MODE_ID) return deck.modes.full ? 'full' : defaultModeId(deck);
  return modeId;
}

/** Materializes a playable run for a bundled deck + mode: opening slides, then the mode's questions in order. */
function bundledRunForMode(deckId: string | null | undefined, modeId: string | null | undefined): SlideEntry[] | null {
  if (!modeId) return null;
  const deck = resolveBundledDeck(deckId ?? DEFAULT_DECK_ID);
  if (!deck) return null;
  const authoredModeId = authoredModeIdFor(deck, modeId);
  const mode = deck.modes[authoredModeId];
  if (!mode) return null;
  const rawQuestionIds = playsCurated8(deck, modeId)
    ? (deck.id === DEFAULT_DECK_ID ? CURATED8_QUESTION_IDS : mode.questionIds.slice(0, 8))
    : mode.questionIds;
  const questionsById = new Map(deck.questions.map((question) => [question.id, question]));
  const run = rawQuestionIds.filter((id) => !(deck.heldQuestionIds ?? []).includes(String(id))).map((id) => questionsById.get(String(id)));
  if (run.some((question) => !question)) return null;
  const authoredRun = run as Question[];
  const orderedRun = authoredModeId === PATTERN_BREAK_MODE_ID ? breakAlternatingPatterns(authoredRun) : [...authoredRun];
  return runForQuestions(deck, orderedRun);
}

/**
 * These questions as a playable run: the deck's opening slides unless left out, then each question numbered in order,
 * with its citations resolved from the deck. Solo play (VOF-44) builds its rounds here too, without the opening slides,
 * and stamps each question with its deck so another deck's holds reach it only by statement (isHeldBundledQuestion).
 * A question that already names its deck, as a solo topic drawing on several decks does, keeps it.
 */
export function runForQuestions(deck: Pick<Deck, 'id' | 'citations' | 'staticSlides'>, questions: readonly Question[], { opening = true, stampDeck = false }: { opening?: boolean, stampDeck?: boolean } = {}): SlideEntry[] {
  const sources = new Map((deck.citations ?? []).map((citation) => [citation.id, citation]));
  const openingSlides: SlideEntry[] = opening
    ? deck.staticSlides
      .filter((slide) => slide.id === 'title' || slide.id === 'instructions')
      .map((slide) => ({ ...slide })) as SlideEntry[]
    : [];
  const questionSlides = questions.map((question, position) => ({
    ...question,
    displayNumber: position + 1,
    displayCount: questions.length,
    citations: question.citations ?? (question.sourceIds ?? []).flatMap((id) => sources.get(id) ? [sources.get(id)!] : []),
    ...(stampDeck ? { deckId: (question as { deckId?: string }).deckId ?? deck.id } : {}),
  })) as unknown as SlideEntry[];
  return playerVisibleRun([...openingSlides, ...questionSlides]);
}

/** Resolves the deck id a run should come from: the selected bundled deck, else the show deck. */
function bundledDeckIdFor(state: Pick<GameState, 'selectedDeckId' | 'deckId'>): string {
  const candidate = state.selectedDeckId ?? state.deckId;
  return resolveBundledDeck(candidate) ? resolveBundledDeck(candidate)!.id : DEFAULT_DECK_ID;
}

function defaultFullRun(): SlideEntry[] {
  return bundledRunForMode(DEFAULT_DECK_ID, DEFAULT_MODE_ID) ?? [];
}

/**
 * The deck mode's authored `timerSeconds` as a `{ durationMs, remainingMs }` patch, or `{}` when the
 * mode authors none. PRES-04: the Quick demo declares 20 s; the clock must never fall back to a
 * hard-coded 30.
 */
function authoredTimerPatch(state: Pick<GameState, 'selectedDeckId' | 'deckId' | 'modeId'>): Partial<Pick<TimerWithDeadline, 'durationMs' | 'remainingMs'>> {
  const deck = resolveBundledDeck(bundledDeckIdFor(state));
  if (!deck || !state.modeId) return {};
  const authoredModeId = authoredModeIdFor(deck, state.modeId);
  const seconds = deck.modes[authoredModeId]?.timerSeconds;
  if (!Number.isFinite(seconds) || (seconds as number) <= 0) return {};
  const durationMs = Math.round((seconds as number) * 1000);
  return { durationMs, remainingMs: durationMs };
}

/** A stopped timer re-sized to the mode's authored seconds; a running clock is never resized mid-question. */
function timerForMode(state: Pick<GameState, 'selectedDeckId' | 'deckId' | 'modeId' | 'timer'>): TimerWithDeadline {
  if (state.timer.running) return state.timer;
  return { ...state.timer, ...authoredTimerPatch(state) };
}

function isParticipantInterlude(slide: unknown): boolean {
  const candidate = record(slide);
  return candidate?.type === 'focus' || candidate?.type === 'halftime' || candidate?.type === 'fork' || candidate?.halftime === true;
}

/** Reject malformed saved content as a whole, preserving its authored order. */
function isRestorableSlide(value: unknown): value is SlideEntry {
  const slide = record(value);
  if (!slide || typeof slide.id !== 'string' || !slide.id.trim()) return false;
  if (isParticipantInterlude(slide)) return true; // Removed by the run policy below.
  const optionalText = (object: Record<string, any>, keys: readonly string[]) =>
    keys.every((key) => object[key] === undefined || typeof object[key] === 'string');
  const stringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && Array.from(value).every((item) => typeof item === 'string');
  const citation = (value: unknown) => {
    const item = record(value);
    return Boolean(item && optionalText(item, ['id', 'publisher', 'shortDisplayLine', 'url', 'lastVerified', 'accessedDate', 'publisherLabel'])
      && (typeof item.shortDisplayLine === 'string' || typeof item.publisher === 'string'));
  };
  if (!optionalText(slide, ['type', 'questionId', 'statement', 'scenario', 'reveal', 'takeaway', 'discussionPrompt',
    'presenterNote', 'patientConversation', 'imageRequirementId', 'topic', 'topicCue', 'guidelineRef', 'clinicalFocus',
    'authoringId', 'title', 'headline', 'body', 'pearl'])) return false;
  if (!['debatePrompts', 'sourceIds', 'reasons', 'emphasis', 'revealEmphasis', 'takeawayEmphasis', 'summaryPoints'].every((key) =>
    slide[key] === undefined || stringArray(slide[key]))) return false;
  if (slide.citations !== undefined && (!Array.isArray(slide.citations) || !Array.from(slide.citations).every(citation))) return false;
  if (slide.source !== undefined && typeof slide.source !== 'string' && !citation(slide.source)) return false;
  if (slide.references !== undefined && (!Array.isArray(slide.references) || !Array.from(slide.references).every((value) => {
    const item = record(value);
    return item && typeof item.label === 'string' && optionalText(item, ['url']);
  }))) return false;
  if (!isQuestionSlide(slide)) {
    return ['title', 'instructions', 'closing'].includes(slide.type ?? slide.id)
      && typeof slide.title === 'string';
  }
  const hasPrompt = typeof slide.statement === 'string' && slide.statement.trim().length > 0;
  const hasReplyScenario = slide.kind === 'which-patient' && typeof slide.scenario === 'string' && slide.scenario.trim().length > 0;
  if (!hasPrompt && !hasReplyScenario) return false;
  const textOptions = (options: unknown, min: number, max: number): options is string[] =>
    Array.isArray(options) && options.length >= min && options.length <= max
      && Array.from(options).every((option) => typeof option === 'string' && option.trim().length > 0);
  const keyedIndex = (value: unknown, length: number) => Number.isInteger(value) && Number(value) >= 0 && Number(value) < length;
  switch (slide.kind ?? 'binary') {
    case 'binary': return typeof slide.answer === 'boolean';
    case 'myth-among-three': return textOptions(slide.statements, 3, 3) && keyedIndex(slide.mythIndex, slide.statements.length);
    case 'which-patient': return textOptions(slide.choices, 2, 6) && keyedIndex(slide.bestIndex, slide.choices.length);
    case 'order': return textOptions(slide.steps, 3, 6);
    case 'estimate': {
      const estimate = record(slide.estimate);
      return Boolean(estimate && Number.isFinite(estimate.value) && optionalText(estimate, ['unit'])
        && (estimate.tolerance === undefined || Number.isFinite(estimate.tolerance)) && Array.isArray(estimate.ranges)
        && estimate.ranges.length >= 2 && estimate.ranges.length <= 6
        && Array.from(estimate.ranges).every((range: unknown) => {
          const item = record(range);
          return item && typeof item.label === 'string' && item.label.trim()
            && Number.isFinite(item.min) && Number.isFinite(item.max) && item.min <= item.max;
        }));
    }
    default: return false;
  }
}

/** The single player-run policy boundary: authored intermissions never enter React play. */
export function playerVisibleRun(run: readonly SlideEntry[]): SlideEntry[] {
  return run.filter((slide) => !isParticipantInterlude(slide) && !isHeldBundledQuestion(slide));
}

function playerVisibleRunIndex(run: readonly SlideEntry[], requestedIndex: number): number {
  const normalizedRun = playerVisibleRun(run);
  if (normalizedRun.length === 0) return -1;
  if (requestedIndex < 0) return -1;
  const removedBefore = run.slice(0, requestedIndex).filter((slide) => isParticipantInterlude(slide) || isHeldBundledQuestion(slide)).length;
  return Math.min(Math.max(requestedIndex - removedBefore, 0), normalizedRun.length - 1);
}

/** A stable key for one question occurrence within one game run. */
export function getQuestionInstanceId(state: Pick<GameState, 'sessionId' | 'run' | 'slideIndex'>): string | null {
  const question = currentQuestion(state as Pick<GameState, 'run' | 'slideIndex'>);
  return question ? `${state.sessionId}:${state.slideIndex}:${question.id}` : null;
}

export type GameAction =
  | { type: 'SELECT_FORMAT'; formatId?: string }
  | { type: 'SELECT_MODE'; modeId?: string }
  | { type: 'READY' }
  | { type: 'BEGIN_DELIBERATION'; questionInstanceId: string }
  | { type: 'TOGGLE_AUDIO' }
  | { type: 'ADVANCE' }
  // VOF-88: the stage lands question 1 when the 3-2-1 started at `startedAt` runs out.
  | { type: 'FINISH_INTRO_COUNTDOWN'; startedAt: number }
  | { type: 'REVEAL' }
  | { type: 'RESET' }
  | { type: 'BACK' }
  // WARNING-1 (premium-host-fix-3): Closing's offline pager re-dispatches this once BACK has
  // already turned it back to page 1, to run the original BACK transition (leaving closing) the
  // plain 'BACK' case no longer runs directly while phase is 'closing'.
  | { type: 'BACK_FROM_CLOSING' }
  | { type: 'TIME_EXPIRED' }
  | { type: 'TOGGLE_HALFTIME' }
  | { type: 'TOGGLE_LIGHTNING_ROUND' }
  | { type: 'TOGGLE_BOSS_QUESTION' }
  | { type: 'SET_GHOST_OPTIONS'; options?: unknown[] }
  | { type: 'SET_GHOST'; ghost?: unknown }
  | { type: 'CLEAR_GHOST' }
  | { type: 'DISMISS_BOSS_MOMENT' }
  | { type: 'RESTART_TIMER' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'ADD_TIME'; amountMs?: number; seconds?: number }
  | { type: 'TOGGLE_TIMER' }
  | { type: 'TICK_TIMER'; deltaMs?: number }
  | { type: 'SET_TIMER'; durationMs?: number; seconds?: number; remainingMs?: number; running?: boolean; enabled?: boolean; visible?: boolean; pauseReason?: string }
  | { type: 'START_TIMER'; durationMs?: number; seconds?: number }
  | { type: 'DOCUMENT_HIDDEN' }
  | { type: 'DOCUMENT_VISIBLE' }
  | { type: 'OPEN_HELP'; returnFocusId?: string }
  | { type: 'CLOSE_HELP' }
  | { type: 'HUD_SHOW'; restore?: true }
  | { type: 'HUD_HIDE'; releaseFocus?: true; suppress?: true }
  | { type: 'REQUEST_RESTART_RUN' }
  | { type: 'CONFIRM_RESTART_RUN' }
  | { type: 'CANCEL_RESTART_RUN' }
  | { type: 'SELECT_DECK'; deckId?: string; id?: string }
  | { type: 'RETURN_TO_DECK_PICKER' }
  | { type: 'ENTER_LOBBY' }
  | { type: 'START_BROADCAST' }
  | { type: 'CLOSE_OUT' }
  | { type: 'TOGGLE_DISCUSSION' }
  | { type: 'SET_DISCUSSION_SECONDS'; seconds?: number }
  | { type: 'RESET_TO_LOBBY' }
  | { type: 'SET_INTERACTION_MODE'; mode?: string }
  | { type: 'SET_OFFLINE_MODE'; enabled: boolean }
  | { type: 'RESET_POLL_VOTES' }
  | { type: 'LOCK_VOTES' }
  | { type: 'TOGGLE_CONVICTION' }
  | { type: 'TOGGLE_JOIN_QUESTION'; question: string }
  | { type: 'SET_JOIN_QUESTIONS'; join?: { role: boolean; years: boolean; site: boolean } }
  | { type: 'SET_PRESETS'; presets?: unknown[]; available?: boolean }
  | { type: 'SET_TALK_SECONDS'; seconds?: number }
  | { type: 'APPLY_PRESET'; preset?: { id: string; settings: any }; presetId?: string }
  | { type: 'SET_CONVICTION_ENABLED'; enabled?: boolean; value?: boolean }
  | { type: 'OPEN_TALK' }
  | { type: 'RECORD_VOTE'; choice?: string; token?: string; deviceId?: string; device?: string; conviction?: string; team?: string; questionId?: string; takenWhileOpen?: boolean }
  | { type: 'VOTE'; choice?: string; token?: string; deviceId?: string; device?: string; conviction?: string; team?: string; questionId?: string }
  | { type: 'RECORD_HELLO'; deviceId?: string; device?: string; nickname?: string; team?: string; role?: string }
  | { type: 'HELLO'; deviceId?: string; device?: string; nickname?: string; team?: string; role?: string }
  | { type: 'RECORD_DROPPED_MESSAGE' }
  | { type: 'TOGGLE_TEAMS' }
  | { type: 'TOGGLE_TWO_TEAMS' }
  | { type: 'SET_TEAMS_ENABLED'; enabled?: boolean; value?: boolean }
  | { type: 'SET_TWO_TEAMS'; enabled?: boolean; value?: boolean }
  | { type: 'TOGGLE_LEADERBOARD' }
  | { type: 'SET_LEADERBOARD_ENABLED'; enabled?: boolean; value?: boolean }
  | { type: 'REACTION'; deviceId?: string; device?: string; icon?: string; reaction?: string; questionId?: string; questionInstanceId?: string }
  | { type: 'RECORD_REACTION'; deviceId?: string; device?: string; icon?: string; reaction?: string; questionId?: string; questionInstanceId?: string }
  | { type: 'RECORD_REASON'; deviceId?: string; device?: string; reason?: string; questionId?: string; index?: number }
  | { type: 'RECORD_COMMENT'; deviceId?: string; device?: string; comment?: string; questionId?: string; text?: string }
  | { type: 'TOGGLE_COMMENTS' }
  | { type: 'SET_COMMENTS_ENABLED'; enabled?: boolean; value?: boolean }
  | { type: 'FIRE_REACTION'; reactionType?: string; reaction?: string }
  | { type: 'DISMISS_REACTION_MOMENT' }
  | { type: 'RECORD_COMMITMENT'; deviceId?: string; device?: string; commitment?: string; questionId?: string }
  | { type: 'RECORD_PREDICTION'; deviceId?: string; device?: string; prediction?: number; questionId?: string; band?: number }
  | { type: 'RECORD_DOUBLE'; deviceId?: string; device?: string; double?: boolean | string; questionId?: string }
  | { type: 'TOGGLE_PREDICT' }
  | { type: 'TOGGLE_DOUBLE_DOWN' }
  | { type: 'VOLUNTEER'; deviceId?: string; device?: string; volunteer?: string; ticket?: string; questionId?: string }
  | { type: 'PICK_CASE'; case?: string; ticket?: string }
  | { type: 'TOGGLE_MAKE_THE_CASE' }
  | { type: 'RECORD_BOUNTY'; deviceId?: string; device?: string; questionId?: string; bounty?: string; mythId?: string }
  | { type: 'TOGGLE_BOUNTY' }
  | { type: 'RECORD_FORK_VOTE'; deviceId?: string; device?: string; forkId?: string; choice?: string }
  | { type: 'FORK_PICK'; forkId?: string; choice?: string }
  | { type: 'TOGGLE_FORKS' }
  | { type: 'ENTER_SHOWDOWN' }
  | { type: 'ADVANCE_SHOWDOWN' }
  | { type: 'BACK_SHOWDOWN' }
  | { type: 'ADJUST_SHOWDOWN_POINTS'; ticket: string; delta: number }
  | { type: 'SET_SHOWDOWN_QUESTION'; index: number }
  | { type: 'FINISH_SHOWDOWN' }
  | { type: 'PREDICT_WINNER'; deviceId?: string; device?: string; winner?: string; ticket?: string; showdownId?: string }
  | { type: 'TOGGLE_SHOWDOWN' }
  | { type: 'SET_CONSENSUS_PCT'; pct?: number }
  | { type: 'TOGGLE_STAGE_REACTIONS' }
  | { type: 'TOGGLE_REACTION_TICKER' }
  | { type: 'SET_STAGE_REACTIONS_ENABLED'; enabled?: boolean; value?: boolean }
  | { type: 'SET_REACTION_TICKER_ENABLED'; enabled?: boolean; value?: boolean }
  | { type: 'SET_START_TIME'; time?: string | number }
  | { type: 'SKIP' }
  | { type: 'PARK' }
  | { type: 'CLEAR_PARKED_NOTICE' }
  | { type: 'DISMISS_PARKED_NOTICE' }
  | { type: 'SET_CAPTION'; caption?: string; text?: string }
  | { type: 'CLEAR_CAPTION' }
  | { type: 'SET_LIVE_ORIGIN'; origin?: string }
  | { type: 'SET_LIVE_STATUS'; status?: string };


export interface GameState {
  /** Identifies one restart-safe game run; it is not a room authorization secret. */
  sessionId: string;
  broadcasting?: boolean;
  parkedNotice?: boolean;
  parkedAt?: number | null;

  formatId: FormatId | null;
  modeId: string | null;
  run: SlideEntry[];
  slideIndex: number;
  phase: GamePhase;
  availableDecks: any[];
  selectedDeckId: string | null;
  deckId: string | null;
  discussionEnabled: boolean;
  discussionSeconds: number;
  discussionTimer: any | null;
  interactionMode: InteractionMode;
  offlineMode: boolean;
  closingAdvanceStep: number;
  closingBackStep: number;
  /**
   * VOF-88: when the 3-2-1 into question 1 started (Date.now()), or null. Never persisted, so a
   * reload during the count lands back on the instructions instead of jumping into question 1.
   */
  introCountdownAt: number | null;
  /** VOF-88: when the count ran out and landed question 1, so a late skip press cannot lock it. Never persisted. */
  introLandedAt: number | null;
  pollVotes: Record<string, any>;
  pollVoters: Record<string, any>;
  teamsEnabled: boolean;
  twoTeams: boolean;
  leaderboardEnabled: boolean;
  reactions: Record<string, any>;
  reactionTickerEnabled: boolean;
  stageReactionsEnabled: boolean;
  reasons: Record<string, any>;
  comments: Record<string, any>;
  commentsEnabled: boolean;
  reactionMoment: any | null;
  commitments: Record<string, any>;
  halftimeEnabled: boolean;
  lightningRoundEnabled: boolean;
  bossQuestionEnabled: boolean;
  bossBusted: any | null;
  ghost: any | null;
  ghostOptions: any[];
  predictEnabled: boolean;
  doubleDownEnabled: boolean;
  predictions: Record<string, any>;
  doubles: Record<string, any>;
  makeTheCaseEnabled: boolean;
  volunteers: Record<string, any>;
  theCase: any | null;
  bountyEnabled: boolean;
  bounty: any;
  forksEnabled: boolean;
  forks: Record<string, any>;
  showdownEnabled: boolean;
  showdown: GameShowdownState | null;
  consensusPct: ConsensusPct;
  convictionEnabled: boolean;
  join: { role: boolean; years: boolean; site: boolean };
  presets: any[];
  presetsAvailable: boolean;
  activePresetId: string | null;
  talkSeconds: number | null;
  voting: any;
  roomStats: any;
  remoteSessionId: string | null;
  remoteKey: string | null;
  liveOrigin: string | null;
  liveStatus: LiveStatus | null;
  timer: TimerWithDeadline;
  readinessGeneration: number;
  hud: HudState;
  help: HelpState;
  restartRunConfirmationOpen: boolean;
  seenDevices: Record<string, SeenDeviceState>;
  /** Prevents a question occurrence from settling more than once. */
  settledQuestionInstances: Record<string, true>;
  /** Authoritative per-device results, keyed by question occurrence. */
  settledResults: Record<string, Record<string, SettledVote>>;
  session: any;
  startTime: any | null;
  rehearsal: boolean;
  phonesPresent: number;
  posedAt: number | null;
  revealedAt: number | null;
  lowerThird: any | null;
  caption: string | null;
  captionExpiresAt: number | null;
  votesLocked?: boolean;
  /** First Skip / Showdown Next with phones still outstanding. Second press commits. */
  presenterArm: PresenterArm | null;
  /** One reaction per device per question so a phone reload cannot fire the stage sting twice. */
  reactionReceipts: Record<string, Record<string, string>>;
  /**
   * 8.6 fix: an order question's random per-step tokens and random display order, drawn once
   * with crypto.getRandomValues when the occurrence first arms (rearmQuestion / enterShowdown)
   * and kept for the rest of that occurrence's life, including a reload, so nothing sent to a
   * phone can be recomputed from public inputs. Keyed by questionInstanceId.
   */
  orderScrambles: Record<string, OrderScramble>;

  dispatch: (action: GameAction) => void;
}

const initialTimer: TimerWithDeadline = {
  durationMs: 0,
  remainingMs: 0,
  running: false,
  enabled: false,
  visible: false,
  pauseReason: 'disabled',
  generation: 0,
  endsAt: null,
  ...authoredTimerPatch({ selectedDeckId: DEFAULT_DECK_ID, deckId: DEFAULT_DECK_ID, modeId: DEFAULT_MODE_ID }),
};

export function settledDoubleDown(state: GameState, occurrence: string, deviceId: string): boolean {
  const scoped = state.doubles?.[occurrence];
  if (scoped && typeof scoped === 'object') return Boolean(scoped[deviceId]);
  return Boolean(state.doubles?.[deviceId]);
}

function canOpenVotes(state: GameState): boolean {
  const occurrence = getQuestionInstanceId(state);
  return ['entering', 'deliberating'].includes(state.phase)
    && !(occurrence && state.settledQuestionInstances[occurrence]);
}

/** Only an unplayed question can own a running countdown; R may reopen an expired vote. */
function canRunQuestionTimer(state: GameState): boolean {
  const occurrence = getQuestionInstanceId(state);
  return Boolean(occurrence) && ['entering', 'deliberating', 'timedOut', 'locked'].includes(state.phase)
    && !state.settledQuestionInstances[occurrence!];
}

/**
 * The lock beat: votes close and a running clock stops. Idempotent, and a no-op off a question so a
 * stray L on the title slide cannot pre-lock the first question. The next question re-opens via
 * `rearmQuestion`. Whether the timer is *enabled* is untouched: locking never arms a clock (PRES-04).
 */
function lockVotes(state: GameState): GameState {
  if (isSetupPhase(state.phase) || !currentQuestion(state)) return state;
  return {
    ...clearPresenterArm(state),
    votesLocked: true,
    timer: state.timer.running ? stoppedTimer(state.timer, 'timedOut') : state.timer,
  };
}

/** PRES-02: an open live question takes the lock beat first; Space / → reveal only once votes are locked. */
function shouldLockBeforeReveal(state: GameState): boolean {
  return !state.offlineMode && !state.votesLocked && canOpenVotes(state);
}

/**
 * 8.6: draws this occurrence's random tokens and random display order the first time an order
 * question arms, with crypto.getRandomValues, and never again for the same occurrence -- so a
 * reload or a Back into an already-armed question keeps the room's scramble. Every other kind
 * passes through untouched.
 */
function ensureOrderScramble(
  scrambles: Record<string, OrderScramble>,
  occurrence: string | null,
  question: Question | null,
): Record<string, OrderScramble> {
  if (!occurrence || !question || questionKind(question) !== 'order') return scrambles;
  const stepCount = (question.steps ?? []).length;
  const existing = scrambles[occurrence];
  // A scramble whose length no longer matches this occurrence's real step count (a corrupted or
  // foreign persisted value, or a held/edited question reusing an old occurrence id) is not
  // reusable -- redraw rather than hand a length-mismatched scramble to projectPublicQuestion.
  if (existing && existing.tokens.length === stepCount && existing.order.length === stepCount) return scrambles;
  return { ...scrambles, [occurrence]: randomOrderScramble(stepCount) };
}

function rearmQuestion(state: GameState): GameState {
  const question = currentQuestion(state);
  const occurrence = getQuestionInstanceId(state);
  const settled = occurrence ? state.settledQuestionInstances[occurrence] : false;
  const orderScrambles = ensureOrderScramble(state.orderScrambles, occurrence, question);
  const pollVotes = { ...state.pollVotes };
  const pollVoters = { ...state.pollVoters };

  if (question) {
    delete pollVotes[question.id];
    delete pollVoters[question.id];
    if (settled && occurrence) {
      const settledVoters = state.settledResults[occurrence] ?? {};
      const tallies: Record<string, number> = {};
      for (const vote of Object.values(settledVoters)) {
        tallies[vote.choice] = (tallies[vote.choice] ?? 0) + 1;
      }
      if (Object.keys(settledVoters).length > 0) pollVoters[question.id] = { ...settledVoters };
      if (Object.keys(tallies).length > 0) pollVotes[question.id] = tallies;
    }
  }

  if (settled) {
    return {
      ...clearPresenterArm(state),
      phase: 'revealed' as GamePhase,
      votesLocked: true,
      pollVotes,
      pollVoters,
      orderScrambles,
      timer: stoppedTimer(state.timer),
    };
  }

  return {
    ...clearPresenterArm(state),
    votesLocked: false,
    pollVotes,
    pollVoters,
    orderScrambles,
    posedAt: null,
    revealedAt: null,
    timer: {
      ...state.timer,
      remainingMs: state.timer.durationMs,
      running: false,
      endsAt: null,
      pauseReason: state.timer.enabled ? 'manual' : 'disabled',
    },
    voting: {
      ...state.voting,
      questionId: null,
      window: 'open',
      firstSplit: null,
      finalSplit: null,
      switched: 0,
      firstVoters: null,
      talkStartedAt: null,
      talkEndsAt: null,
    },
  };
}

// WARNING-1 (premium-host-fix-3): the transition the plain 'BACK' case ran unconditionally
// before this pass. Extracted so both 'BACK' (outside closing) and 'BACK_FROM_CLOSING' (Closing's
// own re-dispatch once its offline pager is back on page 1) share one implementation.
function runBackTransition(state: GameState): GameState {
  const next = back(state as unknown as EngineGameState);
  if (!next) return state;
  const candidate = { ...clearPresenterArm(state), ...next } as GameState;
  const priorOccurrence = getQuestionInstanceId(candidate);
  if (priorOccurrence && state.settledQuestionInstances[priorOccurrence]) {
    return rearmQuestion(candidate);
  }
  return next.slideIndex !== undefined ? rearmQuestion(candidate) : candidate;
}

function summarizeTeams(devices: Record<string, SeenDeviceState>) {
  const totals: Record<string, { phones: number; score: number; correct: number; answered: number }> = {
    NAVY: { phones: 0, score: 0, correct: 0, answered: 0 },
    GOLD: { phones: 0, score: 0, correct: 0, answered: 0 },
  };
  for (const device of Object.values(devices)) {
    const team = device.team?.toUpperCase();
    if (team !== 'NAVY' && team !== 'GOLD') continue;
    const total = totals[team]!;
    total.phones += 1;
    total.score += device.score;
    total.correct += device.correct;
    total.answered += device.answered;
  }
  return Object.fromEntries(Object.entries(totals).map(([team, total]) => [team, {
    phones: total.phones,
    score: total.score,
    accuracy: total.answered > 0 ? Math.round((total.correct / total.answered) * 100) : 0,
  }]));
}

/**
 * REVEAL acts only on a question on stage, in a question beat. Setup, the lobby, the end screens, the Final
 * challenge and every other screen without a question in play ignore it, so a stray Enter never jumps the room
 * somewhere else. A question already revealed stays revealable, because settling it again awards nothing twice.
 */
function canReveal(state: GameState): boolean {
  return (UNREVEALED_PHASES.has(state.phase) || state.phase === 'revealed') && currentQuestion(state) !== null;
}

/**
 * Atomically settles the current accepted votes. Both REVEAL and ADVANCE route
 * through this function so a key repeat, replay, reload, or Back→Reveal cannot
 * award points twice.
 */
function settleCurrentQuestion(state: GameState): Partial<GameState> {
  const question = currentQuestion(state);
  const occurrence = getQuestionInstanceId(state);
  if (!question || !occurrence) {
    return { phase: 'revealed' as GamePhase, votesLocked: true, timer: stoppedTimer(state.timer), revealedAt: Date.now() };
  }
  if (state.settledQuestionInstances[occurrence]) {
    return { phase: 'revealed' as GamePhase, votesLocked: true, timer: stoppedTimer(state.timer), revealedAt: state.revealedAt ?? Date.now() };
  }

  const voters = state.pollVoters[question.id] ?? {};
  const settled: Record<string, SettledVote> = {};
  const seenDevices: Record<string, SeenDeviceState> = { ...state.seenDevices };
  let correctOnQuestion = 0;
  let votesOnQuestion = 0;
  let certainOnQuestion = 0;
  let certainWrongOnQuestion = 0;

  const kind = questionKind(question);

  for (const [deviceId, rawVote] of Object.entries(voters)) {
    const vote = rawVote as VoterEntry;
    if (!vote || !validChoice(question, vote.choice)) continue;
    const isRight = evalAnswer(question, vote.choice);
    const prior = seenDevices[deviceId] ?? {
      nickname: '', team: null, joinedAt: Date.now(), score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0,
    };
    const result = score(isRight, kind, prior.streak);
    settled[deviceId] = { ...vote, isRight, score: result.points, streakBonus: result.streakBonus, realityGapDelta: result.realityGapDelta };
    const hardQuestionDelta = isRight && (kind === 'which-patient' || kind === 'order')
      ? (result.points - result.streakBonus)
      : 0;
    seenDevices[deviceId] = {
      ...prior,
      score: prior.score + result.points,
      answered: prior.answered + 1,
      correct: prior.correct + (isRight ? 1 : 0),
      streak: result.nextStreak,
      bestStreak: Math.max(prior.bestStreak, result.nextStreak),
      realityGap: prior.realityGap + result.realityGapDelta,
      hardQuestionPoints: (prior.hardQuestionPoints ?? 0) + hardQuestionDelta,
    };
    votesOnQuestion += 1;
    if (isRight) correctOnQuestion += 1;
    if (vote.conviction === 'certain') certainOnQuestion += 1;
    if (vote.conviction === 'certain' && !isRight) certainWrongOnQuestion += 1;
  }

  const allDevices = Object.values(seenDevices);
  const allAnswered = allDevices.reduce((total, device) => total + device.answered, 0);
  const allCorrect = allDevices.reduce((total, device) => total + device.correct, 0);
  const questionAccuracy = votesOnQuestion > 0 ? Math.round((correctOnQuestion / votesOnQuestion) * 100) : 0;
  const roomStats = {
    ...state.roomStats,
    questions: {
      ...state.roomStats.questions,
      [question.id]: {
        kind: question.kind,
        choices: { ...(state.pollVotes[question.id] ?? {}) },
        trueCount: Number(state.pollVotes[question.id]?.true) || 0,
        falseCount: Number(state.pollVotes[question.id]?.false) || 0,
        correctPct: questionAccuracy,
        majorityWrong: votesOnQuestion > 0 && correctOnQuestion * 2 < votesOnQuestion,
        certainCount: certainOnQuestion,
        certainWrongCount: certainWrongOnQuestion,
        confidentlyWrongPct: votesOnQuestion > 0 ? Math.round((certainWrongOnQuestion / votesOnQuestion) * 100) : 0,
      },
    },
    votesTotal: allAnswered,
    certainTotal: (state.roomStats.certainTotal ?? 0) + certainOnQuestion,
    certainWrongTotal: allDevices.reduce((total, device) => total + device.realityGap, 0),
    accuracy: allAnswered > 0 ? Math.round((allCorrect / allAnswered) * 100) : 0,
    streak: computeNextStreak(state.roomStats.streak ?? 0, questionAccuracy),
    bestStreak: Math.max(state.roomStats.bestStreak ?? 0, computeNextStreak(state.roomStats.streak ?? 0, questionAccuracy)),
    devices: seenDevices,
    teams: summarizeTeams(seenDevices),
  };

  return {
    phase: 'revealed' as GamePhase,
    votesLocked: true,
    timer: stoppedTimer(state.timer),
    revealedAt: Date.now(),
    seenDevices,
    pollVoters: { ...state.pollVoters, [question.id]: { ...voters, ...settled } },
    settledQuestionInstances: { ...state.settledQuestionInstances, [occurrence]: true },
    settledResults: { ...state.settledResults, [occurrence]: settled },
    roomStats,
    presenterArm: null,
  };
}

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function safeKey(value: string): boolean {
  return value.length > 0 && value.length <= 256 && value !== '__proto__' && value !== 'prototype' && value !== 'constructor';
}

function normalizedTeam(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const team = value.toUpperCase();
  return team === 'NAVY' || team === 'GOLD' ? team : undefined;
}

function validWholeNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validatedSeenDevices(value: unknown): Record<string, SeenDeviceState> | null {
  const devices = record(value);
  if (!devices) return null;
  const valid: Record<string, SeenDeviceState> = {};
  for (const [deviceId, rawDevice] of Object.entries(devices)) {
    const device = record(rawDevice);
    const team = normalizedTeam(device?.team);
    if (!safeKey(deviceId) || !device || typeof device.nickname !== 'string' || device.nickname.trim().length < 1 || device.nickname.length > 80 || team === undefined
      || !Number.isFinite(device.joinedAt) || !Number.isFinite(device.score) || !validWholeNumber(device.answered)
      || !validWholeNumber(device.correct) || !validWholeNumber(device.streak) || !validWholeNumber(device.bestStreak)
      || !Number.isFinite(device.realityGap) || Number(device.realityGap) < 0) continue;
    valid[deviceId] = {
      nickname: device.nickname,
      // W8: older persisted state has no rawNickname, so fall back to the filtered name rather than
      // reject the whole entry, so a returning player is not silently dropped from the roster.
      rawNickname: typeof device.rawNickname === 'string' && device.rawNickname.trim().length > 0 && device.rawNickname.length <= 80
        ? device.rawNickname
        : device.nickname,
      team,
      joinedAt: Number(device.joinedAt),
      score: Number(device.score),
      answered: Number(device.answered),
      correct: Number(device.correct),
      streak: Number(device.streak),
      bestStreak: Number(device.bestStreak),
      realityGap: Number(device.realityGap),
      hardQuestionPoints: Number.isFinite(device.hardQuestionPoints) ? Math.max(0, Number(device.hardQuestionPoints)) : 0,
    };
  }
  return valid;
}

function validatedPollVoters(value: unknown): Record<string, Record<string, VoterEntry>> | null {
  const questions = record(value);
  if (!questions) return null;
  const valid: Record<string, Record<string, VoterEntry>> = {};
  for (const [questionId, rawVoters] of Object.entries(questions)) {
    const voters = record(rawVoters);
    if (!safeKey(questionId) || !voters) continue;
    const validVoters: Record<string, VoterEntry> = {};
    for (const [deviceId, rawVote] of Object.entries(voters)) {
      const vote = record(rawVote);
      const team = normalizedTeam(vote?.team);
      if (!safeKey(deviceId) || !vote || !isValidVoteToken(vote.choice) || team === undefined) continue;
      if (vote.conviction !== undefined && !['none', 'hunch', 'fairly-sure', 'certain'].includes(vote.conviction)) continue;
      validVoters[deviceId] = {
        choice: vote.choice,
        ...(vote.conviction === undefined ? {} : { conviction: vote.conviction }),
        ...(vote.team === undefined ? {} : { team }),
        ...(typeof vote.isRight === 'boolean' ? { isRight: vote.isRight } : {}),
        ...(Number.isFinite(vote.score) ? { score: Number(vote.score) } : {}),
        // STREAK-PILL: this function is shared between plain poll voters (never carry streakBonus)
        // and settledResults reuse (does), so pass a finite raw value through here. The real bound
        // (integer, 0..MAX_STREAK_BONUS) is enforced downstream in validatedSettledResults, the only
        // caller that treats this field as meaningful.
        ...(Number.isFinite(vote.streakBonus) ? { streakBonus: Number(vote.streakBonus) } : {}),
        ...(Number.isFinite(vote.realityGapDelta) ? { realityGapDelta: Number(vote.realityGapDelta) } : {}),
      } as VoterEntry;
    }
    valid[questionId] = validVoters;
  }
  return valid;
}

function validatedPollVotes(value: unknown): Record<string, Record<string, number>> | null {
  const questions = record(value);
  if (!questions) return null;
  const valid: Record<string, Record<string, number>> = {};
  for (const [questionId, rawTallies] of Object.entries(questions)) {
    const tallies = record(rawTallies);
    if (!safeKey(questionId) || !tallies) continue;
    const validTallies: Record<string, number> = {};
    for (const [choice, count] of Object.entries(tallies)) {
      if (safeKey(choice) && isValidVoteToken(choice) && validWholeNumber(count)) validTallies[choice] = count;
    }
    valid[questionId] = validTallies;
  }
  return valid;
}

function validatedReactionReceipts(value: unknown): Record<string, Record<string, string>> | null {
  const questions = record(value);
  if (!questions) return null;
  const valid: Record<string, Record<string, string>> = {};
  for (const [questionId, rawDevices] of Object.entries(questions)) {
    const devices = record(rawDevices);
    if (!safeKey(questionId) || !devices) continue;
    const row: Record<string, string> = {};
    for (const [deviceId, reaction] of Object.entries(devices)) {
      if (!safeKey(deviceId) || typeof reaction !== 'string' || reaction.length < 1 || reaction.length > 64) continue;
      row[deviceId] = reaction;
    }
    if (Object.keys(row).length > 0) valid[questionId] = row;
  }
  return valid;
}

function validatedSettledResults(value: unknown): GameState['settledResults'] | null {
  const occurrences = validatedPollVoters(value);
  if (!occurrences) return null;
  return Object.fromEntries(Object.entries(occurrences).map(([occurrence, voters]) => [
    occurrence,
    Object.fromEntries(Object.entries(voters).flatMap(([deviceId, rawVote]) => {
      const vote = rawVote as Partial<SettledVote>;
      if (typeof vote.isRight !== 'boolean' || !Number.isFinite(vote.score)
        || !Number.isFinite(vote.realityGapDelta) || Number(vote.realityGapDelta) < 0) return [];
      // STREAK-PILL: a corrupted persisted value (12.5, 150, -1) must not restore a streakBonus
      // no guard would ever accept from a live host, so this keeps only integers in scoring.ts's
      // real range and treats anything else as 0, the same as no bonus at all.
      const rawBonus = Number(vote.streakBonus);
      const streakBonus = Number.isInteger(rawBonus) && rawBonus >= 0 && rawBonus <= MAX_STREAK_BONUS ? rawBonus : 0;
      return [[deviceId, { ...rawVote, isRight: vote.isRight, score: Number(vote.score), streakBonus, realityGapDelta: Number(vote.realityGapDelta) }]];
    })),
  ]));
}

/**
 * Occurrence id -> that occurrence's real step count, for every order-kind question slide in a
 * run. Used to drop a persisted scramble whose length no longer matches its own question (a
 * corrupted value, or a held/edited question reusing an old occurrence id) instead of restoring
 * a mismatched one that projectPublicQuestion would then have to reject anyway.
 */
function orderStepCountsByOccurrence(run: readonly SlideEntry[], sessionId: string): Map<string, number> {
  const counts = new Map<string, number>();
  run.forEach((slide, index) => {
    if (!isQuestionSlide(slide)) return;
    const question = slide as unknown as Question;
    if (questionKind(question) === 'order') counts.set(`${sessionId}:${index}:${question.id}`, (question.steps ?? []).length);
  });
  return counts;
}

/**
 * 8.6: a persisted order scramble restores only when it is shaped exactly like one this host
 * would have drawn -- non-empty opaque tokens and a permutation of the same length -- and, where
 * `expectedStepCounts` can name it (a regular question occurrence; a showdown occurrence is keyed
 * differently and is re-armed fresh by ensureShowdownOrderScrambles regardless), matches that
 * occurrence's real question. A corrupted, foreign, or stale-length value can never resurrect a
 * guessable order.
 */
function validatedOrderScrambles(value: unknown, expectedStepCounts: Map<string, number>): GameState['orderScrambles'] | null {
  const occurrences = record(value);
  if (!occurrences) return null;
  const valid: GameState['orderScrambles'] = {};
  for (const [occurrence, raw] of Object.entries(occurrences)) {
    const candidate = record(raw);
    if (!safeKey(occurrence) || !candidate) continue;
    const tokens = candidate.tokens;
    const order = candidate.order;
    if (!Array.isArray(tokens) || !Array.isArray(order) || tokens.length !== order.length
      || tokens.length < 2 || tokens.length > MAX_ORDER_STEPS) continue;
    const expected = expectedStepCounts.get(occurrence);
    if (expected !== undefined && expected !== tokens.length) continue;
    if (!tokens.every((token) => typeof token === 'string' && ORDER_TOKEN_PATTERN.test(token))
      || new Set(tokens).size !== tokens.length) continue;
    const canonical = Array.from({ length: order.length }, (_unused, index) => String.fromCharCode(97 + index));
    if (!order.every((letter) => typeof letter === 'string' && canonical.includes(letter))
      || new Set(order).size !== order.length) continue;
    valid[occurrence] = { tokens: [...tokens] as string[], order: [...order] as string[] };
  }
  return valid;
}

/** Preserve occurrence identity when a saved run loses held cards or interludes. */
function remapRestoredOccurrences<T>(entries: Record<string, T>, run: readonly SlideEntry[], sessionId: string): Record<string, T> {
  const destinations = new Map<string, string | null>();
  let visibleIndex = 0;
  run.forEach((slide, oldIndex) => {
    const removed = isParticipantInterlude(slide) || isHeldBundledQuestion(slide);
    if (isQuestionSlide(slide)) {
      destinations.set(`${sessionId}:${oldIndex}:${slide.id}`, removed ? null : `${sessionId}:${visibleIndex}:${slide.id}`);
    }
    if (!removed) visibleIndex += 1;
  });
  return Object.fromEntries(Object.entries(entries).flatMap(([key, value]) => {
    const destination = destinations.has(key) ? destinations.get(key) : key;
    return destination ? [[destination, value]] : [];
  }));
}

function resetParticipantResults(devices: Record<string, SeenDeviceState>): Record<string, SeenDeviceState> {
  return Object.fromEntries(Object.entries(devices).map(([deviceId, device]) => [deviceId, {
    ...device,
    score: 0,
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    realityGap: 0,
    hardQuestionPoints: 0,
  }]));
}

function recapQuestionIds(run: SlideEntry[]): string[] {
  return run
    .filter((slide) => isQuestionSlide(slide))
    .slice(-2)
    .map((slide) => slide.id);
}

function createShowdownState(state: GameState): GameShowdownState | null {
  const finalists = computeLeaderboard(state.seenDevices).slice(0, 2).map((entry, index) => ({
    ticket: `F-${index + 1}`,
    name: entry.nickname,
    score: entry.score,
    duelPoints: 0,
  }));
  if (finalists.length === 0) return null;
  return {
    id: `${state.sessionId}:showdown`,
    stage: 'lineup',
    finalists,
    predictions: {},
    predictionCounts: Object.fromEntries(finalists.map((finalist) => [finalist.ticket, 0])),
    questionIds: recapQuestionIds(state.run),
    questionIndex: 0,
    winner: null,
    tie: false,
    isRecap: true,
  };
}

function closingWithoutShowdown(state: GameState): GameState {
  return {
    ...clearPresenterArm(state),
    phase: 'closing' as GamePhase,
    showdown: null,
    votesLocked: true,
    timer: stoppedTimer(state.timer),
  };
}

/** Curated 15 (the in-room default) and Curated 8 never open Showdown. The finale has not been play-tested in those sets. */
export function isCurated15Live(state: Pick<GameState, 'modeId' | 'activePresetId'>): boolean {
  const mode = String(state.modeId ?? '');
  return mode === 'curated15' || mode === 'curated8';
}

export function showdownPlayable(state: Pick<GameState, 'modeId' | 'activePresetId'>): boolean {
  return !isCurated15Live(state);
}

function refuseUnplayableShowdown<T extends Pick<GameState, 'modeId' | 'activePresetId' | 'showdownEnabled' | 'showdown' | 'phase'>>(state: T): T {
  if (showdownPlayable(state)) return state;
  return {
    ...state,
    showdownEnabled: false,
    showdown: null,
    phase: state.phase === 'showdown' ? 'closing' : state.phase,
  };
}

/**
 * 8.6: the showdown recap wire also carries a question via the same opaque-token shape
 * (src/network/game-projection.ts's publicShowdown), so its occurrence -- keyed the same way
 * that projection builds it, `${showdown.id}:${index}:${id}` -- gets its own armed scramble too,
 * drawn once up front for both recap questions rather than lazily per index.
 */
function ensureShowdownOrderScrambles(state: GameState, showdown: GameShowdownState): Record<string, OrderScramble> {
  let scrambles = state.orderScrambles;
  showdown.questionIds.forEach((id, index) => {
    const slide = state.run.find((entry) => entry.id === id);
    const question = isQuestionSlide(slide) ? (slide as unknown as Question) : null;
    scrambles = ensureOrderScramble(scrambles, `${showdown.id}:${index}:${id}`, question);
  });
  return scrambles;
}

/**
 * 8.6: the last-resort arming pass. Every reducer path that can leave an order question live
 * (rearmQuestion, enterShowdown, CONFIRM_RESTART_RUN) already arms its own scramble as it goes,
 * but a reload restores a snapshot without walking those reducers, so mergePersistedGameState
 * calls this on its way out to guarantee the occurrence the restored state actually lands on
 * (current question or showdown) is armed, never left to projectGameState's dev-only throw or
 * (in production) a blocked projection.
 */
function withArmedOrderScramble(state: GameState): GameState {
  if (state.phase === 'showdown' && state.showdown) {
    const orderScrambles = ensureShowdownOrderScrambles(state, state.showdown);
    return orderScrambles === state.orderScrambles ? state : { ...state, orderScrambles };
  }
  const question = currentQuestion(state);
  const occurrence = getQuestionInstanceId(state);
  const orderScrambles = ensureOrderScramble(state.orderScrambles, occurrence, question);
  return orderScrambles === state.orderScrambles ? state : { ...state, orderScrambles };
}

function enterShowdown(state: GameState): GameState {
  if (!state.showdownEnabled || !showdownPlayable(state)) return closingWithoutShowdown(state);
  const showdown = state.showdown?.id === `${state.sessionId}:showdown`
    ? state.showdown
    : createShowdownState(state);
  return showdown
    ? {
        ...clearPresenterArm(state),
        phase: 'showdown' as GamePhase,
        showdown,
        votesLocked: true,
        timer: stoppedTimer(state.timer),
        orderScrambles: ensureShowdownOrderScrambles(state, showdown),
      }
    : closingWithoutShowdown(state);
}

function withShowdownResult(showdown: GameShowdownState): GameShowdownState {
  if (showdown.finalists.length === 1) {
    return { ...showdown, stage: 'result', winner: showdown.finalists[0]!.ticket, tie: false };
  }
  const highest = Math.max(...showdown.finalists.map((finalist) => finalist.duelPoints));
  const leaders = showdown.finalists.filter((finalist) => finalist.duelPoints === highest);
  return { ...showdown, stage: 'result', winner: leaders.length === 1 ? leaders[0]!.ticket : null, tie: leaders.length !== 1 };
}

/**
 * One step forward on the stage, for a presenter advance and for the end of the 3-2-1 into question 1
 * alike. Both countdown stamps end here, so neither can outlive the beat it belongs to.
 */
function advanceStage(state: GameState): GameState {
  const moved = stepStageForward(state);
  if (moved.introCountdownAt === null && moved.introLandedAt === null) return moved;
  return { ...moved, introCountdownAt: null, introLandedAt: null };
}

function stepStageForward(state: GameState): GameState {
  if (state.phase === 'showdown') return advanceShowdown(state);
  if (state.phase === 'closing') return { ...state, closingAdvanceStep: state.closingAdvanceStep + 1 };
  if (state.phase === 'outro') return state;
  const next = advance(state as unknown as EngineGameState);
  if (next?.phase === 'revealed') {
    if (shouldLockBeforeReveal(state)) return lockVotes(state);
    return { ...state, ...settleCurrentQuestion(state) };
  }
  if (next?.phase === 'closing') return enterShowdown({ ...state, ...next } as GameState);
  if (!next) return state;
  const candidate = { ...state, ...next } as GameState;
  return next.phase === 'entering' && next.slideIndex !== undefined
    ? rearmQuestion(candidate)
    : candidate;
}

function advanceShowdown(state: GameState): GameState {
  const showdown = state.showdown;
  if (!showdown) return { ...clearPresenterArm(state), phase: 'closing' as GamePhase };
  if (showdown.stage === 'lineup') {
    if (shouldGuardShowdownAdvance({
      phase: state.phase,
      stage: showdown.stage,
      finalistCount: showdown.finalists.length,
      phonesJoined: Object.keys(state.seenDevices).length,
      predictionCount: Object.keys(showdown.predictions).length,
    })) {
      return armOrCommit(state, 'showdown', (next) => ({
        ...next,
        showdown: next.showdown?.finalists.length === 1
          ? withShowdownResult(next.showdown)
          : { ...next.showdown!, stage: 'duel' as const },
      }));
    }
    return { ...clearPresenterArm(state), showdown: showdown.finalists.length === 1 ? withShowdownResult(showdown) : { ...showdown, stage: 'duel' } };
  }
  if (showdown.stage === 'duel') return { ...clearPresenterArm(state), showdown: withShowdownResult(showdown) };
  return { ...clearPresenterArm(state), phase: 'closing' as GamePhase };
}

function skipCurrentQuestion(state: GameState): GameState {
  const skipQId = state.run?.[state.slideIndex]?.id;
  const skipQuestions = state.session?.questions?.map((q: any) =>
    q.questionId === skipQId ? { ...q, skipped: true } : q
  ) || [];
  const nextSlide = state.run?.[state.slideIndex + 1];
  if (state.slideIndex >= state.run.length - 1 || isTerminalSlide(nextSlide)) {
    const ended = {
      ...clearPresenterArm(state),
      votesLocked: true,
      timer: stoppedTimer(state.timer),
      session: { ...state.session, questions: skipQuestions },
    };
    return enterShowdown(ended);
  }
  return rearmQuestion({
    ...clearPresenterArm(state),
    slideIndex: state.slideIndex + 1,
    phase: 'entering' as GamePhase,
    session: { ...state.session, questions: skipQuestions },
  });
}

function backShowdown(state: GameState): GameState {
  if (!state.showdown || state.phase !== 'showdown') return state;
  if (state.showdown.stage === 'result' && state.showdown.finalists.length > 1) {
    return { ...state, showdown: { ...state.showdown, stage: 'duel', winner: null, tie: false } };
  }
  if (state.showdown.stage === 'result' && state.showdown.finalists.length === 1) {
    return { ...state, showdown: { ...state.showdown, stage: 'lineup', winner: null, tie: false } };
  }
  if (state.showdown.stage === 'duel') return { ...state, showdown: { ...state.showdown, stage: 'lineup' } };
  return state;
}

function validatedShowdown(value: unknown): GameShowdownState | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== 'string' || candidate.id.length === 0 || !['lineup', 'duel', 'result'].includes(candidate.stage)) return null;
  if (!Array.isArray(candidate.finalists) || candidate.finalists.length < 1 || candidate.finalists.length > 2) return null;
  const finalists: ShowdownFinalist[] = [];
  for (const rawFinalist of candidate.finalists) {
    const finalist = record(rawFinalist);
    if (!finalist || typeof finalist.ticket !== 'string' || !finalist.ticket || typeof finalist.name !== 'string' || !finalist.name.trim() || !Number.isFinite(finalist.score) || !Number.isFinite(finalist.duelPoints)) return null;
    finalists.push({ ticket: finalist.ticket, name: finalist.name, score: Number(finalist.score), duelPoints: Math.max(0, Number(finalist.duelPoints)) });
  }
  const tickets = new Set(finalists.map((finalist) => finalist.ticket));
  if (tickets.size !== finalists.length) return null;
  const predictions: Record<string, string> = {};
  const rawPredictions = record(candidate.predictions);
  if (!rawPredictions) return null;
  for (const [deviceId, ticket] of Object.entries(rawPredictions)) {
    if (!deviceId || typeof ticket !== 'string' || !tickets.has(ticket)) return null;
    predictions[deviceId] = ticket;
  }
  const predictionCounts = Object.fromEntries(finalists.map((finalist) => [
    finalist.ticket,
    Object.values(predictions).filter((ticket) => ticket === finalist.ticket).length,
  ]));
  if (!Array.isArray(candidate.questionIds) || candidate.questionIds.some((id) => typeof id !== 'string')) return null;
  const questionIds = candidate.questionIds.slice(0, 2) as string[];
  const questionIndex = Number.isInteger(candidate.questionIndex)
    ? Math.min(Math.max(Number(candidate.questionIndex), 0), Math.max(questionIds.length - 1, 0))
    : 0;
  const winner = candidate.winner === null || (typeof candidate.winner === 'string' && tickets.has(candidate.winner)) ? candidate.winner as string | null : null;
  return {
    id: candidate.id,
    stage: candidate.stage as GameShowdownState['stage'],
    finalists,
    predictions,
    predictionCounts,
    questionIds,
    questionIndex,
    winner,
    tie: candidate.tie === true,
    isRecap: candidate.isRecap === true,
  };
}

function validatedQuestionStats(value: unknown): QuestionStats | null {
  const q = record(value);
  if (!q || !validWholeNumber(q.trueCount) || !validWholeNumber(q.falseCount) || !Number.isFinite(q.correctPct)
    || typeof q.majorityWrong !== 'boolean') return null;
  const stats: QuestionStats = {
    trueCount: Number(q.trueCount),
    falseCount: Number(q.falseCount),
    correctPct: Number(q.correctPct),
    majorityWrong: q.majorityWrong,
  };
  if (typeof q.kind === 'string') stats.kind = q.kind as QuestionStats['kind'];
  const rawChoices = record(q.choices);
  if (rawChoices) {
    const choices: Record<string, number> = {};
    for (const [token, count] of Object.entries(rawChoices)) {
      if (safeKey(token) && Number.isFinite(count)) choices[token] = Number(count);
    }
    stats.choices = choices;
  }
  if (validWholeNumber(q.certainCount)) stats.certainCount = Number(q.certainCount);
  if (validWholeNumber(q.certainWrongCount)) stats.certainWrongCount = Number(q.certainWrongCount);
  if (Number.isFinite(q.confidentlyWrongPct)) stats.confidentlyWrongPct = Number(q.confidentlyWrongPct);
  return stats;
}

function validatedRoomStatsTeam(value: unknown): { phones: number; score: number; accuracy: number } | undefined {
  const team = record(value);
  if (!team || !Number.isFinite(team.phones) || !Number.isFinite(team.score) || !Number.isFinite(team.accuracy)) return undefined;
  return { phones: Number(team.phones), score: Number(team.score), accuracy: Number(team.accuracy) };
}

/**
 * Mirrors the validatedSeenDevices / validatedPollVoters / validatedShowdown pattern: a corrupted
 * or hand-edited roomStats snapshot drops only its malformed nested entries (a bad question or
 * device) rather than passing the whole object through raw, and a fundamentally malformed snapshot
 * falls back to the live roomStats instead of admitting garbage top-level fields (QA-PERSIST-01).
 */
function validatedRoomStats(value: unknown): RoomStatsState | null {
  const candidate = record(value);
  if (!candidate) return null;
  const rawQuestions = record(candidate.questions);
  if (!rawQuestions) return null;
  if (!Number.isFinite(candidate.accuracy)) return null;
  // A counter that a later build added is absent from an older snapshot, not corrupt, so it reads as 0.
  // A counter that is present but not a finite number is garbage, and the whole snapshot is rejected.
  const counter = (raw: unknown): number | null => (raw === undefined ? 0 : Number.isFinite(raw) ? Number(raw) : null);
  const streak = counter(candidate.streak);
  const bestStreak = counter(candidate.bestStreak);
  const mythsBusted = counter(candidate.mythsBusted);
  const swing = counter(candidate.swing);
  const certainTotal = counter(candidate.certainTotal);
  const certainWrongTotal = counter(candidate.certainWrongTotal);
  const votesTotal = counter(candidate.votesTotal);
  if (streak === null || bestStreak === null || mythsBusted === null || swing === null
    || certainTotal === null || certainWrongTotal === null || votesTotal === null) return null;

  const questions: Record<string, QuestionStats> = {};
  for (const [questionId, rawStats] of Object.entries(rawQuestions)) {
    if (!safeKey(questionId)) continue;
    const stats = validatedQuestionStats(rawStats);
    if (stats) questions[questionId] = stats;
  }

  const roomStats: RoomStatsState = {
    questions,
    accuracy: Number(candidate.accuracy),
    streak,
    bestStreak,
    mythsBusted,
    swing,
    certainTotal,
    certainWrongTotal,
    votesTotal,
  };

  const devices = validatedSeenDevices(candidate.devices);
  if (devices) roomStats.devices = devices as unknown as Record<string, Participant>;

  const rawTeams = record(candidate.teams);
  if (rawTeams) {
    const navy = validatedRoomStatsTeam(rawTeams.NAVY);
    const gold = validatedRoomStatsTeam(rawTeams.GOLD);
    if (navy || gold) roomStats.teams = { ...(navy ? { NAVY: navy } : {}), ...(gold ? { GOLD: gold } : {}) };
  }

  return roomStats;
}

function restoredTimer(value: unknown, fallback: TimerWithDeadline): { timer: TimerWithDeadline; expired: boolean } {
  const candidate = record(value);
  if (!candidate || !Number.isFinite(candidate.durationMs) || !Number.isFinite(candidate.remainingMs)) {
    return { timer: fallback, expired: false };
  }
  const running = candidate.running === true;
  const endsAt = Number.isFinite(candidate.endsAt) ? Number(candidate.endsAt) : null;
  if (running && (!endsAt || endsAt <= Date.now())) {
    return { timer: { ...fallback, ...candidate, remainingMs: 0, running: false, endsAt: null, pauseReason: 'timedOut' }, expired: true };
  }
  return {
    timer: {
      ...fallback,
      ...candidate,
      remainingMs: Math.max(0, Number(candidate.remainingMs)),
      running: running && endsAt !== null,
      endsAt,
      pauseReason: running && endsAt !== null ? null : (candidate.pauseReason ?? 'manual'),
    },
    expired: false,
  };
}

function mergePersistedGameState(persistedState: unknown, currentState: GameState): GameState {
  const persisted = record(persistedState);
  if (!persisted) return currentState;
  if (Array.isArray(persisted.run) && (persisted.run.length === 0 || !Array.from(persisted.run).every(isRestorableSlide))) return currentState;
  const persistedRun = Array.isArray(persisted.run) ? persisted.run as SlideEntry[] : null;
  const sourceRun = persistedRun && persistedRun.length > 0 ? persistedRun : currentState.run;
  const run = playerVisibleRun(sourceRun);
  // A withdrawn-only saved run has no valid question to resume. Recover the
  // normal setup instead of restoring an entering phase with index -1.
  if (run.length === 0) return currentState;
  const requestedIndex = Number.isInteger(persisted.slideIndex) ? Number(persisted.slideIndex) : currentState.slideIndex;
  const slideIndex = playerVisibleRunIndex(sourceRun, requestedIndex);
  const restored = restoredTimer(persisted.timer, currentState.timer);
  let phase = typeof persisted.phase === 'string' && [
    'deckPicker', 'formatPicker', 'modePicker', 'preFlight', 'lobby', 'entering', 'deliberating', 'timedOut', 'locked', 'revealed', 'explaining', 'leaderboard', 'closing', 'outro', 'fork', 'showdown',
  ].includes(persisted.phase) ? persisted.phase as GamePhase : currentState.phase;
  const showdown = validatedShowdown(persisted.showdown);
  const restoredModeId = typeof persisted.modeId === 'string' && persisted.modeId.length > 0 ? persisted.modeId : currentState.modeId;
  const restoredPresetId = typeof persisted.activePresetId === 'string' && persisted.activePresetId.length > 0
    ? persisted.activePresetId
    : currentState.activePresetId;
  if (phase === 'fork') phase = slideIndex >= 0 ? 'entering' as GamePhase : 'lobby' as GamePhase;
  if (phase === 'showdown' && (!showdown || !showdownPlayable({ modeId: restoredModeId, activePresetId: restoredPresetId }))) {
    phase = 'closing' as GamePhase;
  }
  if (phase === 'leaderboard' && persisted.leaderboardEnabled === false) phase = 'explaining' as GamePhase;
  const sessionId = typeof persisted.sessionId === 'string' && persisted.sessionId.length > 0 ? persisted.sessionId : currentState.sessionId;
  const settledQuestionInstances = Object.fromEntries(Object.entries(record(persisted.settledQuestionInstances) ?? currentState.settledQuestionInstances)
    .filter(([key, value]) => safeKey(key) && value === true)) as GameState['settledQuestionInstances'];
  const merged: GameState = {
    ...currentState,
    sessionId,
    formatId: typeof persisted.formatId === 'string' && ['widescreen', 'square', 'portrait'].includes(persisted.formatId) ? persisted.formatId as FormatId : currentState.formatId,
    teamsEnabled: typeof persisted.teamsEnabled === 'boolean' ? persisted.teamsEnabled : currentState.teamsEnabled,
    twoTeams: typeof persisted.twoTeams === 'boolean' ? persisted.twoTeams : currentState.twoTeams,
    leaderboardEnabled: typeof persisted.leaderboardEnabled === 'boolean' ? persisted.leaderboardEnabled : currentState.leaderboardEnabled,
    interactionMode: persisted.interactionMode === 'polling' || persisted.interactionMode === 'facilitator'
      ? persisted.interactionMode
      : currentState.interactionMode,
    offlineMode: typeof persisted.offlineMode === 'boolean' ? persisted.offlineMode : currentState.offlineMode,
    modeId: restoredModeId,
    run,
    slideIndex,
    phase,
    selectedDeckId: typeof persisted.selectedDeckId === 'string' && persisted.selectedDeckId.length > 0 ? persisted.selectedDeckId : currentState.selectedDeckId,
    deckId: typeof persisted.deckId === 'string' && persisted.deckId.length > 0 ? persisted.deckId : currentState.deckId,
    pollVotes: validatedPollVotes(persisted.pollVotes) ?? currentState.pollVotes,
    pollVoters: validatedPollVoters(persisted.pollVoters) ?? currentState.pollVoters,
    seenDevices: validatedSeenDevices(persisted.seenDevices) ?? currentState.seenDevices,
    reactions: record(persisted.reactions) ?? currentState.reactions,
    reactionReceipts: validatedReactionReceipts(persisted.reactionReceipts) ?? currentState.reactionReceipts,
    reactionTickerEnabled: typeof persisted.reactionTickerEnabled === 'boolean'
      ? persisted.reactionTickerEnabled
      : typeof persisted.stageReactionsEnabled === 'boolean'
        ? persisted.stageReactionsEnabled
        : currentState.reactionTickerEnabled,
    stageReactionsEnabled: typeof persisted.stageReactionsEnabled === 'boolean'
      ? persisted.stageReactionsEnabled
      : typeof persisted.reactionTickerEnabled === 'boolean'
        ? persisted.reactionTickerEnabled
        : currentState.stageReactionsEnabled,
    settledQuestionInstances: remapRestoredOccurrences(settledQuestionInstances, sourceRun, sessionId),
    settledResults: remapRestoredOccurrences(validatedSettledResults(persisted.settledResults) ?? currentState.settledResults, sourceRun, sessionId),
    orderScrambles: remapRestoredOccurrences(
      validatedOrderScrambles(persisted.orderScrambles, orderStepCountsByOccurrence(sourceRun, sessionId)) ?? currentState.orderScrambles,
      sourceRun,
      sessionId,
    ),
    roomStats: validatedRoomStats(persisted.roomStats) ?? currentState.roomStats,
    showdownEnabled: isSetupPhase(phase) || !showdownPlayable({ modeId: restoredModeId, activePresetId: restoredPresetId })
      ? false
      : persisted.showdownEnabled === true,
    showdown: showdownPlayable({ modeId: restoredModeId, activePresetId: restoredPresetId }) ? showdown : null,
    startTime: typeof persisted.startTime === 'string' || typeof persisted.startTime === 'number'
      ? persisted.startTime
      : currentState.startTime,
    votesLocked: restored.expired || persisted.votesLocked === true,
    timer: restored.timer,
    activePresetId: typeof persisted.activePresetId === 'string' && persisted.activePresetId.length > 0
      ? persisted.activePresetId
      : currentState.activePresetId,
  };
  // Previous hosts defaulted to the 12-Q Quick demo. A setup tab that never
  // picked a preset upgrades to Curated 8 so Open the lobby is the meeting path.
  if (isSetupPhase(merged.phase) && persisted.modeId === 'demo' && persisted.activePresetId == null) {
    merged.modeId = 'curated8';
    merged.run = currentState.run;
    merged.timer = currentState.timer;
    merged.activePresetId = currentState.activePresetId;
    merged.formatId = currentState.formatId;
    merged.showdownEnabled = false;
    merged.leaderboardEnabled = currentState.leaderboardEnabled;
  }
  const removedCurrent = sourceRun[requestedIndex]
    && (isParticipantInterlude(sourceRun[requestedIndex]) || isHeldBundledQuestion(sourceRun[requestedIndex]));
  if (removedCurrent && ['entering', 'deliberating', 'timedOut', 'locked', 'revealed', 'explaining', 'leaderboard'].includes(phase)) {
    const replacement = rearmQuestion({ ...merged, phase: 'entering' });
    const occurrence = getQuestionInstanceId(replacement);
    return withArmedOrderScramble(occurrence && replacement.settledQuestionInstances[occurrence]
      ? { ...replacement, phase: 'revealed', votesLocked: true, timer: stoppedTimer(replacement.timer) }
      : replacement);
  }
  return withArmedOrderScramble(merged.votesLocked || !canRunQuestionTimer(merged)
    ? { ...merged, timer: stoppedTimer(merged.timer) }
    : merged);
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
  sessionId: createSessionId(),
  formatId: 'widescreen' as FormatId,
  modeId: DEFAULT_MODE_ID,
  run: defaultFullRun(),
  slideIndex: -1,
  phase: 'modePicker' as GamePhase,
  availableDecks: [],
  selectedDeckId: DEFAULT_DECK_ID,
  deckId: DEFAULT_DECK_ID,
  discussionEnabled: true,
  discussionSeconds: 0,
  discussionTimer: null,
  // Teams is the setup default (VOF-08 / VOF-25), so a fresh host starts with phone voting on.
  interactionMode: 'polling' as InteractionMode,
  offlineMode: false,
  // W4 (premium-host pass 2), corrected WARNING-1 (premium-host-fix-3): a counter Closing.tsx
  // watches to turn its offline recap pager forward from the facilitator advance, not clicks
  // alone. The phone remote cannot pair while the venue is offline (no relay), so this is
  // keyboard and clicker only, never the remote. ADVANCE no-ops on 'closing' in slide terms, so
  // this is the one piece of that no-op it now carries.
  closingAdvanceStep: 0,
  introCountdownAt: null,
  introLandedAt: null,
  // WARNING-1 (premium-host-fix-3): the BACK-side counterpart. Closing phase intercepts BACK
  // entirely (see the reducer's 'closing' branch below) so a mid-pager Back turns the page
  // instead of leaving the closing screen. Page 1 re-dispatches BACK_FROM_CLOSING for the
  // original navigation.
  closingBackStep: 0,
  pollVotes: {},
  pollVoters: {},
  teamsEnabled: false,
  twoTeams: false,
  leaderboardEnabled: true,
  reactions: {},
  reactionTickerEnabled: true,
  stageReactionsEnabled: true,
  reasons: {},
  comments: {},
  commentsEnabled: false,
  reactionMoment: null,
  commitments: {},
  halftimeEnabled: false,
  lightningRoundEnabled: false,
  bossQuestionEnabled: false,
  bossBusted: null,
  ghost: null,
  ghostOptions: [],
  predictEnabled: false,
  doubleDownEnabled: false,
  predictions: {},
  doubles: {},
  makeTheCaseEnabled: false,
  volunteers: {},
  theCase: null,
  bountyEnabled: false,
  bounty: { counts: {}, devices: {}, total: 0 },
  forksEnabled: false,
  forks: {},
  showdownEnabled: false,
  showdown: null,
  consensusPct: 80,
  convictionEnabled: true,
  join: { role: false, years: false, site: false },
  presets: [],
  presetsAvailable: false,
  activePresetId: DEFAULT_PRESET_ID,
  talkSeconds: null,
  voting: { questionId: null, window: 'open', firstSplit: null, finalSplit: null, switched: 0, firstVoters: null, talkStartedAt: null, talkEndsAt: null, talkSeconds: 45 },
  roomStats: { questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0, swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0 },
  remoteSessionId: null,
  remoteKey: null,
  liveOrigin: null,
  liveStatus: null,
  timer: timerForBuiltInPreset(DEFAULT_PRESET_ID, initialTimer),
  readinessGeneration: 0,
  hud: { visible: false, pinnedByFocus: false, suppressed: false },
  help: { open: false, returnFocusId: null },
  restartRunConfirmationOpen: false,
  seenDevices: {},
  settledQuestionInstances: {},
  settledResults: {},
  session: { room: null, deckId: "flagship", startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
  startTime: null,
  rehearsal: false,
  phonesPresent: 0,
  posedAt: null,
  revealedAt: null,
  lowerThird: null,
  caption: null,
  captionExpiresAt: null,
  votesLocked: false,
  broadcasting: false,
  parkedNotice: false,
  parkedAt: null,
  presenterArm: null,
  reactionReceipts: {},
  orderScrambles: {},

  dispatch: (action: GameAction) => set((state) => {
    switch (action.type) {
      case 'SELECT_FORMAT': return { ...state, formatId: action.formatId };
      case 'SELECT_MODE': {
        const modeId = action.modeId ?? null;
        const deckId = bundledDeckIdFor(state);
        const modeRun = bundledRunForMode(deckId, modeId);
        if (!modeRun) return refuseUnplayableShowdown({ ...state, modeId });
        return refuseUnplayableShowdown({
          ...state,
          modeId,
          selectedDeckId: deckId,
          deckId,
          run: modeRun,
          timer: timerForMode({ selectedDeckId: deckId, deckId, modeId, timer: state.timer }),
        });
      }
      case 'READY': return state;
      case 'BEGIN_DELIBERATION': {
        if (state.phase !== 'entering' || state.votesLocked || !canRunQuestionTimer(state)
          || action.questionInstanceId !== getQuestionInstanceId(state)) return state;
        const running = state.timer.enabled && state.timer.remainingMs > 0;
        return { ...state, phase: 'deliberating' as GamePhase, timer: {
          ...state.timer,
          running,
          pauseReason: running ? null : state.timer.pauseReason,
          endsAt: running ? state.timer.endsAt ?? Date.now() + state.timer.remainingMs : null,
        } };
      }
      case 'TOGGLE_AUDIO': {
        useAudioStore.getState().toggleMute();
        return state;
      }
      case 'ADVANCE': {
        const now = Date.now();
        // VOF-88: the first press on the instructions starts the 3-2-1, and a press during it skips
        // straight into question 1, the same step the count itself ends with. Only the keyboard
        // debounces a double press (300 ms), so a double-click on the HUD skips the count, which is
        // harmless: question 1 simply lands at once, as it did before the count existed.
        if (isIntroCountdownBeat(state) && !isIntroCountdownRunning(state.introCountdownAt, now)) {
          return { ...state, introCountdownAt: now };
        }
        if (isWithin(state.introLandedAt, now, INTRO_LANDING_GRACE_MS)) return state;
        return advanceStage(state);
      }
      case 'FINISH_INTRO_COUNTDOWN':
        return state.introCountdownAt === action.startedAt && isIntroCountdownBeat(state)
          ? { ...advanceStage(state), introLandedAt: Date.now() }
          : state;
      case 'REVEAL': {
        if (!canReveal(state)) return state;
        return { ...state, ...settleCurrentQuestion(state) };
      }
      case 'RESET': return { 
        ...state, 
        sessionId: createSessionId(),
        run: playerVisibleRun(state.run).length > 0 ? playerVisibleRun(state.run) : defaultFullRun(),
        modeId: state.modeId ?? DEFAULT_MODE_ID,
        selectedDeckId: state.selectedDeckId ?? DEFAULT_DECK_ID,
        deckId: state.deckId ?? DEFAULT_DECK_ID,
        slideIndex: -1,
        phase: 'modePicker' as GamePhase,
        introCountdownAt: null,
        introLandedAt: null,
        pollVotes: {},
        pollVoters: {},
        seenDevices: {},
        settledQuestionInstances: {},
        settledResults: {},
        orderScrambles: {},
        showdown: null,
        presenterArm: null,
        reactions: {},
        reactionReceipts: {},
        reactionMoment: null,
        roomStats: { questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0, swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0 },
        session: { room: null, deckId: DEFAULT_DECK_ID, startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
        timer: { ...initialTimer, ...authoredTimerPatch({ selectedDeckId: state.selectedDeckId ?? DEFAULT_DECK_ID, deckId: state.deckId ?? DEFAULT_DECK_ID, modeId: state.modeId ?? DEFAULT_MODE_ID }) },
        voting: { questionId: null, window: 'open', firstSplit: null, finalSplit: null, switched: 0, firstVoters: null, talkStartedAt: null, talkEndsAt: null, talkSeconds: 45 }
      };
      case 'BACK': {
        // VOF-88: Back during the 3-2-1 stops the count and stays on the instructions.
        if (isIntroCountdownBeat(state) && isIntroCountdownRunning(state.introCountdownAt, Date.now())) {
          return { ...state, introCountdownAt: null };
        }
        if (state.phase === 'showdown') {
          const previousStage = backShowdown(state);
          return previousStage === state
            ? runBackTransition(state)
            : clearPresenterArm(previousStage);
        }
        // WARNING-1 (premium-host-fix-3), narrowed BLOCKER-2 (premium-host-fix-4): while the
        // offline recap pager is up, BACK turns the page instead of leaving closing outright.
        // Closing.tsx watches closingBackStep. If the pager still has a previous page, it turns
        // it locally. On page 1, it re-dispatches BACK_FROM_CLOSING to run the transition below.
        // Keyboard and clicker both flow through this one dispatch (Keyboard.tsx's
        // mapKeyboardEvent), so this one branch covers both. Scoped to offlineMode: the pager
        // only ever renders offline (Closing.tsx's own offlineMode ? ... branch), so intercepting
        // BACK for every venue during closing ate a real Back on online and in-room Closing,
        // which has no pager to turn and needs BACK's ordinary meaning.
        if (state.phase === 'closing' && state.offlineMode) return { ...state, closingBackStep: state.closingBackStep + 1 };
        return runBackTransition(state);
      }
      case 'BACK_FROM_CLOSING':
        return runBackTransition(state);
      case 'TIME_EXPIRED': return { 
        ...state, 
        votesLocked: true, 
        timer: { ...state.timer, remainingMs: 0, running: false, pauseReason: 'timedOut' as const } 
      };
      case 'TOGGLE_HALFTIME': return { ...state, halftimeEnabled: !state.halftimeEnabled };
      case 'TOGGLE_LIGHTNING_ROUND': return { ...state, lightningRoundEnabled: !state.lightningRoundEnabled };
      case 'TOGGLE_BOSS_QUESTION': return { ...state, bossQuestionEnabled: !state.bossQuestionEnabled };
      case 'SET_GHOST_OPTIONS': return { ...state, ghostOptions: action.options || [] };
      case 'SET_GHOST': return { ...state, ghost: action.ghost };
      case 'CLEAR_GHOST': return { ...state, ghost: null };
      case 'DISMISS_BOSS_MOMENT': return state.bossBusted ? { ...state, bossBusted: { ...state.bossBusted, shown: true } } : state;
      case 'RESTART_TIMER': return canRunQuestionTimer(state)
        ? { ...state, phase: 'deliberating' as GamePhase, timer: { ...state.timer, remainingMs: state.timer.durationMs, running: true, enabled: true, visible: true, pauseReason: null, endsAt: Date.now() + state.timer.durationMs }, votesLocked: false }
        : state;
      case 'TOGGLE_PAUSE': {
        if (state.phase === 'showdown' && state.showdown?.stage === 'duel') {
          return { ...state, timer: stoppedTimer(state.timer, state.timer.pauseReason === 'manual' ? 'revealed' : 'manual') };
        }
        if (!canRunQuestionTimer(state) || state.votesLocked || !state.timer.enabled) return state;
        if (state.timer.remainingMs <= 0 && !state.timer.running) return state;
        const running = !state.timer.running;
        return { ...state, timer: { ...state.timer, running, pauseReason: running ? null : 'manual', endsAt: running ? Date.now() + state.timer.remainingMs : null } };
      }
      case 'ADD_TIME': {
        if (isSetupPhase(state.phase) || !canRunQuestionTimer(state)) return state;
        const addMs = action.amountMs ?? (action.seconds ? action.seconds * 1000 : 15_000);
        const nextRemaining = state.timer.remainingMs + addMs;
        return {
          ...state,
          timer: {
            ...state.timer,
            remainingMs: nextRemaining,
            pauseReason: state.timer.pauseReason === 'timedOut' ? 'manual' : state.timer.pauseReason,
            endsAt: state.timer.running ? Date.now() + nextRemaining : state.timer.endsAt,
          },
          ...(nextRemaining > 0 && canOpenVotes(state) ? { votesLocked: false } : {}),
        };
      }
      case 'TOGGLE_TIMER': {
        return { ...state, timer: state.timer.enabled
          ? { ...stoppedTimer(state.timer, 'disabled'), enabled: false, visible: false }
          : { ...state.timer, enabled: true, visible: true }
        };
      }
      case 'TICK_TIMER': {
        if (!state.timer.running || state.timer.remainingMs <= 0) return state;
        const delta = action.deltaMs ?? 1000;
        const nextRemaining = Math.max(0, state.timer.remainingMs - delta);
        const isExpired = nextRemaining === 0;
        return {
          ...state,
          timer: {
            ...state.timer,
            remainingMs: nextRemaining,
            running: isExpired ? false : state.timer.running,
            pauseReason: isExpired ? ('timedOut' as const) : state.timer.pauseReason,
            endsAt: isExpired ? null : Date.now() + nextRemaining,
          },
          ...(isExpired ? { votesLocked: true } : {}),
        };
      }
      case 'SET_TIMER': {
        const durationMs = action.durationMs ?? (action.seconds ? action.seconds * 1000 : state.timer.durationMs);
        const remainingMs = action.remainingMs ?? durationMs;
        const running = action.running ?? state.timer.running;
        if (running && (!canRunQuestionTimer(state) || state.votesLocked)) return state;
        return {
          ...state,
          timer: {
            ...state.timer,
            durationMs,
            remainingMs,
            running,
            // PRES-04: a SET_TIMER that says nothing about enabled/visible leaves them alone. The old
            // `?? (enabled || true)` switched the clock on at the first Lock and armed a phantom 30 s
            // countdown on every later question.
            enabled: action.enabled ?? state.timer.enabled,
            visible: action.visible ?? state.timer.visible,
            pauseReason: running ? null : (action.pauseReason ?? state.timer.pauseReason),
            endsAt: running ? Date.now() + remainingMs : null,
          },
        };
      }
      case 'START_TIMER': {
        if (!canRunQuestionTimer(state)) return state;
        const durationMs = action.durationMs ?? (action.seconds ? action.seconds * 1000 : state.timer.durationMs);
        return {
          ...state,
          phase: 'deliberating' as GamePhase,
          votesLocked: false,
          timer: {
            ...state.timer,
            durationMs,
            remainingMs: durationMs,
            running: true,
            enabled: true,
            visible: true,
            pauseReason: null,
            endsAt: Date.now() + durationMs,
          },
        };
      }
      case 'DOCUMENT_HIDDEN': {
        if (!canRunQuestionTimer(state) || state.votesLocked || !state.timer.running) return state;
        return { ...state, timer: { ...state.timer, pauseReason: 'documentHidden', running: false, endsAt: null } };
      }
      case 'DOCUMENT_VISIBLE': {
        if (state.timer.pauseReason !== 'documentHidden' || !canRunQuestionTimer(state) || state.votesLocked || state.timer.remainingMs <= 0) return state;
        return { 
          ...state, 
          timer: { ...state.timer, pauseReason: null, running: true, endsAt: Date.now() + state.timer.remainingMs }
        };
      }
      // VOF-88: opening help or asking to restart stops a running 3-2-1, so question 1 never lands behind a sheet.
      case 'OPEN_HELP': return { ...state, introCountdownAt: null, help: { open: true, returnFocusId: action.returnFocusId } };
      case 'CLOSE_HELP': return { ...state, help: { open: false, returnFocusId: null } };
      case 'HUD_SHOW':
        return { ...state, hud: { ...state.hud, visible: true, suppressed: false } };
      case 'HUD_HIDE':
        return {
          ...state,
          hud: {
            ...state.hud,
            visible: false,
            suppressed: action.suppress ?? true,
            pinnedByFocus: action.releaseFocus ? false : state.hud.pinnedByFocus,
          },
        };
      case 'REQUEST_RESTART_RUN': return { ...state, introCountdownAt: null, restartRunConfirmationOpen: true };
      case 'CONFIRM_RESTART_RUN': {
        const visibleRun = playerVisibleRun(state.run);
        const run = visibleRun.length > 0 ? visibleRun : defaultFullRun();
        const firstPhase: GamePhase = run.length > 0 ? (run[0]!.type === 'closing' ? 'closing' : 'entering') : 'lobby';
        const sessionId = createSessionId();
        // 8.6: this restarts straight into slideIndex 0 without going through rearmQuestion, so an
        // order question landing here needs its own scramble drawn here, or the stage and the first
        // vote decode disagree until the next ADVANCE happens to arm one.
        const firstQuestion = firstPhase === 'entering' && isQuestionSlide(run[0]) ? (run[0] as unknown as Question) : null;
        const firstOccurrence = firstQuestion ? `${sessionId}:0:${firstQuestion.id}` : null;
        return {
          ...state,
          run,
          sessionId,
          restartRunConfirmationOpen: false,
          introCountdownAt: null,
          introLandedAt: null,
          slideIndex: 0,
          phase: firstPhase,
          pollVotes: {},
          pollVoters: {},
          seenDevices: resetParticipantResults(state.seenDevices),
          settledQuestionInstances: {},
          settledResults: {},
          orderScrambles: ensureOrderScramble({}, firstOccurrence, firstQuestion),
          showdown: null,
          votesLocked: false,
          roomStats: { questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0, swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0 },
          timer: { ...initialTimer, ...authoredTimerPatch(state) },
          voting: { questionId: null, window: 'open', firstSplit: null, finalSplit: null, switched: 0, firstVoters: null, talkStartedAt: null, talkEndsAt: null, talkSeconds: 45 },
        };
      }
      case 'CANCEL_RESTART_RUN': return { ...state, restartRunConfirmationOpen: false };
      case 'SELECT_DECK': {
        const requestedId = action.deckId ?? action.id;
        const deck = resolveBundledDeck(requestedId);
        if (!deck) return { ...state, selectedDeckId: requestedId };
        // Keep the presenter's pace when the chosen deck authors it; otherwise land on that deck's default pace.
        const modeId = state.modeId && (state.modeId === REHEARSAL_MODE_ID || (state.modeId === 'curated8' && deck.modes.curated15) || deck.modes[state.modeId]) ? state.modeId : defaultModeId(deck);
        const run = bundledRunForMode(deck.id, modeId) ?? defaultFullRun();
        return {
          ...state,
          selectedDeckId: deck.id,
          deckId: deck.id,
          modeId,
          run,
          timer: timerForMode({ selectedDeckId: deck.id, deckId: deck.id, modeId, timer: state.timer }),
        };
      }
      case 'RETURN_TO_DECK_PICKER': return { ...state, phase: 'deckPicker' as GamePhase };
      case 'ENTER_LOBBY': return { ...state, phase: 'lobby' as GamePhase };
      case 'START_BROADCAST': return { ...state, broadcasting: true };
      case 'CLOSE_OUT': return { ...state, phase: 'closing' as GamePhase, votesLocked: true, timer: stoppedTimer(state.timer) };
      case 'TOGGLE_DISCUSSION': return { ...state, discussionEnabled: !state.discussionEnabled };
      case 'SET_DISCUSSION_SECONDS': return { ...state, discussionSeconds: action.seconds };
      case 'RESET_TO_LOBBY': return { ...state, phase: 'lobby' as GamePhase };
      case 'SET_INTERACTION_MODE': return { ...state, interactionMode: action.mode };
      case 'SET_OFFLINE_MODE': return { ...state, offlineMode: action.enabled };
      case 'RESET_POLL_VOTES': return { ...state, pollVotes: {}, pollVoters: {} };
      case 'LOCK_VOTES': return lockVotes(state);
      case 'TOGGLE_CONVICTION': return { ...state, convictionEnabled: !state.convictionEnabled };
      case 'TOGGLE_JOIN_QUESTION': return { ...state, join: { ...state.join, [action.question]: !state.join[action.question as keyof typeof state.join] } };
      case 'SET_JOIN_QUESTIONS': return { ...state, join: { role: action.join?.role ?? false, years: action.join?.years ?? false, site: action.join?.site ?? false } };
      case 'SET_PRESETS': return { ...state, presets: action.presets, presetsAvailable: action.available !== false };
      case 'SET_TALK_SECONDS': return { ...state, talkSeconds: action.seconds };
      case 'APPLY_PRESET': {
        const preset = action.preset;
        if (preset) {
          const settings: any = record(preset.settings) ?? {};
          if (Array.isArray(settings.run) && !Array.from(settings.run).every(isRestorableSlide)) return state;
          const run = Array.isArray(settings.run)
            ? playerVisibleRun(settings.run as SlideEntry[])
            : state.run;
          if (run.length === 0) return state;
          return refuseUnplayableShowdown({ ...state, activePresetId: preset.id, ...settings, run });
        }
        const presetId = action.presetId;
        const builtIn = presetId ? BUILT_IN_PRESETS[presetId] : undefined;
        if (!presetId || !builtIn) return state;
        const presetDeckId = bundledDeckIdFor(state);
        const run = bundledRunForMode(presetDeckId, builtIn.modeId) ?? state.run;
        return refuseUnplayableShowdown({
          ...state,
          activePresetId: presetId,
          formatId: builtIn.formatId,
          modeId: builtIn.modeId,
          run,
          selectedDeckId: presetDeckId,
          deckId: presetDeckId,
          discussionEnabled: builtIn.discussionEnabled,
          teamsEnabled: builtIn.twoTeams,
          twoTeams: builtIn.twoTeams,
          leaderboardEnabled: builtIn.leaderboardEnabled,
          interactionMode: builtIn.interactionMode,
          ...(typeof builtIn.showdownEnabled === 'boolean' ? { showdownEnabled: builtIn.showdownEnabled } : {}),
          reactionTickerEnabled: builtIn.reactionsEnabled,
          stageReactionsEnabled: builtIn.reactionsEnabled,
          timer: builtIn.timerEnabled
            ? { ...state.timer, ...authoredTimerPatch({ selectedDeckId: presetDeckId, deckId: presetDeckId, modeId: builtIn.modeId }), enabled: true, visible: true }
            : { ...stoppedTimer(state.timer, 'disabled'), ...authoredTimerPatch({ selectedDeckId: presetDeckId, deckId: presetDeckId, modeId: builtIn.modeId }), enabled: false, visible: false },
        });
      }
      case 'SET_CONVICTION_ENABLED': return { ...state, convictionEnabled: action.enabled ?? action.value };
      case 'OPEN_TALK': {
        return { 
          ...state, 
          voting: { 
            ...state.voting, 
            window: 'talk', 
            talkStartedAt: Date.now(),
            talkEndsAt: Date.now() + (state.talkSeconds || 45) * 1000
          } 
        };
      }
      case 'RECORD_VOTE':
      case 'VOTE': {
        // A vote the relay took while this question was still open counts though the host has locked since, up to the reveal
        // (takenWhileOpen, from src/network/host-live-link.ts). Every other vote needs the vote open now.
        const takenWhileOpen = 'takenWhileOpen' in action && action.takenWhileOpen === true;
        if (!acceptsAttendeeInput(state) || (state.votesLocked && !takenWhileOpen) || !['entering', 'deliberating'].includes(state.phase)) return state;
        const question = currentQuestion(state);
        if (!question) return state;
        const questionId = question.id;
        if (action.questionId && action.questionId !== questionId) return state;
        const choice = action.choice ?? action.token;
        if (!isValidVoteToken(choice) || !validChoice(question, choice)) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[game-store] Rejected invalid vote token: "${choice}"`);
          }
          return state;
        }
        const deviceId = action.deviceId ?? action.device ?? 'anonymous';
        
        const newPollVotes = { ...state.pollVotes };
        if (!newPollVotes[questionId]) newPollVotes[questionId] = Object.create(null);
        else newPollVotes[questionId] = { ...newPollVotes[questionId] };
        
        const newPollVoters = { ...state.pollVoters };
        if (!newPollVoters[questionId]) newPollVoters[questionId] = Object.create(null);
        else newPollVoters[questionId] = { ...newPollVoters[questionId] };
        
        const existingVoter = newPollVoters[questionId][deviceId];
        if (existingVoter) {
          const oldChoice = existingVoter.choice;
          if (newPollVotes[questionId][oldChoice]) {
            newPollVotes[questionId][oldChoice]--;
          }
        }
        
        newPollVotes[questionId][choice] = (newPollVotes[questionId][choice] || 0) + 1;
        
        newPollVoters[questionId][deviceId] = { choice, conviction: action.conviction ?? 'fairly-sure', team: action.team };
        return { ...clearPresenterArm(state), pollVotes: newPollVotes, pollVoters: newPollVoters };
      }
      case 'RECORD_HELLO':
      case 'HELLO': {
        const deviceId = action.deviceId ?? action.device;
        if (!deviceId) return state;
        const newSeenDevices = { ...state.seenDevices };
        const previous = newSeenDevices[deviceId];
        const rawNickname = typeof action.nickname === 'string' && action.nickname.trim().length > 0
          ? action.nickname.trim()
          : previous?.nickname?.trim();
        if (!rawNickname || rawNickname.length > 80) return state;
        const nickname = filteredDisplayName(rawNickname);
        newSeenDevices[deviceId] = {
          nickname,
          rawNickname,
          team: action.team ?? previous?.team ?? null,
          score: previous?.score ?? 0,
          answered: previous?.answered ?? 0,
          correct: previous?.correct ?? 0,
          streak: previous?.streak ?? 0,
          bestStreak: previous?.bestStreak ?? 0,
          realityGap: previous?.realityGap ?? 0,
          hardQuestionPoints: previous?.hardQuestionPoints ?? 0,
          joinedAt: previous?.joinedAt ?? Date.now(),
        };
        return { ...state, seenDevices: newSeenDevices };
      }
      case 'RECORD_DROPPED_MESSAGE': return { ...state, session: { ...state.session, droppedMessages: (state.session?.droppedMessages || 0) + 1 } };
      case 'TOGGLE_TEAMS':
      case 'TOGGLE_TWO_TEAMS': return { ...state, teamsEnabled: !(state.twoTeams || state.teamsEnabled), twoTeams: !(state.twoTeams || state.teamsEnabled) };
      case 'SET_TEAMS_ENABLED':
      case 'SET_TWO_TEAMS': return { ...state, teamsEnabled: Boolean(action.enabled ?? action.value), twoTeams: Boolean(action.enabled ?? action.value) };
      case 'TOGGLE_LEADERBOARD': return { ...state, leaderboardEnabled: !state.leaderboardEnabled };
      case 'SET_LEADERBOARD_ENABLED': return { ...state, leaderboardEnabled: Boolean(action.enabled ?? action.value) };
      case 'REACTION':
      case 'RECORD_REACTION': {
        const rawReaction = action.reaction || action.icon;
        if (!rawReaction) return state;
        const receiptDevice = action.deviceId || action.device;
        const reactionKey = canonicalReaction(rawReaction);

        const questionId =
          action.questionId ||
          state.run?.[state.slideIndex]?.id ||
          ((state as any).activeDuelIndex !== undefined ? `duel-${(state as any).activeDuelIndex}` : 'unknown');

        const occurrence = getQuestionInstanceId(state);
        const receiptKey = action.questionInstanceId || occurrence || questionId;
        const receipts = state.reactionReceipts ?? {};
        if (receiptDevice && receipts[receiptKey]?.[receiptDevice]) return state;

        const newReactions = { ...state.reactions };
        const currentQ =
          newReactions[questionId] && typeof newReactions[questionId] === 'object'
            ? { ...newReactions[questionId] }
            : {
                'wait-really': 0,
                'knew-it': 0,
                'we-do-this': 0,
                waitReally: 0,
                knewIt: 0,
                weDoThis: 0,
                total: 0,
              };

        if (reactionKey === 'wait-really') {
          const next = (Number(currentQ['wait-really'] ?? currentQ.waitReally) || 0) + 1;
          currentQ['wait-really'] = next;
          currentQ.waitReally = next;
        } else if (reactionKey === 'knew-it') {
          const next = (Number(currentQ['knew-it'] ?? currentQ.knewIt) || 0) + 1;
          currentQ['knew-it'] = next;
          currentQ.knewIt = next;
        } else if (reactionKey === 'we-do-this') {
          const next = (Number(currentQ['we-do-this'] ?? currentQ.weDoThis) || 0) + 1;
          currentQ['we-do-this'] = next;
          currentQ.weDoThis = next;
        } else {
          currentQ[reactionKey] = (Number(currentQ[reactionKey]) || 0) + 1;
        }
        currentQ.total = (Number(currentQ.total) || 0) + 1;

        newReactions[questionId] = currentQ;
        const reactionReceipts = receiptDevice
          ? {
              ...receipts,
              [receiptKey]: { ...(receipts[receiptKey] ?? {}), [receiptDevice]: reactionKey },
            }
          : receipts;
        // The active footer follows an occurrence. Keep the legacy per-question totals for
        // standalone consumers, while repeated cards and Back read their own received taps.
        const liveOccurrence = occurrence
          && (!action.questionInstanceId || action.questionInstanceId === occurrence)
          && currentQuestion(state)?.id === questionId
          ? occurrence
          : null;
        if (liveOccurrence) {
          const prior = state.reactions[liveOccurrence] ?? {};
          newReactions[liveOccurrence] = {
            ...prior,
            [reactionKey]: (Number(prior[reactionKey]) || 0) + 1,
            total: (Number(prior.total) || 0) + 1,
          };
        }
        const now = Date.now();
        return {
          ...state,
          reactions: newReactions,
          reactionReceipts,
          reactionMoment: liveOccurrence
            ? { reaction: reactionKey, firedAt: now, at: now }
            : state.reactionMoment,
        };
      }
      case 'RECORD_REASON': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const qId = state.run?.[state.slideIndex]?.id ?? 'unknown';
        const newReasons = { ...state.reasons };
        if (!newReasons[qId]) newReasons[qId] = {};
        newReasons[qId][deviceId] = action.reason;
        return { ...state, reasons: newReasons };
      }
      case 'RECORD_COMMENT': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const qId = state.run?.[state.slideIndex]?.id ?? 'unknown';
        const newComments = { ...state.comments };
        if (!newComments[qId]) newComments[qId] = {};
        newComments[qId][deviceId] = action.comment;
        return { ...state, comments: newComments };
      }
      case 'TOGGLE_COMMENTS': return { ...state, commentsEnabled: !state.commentsEnabled };
      case 'SET_COMMENTS_ENABLED': return { ...state, commentsEnabled: Boolean(action.enabled ?? action.value) };
      case 'FIRE_REACTION': {
        const reaction = canonicalReaction(String(action.reaction ?? action.reactionType ?? '').trim());
        if (!reaction) return state;
        const now = Date.now();
        return { ...state, reactionMoment: { reaction, firedAt: now, at: now } };
      }
      case 'DISMISS_REACTION_MOMENT': return { ...state, reactionMoment: null };
      case 'RECORD_COMMITMENT': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const qId = state.run?.[state.slideIndex]?.id ?? 'unknown';
        const newCommitments = { ...state.commitments };
        if (!newCommitments[qId]) newCommitments[qId] = {};
        newCommitments[qId][deviceId] = action.commitment;
        return { ...state, commitments: newCommitments };
      }
      case 'RECORD_PREDICTION': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const newPredictions = { ...state.predictions };
        newPredictions[deviceId] = action.prediction;
        return { ...state, predictions: newPredictions };
      }
      case 'RECORD_DOUBLE': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const occurrence = getQuestionInstanceId(state);
        if (!occurrence || state.votesLocked) return state;
        const newDoubles = { ...state.doubles };
        newDoubles[occurrence] = { ...(newDoubles[occurrence] ?? {}), [deviceId]: action.double === true || action.double === 'true' };
        return { ...state, doubles: newDoubles };
      }
      case 'TOGGLE_PREDICT': return { ...state, predictEnabled: !state.predictEnabled };
      case 'TOGGLE_DOUBLE_DOWN': return { ...state, doubleDownEnabled: !state.doubleDownEnabled };
      case 'VOLUNTEER': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const newVolunteers = { ...state.volunteers };
        newVolunteers[deviceId] = action.volunteer;
        return { ...state, volunteers: newVolunteers };
      }
      case 'PICK_CASE': return { ...state, theCase: action.case };
      case 'TOGGLE_MAKE_THE_CASE': return { ...state, makeTheCaseEnabled: !state.makeTheCaseEnabled };
      case 'RECORD_BOUNTY': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const qId = action.questionId;
        if (!qId) return state;
        const newBounty = { ...state.bounty };
        newBounty.counts = { ...newBounty.counts, [qId]: (newBounty.counts[qId] || 0) + 1 };
        newBounty.devices = { ...newBounty.devices, [deviceId]: qId };
        newBounty.total = (newBounty.total || 0) + 1;
        return { ...state, bounty: newBounty };
      }
      case 'TOGGLE_BOUNTY': return { ...state, bountyEnabled: !state.bountyEnabled };
      case 'RECORD_FORK_VOTE': {
        const deviceId = action.deviceId || action.device || 'anonymous';
        const forkId = action.forkId;
        if (!forkId) return state;
        const newForks = { ...state.forks };
        if (!newForks[forkId]) newForks[forkId] = { votes: {} };
        newForks[forkId].votes[deviceId] = action.choice;
        return { ...state, forks: newForks };
      }
      case 'FORK_PICK': {
        const forkId = action.forkId;
        if (!forkId) return state;
        const newForks = { ...state.forks };
        if (!newForks[forkId]) newForks[forkId] = {};
        newForks[forkId].picked = action.choice;
        return { ...state, forks: newForks };
      }
      case 'TOGGLE_FORKS': return { ...state, forksEnabled: !state.forksEnabled };
      case 'ENTER_SHOWDOWN': return enterShowdown(state);
      case 'ADVANCE_SHOWDOWN': return advanceShowdown(state);
      case 'BACK_SHOWDOWN': return backShowdown(state);
      case 'ADJUST_SHOWDOWN_POINTS': {
        if (!state.showdown || state.showdown.stage !== 'duel' || !Number.isFinite(action.delta)) return state;
        if (!state.showdown.finalists.some((finalist) => finalist.ticket === action.ticket)) return state;
        return {
          ...state,
          showdown: {
            ...state.showdown,
            finalists: state.showdown.finalists.map((finalist) => finalist.ticket === action.ticket
              ? { ...finalist, duelPoints: Math.max(0, finalist.duelPoints + action.delta) }
              : finalist),
          },
        };
      }
      case 'SET_SHOWDOWN_QUESTION': {
        if (!state.showdown || state.showdown.stage !== 'duel' || !Number.isInteger(action.index)) return state;
        const maxIndex = Math.max(state.showdown.questionIds.length - 1, 0);
        return { ...state, showdown: { ...state.showdown, questionIndex: Math.min(Math.max(action.index, 0), maxIndex) } };
      }
      case 'FINISH_SHOWDOWN': return state.showdown?.stage === 'result'
        ? { ...state, phase: 'closing' as GamePhase, votesLocked: true, timer: stoppedTimer(state.timer) }
        : state;
      case 'PREDICT_WINNER': {
        const deviceId = action.deviceId ?? action.device;
        const ticket = action.winner ?? action.ticket;
        const showdown = state.showdown;
        if (!deviceId || !ticket || !showdown || showdown.stage !== 'lineup' || action.showdownId !== showdown.id) return state;
        if (!showdown.finalists.some((finalist) => finalist.ticket === ticket)) return state;
        const predictions = { ...showdown.predictions, [deviceId]: ticket };
        const predictionCounts = Object.fromEntries(showdown.finalists.map((finalist) => [
          finalist.ticket,
          Object.values(predictions).filter((prediction) => prediction === finalist.ticket).length,
        ]));
        return { ...clearPresenterArm(state), showdown: { ...showdown, predictions, predictionCounts } };
      }
      case 'TOGGLE_SHOWDOWN':
        if (!showdownPlayable(state)) return { ...state, showdownEnabled: false };
        return { ...state, showdownEnabled: !state.showdownEnabled };
      case 'SET_CONSENSUS_PCT': return { ...state, consensusPct: action.pct };
      case 'TOGGLE_STAGE_REACTIONS':
      case 'TOGGLE_REACTION_TICKER': return { ...state, reactionTickerEnabled: !(state.reactionTickerEnabled || state.stageReactionsEnabled), stageReactionsEnabled: !(state.reactionTickerEnabled || state.stageReactionsEnabled) };
      case 'SET_STAGE_REACTIONS_ENABLED':
      case 'SET_REACTION_TICKER_ENABLED': return { ...state, reactionTickerEnabled: Boolean(action.enabled ?? action.value), stageReactionsEnabled: Boolean(action.enabled ?? action.value) };
      case 'SET_START_TIME': return { ...state, startTime: action.time };
      case 'SKIP': {
        if (isSetupPhase(state.phase) || state.phase === 'lobby' || state.phase === 'closing' || state.phase === 'outro' || state.phase === 'showdown' || state.phase === 'leaderboard' || !currentQuestion(state)) return state;
        const question = currentQuestion(state);
        const votesIn = question ? Object.keys(state.pollVoters[question.id] ?? {}).length : 0;
        if (shouldGuardSkip({
          offlineMode: state.offlineMode,
          interactionMode: state.interactionMode,
          votesLocked: state.votesLocked,
          phonesJoined: Object.keys(state.seenDevices).length,
          votesIn,
          onQuestion: true,
        })) {
          return armOrCommit(state, 'skip', skipCurrentQuestion);
        }
        return skipCurrentQuestion(state);
      }
      case 'PARK': {
        if (isSetupPhase(state.phase) || state.phase === 'lobby' || state.phase === 'closing' || state.phase === 'outro' || state.phase === 'showdown' || state.phase === 'leaderboard' || !currentQuestion(state)) return state;
        const parkQId = state.run?.[state.slideIndex]?.id;
        if (!parkQId) return state;
        const existing = state.session?.questions ?? [];
        const current = existing.find((q: { questionId?: string; parked?: boolean }) => q.questionId === parkQId);
        const nextParked = !current?.parked;
        const parkQuestions = current
          ? existing.map((q: { questionId?: string; parked?: boolean }) =>
              q.questionId === parkQId ? { ...q, parked: nextParked } : q)
          : [...existing, { questionId: parkQId, parked: nextParked }];
        return {
          ...state,
          parkedNotice: nextParked,
          parkedAt: nextParked ? Date.now() : null,
          session: { ...state.session, questions: parkQuestions },
        };
      }
      case 'CLEAR_PARKED_NOTICE': return { ...state, parkedNotice: false };
      case 'DISMISS_PARKED_NOTICE': return { ...state, parkedNotice: false };
      case 'SET_CAPTION': return { ...state, caption: action.caption };
      case 'CLEAR_CAPTION': return { ...state, caption: null, captionExpiresAt: null };
      case 'SET_LIVE_ORIGIN': return { ...state, liveOrigin: action.origin };
      case 'SET_LIVE_STATUS': return { ...state, liveStatus: action.status };
      default: return state;
    }
  })
}),
{
  name: getGameSessionStorageName(),
    storage: {
      getItem: (name) => {
        try { return JSON.parse(sessionStorage.getItem(name) || 'null'); } catch { return null; }
      },
      setItem: (name, value) => {
        try { sessionStorage.setItem(name, JSON.stringify(value)); } catch {}
      },
      removeItem: (name) => {
        try { sessionStorage.removeItem(name); } catch {}
      },
    },
    partialize: (state) => ({
      sessionId: state.sessionId,
      formatId: state.formatId,
      modeId: state.modeId,
      run: playerVisibleRun(state.run),
      slideIndex: state.slideIndex,
      phase: state.phase,
      selectedDeckId: state.selectedDeckId,
      deckId: state.deckId,
      pollVotes: state.pollVotes,
      pollVoters: state.pollVoters,
      votesLocked: state.votesLocked,
      teamsEnabled: state.teamsEnabled,
      twoTeams: state.twoTeams,
      leaderboardEnabled: state.leaderboardEnabled,
      interactionMode: state.interactionMode,
      offlineMode: state.offlineMode,
      timer: state.timer,
      seenDevices: state.seenDevices,
      reactions: state.reactions,
      reactionReceipts: state.reactionReceipts,
      reactionTickerEnabled: state.reactionTickerEnabled,
      stageReactionsEnabled: state.stageReactionsEnabled,
      settledQuestionInstances: state.settledQuestionInstances,
      settledResults: state.settledResults,
      orderScrambles: state.orderScrambles,
      roomStats: state.roomStats,
      showdownEnabled: state.showdownEnabled,
      showdown: state.showdown,
      startTime: state.startTime,
      activePresetId: state.activePresetId,
    }) as unknown as GameState,
    merge: (persistedState, currentState) => mergePersistedGameState(persistedState, currentState),
  }
)
);
