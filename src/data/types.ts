/**
 * Vax or Fiction? — Platform Port TypeScript Type Definitions
 *
 * Source: Extracted exhaustively from VRC integration engine runtime:
 *   - src/engine/kinds.mjs (question kinds, choice tokens, scoring)
 *   - src/content/deck.mjs (deck collections, modes, groups)
 *   - src/content/validate.mjs (deck schema validation, runtime projection)
 *   - src/engine/reducer.mjs (state machine, actions, aggregates, room stats)
 *   - src/design/formats.mjs (viewport formats, dimensions, compatibility)
 *   - src/design/theme.mjs (theme tokens, contrast pairs, liquid glass)
 *   - src/ui/render.mjs (view models, slide rendering, overlays)
 *   - src/engine/live-link.mjs & phone-link.mjs (live room protocol, phone client)
 *   - src/ui/session-report.mjs (session summaries, calibration, CSV/JSON export)
 *
 * All types represent real, running runtime contracts without approximation.
 */

// ============================================================================
// 1. CORE PRIMITIVES & ENUM UNIONS
// ============================================================================

/**
 * Question kind discriminant union.
 * - 'binary': Traditional True/False verdict prompt.
 * - 'myth-among-three': 3 statements where exactly 1 is false (the myth).
 * - 'estimate': Numeric estimate prompt with tolerance and target value.
 * - 'order': 3 to 6 clinical steps that must be arranged in sequence.
 * - 'which-patient': 2 to 4 clinical cases selecting the best candidate.
 */
export type QuestionKind =
  | "binary"
  | "myth-among-three"
  | "estimate"
  | "order"
  | "which-patient";

/**
 * Question kinds that resolve to a singular right/wrong verdict pad.
 */
export type VerdictKind = "binary" | "myth-among-three" | "which-patient";

/**
 * Choice tokens per question kind:
 * - binary: 'true' | 'false'
 * - myth-among-three: 'a' | 'b' | 'c'
 * - which-patient: 'a' | 'b' | 'c' | 'd'
 * - estimate: 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
 * - order: permutation token string such as 'b-a-c-d'
 */
export type BinaryChoiceToken = "true" | "false";
export type AlphaChoiceToken = "a" | "b" | "c" | "d" | "e" | "f";
export type OrderChoiceToken = string;
export type ChoiceToken = BinaryChoiceToken | AlphaChoiceToken | OrderChoiceToken;

/**
 * Canonical layout families assigned to questions for slide rendering.
 */
export type LayoutFamily =
  | "editorial-split"
  | "numeric-poster"
  | "three-site-map"
  | "comparison"
  | "timeline"
  | "offset-split";

/**
 * Pedagogical role of a question in curriculum delivery.
 */
export type TeachingRole =
  | "misconception"
  | "consequence"
  | "applied"
  | "surprise";

/**
 * Where the facilitator hosts the session.
 * - 'teams': Video call / remote bridge (phones on, join via URL + code).
 * - 'room': In-person presentation (phones on, QR displayed in lobby).
 * - 'offline': Physical hands-up / zero-network mode (no phone scoring/stats).
 */
export type Venue = "teams" | "room" | "offline";

/**
 * Conviction confidence level selected by an attendee on their device.
 */
export type ConvictionLevel = "none" | "hunch" | "fairly-sure" | "certain";

/**
 * The 4 prediction percentage bands for room-prediction mechanics.
 */
export type PredictBand = 0 | 1 | 2 | 3;

/**
 * Two-team competition sides.
 */
export type TeamSide = "NAVY" | "GOLD";

/**
 * Reaction types that attendees can tap on their phone.
 */
export type ReactionType = "wait-really" | "knew-it" | "we-do-this";

/**
 * Demographic 'About You' response fields asked at room join.
 */
export interface DemographicAbout {
  role?: "pharmacist" | "technician" | "intern" | "leader" | "other";
  years?: "under-2" | "2-5" | "5-10" | "over-10";
  site?: "retail" | "clinic" | "hospital" | "other";
}

export type DemographicKey = keyof DemographicAbout;

/**
 * Live WebSocket / pub-sub connection status.
 */
export type LiveStatus = "idle" | "connecting" | "open" | "error" | "closed";

/**
 * Phone routing role extracted from query parameters.
 */
export type PhoneRole = "vote" | "remote" | "recap";

/**
 * Slide types supported in a presentation run.
 */
export type SlideType =
  | "title"
  | "instructions"
  | "question"
  | "focus"
  | "closing"
  | "fork"
  | "showdown";

/**
 * Consensus threshold choices (percentage of agreement to prompt advance).
 */
export type ConsensusPct = 70 | 80 | 90 | 0;

// ============================================================================
// 2. CITATIONS & IMAGE REQUIREMENTS
// ============================================================================

/**
 * Verified peer-reviewed source or institutional guideline citation.
 */
export interface Citation {
  /** Source identifier string, typically publisher prefixed (e.g. 'cdc-mmwr-7245'). */
  id: string;
  /** Publisher name (e.g. 'CDC', 'FDA', 'WHO', 'NLM'). */
  publisher: string;
  /** Concise citation line suitable for slide footer / evidence kicker. */
  shortDisplayLine: string;
  /** ISO date or month string when last verified (e.g. '2026-08' or 'August 2026'). */
  lastVerified?: string;
  /** Alternative accessed date representation. */
  accessedDate?: string;
  /** Display label override for publisher badge. */
  publisherLabel?: string;
  /** Fully-qualified canonical URL to authoritative guideline/evidence. */
  url?: string;
}

/**
 * Image requirement specification defined in the deck manifest.
 */
export interface ImageRequirement {
  /** Unique image identifier (e.g. 'plate-q01', 'plate-care-team'). */
  id: string;
  /** Description of the intended photographic subject for generative prompt or artist. */
  intendedSubject: string;
  /** Compositional focal point and lighting instructions. */
  focalPointIntent: string;
  /** Prompt file name tracking generation asset. */
  promptFilename: string;
  /** If true, treated as purely decorative by accessibility readers. */
  decorative: boolean;
  /** Accessible alt text for screen readers. */
  alt: string;
  /** Question numbers or identifiers referencing this artwork. */
  questionIds: (string | number)[];
  /** Static slide IDs referencing this artwork. */
  slideIds: string[];
}

/**
 * Resolved scene positioning and file path for a format canvas.
 */
export interface NativeScene {
  /** Format-specific image file id (e.g. 'plate-q01-square'). */
  imageId: string | null;
  /** Base scene identifier without format suffix. */
  sceneId: string | null;
  /** CSS positioning object or coordinate anchor. */
  placement: Record<string, unknown> | null;
}

// ============================================================================
// 3. QUESTION DEFINITION & KIND SPECIFICS
// ============================================================================

/**
 * Estimate configuration for numeric estimate questions.
 */
export interface EstimateConfig {
  /** Canonical correct numerical value. */
  value: number;
  /** Unit label (e.g. '%', 'days', 'weeks', 'doses'). */
  unit?: string;
  /** Allowed tolerance (+/-) around the value. */
  tolerance?: number;
  /** Authored choice ranges for device selection cards. */
  ranges?: Array<{
    label: string;
    min: number;
    max: number;
  }>;
}

/**
 * Question model representing a clinical challenge in the deck.
 * Kind-specific fields are optional on the interface to allow generic handling,
 * while specialized narrow shapes are available when kind is narrowed.
 */
export interface Question {
  /** Primary identifier (e.g. 'q01', 'q02'). */
  id: string;
  /** 1-based presentation index within the deck. */
  index?: number;
  /** Question kind discriminant. Defaults to 'binary' if omitted in legacy authoring. */
  kind?: QuestionKind;
  /** A which-patient question whose choices are spoken lines, so it asks which reply is better (the offers deck). */
  reply?: boolean;
  /** Core clinical prompt or statement presented to participants. A which-patient question may carry only a scenario. */
  statement?: string;
  /** Canonical truth value for binary questions. Non-binary kinds carry none (the classic runtime leaves it unset). */
  answer?: boolean;
  /** Clinical evidence reveal text explaining the biological/guideline rationale. */
  reveal: string;
  /** Concise takeaway pearl for retention. */
  takeaway?: string;
  /** Question posed to the room for facilitated discussion. */
  discussionPrompt?: string;
  /** Additional debate starter prompts for active deliberation. */
  debatePrompts?: string[];
  /** Host/facilitator background briefing notes. */
  presenterNote?: string;
  /** Recommended wording for clinicians to practice with patients. */
  patientConversation?: string;
  /** ID linking to an ImageRequirement artwork plate. */
  imageRequirementId?: string;
  /** Array of citation IDs linked to this question. */
  sourceIds?: string[];
  /** Normalized citation objects. */
  citations?: Citation[];
  /** Legacy single source reference or citation object. */
  source?: string | Citation;
  /** Role in curriculum sequence. */
  teachingRole?: TeachingRole;
  /** Clinical scenario text (used in 'which-patient' and complex prompts). */
  scenario?: string;
  /**
   * Whether the scenario card is a real quoted line ('quote') or a narrated third-person case
   * ('narrated'). Only meaningful once a which-patient question also carries a distinct
   * `statement`, so its scenario renders as its own card. Undefined means narrated.
   */
  scenarioVoice?: 'quote' | 'narrated';
  /** Authored reasons (3–4 strings <= 60 chars) participants can tap after voting. */
  reasons?: string[];
  /** Key clinical terms to emphasize (1–3 items). */
  emphasis?: string[];
  /** The deciding words of `reveal` to emphasize, each an exact substring of it (content/editorial/emphasis.json). */
  revealEmphasis?: string[];
  /** The deciding words of `takeaway` to emphasize, each an exact substring of it (content/editorial/emphasis.json). */
  takeawayEmphasis?: string[];
  /** Clinical topic tag (<= 48 chars). */
  topic?: string;
  /** Clinical practice guideline reference tag. */
  guidelineRef?: string;
  /** Focused clinical specialty area. */
  clinicalFocus?: string;

  // Kind-Specific Fields (Optional on Base)
  /**
   * For 'myth-among-three': exactly 3 statements where one is false.
   */
  statements?: [string, string, string] | string[];
  /**
   * For 'myth-among-three': 0-based index (0, 1, or 2) of the myth statement.
   */
  mythIndex?: 0 | 1 | 2;
  /**
   * For 'estimate': numerical value, unit, and range bounds.
   */
  estimate?: EstimateConfig;
  /**
   * For 'order': 3 to 6 chronological steps to sequence.
   */
  steps?: string[];
  /**
   * For 'which-patient': 2 to 4 patient option vignettes.
   */
  choices?: string[];
  /**
   * For 'which-patient': index of the clinically optimal choice.
   */
  bestIndex?: number;
}

/**
 * Question Option representation used for phone buttons and stage tallies.
 */
export interface QuestionOption {
  token: ChoiceToken;
  label: string;
  detail?: string;
  correct?: boolean;
}

// ============================================================================
// 4. SLIDES, MODES & DECK MANIFEST
// ============================================================================

/**
 * Game Mode configuration defining presentation pace and question selection.
 */
export interface GameMode {
  /** Mode key (e.g. 'full', 'curated', 'lightning'). */
  id: string;
  /** Human-readable title (e.g. 'Full Presentation', 'Curated Discussion'). */
  label: string;
  /** Ordered list of question IDs included in this mode. */
  questionIds: string[];
  /** Countdown timer seconds per question slide. */
  timerSeconds: number;
  /** Estimated duration display string (e.g. '25–35 min', '12–15 min'). */
  runtimeLabel: string;
  /** Seconds allowed for discussion post-reveal. */
  revealDiscussionAllowance?: number;
  /** Whether the countdown timer starts automatically on question entry. */
  timerEnabledByDefault: boolean;
  /** Number of questions displayed on HUD chips. */
  displayCount?: number;
}

/**
 * Static non-question slide (title, instructions, closing reflection).
 */
export interface StaticSlide {
  /** Unique slide identifier. */
  id: "title" | "instructions" | "closing" | string;
  /** Slide category. */
  type: "title" | "instructions" | "closing" | "focus" | string;
  /** Header title displayed on slide. */
  title: string;
  /** Body prose or instructional text. */
  body?: string;
  /** Artwork plate requirement ID. */
  imageRequirementId?: string;
  /** Host instructions for this slide. */
  presenterNote?: string;
  /** Clinical pearl takeaway. */
  pearl?: string;
  /** Bullet points for closing or summary. */
  summaryPoints?: string[];
  /** Reference citations. */
  references?: Array<{ label: string; url?: string }>;
  /** If true, renders the intermission halftime leaderboard and stats. */
  halftime?: boolean;
}

/**
 * Focus slide used for thematic chapter transitions and mid-run recap.
 */
export interface FocusSlide {
  id: string;
  groupId: string;
  headline: string;
  body: string;
  imageRequirementId?: string;
  presenterNote?: string;
  halftime?: boolean;
}

/**
 * Entry in the compiled active presentation run.
 */
export interface SlideEntry {
  id: string;
  type: SlideType;
  questionId?: string;
  displayNumber?: number;
  displayCount?: number;
  timerSeconds?: number;
  boss?: boolean;
  bountyBoss?: boolean;
  lightning?: boolean;
  duel?: boolean;
  forkPick?: boolean;
  headline?: string;
  body?: string;
  title?: string;
  imageRequirementId?: string;
  pearl?: string;
  summaryPoints?: string[];
  references?: Array<{ label: string; url?: string }>;
  halftime?: boolean;
}

/**
 * Authored default settings for deck execution.
 */
export interface DeckDefaults {
  conviction?: boolean;
  talkWindowSeconds?: number;
  leaderboard?: boolean;
  commitments?: boolean;
  reactions?: boolean;
}

/**
 * Authoring manifest representing a complete VRC curriculum deck.
 */
export interface Deck {
  id: string;
  version: number;
  contentRevision: string;
  title: string;
  status: "draft" | "published";
  defaultTimerSeconds: number;
  defaults?: DeckDefaults;
  layoutAssignments: Record<string, number[]>;
  imageRequirements: ImageRequirement[];
  staticSlides: StaticSlide[];
  focuses: FocusSlide[];
  groups: Array<{ id: string; questionIds: (string | number)[] }>;
  modes: Record<string, GameMode>;
  modeOrder: string[];
  citations?: Citation[];
  cards?: { true: string; false: string };
  questions: Question[];
}

/**
 * Runtime normalized deck with indexed maps for fast O(1) access.
 */
export interface RuntimeDeck extends Deck {
  questionsById: Record<string, Question>;
  imageRequirementsById?: Record<string, ImageRequirement>;
  staticSlidesById?: Record<string, StaticSlide>;
  focusesById?: Record<string, FocusSlide>;
}

// ============================================================================
// 5. DESIGN SYSTEM, FORMATS & TOKENS
// ============================================================================

export type FormatId = "widescreen" | "square" | "portrait";

/**
 * Exact dimensions and typographic scale constraints per canvas aspect ratio.
 */
export interface FormatMetrics {
  width: number;
  height: number;
  statementFloor: number;
  evidenceFloor: number;
  sourceFloor: number;
}

/**
 * Format compatibility calculation against window viewport.
 */
export interface FormatCompatibility {
  compatible: boolean;
  formatId: FormatId;
  recommendedFormatId: FormatId;
  scale: number;
}

/**
 * High-contrast semantic tokens from the presentation theme.
 */
export interface PresentationTheme {
  canvasNavy: string;
  panelNavy: string;
  textPrimary: string;
  textMuted: string;
  textDim: string;
  hairline: string;
  requiredBoundary: string;
  emphasisRed: string;
  anticipationGold: string;
  verdictTrue: string;
  verdictFalse: string;
  timeWarning: string;
  accentCoral: string;
  accentCobalt: string;
  accentGold: string;
  accentPurple: string;
  accentPink: string;
  accentTeal: string;
  accentOrange: string;
  accentGreen: string;
}

/**
 * Liquid Glass styling tokens for frosted glass panels and specular borders.
 */
export interface LiquidGlassTokens {
  filmOverVoid: string;
  specularRim: string;
  specularRimTruth: string;
  hairlineBorder: string;
  cardBlur: string;
  truthBlur: string;
  borderRadius: string;
  borderRadiusCompact: string;
}

// ============================================================================
// 6. STATE MACHINE: PHASES, TIMERS, VOTING & MECHANICS
// ============================================================================

/**
 * Complete lifecycle states of the engine reducer state machine.
 */
export type GamePhase =
  | "deckPicker"
  | "formatPicker"
  | "modePicker"
  | "preFlight"
  | "lobby"
  | "entering"
  | "deliberating"
  | "timedOut"
  | "locked"
  | "revealed"
  | "explaining"
  | "leaderboard"
  | "closing"
  | "outro"
  | "fork"
  | "showdown";

/**
 * Deliberation voting window state:
 * - 'open': Initial anonymous voting window open.
 * - 'talk': Facilitated discussion window; participants may change vote.
 * - 'locked': Votes frozen; final split established before reveal.
 */
export type VotingWindow = "open" | "talk" | "locked";

/**
 * Facilitation mode:
 * - 'facilitator': Pure presentation mode without audience voting lock.
 * - 'polling': Interactive live audience voting with splits and analytics.
 */
export type InteractionMode = "facilitator" | "polling";

/**
 * Countdown timer state.
 */
export interface TimerState {
  durationMs: number;
  remainingMs: number;
  running: boolean;
  enabled: boolean;
  visible: boolean;
  pauseReason: "manual" | "disabled" | "documentHidden" | "timedOut" | "revealed" | null;
  generation: number;
}

/**
 * Discussion countdown timer active post-reveal.
 */
export interface DiscussionTimerState {
  seconds: number;
  remainingMs: number;
  running: boolean;
}

/**
 * Voting split aggregate of votes cast.
 */
export interface VoteSplit {
  trueCount: number;
  falseCount: number;
  choices?: Record<string, number>;
}

/**
 * Active voting window tracker for the current question.
 */
export interface VotingState {
  questionId: string | null;
  window: VotingWindow;
  firstSplit: VoteSplit | null;
  finalSplit: VoteSplit | null;
  switched: number;
  firstVoters: Record<string, string | { choice: string; conviction?: ConvictionLevel }> | null;
  talkStartedAt: number | null;
  talkEndsAt: number | null;
  talkSeconds: number;
}

/**
 * Lower-third caption broadcast onto the stage.
 */
export interface LowerThirdState {
  text: string;
  expiresAt: number | null;
}

/**
 * HUD navigation overlay state.
 */
export interface HudState {
  visible: boolean;
  pinnedByFocus: boolean;
  suppressed: boolean;
}

/**
 * Help modal overlay state.
 */
export interface HelpState {
  open: boolean;
  returnFocusId: string | null;
}

/**
 * Reaction counts accumulator for a question.
 */
export interface ReactionCounts {
  waitReally: number;
  knewIt: number;
  weDoThis: number;
}

/**
 * Fired reaction moment displayed as a dramatic banner on stage.
 */
export interface ReactionMomentState {
  reaction: string;
  firedAt: number;
  at?: number;
}

/**
 * Author-provided reasons tally for a question.
 */
export interface ReasonsState {
  counts: number[];
}

/**
 * Anonymous moderated audience comments for a question.
 */
export interface CommentsState {
  lines: Array<{ text: string; device?: string; at?: number }>;
}

/**
 * Practice commitment count per question.
 */
export interface CommitmentEntry {
  count: number;
  devices: Record<string, boolean>;
}

/**
 * Boss question bust milestone state.
 */
export interface BossBustedState {
  questionId: string;
  correctPct: number;
  at: number;
  shown?: boolean;
}

/**
 * Ghost room comparison state (prior session benchmark).
 */
export interface GhostState {
  room: string;
  createdAt: number | string | null;
  summary: {
    accuracyPct: number;
    participants?: number;
    mythsBusted?: number;
    streak?: number;
  };
}

export interface GhostOption {
  room: string;
  createdAt: number | string | null;
  summary: {
    accuracyPct: number;
    participants?: number;
    mythsBusted?: number;
    streak?: number;
  };
}

/**
 * Make The Case volunteer and speaking state.
 */
export interface CaseState {
  questionId: string;
  ticket: string;
  nickname: string;
  votersAtStart: Record<string, string | { choice: string }>;
  startedAt: number;
  durationSeconds: number;
}

/**
 * Volunteers queue for Make The Case.
 */
export interface VolunteersState {
  devices: Record<string, { ticket: string; nickname: string; at: number }>;
}

/**
 * Myth bounty vote tracker where participants pick the myth they encounter most.
 */
export interface BountyState {
  counts: Record<string, number>;
  devices: Record<string, string>;
  total: number;
}

/**
 * Pick Your Poison fork choice state.
 */
export interface ForkState {
  votes: Record<string, string>;
  counts: Record<string, number>;
  pick: string | null;
}

/**
 * Post-run showdown duel state for highest-scoring participants.
 */
export interface ShowdownState {
  stage: "intro" | "lineup" | "duel" | "result";
  entrants: Record<string, { nickname: string; score: number; realityGap: number }>;
  duelists: Array<{ ticket: string; device: string; nickname: string; score: number }> | null;
  picks: Record<string, string>;
  pickCounts: Record<string, number>;
  questionIds: string[];
  points: Record<string, number>;
  winner: { ticket: string; nickname: string } | null;
  shared: boolean;
  calledIt: number;
  suddenDeath: boolean;
}

/**
 * Double down bet tracking per question.
 */
export interface DoublesState {
  devices: Set<string> | Record<string, boolean>;
}

/**
 * Room predictions tracking per question.
 */
export interface PredictionsState {
  devices: Record<string, number>;
}

/**
 * Join question configuration toggled during setup.
 */
export interface JoinQuestionsState {
  role: boolean;
  years: boolean;
  site: boolean;
}

/**
 * Setup preset entry for quick facilitation configuration.
 */
export interface PresetEntry {
  id: string;
  name: string;
  savedAt: string | null;
  questionCount: number | null;
}

// ============================================================================
// 7. PARTICIPANT, RESPONSE, ROOM & LIVE WIRE
// ============================================================================

/**
 * Live presentation room connection parameters and status.
 */
export interface Room {
  /** Upper-case room code (e.g. 'VRC-DEMO'). */
  code: string;
  /** Host facilitator private key for remote pairing. */
  remoteKey: string | null;
  /** Origin domain hosting the live pub/sub channel. */
  liveOrigin: string | null;
  /** Connection status. */
  status: LiveStatus | null;
  /** Number of active audience devices connected. */
  phonesPresent: number;
  /** Total cumulative participants recorded. */
  participants: number;
  /** Venue setting. */
  venue?: Venue;
}

/**
 * Registered participant / device state tracked in roomStats.devices.
 */
export interface Participant {
  /** Unique anonymous device token. */
  device: string;
  /** Required participant-entered display name. */
  nickname: string | null;
  /** Two-team affiliation. */
  team: TeamSide | null;
  /** Connection role (audience vote, host remote, or read-only recap). */
  role?: PhoneRole;
  /** Optional demographic self-identification. */
  about?: DemographicAbout | null;
  /** Number of questions answered correctly. */
  correct: number;
  /** Total questions answered. */
  answered: number;
  /** Number of times conviction was marked 'certain'. */
  certain: number;
  /** Gamified conviction points score. */
  score: number;
  /** Reality gap count (votes that were marked certain and wrong). */
  realityGap: number;
  /** Number of times participant moved from wrong first read to correct final vote. */
  openMind?: number;
  /** Total room-reading prediction attempts. */
  predicted?: number;
  /** Successful room-reading predictions. */
  reads?: number;
}

/**
 * Vote or interaction response submitted over the wire by an attendee.
 */
export interface Response {
  device: string;
  questionId: string;
  choice: string;
  conviction?: ConvictionLevel;
  nickname?: string | null;
  team?: TeamSide | null;
  at?: number;
}

/**
 * Individual question record preserved inside Session.questions.
 */
export interface SessionQuestion {
  questionId: string;
  posedAt: number | null;
  revealedAt: number | null;
  leftAt: number | null;
  trueCount: number;
  falseCount: number;
  correctPct: number;
  mythBusted: boolean;
  swing: number;
  switched: number;
  confidentlyWrongPct: number;
  skipped?: boolean;
  parked?: boolean;
  choices?: Record<string, number> | null;
}

/**
 * Session persistence record exported to JSON/CSV for clinical reporting.
 */
export interface Session {
  room: string | null;
  deckId: string;
  startedAt: number | null;
  startedAtEpoch?: number | null;
  questions: SessionQuestion[];
  participants: number;
  droppedMessages: number;
}

/**
 * Question statistics entry within RoomStatsState.
 */
export interface QuestionStats {
  kind?: QuestionKind;
  choices?: Record<string, number>;
  trueCount: number;
  falseCount: number;
  correctPct: number;
  majorityWrong: boolean;
  firstSplit?: VoteSplit;
  finalSplit?: VoteSplit;
  switched?: number;
  swing?: number;
  certainCount?: number;
  certainWrongCount?: number;
  confidentlyWrongPct?: number;
  theCase?: { nickname: string; moved: number };
  doubles?: { count: number; paid: number };
  readsTheRoom?: {
    predictors: number;
    called: number;
    actualPct: number;
    actualBand: number;
  };
}

/**
 * Aggregated analytics for the room across the session.
 */
export interface RoomStatsState {
  questions: Record<string, QuestionStats>;
  accuracy: number;
  streak: number;
  bestStreak: number;
  mythsBusted: number;
  swing: number;
  certainTotal: number;
  certainWrongTotal: number;
  votesTotal: number;
  openMinds?: number;
  readsTheRoom?: { best: number; phones: number } | null;
  devices?: Record<string, Participant>;
  leaderboard?: Array<{ nickname: string; score: number; realityGap: number; team?: TeamSide }>;
  teams?: {
    NAVY?: { phones: number; score: number; accuracy: number };
    GOLD?: { phones: number; score: number; accuracy: number };
  } | null;
}

/**
 * Snapshot of voting voters for a question: deviceId -> choice or structured vote.
 */
export type VoterEntry = {
  choice: string;
  conviction?: ConvictionLevel;
};

export interface PollVotesEntry {
  trueCount: number;
  falseCount: number;
  choices?: Record<string, number>;
}

// ============================================================================
// 8. ACTIONS & REDUCER ACTION UNION
// ============================================================================

/**
 * All reducer action type string literals in the VRC state machine.
 */
export type ActionType =
  | "SELECT_FORMAT"
  | "SELECT_MODE"
  | "READY"
  | "ADVANCE"
  | "REVEAL"
  | "RESET"
  | "BACK"
  | "TIME_EXPIRED"
  | "TOGGLE_HALFTIME"
  | "TOGGLE_LIGHTNING_ROUND"
  | "TOGGLE_BOSS_QUESTION"
  | "DISMISS_BOSS_MOMENT"
  | "SET_GHOST_OPTIONS"
  | "SET_GHOST"
  | "CLEAR_GHOST"
  | "RESTART_TIMER"
  | "TOGGLE_PAUSE"
  | "ADD_TIME"
  | "TOGGLE_TIMER"
  | "DOCUMENT_HIDDEN"
  | "DOCUMENT_VISIBLE"
  | "OPEN_HELP"
  | "CLOSE_HELP"
  | "HUD_SHOW"
  | "HUD_HIDE"
  | "REQUEST_RESTART_RUN"
  | "CONFIRM_RESTART_RUN"
  | "CANCEL_RESTART_RUN"
  | "SELECT_DECK"
  | "RETURN_TO_DECK_PICKER"
  | "RETURN_TO_FORMAT_PICKER"
  | "ENTER_LOBBY"
  | "START_BROADCAST"
  | "CLOSE_OUT"
  | "TOGGLE_DISCUSSION"
  | "SET_DISCUSSION_SECONDS"
  | "RESET_TO_LOBBY"
  | "SET_INTERACTION_MODE"
  | "RESET_POLL_VOTES"
  | "LOCK_VOTES"
  | "TOGGLE_CONVICTION"
  | "SET_CONVICTION_ENABLED"
  | "TOGGLE_JOIN_QUESTION"
  | "SET_JOIN_QUESTIONS"
  | "SET_PRESETS"
  | "SET_TALK_SECONDS"
  | "APPLY_PRESET"
  | "OPEN_TALK"
  | "RECORD_VOTE"
  | "VOTE"
  | "RECORD_HELLO"
  | "HELLO"
  | "RECORD_DROPPED_MESSAGE"
  | "TOGGLE_TEAMS"
  | "TOGGLE_TWO_TEAMS"
  | "SET_TEAMS_ENABLED"
  | "SET_TWO_TEAMS"
  | "TOGGLE_LEADERBOARD"
  | "SET_LEADERBOARD_ENABLED"
  | "REACTION"
  | "RECORD_REACTION"
  | "RECORD_REASON"
  | "RECORD_COMMENT"
  | "TOGGLE_COMMENTS"
  | "SET_COMMENTS_ENABLED"
  | "FIRE_REACTION"
  | "DISMISS_REACTION_MOMENT"
  | "RECORD_COMMITMENT"
  | "RECORD_PREDICTION"
  | "RECORD_DOUBLE"
  | "TOGGLE_PREDICT"
  | "TOGGLE_DOUBLE_DOWN"
  | "VOLUNTEER"
  | "PICK_CASE"
  | "TOGGLE_MAKE_THE_CASE"
  | "RECORD_BOUNTY"
  | "TOGGLE_BOUNTY"
  | "RECORD_FORK_VOTE"
  | "FORK_PICK"
  | "TOGGLE_FORKS"
  | "ENTER_SHOWDOWN"
  | "PREDICT_WINNER"
  | "TOGGLE_SHOWDOWN"
  | "SET_CONSENSUS_PCT"
  | "TOGGLE_STAGE_REACTIONS"
  | "TOGGLE_REACTION_TICKER"
  | "SET_STAGE_REACTIONS_ENABLED"
  | "SET_REACTION_TICKER_ENABLED"
  | "SET_START_TIME"
  | "SKIP"
  | "PARK"
  | "DISMISS_PARKED_NOTICE"
  | "CLEAR_PARKED_NOTICE"
  | "SET_CAPTION"
  | "CLEAR_CAPTION"
  | "SET_LIVE_ORIGIN"
  | "SET_LIVE_STATUS";

/**
 * Discriminated union of all actions handled by the VRC reducer.
 */
export type GameAction =
  | { type: "SELECT_FORMAT"; formatId: FormatId }
  | { type: "SELECT_MODE"; modeId: string }
  | { type: "READY" }
  | { type: "ADVANCE"; at?: number }
  | { type: "REVEAL"; at?: number }
  | { type: "RESET"; at?: number }
  | { type: "BACK"; at?: number }
  | { type: "TIME_EXPIRED"; at?: number }
  | { type: "TOGGLE_HALFTIME" }
  | { type: "TOGGLE_LIGHTNING_ROUND" }
  | { type: "TOGGLE_BOSS_QUESTION" }
  | { type: "DISMISS_BOSS_MOMENT" }
  | { type: "SET_GHOST_OPTIONS"; options: GhostOption[] }
  | { type: "SET_GHOST"; ghost: GhostState | null }
  | { type: "CLEAR_GHOST" }
  | { type: "RESTART_TIMER" }
  | { type: "TOGGLE_PAUSE"; at?: number; remainingMs?: number }
  | { type: "ADD_TIME"; seconds?: number; amountMs?: number }
  | { type: "TOGGLE_TIMER"; at?: number }
  | { type: "TICK_TIMER"; deltaMs?: number; at?: number }
  | {
      type: "SET_TIMER";
      durationMs?: number;
      remainingMs?: number;
      running?: boolean;
      enabled?: boolean;
      visible?: boolean;
      pauseReason?: "manual" | "disabled" | "documentHidden" | "timedOut" | "revealed" | null;
    }
  | { type: "START_TIMER"; durationMs?: number; seconds?: number }
  | { type: "TOGGLE_AUDIO" }
  | { type: "DOCUMENT_HIDDEN"; at?: number; remainingMs?: number }
  | { type: "DOCUMENT_VISIBLE" }
  | { type: "OPEN_HELP"; returnFocusId?: string }
  | { type: "CLOSE_HELP" }
  | { type: "HUD_SHOW" }
  | { type: "HUD_HIDE" }
  | { type: "REQUEST_RESTART_RUN" }
  | { type: "CONFIRM_RESTART_RUN" }
  | { type: "CANCEL_RESTART_RUN" }
  | { type: "SELECT_DECK"; deckId: string }
  | { type: "RETURN_TO_DECK_PICKER" }
  | { type: "RETURN_TO_FORMAT_PICKER" }
  | { type: "ENTER_LOBBY" }
  | { type: "START_BROADCAST"; at?: number }
  | { type: "CLOSE_OUT"; at?: number }
  | { type: "TOGGLE_DISCUSSION" }
  | { type: "SET_DISCUSSION_SECONDS"; seconds: number }
  | { type: "RESET_TO_LOBBY" }
  | { type: "SET_INTERACTION_MODE"; mode: InteractionMode }
  | { type: "RESET_POLL_VOTES" }
  | { type: "LOCK_VOTES"; at?: number }
  | { type: "TOGGLE_CONVICTION" }
  | { type: "SET_CONVICTION_ENABLED"; enabled?: boolean; value?: boolean }
  | { type: "TOGGLE_JOIN_QUESTION"; question: DemographicKey }
  | { type: "SET_JOIN_QUESTIONS"; join: Partial<JoinQuestionsState> }
  | { type: "SET_PRESETS"; presets: PresetEntry[]; available?: boolean }
  | { type: "SET_TALK_SECONDS"; seconds: number }
  | { type: "APPLY_PRESET"; presetId: string }
  | { type: "OPEN_TALK"; at?: number }
  | {
      type: "RECORD_VOTE" | "VOTE";
      questionId: string;
      device: string;
      choice: string;
      conviction?: ConvictionLevel;
      nickname?: string;
      team?: TeamSide;
      at?: number;
    }
  | {
      type: "RECORD_HELLO" | "HELLO";
      device?: string;
      nickname?: string;
      team?: TeamSide;
      role?: PhoneRole;
      about?: DemographicAbout;
      count?: number;
    }
  | { type: "RECORD_DROPPED_MESSAGE" }
  | { type: "TOGGLE_TEAMS" | "TOGGLE_TWO_TEAMS" }
  | { type: "SET_TEAMS_ENABLED" | "SET_TWO_TEAMS"; enabled?: boolean; value?: boolean }
  | { type: "TOGGLE_LEADERBOARD" }
  | { type: "SET_LEADERBOARD_ENABLED"; enabled?: boolean; value?: boolean }
  | {
      type: "REACTION" | "RECORD_REACTION";
      questionId: string;
      reaction: ReactionType;
    }
  | { type: "RECORD_REASON"; questionId: string; index: number }
  | { type: "RECORD_COMMENT"; questionId: string; text: string; device?: string }
  | { type: "TOGGLE_COMMENTS" }
  | { type: "SET_COMMENTS_ENABLED"; enabled?: boolean; value?: boolean }
  | { type: "FIRE_REACTION"; reaction: string; at?: number }
  | { type: "DISMISS_REACTION_MOMENT" }
  | { type: "RECORD_COMMITMENT"; questionId: string; device: string }
  | { type: "RECORD_PREDICTION"; questionId: string; device: string; band: number }
  | { type: "RECORD_DOUBLE"; questionId: string; device: string }
  | { type: "TOGGLE_PREDICT" }
  | { type: "TOGGLE_DOUBLE_DOWN" }
  | { type: "VOLUNTEER"; questionId: string; device: string; nickname?: string }
  | { type: "PICK_CASE"; ticket: string }
  | { type: "TOGGLE_MAKE_THE_CASE" }
  | { type: "RECORD_BOUNTY"; mythId: string; device: string }
  | { type: "TOGGLE_BOUNTY" }
  | { type: "RECORD_FORK_VOTE"; choice: string; device: string }
  | { type: "FORK_PICK"; choice: string }
  | { type: "TOGGLE_FORKS" }
  | { type: "ENTER_SHOWDOWN" }
  | { type: "PREDICT_WINNER"; ticket: string; device: string }
  | { type: "TOGGLE_SHOWDOWN" }
  | { type: "SET_CONSENSUS_PCT"; pct: ConsensusPct }
  | { type: "TOGGLE_STAGE_REACTIONS" | "TOGGLE_REACTION_TICKER" }
  | {
      type: "SET_STAGE_REACTIONS_ENABLED" | "SET_REACTION_TICKER_ENABLED";
      enabled?: boolean;
      value?: boolean;
    }
  | { type: "SET_START_TIME"; time: string | number | null }
  | { type: "SKIP"; at?: number }
  | { type: "PARK"; at?: number }
  | { type: "DISMISS_PARKED_NOTICE" | "CLEAR_PARKED_NOTICE" }
  | { type: "SET_CAPTION"; text: string; at?: number }
  | { type: "CLEAR_CAPTION" }
  | { type: "SET_LIVE_ORIGIN"; origin: string | null }
  | { type: "SET_LIVE_STATUS"; status: LiveStatus | null };

// ============================================================================
// 9. GAME STATE
// ============================================================================

/**
 * Complete immutable engine state shape maintained by reduce(state, action, deck).
 */
export interface GameState {
  /** Target presentation format. Null before format selection. */
  formatId: FormatId | null;
  /** Active presentation pace mode ID. Null before mode selection. */
  modeId: string | null;
  /** Assembled sequence of slides in the active presentation run. */
  run: SlideEntry[];
  deck?: Deck;
  selectedDeck?: Deck;
  /** Index into run representing the current on-stage slide. -1 before start. */
  slideIndex: number;
  /** Current state machine lifecycle phase. */
  phase: GamePhase;
  /** Decks available in multi-deck runtimes. */
  availableDecks: Array<{ id: string; title: string; questionCount?: number }>;
  /** ID of selected deck. */
  selectedDeckId: string | null;
  /** Active deck identifier. */
  deckId: string | null;
  /** If false, reveals immediately without discussion allowance. */
  discussionEnabled: boolean;
  /** Target duration for facilitated discussion post-reveal. */
  discussionSeconds: number;
  /** Active discussion timer state if running. */
  discussionTimer: DiscussionTimerState | null;
  /** Interaction mode: 'facilitator' vs 'polling'. */
  interactionMode: InteractionMode;
  /** Per-question aggregate of raw true/false and choice votes. */
  pollVotes: Record<string, PollVotesEntry>;
  /** Per-question map of deviceId -> choice or structured vote. */
  pollVoters: Record<string, Record<string, string | VoterEntry>>;
  /** Whether team competition is enabled. */
  teamsEnabled: boolean;
  /** Two-team mode flag. */
  twoTeams: boolean;
  /** Whether leaderboard standings are displayed. */
  leaderboardEnabled: boolean;
  /** Audience reaction counts per question. */
  reactions: Record<string, ReactionCounts>;
  /** Whether live reaction ticker floats on stage. */
  reactionTickerEnabled: boolean;
  /** Synonym for reactionTickerEnabled. */
  stageReactionsEnabled: boolean;
  /** Authored reasons counts per question. */
  reasons: Record<string, ReasonsState>;
  /** Audience comments per question. */
  comments: Record<string, CommentsState>;
  /** Whether attendee comments lane is enabled. */
  commentsEnabled: boolean;
  /** Currently active reaction banner moment on stage. */
  reactionMoment: ReactionMomentState | null;
  /** Commitments to practice guidelines registered per question. */
  commitments: Record<string, CommitmentEntry>;
  /** Run flag: intermission halftime stats board. */
  halftimeEnabled: boolean;
  /** Run flag: 5-question rapid lightning round. */
  lightningRoundEnabled: boolean;
  /** Run flag: climactic final boss question. */
  bossQuestionEnabled: boolean;
  /** State when boss question myth was successfully busted. */
  bossBusted: BossBustedState | null;
  /** Prior room benchmark for comparison. */
  ghost: GhostState | null;
  /** Available ghost sessions to choose from. */
  ghostOptions: GhostOption[];
  /** Run flag: enable audience predictions of the room split. */
  predictEnabled: boolean;
  /** Run flag: enable double-down confidence wagering. */
  doubleDownEnabled: boolean;
  /** Prediction votes cast per question. */
  predictions: Record<string, PredictionsState>;
  /** Double-down bets placed per question. */
  doubles: Record<string, DoublesState>;
  /** Run flag: Make The Case volunteer deliberation. */
  makeTheCaseEnabled: boolean;
  /** Queued volunteers for Make The Case. */
  volunteers: Record<string, VolunteersState>;
  /** Active volunteer on the floor for Make The Case. */
  theCase: CaseState | null;
  /** Run flag: Myth Bounty priority vote. */
  bountyEnabled: boolean;
  /** Myth bounty votes and heat map. */
  bounty: BountyState;
  /** Run flag: Pick Your Poison forks. */
  forksEnabled: boolean;
  /** Fork branch votes per fork slide. */
  forks: Record<string, ForkState>;
  /** Run flag: Post-show duel showdown. */
  showdownEnabled: boolean;
  /** Active showdown state. */
  showdown: ShowdownState | null;
  /** Room consensus threshold percentage. */
  consensusPct: ConsensusPct;
  /** Whether conviction pads appear on mobile devices. */
  convictionEnabled: boolean;
  /** Demographic questions active at room join. */
  join: JoinQuestionsState;
  /** Available saved configuration presets. */
  presets: PresetEntry[];
  /** Whether presets can be loaded from persistence. */
  presetsAvailable: boolean;
  /** ID of active preset. */
  activePresetId: string | null;
  /** Talk window duration override. */
  talkSeconds: number | null;
  /** Active voting window state machine. */
  voting: VotingState;
  /** Cumulative room metrics, accuracy, and streaks. */
  roomStats: RoomStatsState;
  /** Live room code (uppercase). */
  remoteSessionId: string | null;
  /** Facilitator remote key. */
  remoteKey: string | null;
  /** Pub/sub broker origin URL. */
  liveOrigin: string | null;
  /** Pub/sub socket connection status. */
  liveStatus: LiveStatus | null;
  /** Countdown timer state. */
  timer: TimerState;
  /** Monotonic counter invalidating async readiness checks. */
  readinessGeneration: number;
  /** Facilitator Heads-Up Display visibility. */
  hud: HudState;
  /** Keyboard shortcuts and help modal state. */
  help: HelpState;
  /** Confirmation dialog state for restarting run. */
  restartRunConfirmationOpen: boolean;
  /** Map of device tokens seen during this run. */
  seenDevices: Record<string, boolean>;
  /** Canonical session record for export and audit. */
  session: Session;
  /** Scheduled presentation start time. */
  startTime: string | number | null;
  /** True when running in dry-run rehearsal mode. */
  rehearsal: boolean;
  /** Count of distinct audience phones currently present. */
  phonesPresent: number;
  /** Timestamp when current question was posed (monotonic store clock). */
  posedAt: number | null;
  /** Timestamp when current question was revealed (monotonic store clock). */
  revealedAt: number | null;
  /** Wall-clock epoch timestamp companion to posedAt. */
  posedWallAt?: number | null;
  /** Wall-clock epoch timestamp companion to revealedAt. */
  revealedWallAt?: number | null;
  /** Direction of last slide transition for animation. */
  direction?: "forward" | "backward";
  /** Lower third broadcast message. */
  lowerThird: LowerThirdState | null;
  /** Legacy caption string. */
  caption: string | null;
  /** Expiration timestamp for caption. */
  captionExpiresAt: number | null;
  /** Facilitation venue. */
  venue?: Venue;
  /** Flag indicating a question was parked for later review. */
  parkedNotice?: boolean;
  /** Timestamp when question was parked. */
  parkedAt?: number | null;
  /** Closing finale beat index. */
  closingBeat?: number;
  /** Identifier of current closing beat board. */
  closingBeatId?: string | null;
  /** Singular noun for audience members (e.g. 'pharmacist'). */
  countSingular?: string;
  /** Plural noun for audience members (e.g. 'pharmacists'). */
  countPlural?: string;
  /** Number of voted participants. */
  votedCount?: number;
  /** Elapsed seconds on current slide. */
  elapsedSeconds?: number;
  /** Now timestamp override for test stability. */
  now?: number;
  /** Current time alias. */
  currentTime?: number;
}

// ============================================================================
// 10. VIEW MODELS (WHAT RENDER FUNCTIONS RECEIVE)
// ============================================================================

/**
 * Overlay state shared across all presentation views.
 */
export interface OverlayState {
  help: boolean;
  helpReturnFocusId: string | null;
  hud: boolean;
  restartConfirmation: boolean;
  now?: number;
}

/**
 * Common base interface for all screen view models generated by createViewModel.
 */
export interface ViewModelBase {
  /** Screen or slide type identifier. */
  type: string;
  /** Current game phase. */
  phase: GamePhase;
  /** Active format or null if picking format. */
  formatId: FormatId | null;
  /** Active mode configuration if selected. */
  mode: GameMode | null;
  /** Global HUD/modal overlay status. */
  overlay: OverlayState;
  /** Status announcement for screen readers and live banner. */
  liveMessage?: string;
  /** Venue context for styling and feature gating. */
  venue?: Venue;
}

/**
 * Deck picker view model.
 */
export interface DeckPickerViewModel extends ViewModelBase {
  type: "deckPicker";
  phase: "deckPicker";
  availableDecks: Array<{ id: string; title: string; questionCount?: number }>;
}

/**
 * Format picker view model.
 */
export interface FormatPickerViewModel extends ViewModelBase {
  type: "formatPicker";
  imageId: string;
  formats: Array<{
    id: FormatId;
    label: string;
    ratio: string;
    subtitle: string;
  }>;
  availableDecks: Array<{ id: string; title: string }>;
}

/**
 * Mode picker view model.
 */
export interface ModePickerViewModel extends ViewModelBase, NativeScene {
  type: "modePicker";
  modes: Array<{
    id: string;
    label: string;
    countBadge: string;
    timeChip: string;
    durationChip: string;
    subtitle: string;
    detail: string;
  }>;
}

/**
 * Pre-flight setup console view model.
 */
export interface PreFlightViewModel extends ViewModelBase {
  type: "preFlight";
  phase: "preFlight";
  modeLabel: string;
  modeQuestionCount: number;
  modeDuration: string;
  discussionEnabled: boolean;
  discussionSeconds: number;
  timerEnabled: boolean;
  audioMuted: boolean;
  interactionMode: InteractionMode;
  leaderboardEnabled: boolean;
  convictionEnabled: boolean;
  join: JoinQuestionsState;
  presets: PresetEntry[];
  presetsAvailable: boolean;
  activePresetId: string | null;
  runSummary: string;
  twoTeams: boolean;
  reactionTickerEnabled: boolean;
  stageReactionsEnabled: boolean;
  commentsEnabled: boolean;
  halftimeEnabled: boolean;
  lightningRoundEnabled: boolean;
  bossQuestionEnabled: boolean;
  ghost: GhostState | null;
  ghostOptions: GhostOption[];
  predictEnabled: boolean;
  doubleDownEnabled: boolean;
  makeTheCaseEnabled: boolean;
  bountyEnabled: boolean;
  bounty: Record<string, unknown> | null;
  forksEnabled: boolean;
  showdownEnabled: boolean;
  consensusPct: ConsensusPct;
  remoteSessionId: string | null;
  remoteKey: string | null;
  liveOrigin: string | null;
  liveStatus: LiveStatus | null;
  remoteUrl: string | null;
  pollingUrl: string | null;
  pollingDisplay: string | null;
  direction: "forward" | "backward";
  startTime: string | number | null;
  deckTitle: string;
  deckChoices: number;
  modeChoices: Array<{ id: string; label: string; count: number; runtime: string }>;
  formatChoices: Array<{ id: FormatId; label: string; ratio: string }>;
  roomCode: string | null;
  phonesPresent: number;
  rehearsal: boolean;
  music: { playing: boolean; muted: boolean; volume: number };
}

/**
 * Lobby display view model (waiting for participants to join).
 */
export interface LobbyViewModel extends ViewModelBase, NativeScene {
  type: "lobby";
  phase: "lobby";
  audienceBoundary: boolean;
  modeLabel: string;
  startTime: string | number | null;
  countdownText: string | null;
  interactionMode: InteractionMode;
  pollingUrl: string | null;
  pollingDisplay: string | null;
  roomCode: string | null;
  liveStatus: LiveStatus | null;
  phonesPresent: number;
  direction: "forward" | "backward";
  music: { playing: boolean; muted: boolean; volume: number };
}

/**
 * Common properties for slide views during presentation run.
 */
export interface SlideViewModelBase extends ViewModelBase {
  id: string;
  deckId: string;
  modeLabel: string;
  direction: "forward" | "backward";
  rehearsal: boolean;
  parkedNotice: boolean;
  lowerThird: LowerThirdState | null;
  timerEnabled: boolean;
  audioMuted: boolean;
  music: { playing: boolean; muted: boolean; volume: number };
  audienceBoundary: boolean;
  discussionEnabled: boolean;
  discussionSeconds: number;
  discussionTimer: DiscussionTimerState | null;
  interactionMode: InteractionMode;
  liveOrigin: string | null;
  pollingUrl: string | null;
  pollingDisplay: string | null;
  roomCode: string | null;
  remoteSessionId: string | null;
  phonesPresent: number;
  countSingular?: string;
  countPlural?: string;
  posedAt: number | null;
  revealedAt: number | null;
  posedWallAt: number | null;
  revealedWallAt: number | null;
  now: number;
  reactions: ReactionCounts;
  reactionTickerEnabled: boolean;
  stageReactionsEnabled: boolean;
  bounty: BountyState | Record<string, unknown> | null;
  fork: ForkState | Record<string, unknown> | null;
  showdown: ShowdownState | Record<string, unknown> | null;
}

/**
 * Question slide view model.
 */
export interface QuestionViewModel extends SlideViewModelBase, NativeScene {
  type: "question";
  question: Question;
  revealed: boolean;
  number: number;
  total: number;
  tally: VoteSplit & { totalVotes: number; truePercent: number; falsePercent: number };
  kind: QuestionKind;
  eyebrow: string;
  optionTally: Array<{ token: ChoiceToken; count: number; percent: number }> | null;
  orderDisplay: Array<{ token: ChoiceToken; text: string }> | null;
  kindRead: Record<string, unknown> | null;
  answerLine: string;
  answerDetail: string;
  reasonsBeat: Record<string, unknown> | null;
  wordWall: Record<string, unknown> | null;
  reactionMoment: ReactionMomentState | null;
  commentsEnabled: boolean;
  lightning: boolean;
  boss: boolean;
  bountyBoss: boolean;
  bossMoment: Record<string, unknown> | null;
  ghostLine: string | null;
  doublesLine: string | null;
  readsLine: string | null;
  theCase: Record<string, unknown> | null;
  caseLine: string | null;
  volunteersLine: string | null;
  votingWindow: VotingWindow;
  roomRead: { headline: string; consensus: boolean } | null;
  talkClock: string | null;
  switched: number;
  swingLine: string | null;
  roomStreak: number;
  showRoomStreak: boolean;
  roomLine: string | null;
  mythBusted: boolean;
  realityGapCallout: string | null;
  showRoomAccuracy: boolean;
  roomAccuracy: number;
  votedCount: number;
  elapsedSeconds: number;
  isReady: boolean;
  readinessText: string;
  timer: {
    seconds: number;
    display: string;
    enabled: boolean;
    visible: boolean;
    running: boolean;
    warning: boolean;
    status: string;
  };
  sourceLabel: string;
  twoTeams: boolean;
  teams: RoomStatsState["teams"];
}

/**
 * Focus slide view model.
 */
export interface FocusViewModel extends SlideViewModelBase, NativeScene {
  type: "focus";
  headline: string;
  body: string;
  halftime?: Record<string, unknown> | null;
}

/**
 * Closing slide view model (finale recap boards).
 */
export interface ClosingViewModel extends SlideViewModelBase, NativeScene {
  type: "closing";
  title: string;
  body?: string;
  pearl: string;
  summaryPoints?: string[];
  references?: Array<{ label: string; url?: string }>;
  showRealityCard: boolean;
  roomAccuracy: number;
  bestStreak: number;
  mythsBusted: number;
  participants: number;
  warmCopy: string;
  calibration: Record<string, unknown> | null;
  calibrationLine: string | null;
  roleSplit: Record<string, unknown> | null;
  adoption: Record<string, unknown> | null;
  covered: string[];
  offlineMyth: string | null;
  closingBeats: string[] | null;
  closingBeat: number;
  swing: number;
  ghostComparison: { room: string; lastTime: number; today: number } | null;
  openMinds: number;
  readsTheRoom: RoomStatsState["readsTheRoom"];
  namedPhones: number;
  leaderboardEnabled: boolean;
  leaderboard: NonNullable<RoomStatsState["leaderboard"]>;
  twoTeams: boolean;
  teams: RoomStatsState["teams"];
  recapUrl: string | null;
  recapDisplay: string | null;
  timing: Record<string, unknown> | null;
}

/**
 * Showdown duel view model.
 */
export interface ShowdownViewModel extends SlideViewModelBase {
  type: "showdown";
  showdown: ShowdownState;
}

/**
 * Pick Your Poison fork view model.
 */
export interface ForkViewModel extends SlideViewModelBase {
  type: "fork";
  fork: ForkState;
}

/**
 * Comprehensive union of all possible view models returned by createViewModel.
 */
export type ViewModel =
  | DeckPickerViewModel
  | FormatPickerViewModel
  | ModePickerViewModel
  | PreFlightViewModel
  | LobbyViewModel
  | QuestionViewModel
  | FocusViewModel
  | ClosingViewModel
  | ShowdownViewModel
  | ForkViewModel;
