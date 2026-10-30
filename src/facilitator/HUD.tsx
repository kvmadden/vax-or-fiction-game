import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";
import { useGameStore } from "../store/game-store";
import { useAudioStore } from "../engine/audio-store";
import { isQuestionSlide, staticSlideLabel } from "../engine/kinds";
import { isSetupPhase } from "../engine/state-machine";
import { voteStatusChip, voteStatusFor } from "../engine/vote-status";
import type { GamePhase, FormatId, TimerState } from "../data/types";
import { shouldTapPrimaryOnAdvance, shouldTapPrimaryOnSkip, tapPrimary, tapUi } from '../engine/audio-cues';
import { slideAudioKind } from '../engine/audio-lifecycle';
import { shouldGuardShowdownAdvance, shouldGuardSkip } from '../engine/presenter-guards';
import {
  DEFAULT_AUTO_HIDE_DELAY_MS,
  HUDAutoHideController,
  HUD_COMPACT_THRESHOLD_PX,
  getInitialHudVisibility,
  shouldRevealFromPointer,
} from "./hud-auto-hide";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export interface HUDProps {
  /** Optional container element for the portal. Defaults to document.body. */
  container?: HTMLElement | null;
  /** Audience presentation mode keeps incidental pointer activity off the shared frame. */
  audiencePresentation?: boolean;
  /** Whether the HUD is visible (controlled mode). If omitted, managed automatically. */
  visible?: boolean;
  /** Initial or controlled pinned state (keeps HUD permanently visible without auto-hiding). */
  pinned?: boolean;
  /** Inactivity delay in milliseconds before auto-hiding (default: 2500ms). */
  autoHideDelay?: number;
  /** Callback fired whenever visibility state transitions. */
  onVisibilityChange?: (visible: boolean) => void;

  // ── Facilitator Control Callbacks ──
  /** Advance to next question / slide / reveal state (Space / ArrowRight). */
  onAdvance?: () => void;
  /** Step back to previous question / slide / state (ArrowLeft). */
  onBack?: () => void;
  /** Skip current question without revealing verdict (S). */
  onSkip?: () => void;
  /** Park current question for later discussion / follow-up review (K). */
  onPark?: () => void;
  /** Toggle timer countdown running / paused (T). */
  onToggleTimer?: () => void;
  /** Toggle audio mute for cues / background tracks (M). */
  onToggleMute?: () => void;
  /** Toggle fullscreen presentation mode (F). */
  onToggleFullscreen?: () => void;

  // ── State Overrides & Indicators ──
  /** Explicit override for whether current question is parked. */
  isParked?: boolean;
  /** Explicit override for whether audio is currently muted. */
  isMuted?: boolean;
  /** Explicit override for whether presentation is fullscreen. */
  isFullscreen?: boolean;
  /** Explicit override for active game phase label. */
  phase?: GamePhase | string;
  /** Explicit override for active layout format. */
  format?: FormatId;
  /** Slide index override (0-indexed). */
  slideIndex?: number;
  /** Total slides count. */
  totalSlides?: number;
  /** Question number override (1-indexed). */
  questionNumber?: number;
  /** Total questions count. */
  totalQuestions?: number;
  /** Slide title or question kicker override. */
  slideTitle?: string;
  /** Explicit override for timer display or state. */
  timerState?: TimerState;
  /** Formatted timer display string override (e.g. "0:45"). */
  timerDisplay?: string;
  /** Connected phones count badge. */
  phonesPresent?: number;

  /** Additional CSS classes for root overlay. */
  className?: string;
  /** Custom inline style overrides. */
  style?: React.CSSProperties;
}

// ─── SVG ICONS (NO EMOJI - STRICT RULE SR-05) ─────────────────────────────────

const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const SkipIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" fillOpacity="0.2" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);

const ParkIcon: React.FC<{ className?: string; filled?: boolean }> = ({ className = "hud-icon", filled = false }) => (
  <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const TimerIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const VolumeOnIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fillOpacity="0.2" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const VolumeMutedIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const MaximizeIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const MinimizeIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </svg>
);

const PinIcon: React.FC<{ className?: string; pinned?: boolean }> = ({ className = "hud-icon", pinned = false }) => (
  <svg className={className} viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-2l-2-2V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v8l-2 2v2z" />
  </svg>
);

const HelpIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const EyeOffIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const LockIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronUpIcon: React.FC<{ className?: string }> = ({ className = "hud-icon hud-icon--sm" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

// HUD-COMPACT: the horizontal-ellipsis "More" trigger for the compact bar's utilities sheet.
const MoreIcon: React.FC<{ className?: string }> = ({ className = "hud-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

// ─── FRAMER MOTION VARIANTS ───────────────────────────────────────────────────

// Opacity-only — same dissolve as ScreenRouter. A y-slide on the facilitator
// strip fights the stage crossfade when the host advances and the HUD peeks.
const hudBarVariants: Variants = {
  hidden: {
    opacity: 0,
    transition: {
      duration: SCREEN_FADE_S,
      ease: SCREEN_FADE_EASE,
    },
  },
  visible: {
    opacity: 1,
    transition: {
      duration: SCREEN_FADE_S,
      ease: SCREEN_FADE_EASE,
    },
  },
};

const peekPillVariants: Variants = {
  hidden: {
    opacity: 0,
    transition: {
      duration: SCREEN_FADE_S,
      ease: SCREEN_FADE_EASE,
    },
  },
  visible: {
    opacity: 1,
    transition: {
      duration: SCREEN_FADE_S,
      ease: SCREEN_FADE_EASE,
    },
  },
};

const emptySubscribe = () => () => {};

// ─── COMPONENT: FACILITATOR HUD ───────────────────────────────────────────────

/**
 * Facilitator HUD
 *
 * Auto-hiding control strip for presentation facilitators rendered as a top-level
 * React Portal overlay. Provides rapid tactile controls for slide advancement,
 * question navigation, timer toggle, sound cue muting, and fullscreen toggle.
 */
export interface HUDComponent extends React.FC<HUDProps> {
  defaultProps?: Partial<HUDProps>;
}

const HUDComponentInner: React.FC<HUDProps> = ({
  container,
  audiencePresentation = true,
  visible: propVisible,
  pinned: propPinned,
  autoHideDelay = DEFAULT_AUTO_HIDE_DELAY_MS,
  onVisibilityChange,
  onAdvance: propOnAdvance,
  onBack: propOnBack,
  onSkip: propOnSkip,
  onPark: propOnPark,
  onToggleTimer: propOnToggleTimer,
  onToggleMute: propOnToggleMute,
  onToggleFullscreen: propOnToggleFullscreen,
  isParked: propIsParked,
  isMuted: propIsMuted,
  isFullscreen: propIsFullscreen,
  phase: propPhase,
  slideIndex: propSlideIndex,
  questionNumber: propQuestionNumber,
  totalQuestions: propTotalQuestions,
  slideTitle: propSlideTitle,
  timerState: propTimerState,
  timerDisplay: propTimerDisplay,
  phonesPresent: propPhonesPresent,
  className = "",
  style = {},
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Modern SSR-safe client mount detection
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // ── Store Integration ──
  const storePhase = useGameStore((s) => s.phase);
  const storeSlideIndex = useGameStore((s) => s.slideIndex);
  const storeRun = useGameStore((s) => s.run);
  const storeTimer = useGameStore((s) => s.timer);
  const storePhones = useGameStore((s) => s.phonesPresent);
  const storeVotesLocked = useGameStore((s) => Boolean(s.votesLocked));
  const storeOffline = useGameStore((s) => Boolean(s.offlineMode));
  const storeLiveVoting = useGameStore((s) => s.interactionMode === "polling");
  const storePhonesJoined = useGameStore((s) => Object.keys(s.seenDevices).length);
  const storePresenterArm = useGameStore((s) => s.presenterArm);
  const storeShowdownStage = useGameStore((s) => s.showdown?.stage ?? null);
  const storeShowdownFinalists = useGameStore((s) => s.showdown?.finalists.length ?? 0);
  const storeShowdownPredictions = useGameStore((s) => Object.keys(s.showdown?.predictions ?? {}).length);
  const dispatch = useGameStore((s) => s.dispatch);

  // ── Local State ──
  const [internalVisible, setInternalVisible] = useState<boolean>(() => {
    const hud = useGameStore.getState().hud;
    if (hud?.suppressed) return false;
    if (hud?.visible) return true;
    return getInitialHudVisibility(typeof window === "undefined" ? undefined : window.innerWidth);
  });
  const [internalPinned, setInternalPinned] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isSuppressed, setIsSuppressed] = useState<boolean>(() => Boolean(useGameStore.getState().hud?.suppressed));
  // HUD-COMPACT: the initial guess only has window.innerWidth to go on (the bar itself has not
  // mounted yet), which is wrong for a portrait-format bar capped to 400px on a wide desktop
  // viewport. The useLayoutEffect below measures the real bar and corrects this synchronously,
  // before the browser paints, so that wrong initial guess never actually flashes on screen.
  const [isCompact, setIsCompact] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth <= HUD_COMPACT_THRESHOLD_PX
  );
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  // HUD-COMPACT: the sheet sits 8px in from the BAR's own edges, not the viewport's. A
  // portrait-format bar can be capped to 400px and flush right on a much wider desktop viewport
  // (question-chrome.css), so the sheet has to track the bar's measured rect, not a static inset.
  const [barRect, setBarRect] = useState<{ left: number; right: number; top: number } | null>(null);
  const audioMuted = useAudioStore((s) => s.muted);
  const [localFullscreen, setLocalFullscreen] = useState<boolean>(false);
  const storeParked = useGameStore((s) => {
    const questionId = s.run?.[s.slideIndex]?.id;
    if (!questionId) return Boolean(s.parkedNotice);
    return Boolean(s.session?.questions?.some((q: { questionId?: string; parked?: boolean }) => q.questionId === questionId && q.parked));
  });

  const controllerRef = useRef<HUDAutoHideController | null>(null);
  const hudElementRef = useRef<HTMLDivElement | null>(null);
  const peekTabRef = useRef<HTMLButtonElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreSheetRef = useRef<HTMLDivElement | null>(null);

  // Pinned state resolution
  const isPinned = propPinned !== undefined ? propPinned : internalPinned;

  // Fullscreen Browser State Observer
  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = typeof document !== "undefined" && Boolean(document.fullscreenElement);
      setLocalFullscreen(active);
    };

    if (typeof document !== "undefined") {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      handleFullscreenChange();
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
    };
  }, []);

  // Determine Effective Values
  const effectiveFullscreen = propIsFullscreen ?? localFullscreen;
  const effectiveMuted = propIsMuted ?? audioMuted;
  const effectiveParked = propIsParked ?? storeParked;
  const activePhase = propPhase ?? storePhase ?? "lobby";
  const setupIdle = isSetupPhase(String(activePhase));
  const activeTimer = propTimerState ?? storeTimer;
  const resolvedPhones = propPhonesPresent ?? storePhones ?? 0;

  // Slide & Question Counts
  const runArray = useMemo(() => (Array.isArray(storeRun) ? storeRun : []), [storeRun]);
  const activeSlideIndex = propSlideIndex ?? storeSlideIndex;
  const currentSlide =
    typeof activeSlideIndex === "number" && activeSlideIndex >= 0
      ? (runArray[activeSlideIndex] ?? null)
      : null;
  const showIdle =
    setupIdle ||
    activePhase === "lobby" ||
    activePhase === "closing" ||
    activePhase === "outro" ||
    activePhase === "showdown" ||
    activePhase === "leaderboard";
  // Lobby keeps slideIndex -1; showdown/closing can leave a leftover question under the index.
  const onQuestion = !showIdle && isQuestionSlide(currentSlide);
  const skipParkIdle = !onQuestion;
  const timerIdle = !onQuestion;
  const nextIdle = setupIdle || activePhase === "closing" || activePhase === "outro";
  const currentQuestionId = onQuestion ? (currentSlide as { id: string }).id : null;
  const storeVotesIn = useGameStore((s) => (currentQuestionId ? Object.keys(s.pollVoters[currentQuestionId] ?? {}).length : 0));
  const skipArmed = storePresenterArm?.kind === "skip";
  const showdownArmed = storePresenterArm?.kind === "showdown";
  const skipNeedsConfirm = shouldGuardSkip({
    offlineMode: storeOffline,
    interactionMode: storeLiveVoting ? "polling" : "facilitator",
    votesLocked: storeVotesLocked,
    phonesJoined: storePhonesJoined,
    votesIn: storeVotesIn,
    onQuestion,
  });
  const showdownNeedsConfirm = shouldGuardShowdownAdvance({
    phase: activePhase,
    stage: storeShowdownStage,
    finalistCount: storeShowdownFinalists,
    phonesJoined: storePhonesJoined,
    predictionCount: storeShowdownPredictions,
  });

  // Count question slides (the same rule the stage uses), so the chip says "Q1 of 12", never "Slide 3 of 14".
  const questionMeta = useMemo(() => {
    if (propQuestionNumber !== undefined && propTotalQuestions !== undefined) {
      return { number: propQuestionNumber, total: propTotalQuestions };
    }
    const questions = runArray.filter((slide) => isQuestionSlide(slide));
    if (!onQuestion) return { number: null, total: questions.length };
    const slide = currentSlide as { id?: string; displayNumber?: number; displayCount?: number };
    const position = questions.findIndex((candidate) => candidate === currentSlide || (candidate as { id?: string }).id === slide.id);
    return {
      number: slide.displayNumber ?? (position >= 0 ? position + 1 : null),
      total: slide.displayCount ?? questions.length,
    };
  }, [propQuestionNumber, propTotalQuestions, runArray, currentSlide, onQuestion]);

  // Formatted Timer String
  const resolvedTimerDisplay = useMemo(() => {
    if (propTimerDisplay) return propTimerDisplay;
    if (activeTimer && activeTimer.enabled !== false && activeTimer.remainingMs !== undefined) {
      const totalSeconds = Math.max(0, Math.ceil(activeTimer.remainingMs / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    }
    return null;
  }, [propTimerDisplay, activeTimer]);

  // Phase & Slide Readable String
  const statusHeadline = useMemo(() => {
    if (propSlideTitle) return propSlideTitle;
    if (questionMeta.number !== null && questionMeta.total > 0) {
      return `Q${questionMeta.number} of ${questionMeta.total}`;
    }
    return staticSlideLabel(currentSlide) ?? (activePhase === "lobby" ? "Lobby" : String(activePhase));
  }, [propSlideTitle, questionMeta, currentSlide, activePhase]);

  // Phase badge descriptive label (non-question screens)
  const phaseLabel = useMemo(() => {
    if (activePhase === "lobby") return "Lobby";
    const opening = staticSlideLabel(currentSlide);
    if (opening) return opening;
    switch (activePhase) {
      case "deliberating":
      case "entering":
        return "Posed";
      case "timedOut":
        return "Time's up";
      case "revealed":
        return "Revealed";
      case "explaining":
        return "Explanation";
      case "lobby":
        return "Lobby";
      case "preFlight":
      case "modePicker":
      case "formatPicker":
      case "deckPicker":
        return "Ready";
      case "halftime":
        return "Halftime";
      case "fork":
        return "Fork";
      case "showdown":
        return "Showdown";
      case "leaderboard":
        return "Top 5";
      case "closing":
      case "outro":
        return "Closing";
      default:
        return String(activePhase);
    }
  }, [activePhase, currentSlide]);

  // ── The state instrument: what the chip says, what Lock means, what the primary does ──
  const voteStatus = voteStatusFor({ phase: activePhase, votesLocked: storeVotesLocked });
  const liveVoting = onQuestion && storeLiveVoting && !storeOffline;
  const revealed = activePhase === "revealed" || activePhase === "explaining";
  const chipState = onQuestion
    ? (activePhase === "explaining" ? phaseLabel : liveVoting ? voteStatusChip(voteStatus, { votesIn: storeVotesIn, phonesJoined: storePhonesJoined }) : (revealed ? "Revealed" : "Posed"))
    : phaseLabel;
  const chipLine = onQuestion ? `${statusHeadline} · ${chipState}` : phaseLabel;
  const canLock = liveVoting && voteStatus === "open";
  const primaryAction: "lock" | "reveal" | "advance" = onQuestion && !revealed ? (canLock ? "lock" : "reveal") : "advance";
  const primaryLabel = primaryAction === "lock" ? "Lock" : primaryAction === "reveal" ? "Reveal" : activePhase === "revealed" && onQuestion ? "Explain" : "Next";

  // Derived Visibility
  const effectiveVisible =
    propVisible !== undefined
      ? propVisible
      : !isSuppressed && (isPinned || isHovered || isFocused || internalVisible);

  // The existing H shortcut dispatches HUD_SHOW/HUD_HIDE through the store.
  // Consume that signal so keyboard reveal remains available when pointer
  // activity is intentionally ignored on the shared audience frame.
  useEffect(() => useGameStore.subscribe((state, previousState) => {
    if (propVisible !== undefined) return;
    const hud = state.hud;
    const previous = previousState.hud;
    if (hud.visible === previous.visible && hud.suppressed === previous.suppressed) return;
    // HUD-COMPACT: Hide (the H shortcut or the Hide tile) takes the whole bar away, so the More
    // sheet that hung off it must go too, not linger detached from anything. Keyed off suppressed
    // going true (the real "Hide" signal), not visible going false: at compact widths the store's
    // hud.visible can already read false before the first Hide (getInitialHudVisibility keeps the
    // bar shown via local state only), so a visible-based check would silently never fire there.
    if (hud.suppressed && !previous.suppressed) setSheetOpen(false);
    setInternalVisible(hud.visible);
    setIsSuppressed(hud.suppressed);
    if (hud.visible) {
      setIsSuppressed(false);
      return;
    }
    if (!hud.suppressed) return;
    setIsFocused(false);
    const node = hudElementRef.current;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    // HUD-COMPACT: the More sheet renders as a sibling of the bar, not nested inside it (a
    // Framer Motion containing-block issue, see sheetPanel's own comment), so a focused tile
    // inside the sheet is not a descendant of hudElementRef. Check both.
    const inHud = node && active instanceof HTMLElement && (node.contains(active) || moreSheetRef.current?.contains(active));
    if (inHud && active instanceof HTMLElement) {
      active.blur();
      // A11Y-02: hand focus to the peek tab that replaces the bar instead of letting it fall to
      // document.body. Deferred a tick (matching KeyboardHelpModal's own autofocus timing) so the
      // peek tab has mounted by the time focus() runs. At wide/audience widths the peek tab is
      // deliberately display:none (question-chrome.css, VOF-25), where focus() on it is a no-op
      // and this degrades to the prior behavior, since there is nothing visible to hand off to.
      setTimeout(() => {
        peekTabRef.current?.focus();
      }, 0);
    }
  }), [propVisible]);

  // HUD-COMPACT: Shortcuts (the ? key or the Shortcuts tile) opens the shared keyboard-help sheet,
  // and Shift+R opens the restart confirmation, both of which sit above everything else. Close
  // the More sheet the same moment so it never stacks under either.
  useEffect(() => useGameStore.subscribe((state, previousState) => {
    const helpOpened = state.help?.open && !previousState.help?.open;
    const restartOpened = state.restartRunConfirmationOpen && !previousState.restartRunConfirmationOpen;
    if (helpOpened || restartOpened) setSheetOpen(false);
  }), []);

  // CONTROLS-REVIEW: the same close, but for modals with no store flag at all, like
  // PresenterPairing (a mounted-DOM check, the exact pattern keyboard-actions.ts already uses
  // for pairingOpen) or any future modal. Scoped to only run while the sheet is actually open, so
  // there is nothing to observe the rest of the time.
  useEffect(() => {
    if (!sheetOpen || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    const closeIfModalOpen = () => {
      if (document.querySelector('dialog[open], [aria-modal=true]')) setSheetOpen(false);
    };
    closeIfModalOpen();
    const observer = new MutationObserver(closeIfModalOpen);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal"] });
    return () => observer.disconnect();
  }, [sheetOpen]);

  // HUD-COMPACT: measure the bar itself, not the viewport (question-chrome.css caps a
  // portrait-format bar to 400px wide even on a wide desktop viewport, so viewport width alone
  // would call that bar non-compact). The synchronous first measure runs in this same
  // useLayoutEffect, before the browser paints, so a wrong initial guess (isCompact's useState
  // initializer above only has window.innerWidth to go on) never actually flashes on screen.
  useLayoutEffect(() => {
    const el = hudElementRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      setIsCompact(rect.width <= HUD_COMPACT_THRESHOLD_PX);
      setBarRect({ left: rect.left, right: rect.right, top: rect.top });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // CONTROLS-REVIEW: a portrait-format bar (hud.css, max-width:400px, flush right) can move
    // without changing its own size when the window resizes, since it stays capped at 400px the
    // whole time. ResizeObserver only fires on a SIZE change, so it never catches that move, and
    // the sheet's measured position goes stale until something else happens to trigger it. A
    // window resize listener re-measures the bar's real position on every resize, not just when
    // its own size changes.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [effectiveVisible]);

  // Leaving compact mode closes the sheet: a wide bar renders the utilities directly in the
  // cluster, so a sheet built for the compact bar's 8 tiles would be orphaned from its trigger.
  useEffect(() => {
    if (!isCompact) setSheetOpen(false);
  }, [isCompact]);

  // CONTROLS-REVIEW: the focus-handoff side effect used to live inside the setSheetOpen updater,
  // which React may invoke more than once for the same update (StrictMode double-invoke, or any
  // future concurrent-mode replay), risking a duplicate setTimeout. Reading sheetOpen directly and
  // taking it as a dependency keeps the side effect a plain, single-run consequence of the click.
  const handleToggleMore = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    tapUi();
    const next = !sheetOpen;
    setSheetOpen(next);
    if (next && event.detail === 0) {
      // A synthesized click from Enter/Space on a focused button carries detail 0, a real mouse
      // click carries at least 1. Only a keyboard open needs a focus handoff into the sheet.
      setTimeout(() => {
        const first = moreSheetRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
        first?.focus();
      }, 0);
    }
  }, [sheetOpen]);

  // Escape closes the sheet and returns focus to More, and must win the race against any other
  // Escape handler (fullscreen exit, the keyboard-help sheet) already listening on window: a
  // capture-phase listener runs before window's own bubble-phase listener ever sees the event.
  // CONTROLS-REVIEW: it must also get out of the way entirely when a real modal (the restart
  // confirmation, PresenterPairing, or any future dialog) is open, so that modal's own Escape
  // handler is the one that gets the keypress instead of this one stealing it first. The modal
  // effect above already closes the sheet the moment a tracked modal opens, so this check only
  // matters for the same-tick race and for modals this component has no other way to know about.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('dialog[open], [aria-modal=true]')) return;
      event.preventDefault();
      event.stopPropagation();
      setSheetOpen(false);
      moreButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [sheetOpen]);

  // A pointer down outside the sheet and outside More closes it. Pointerdown (not click) so this
  // fires before whatever is under the pointer runs its own click handler.
  useEffect(() => {
    if (!sheetOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (moreSheetRef.current?.contains(target)) return;
      if (moreButtonRef.current?.contains(target)) return;
      setSheetOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sheetOpen]);

  // Notify parent on visibility changes
  useEffect(() => {
    onVisibilityChange?.(effectiveVisible);
  }, [effectiveVisible, onVisibilityChange]);

  // Timers belong to the committed component lifecycle, never an abandoned render.
  useEffect(() => {
    const controller = new HUDAutoHideController({onHide: () => setInternalVisible(false)});
    controllerRef.current = controller;
    return () => { controller.dispose(); controllerRef.current = null; };
  }, []);

  useEffect(() => {
    controllerRef.current?.updateState({
      // HUD-COMPACT: an open More sheet must hold the bar visible the same way real focus does,
      // folded into this one existing signal rather than teaching the controller a second concept
      // for "something inside the bar still needs it visible."
      autoHideDelay, isPinned, isHovered, isFocused: isFocused || sheetOpen, isSuppressed, isVisible: internalVisible,
    });
  }, [autoHideDelay, isPinned, isHovered, isFocused, isSuppressed, internalVisible, sheetOpen]);

  const resetAutoHideTimer = useCallback(() => {
    controllerRef.current?.resetTimer();
  }, []);

  // User Activity Signal (reveals HUD on mouse/touch/key, throttled to prevent render churn)
  const handleUserActivity = useCallback((force: boolean = false) => {
    if (controllerRef.current?.isSuppressed) return;
    if (!controllerRef.current?.isVisible) {
      setInternalVisible(true);
    }
    controllerRef.current?.handleActivity(force);
  }, []);

  // Global Activity Listeners with 250ms throttling to eliminate re-render churn
  useEffect(() => {
    if (typeof window === "undefined" || !shouldRevealFromPointer(audiencePresentation)) return;

    const onPointerMove = (e: PointerEvent) => {
      // If pointer is near bottom 48px, always show immediately even if suppressed
      if (window.innerHeight - e.clientY < 48) {
        setIsSuppressed(false);
        if (!controllerRef.current?.isVisible) {
          setInternalVisible(true);
        }
        controllerRef.current?.handleActivity(true);
      } else {
        handleUserActivity(false);
      }
    };

    const onPointerDown = () => {
      handleUserActivity(true);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [audiencePresentation, handleUserActivity]);

  // ── Facilitator Actions ──

  const handleAdvance = useCallback(() => {
    if (shouldTapPrimaryOnAdvance(String(activePhase), {
      votesLocked: storeVotesLocked,
      offlineMode: storeOffline,
      slideType: slideAudioKind(currentSlide),
    })) tapPrimary();
    if (propOnAdvance) {
      propOnAdvance();
    } else {
      dispatch({ type: "ADVANCE" });
    }
    handleUserActivity();
  }, [activePhase, currentSlide, storeVotesLocked, storeOffline, propOnAdvance, dispatch, handleUserActivity]);

  const handleReveal = useCallback(() => {
    // Reveal sting is AudioPlayer reveal-a / reveal-b. Do not stack ui-tap.
    dispatch({ type: "REVEAL" });
    handleUserActivity();
  }, [dispatch, handleUserActivity]);

  const handleLock = useCallback(() => {
    // Lock sting is AudioPlayer answer-lock. Do not stack ui-tap.
    dispatch({ type: "LOCK_VOTES" });
    handleUserActivity();
  }, [dispatch, handleUserActivity]);

  const handleBack = useCallback(() => {
    tapPrimary();
    if (propOnBack) {
      propOnBack();
    } else {
      // WARNING-1 (premium-host-fix-4), same fix as Keyboard.tsx: the store's own 'BACK' case
      // only turns the offline closing pager back a page when it is actually mounted. If Closing
      // has crashed (SlideErrorBoundary) or the pager legitimately is not rendered, nothing
      // consumes the closingBackStep bump and BACK goes dead. Same DOM-presence check, so the
      // HUD's own Back button recovers the same way keyboard and clicker do.
      const closingWithNoPager = activePhase === "closing"
        && storeOffline
        && typeof document !== "undefined"
        && !document.querySelector('[data-role="closing-offline-pager"]');
      dispatch({ type: closingWithNoPager ? "BACK_FROM_CLOSING" : "BACK" });
    }
    handleUserActivity();
  }, [propOnBack, dispatch, handleUserActivity, activePhase, storeOffline]);

  const handleSkip = useCallback(() => {
    // Last-question skip enters showdown/closing. transition-3 / myth-busted own that beat.
    if (shouldTapPrimaryOnSkip(runArray, activeSlideIndex)) tapPrimary();
    if (propOnSkip) {
      propOnSkip();
    } else {
      dispatch({ type: "SKIP" });
    }
    handleUserActivity();
  }, [runArray, activeSlideIndex, propOnSkip, dispatch, handleUserActivity]);

  const handlePark = useCallback(() => {
    tapUi();
    if (propOnPark) {
      propOnPark();
    } else {
      dispatch({ type: "PARK" });
    }
    handleUserActivity();
  }, [propOnPark, dispatch, handleUserActivity]);

  // T on the keyboard toggles the timer; the button does the same thing, not pause.
  const handleToggleTimer = useCallback(() => {
    tapUi();
    if (propOnToggleTimer) {
      propOnToggleTimer();
    } else {
      dispatch({ type: "TOGGLE_TIMER" });
    }
    handleUserActivity();
  }, [propOnToggleTimer, dispatch, handleUserActivity]);

  const handleToggleMute = useCallback(() => {
    // Mute stays silent on purpose: a tap would play under the mute flip.
    if (propOnToggleMute) {
      propOnToggleMute();
    } else {
      useAudioStore.getState().toggleMute();
    }
    handleUserActivity();
  }, [propOnToggleMute, handleUserActivity]);

  const handlePrimary = useCallback(() => {
    if (primaryAction === "lock") handleLock();
    else if (primaryAction === "reveal") handleReveal();
    else handleAdvance();
  }, [primaryAction, handleLock, handleReveal, handleAdvance]);

  const handleToggleFullscreen = useCallback(() => {
    tapUi();
    if (propOnToggleFullscreen) {
      propOnToggleFullscreen();
    } else {
      if (typeof document !== "undefined") {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    }
    handleUserActivity();
  }, [propOnToggleFullscreen, handleUserActivity]);

  const handleTogglePin = useCallback(() => {
    tapUi();
    setInternalPinned((prev) => !prev);
    setInternalVisible(true);
    handleUserActivity();
  }, [handleUserActivity]);

  const handleToggleHide = useCallback(() => {
    tapUi();
    dispatch({ type: "HUD_HIDE", releaseFocus: true, suppress: true });
  }, [dispatch]);

  // One help sheet for the whole show: the ? key and this button open the same store-driven
  // sheet. returnFocusId defaults to this button's own id (the wide bar's persistent trigger),
  // but the compact More sheet's Shortcuts tile passes "hud-more" instead: that tile shares a
  // sheet that closes itself the instant help opens, so the tile itself is gone by the time
  // help closes and cannot reclaim focus. #hud-more, the button that opened the sheet the tile
  // lived in, is what survives to receive it back.
  const handleOpenHelp = useCallback((returnFocusId: string = "hud-help") => {
    tapUi();
    dispatch({ type: "OPEN_HELP", returnFocusId });
  }, [dispatch]);

  if (!isMounted || typeof document === "undefined") {
    return null;
  }

  const portalContainer = container ?? document.body;

  const ghostButtonClass = "hud-button-ghost";

  // HUD-COMPACT: the same 8 utility controls as the cluster above, moved here instead of hidden
  // in compact mode. Same handler, id, data-testid, aria-label, title and pressed/armed semantics
  // as the cluster buttons, so the ids stay unique (rendered in exactly one place at a time) and
  // every existing behavior carries over unchanged, plus a visible label under each icon.
  //
  // Rendered as a sibling of the AnimatePresence block below (not nested inside motion.aside):
  // the bar's own backdrop-filter (hud.css, #presenter-hud.hud-bar) establishes a containing
  // block for position:fixed descendants, which put this sheet's measured rect nowhere near
  // barRect when it was nested there (verified: the sheet rendered off past the right edge of
  // the viewport at 768x1024). Sitting in the plain, unanimated portal div avoids that entirely.
  // CONTROLS-REVIEW: also gated on effectiveVisible, so a sheet left open by a prior interaction
  // cannot render detached once the bar itself has auto-hidden or been suppressed.
  const sheetPanel = effectiveVisible && isCompact && sheetOpen && barRect ? (
    <div
      ref={moreSheetRef}
      id="hud-more-sheet"
      data-role="hud-more-sheet"
      role="group"
      aria-label="More controls"
      className="hud-more-sheet"
      style={{
        left: `${barRect.left + 8}px`,
        width: `${Math.max(0, barRect.right - barRect.left - 16)}px`,
        bottom: `${typeof window !== "undefined" ? window.innerHeight - barRect.top + 8 : 0}px`,
      }}
    >
      {/* Skip Tile */}
      <button
        type="button"
        id="hud-skip"
        onClick={handleSkip}
        disabled={skipParkIdle}
        aria-disabled={skipParkIdle}
        aria-label={skipArmed ? "Skip again to leave this question (S)" : skipNeedsConfirm ? "Phones are still answering. Skip again to leave this question (S)" : "Skip question (S)"}
        title={skipParkIdle ? "Skip is idle off a live question" : skipArmed ? "Skip again to leave this question (S)" : skipNeedsConfirm ? "Phones are still answering. Skip again to leave this question (S)" : "Skip question (S)"}
        data-hud-action="skip"
        data-testid="hud-skip"
        data-armed={skipArmed || skipNeedsConfirm ? "true" : "false"}
        className={`${ghostButtonClass} hud-tile`}
      >
        <SkipIcon className="hud-icon" />
        <span className="hud-tile-label">Skip</span>
      </button>

      {/* Park Tile */}
      <button
        type="button"
        id="hud-park"
        onClick={handlePark}
        disabled={skipParkIdle}
        aria-disabled={skipParkIdle}
        aria-label="Park question for follow-up review (K)"
        aria-pressed={effectiveParked}
        title={skipParkIdle ? "Park is idle off a live question" : effectiveParked ? "Unpark question (K)" : "Park question (K)"}
        data-hud-action="park"
        data-testid="hud-park"
        className={`${ghostButtonClass} hud-tile`}
      >
        <ParkIcon className="hud-icon" filled={effectiveParked} />
        <span className="hud-tile-label">Park</span>
      </button>

      {/* Timer Tile */}
      <button
        type="button"
        id="hud-timer"
        onClick={handleToggleTimer}
        disabled={timerIdle}
        aria-disabled={timerIdle}
        aria-label={activeTimer?.enabled ? "Timer on: turn it off (T)" : "Timer off: turn it on (T)"}
        aria-pressed={Boolean(activeTimer?.enabled)}
        title={timerIdle ? "Timer is idle off a live question" : activeTimer?.enabled ? "Timer on (T)" : "Timer off (T)"}
        data-hud-action="toggle-timer"
        data-testid="hud-timer"
        className={`${ghostButtonClass} hud-tile`}
      >
        <TimerIcon className="hud-icon" />
        <span className="hud-tile-label">Timer</span>
      </button>

      {/* Sound Tile: the "Muted" text is dropped here on purpose (VOF-CONTROLS spec) - the label
          plus the pressed gold state already carry it, same as every other tile relies on its
          label instead of extra text. */}
      <button
        type="button"
        id="hud-audio"
        onClick={handleToggleMute}
        aria-label={effectiveMuted ? "Unmute walk-in and cues (M)" : "Mute walk-in and cues (M)"}
        aria-pressed={effectiveMuted}
        title={effectiveMuted ? "Sound is off. Click to unmute (M)." : "Sound is on. Click to mute (M)."}
        data-hud-action="toggle-audio"
        data-testid="hud-mute"
        className={`${ghostButtonClass} hud-tile`}
      >
        {effectiveMuted ? <VolumeMutedIcon className="hud-icon" /> : <VolumeOnIcon className="hud-icon" />}
        <span className="hud-tile-label">Sound</span>
      </button>

      {/* Full screen Tile */}
      <button
        type="button"
        id="hud-fullscreen"
        onClick={handleToggleFullscreen}
        aria-label={effectiveFullscreen ? "Exit full screen (F)" : "Enter full screen (F)"}
        aria-pressed={effectiveFullscreen}
        title={effectiveFullscreen ? "Exit full screen (F)" : "Enter full screen (F)"}
        data-hud-action="fullscreen"
        data-testid="hud-fullscreen"
        className={`${ghostButtonClass} hud-tile`}
      >
        {effectiveFullscreen ? <MinimizeIcon className="hud-icon" /> : <MaximizeIcon className="hud-icon" />}
        <span className="hud-tile-label">Full screen</span>
      </button>

      {/* Pin Tile */}
      <button
        type="button"
        id="hud-pin"
        onClick={handleTogglePin}
        aria-label={isPinned ? "Unpin controls" : "Pin controls open"}
        aria-pressed={isPinned}
        title={isPinned ? "Unpin controls" : "Pin controls open"}
        data-hud-action="toggle-pin"
        data-testid="hud-pin"
        className={`${ghostButtonClass} hud-tile`}
      >
        <PinIcon className="hud-icon" pinned={isPinned} />
        <span className="hud-tile-label">Pin</span>
      </button>

      {/* Shortcuts Tile (same sheet as ?). Returns focus to #hud-more, not this tile, on close:
          the More sheet closes itself the instant help opens, so this tile is gone by then. */}
      <button
        type="button"
        id="hud-help"
        onClick={() => handleOpenHelp("hud-more")}
        aria-label="Keyboard shortcuts (?)"
        title="Keyboard shortcuts (?)"
        data-hud-action="open-help"
        data-testid="hud-help"
        className={`${ghostButtonClass} hud-tile`}
      >
        <HelpIcon className="hud-icon" />
        <span className="hud-tile-label">Shortcuts</span>
      </button>

      {/* Hide Tile */}
      <button
        type="button"
        id="hud-hide"
        onClick={handleToggleHide}
        aria-label="Hide facilitator controls (H)"
        title="Hide controls (H)"
        data-hud-action="hide-controls"
        data-testid="hud-hide"
        className={`${ghostButtonClass} hud-tile`}
      >
        <EyeOffIcon className="hud-icon" />
        <span className="hud-tile-label">Hide</span>
      </button>
    </div>
  ) : null;

  // Portal JSX content
  const hudContent = (
    <div
      className={`vrc-facilitator-hud-portal ${className}`}
      data-testid="facilitator-hud-portal"
      data-role="hud-portal"
      style={style}
    >
      {/* ── PEEK TAB (SHOWN WHEN HUD IS AUTO-HIDDEN) ── */}
      <AnimatePresence>
        {!effectiveVisible && (
          <motion.button
            key="hud-peek-tab"
            ref={peekTabRef}
            variants={shouldReduceMotion ? undefined : peekPillVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            type="button"
            className="hud-peek-tab"
            style={{
              backgroundColor: "var(--color-panel-navy)",
              borderColor: "var(--color-gold)",
              color: "var(--color-ink-muted)",
              minHeight: "var(--kit-touch)",
            }}
            onClick={() => {
              tapUi();
              dispatch({ type: "HUD_SHOW", restore: true });
            }}
            aria-label="Reveal Facilitator Controls (H)"
            title="Reveal Facilitator Controls (H)"
            data-role="hud-peek-trigger"
          >
            <ChevronUpIcon className="hud-icon hud-icon--sm" />
            <span className="hud-peek-label">
              Controls · {onQuestion ? statusHeadline : phaseLabel}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── MAIN AUTO-HIDING CONTROL BAR: 48px, flush to the viewport bottom, inside the letterbox band ── */}
      <AnimatePresence>
        {effectiveVisible && (
          <motion.aside
            key="facilitator-hud-strip"
            ref={hudElementRef}
            variants={shouldReduceMotion ? undefined : hudBarVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            id="presenter-hud"
            role="group"
            aria-label="Facilitator controls"
            data-role="hud"
            data-testid="facilitator-hud"
            data-vote-status={onQuestion ? voteStatus : undefined}
            data-compact={isCompact ? "true" : "false"}
            className="hud-bar"
            onMouseEnter={() => {
              setIsHovered(true);
            }}
            onMouseLeave={() => {
              setIsHovered(false);
              resetAutoHideTimer();
            }}
            onFocus={() => {
              setIsFocused(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              resetAutoHideTimer();
            }}
          >
            {/* ── LEFT CLUSTER: STATE INSTRUMENT ── */}
            <div
              className="hud-cluster-status"
              data-strip-group="status"
              data-role="hud-status-cluster"
            >
              {/* Question / state chip: "Q1 of 12 · Voting open · 3 in" → "Q1 of 12 · Locked · 3" → "Q1 of 12 · Revealed" */}
              <div
                className="hud-chip"
                data-role="strip-phase-chip"
                data-vote-status={onQuestion ? voteStatus : undefined}
              >
                <span
                  aria-hidden="true"
                  className="hud-chip-dot"
                />
                <span data-role="strip-phase-text">{chipLine}</span>
              </div>

              {/* Live Timer Clock Chip */}
              {resolvedTimerDisplay && (
                <div
                  className="hud-clock-chip"
                  data-urgent={(activeTimer?.remainingMs ?? 10000) <= 5000}
                  data-role="strip-clock"
                  title="Remaining Time"
                >
                  <TimerIcon className="hud-icon hud-icon--sm" />
                  <span>{resolvedTimerDisplay}</span>
                </div>
              )}

              {/* Parked Alert Badge */}
              {effectiveParked && (
                <div
                  className="hud-parked-chip"
                  data-role="hud-parked-chip"
                >
                  <span>Parked</span>
                  <span>✓</span>
                </div>
              )}

              {/* Phones Count (relay-side count, when supplied) */}
              {resolvedPhones > 0 && (
                <div
                  className="hud-phones-chip"
                  title={`${resolvedPhones} audience phones connected`}
                >
                  <span className="hud-phones-dot" />
                  <span>{resolvedPhones} phones</span>
                </div>
              )}
            </div>

            {/* ── CENTER CLUSTER: BACK · LOCK (L) · ONE GOLD PRIMARY (REVEAL / NEXT) ── */}
            <div
              className="hud-cluster-flow"
              data-strip-group="show"
              role="group"
              aria-label="Presentation flow"
              data-role="hud-flow-cluster"
            >
              {/* Back Button */}
              <button
                type="button"
                id="hud-back"
                onClick={handleBack}
                disabled={setupIdle}
                aria-disabled={setupIdle}
                aria-label="Back (Left Arrow)"
                title={setupIdle ? "Back is idle until the lobby" : "Back (← Left Arrow)"}
                data-hud-action="back"
                data-testid="hud-back"
                className={ghostButtonClass}
              >
                <ChevronLeftIcon className="hud-icon" />
              </button>

              {/* Lock Button (L): visible on every live question, disabled once the votes are in */}
              {liveVoting && (
                <button
                  type="button"
                  id="hud-lock"
                  onClick={handleLock}
                  disabled={!canLock}
                  aria-disabled={!canLock}
                  aria-label={canLock ? "Lock votes (L)" : "Votes locked"}
                  title={canLock ? "Lock votes (L)" : "Votes locked"}
                  data-hud-action="lock"
                  data-testid="hud-lock"
                  data-locked={!canLock}
                  className={ghostButtonClass}
                >
                  <LockIcon className="hud-icon" />
                  <span>{canLock ? "Lock" : "Locked ✓"}</span>
                </button>
              )}

              {/* Primary follows the shared question, result, and explanation sequence. */}
              <button
                type="button"
                id="hud-advance"
                onClick={handlePrimary}
                disabled={primaryAction === "advance" ? nextIdle : setupIdle}
                aria-disabled={primaryAction === "advance" ? nextIdle : setupIdle}
                aria-label={primaryAction === "lock" ? "Lock votes (L)" : primaryAction === "reveal" ? "Reveal answer (Enter)" : `${primaryLabel} (Space or Right Arrow)`}
                title={setupIdle ? "Next is idle on Ready" : nextIdle ? "Next is idle on Closing" : primaryAction === "lock" ? (storeVotesIn === 0 && storePhonesJoined > 0 ? `Lock votes (L). ${storeVotesIn} of ${storePhonesJoined} in. Press Lock once.` : "Lock votes (L)") : primaryAction === "reveal" ? "Reveal answer (Enter)" : showdownArmed ? "Next again to start the duel (Space)" : showdownNeedsConfirm ? "Waiting for a pick. Next again starts the duel (Space)" : `${primaryLabel} (Space / → Right Arrow)`}
                data-hud-action={primaryAction}
                data-testid="hud-advance"
                data-role={primaryAction === "reveal" ? "reveal-button" : primaryAction === "lock" ? "lock-primary-button" : "advance-button"}
                className={nextIdle
                  ? ghostButtonClass
                  : "hud-button-primary"}
              >
                <span>{primaryLabel}</span>
                <ChevronRightIcon className="hud-icon" />
              </button>

              {/* HUD-COMPACT: at the row's end, only when the bar cannot also fit the utilities
                  cluster. Opens the sheet that carries Skip, Park, Timer, Sound, Full screen,
                  Pin, Shortcuts and Hide (the design call 2026-09-26, "A: one row + More"). */}
              {isCompact && (
                <button
                  type="button"
                  id="hud-more"
                  ref={moreButtonRef}
                  onClick={handleToggleMore}
                  aria-label="More controls"
                  aria-expanded={sheetOpen}
                  aria-controls="hud-more-sheet"
                  title="More controls"
                  data-hud-action="more"
                  data-testid="hud-more"
                  className={ghostButtonClass}
                >
                  <MoreIcon className="hud-icon" />
                </button>
              )}
            </div>

            {/* ── RIGHT CLUSTER: GHOST UTILITIES (hidden in compact mode, where the same 8
                controls render in the More sheet below instead, never in both places at once) ── */}
            {!isCompact && (
            <div
              className="hud-cluster-utilities"
              data-strip-group="settings"
              role="group"
              aria-label="Environment and session controls"
              data-role="hud-settings-cluster"
            >
              {/* Skip Button */}
              <button
                type="button"
                id="hud-skip"
                onClick={handleSkip}
                disabled={skipParkIdle}
                aria-disabled={skipParkIdle}
                aria-label={skipArmed ? "Skip again to leave this question (S)" : skipNeedsConfirm ? "Phones are still answering. Skip again to leave this question (S)" : "Skip question (S)"}
                title={skipParkIdle ? "Skip is idle off a live question" : skipArmed ? "Skip again to leave this question (S)" : skipNeedsConfirm ? "Phones are still answering. Skip again to leave this question (S)" : "Skip question (S)"}
                data-hud-action="skip"
                data-testid="hud-skip"
                data-armed={skipArmed || skipNeedsConfirm ? "true" : "false"}
                className={ghostButtonClass}
              >
                <SkipIcon className="hud-icon" />
              </button>

              {/* Park Button */}
              <button
                type="button"
                id="hud-park"
                onClick={handlePark}
                disabled={skipParkIdle}
                aria-disabled={skipParkIdle}
                aria-label="Park question for follow-up review (K)"
                aria-pressed={effectiveParked}
                title={skipParkIdle ? "Park is idle off a live question" : effectiveParked ? "Unpark question (K)" : "Park question (K)"}
                data-hud-action="park"
                data-testid="hud-park"
                className={ghostButtonClass}
              >
                <ParkIcon className="hud-icon" filled={effectiveParked} />
              </button>

              {/* Timer Toggle Button (T) */}
              <button
                type="button"
                id="hud-timer"
                onClick={handleToggleTimer}
                disabled={timerIdle}
                aria-disabled={timerIdle}
                aria-label={activeTimer?.enabled ? "Timer on: turn it off (T)" : "Timer off: turn it on (T)"}
                aria-pressed={Boolean(activeTimer?.enabled)}
                title={timerIdle ? "Timer is idle off a live question" : activeTimer?.enabled ? "Timer on (T)" : "Timer off (T)"}
                data-hud-action="toggle-timer"
                data-testid="hud-timer"
                className={ghostButtonClass}
              >
                <TimerIcon className="hud-icon" />
              </button>

              {/* Mute Audio Button */}
              <button
                type="button"
                id="hud-audio"
                onClick={handleToggleMute}
                aria-label={effectiveMuted ? "Unmute walk-in and cues (M)" : "Mute walk-in and cues (M)"}
                aria-pressed={effectiveMuted}
                title={effectiveMuted ? "Sound is off. Click to unmute (M)." : "Sound is on. Click to mute (M)."}
                data-hud-action="toggle-audio"
                data-testid="hud-mute"
                className={ghostButtonClass}
              >
                {effectiveMuted ? <VolumeMutedIcon className="hud-icon" /> : <VolumeOnIcon className="hud-icon" />}
                {effectiveMuted ? <span className="hud-mute-label">Muted</span> : null}
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                id="hud-fullscreen"
                onClick={handleToggleFullscreen}
                aria-label={effectiveFullscreen ? "Exit full screen (F)" : "Enter full screen (F)"}
                aria-pressed={effectiveFullscreen}
                title={effectiveFullscreen ? "Exit full screen (F)" : "Enter full screen (F)"}
                data-hud-action="fullscreen"
                data-testid="hud-fullscreen"
                className={ghostButtonClass}
              >
                {effectiveFullscreen ? <MinimizeIcon className="hud-icon" /> : <MaximizeIcon className="hud-icon" />}
              </button>

              {/* Pin Strip Button */}
              <button
                type="button"
                id="hud-pin"
                onClick={handleTogglePin}
                aria-label={isPinned ? "Unpin controls" : "Pin controls open"}
                aria-pressed={isPinned}
                title={isPinned ? "Unpin controls" : "Pin controls open"}
                data-hud-action="toggle-pin"
                data-testid="hud-pin"
                className={ghostButtonClass}
              >
                <PinIcon className="hud-icon" pinned={isPinned} />
              </button>

              {/* Keyboard Help Sheet Trigger (same sheet as ?). Explicit no-arg call: a bare
                  handleOpenHelp here would pass the click's MouseEvent as returnFocusId. */}
              <button
                type="button"
                id="hud-help"
                onClick={() => handleOpenHelp()}
                aria-label="Keyboard shortcuts (?)"
                title="Keyboard shortcuts (?)"
                data-hud-action="open-help"
                data-testid="hud-help"
                className={ghostButtonClass}
              >
                <HelpIcon className="hud-icon" />
              </button>

              {/* Hide Controls Button */}
              <button
                type="button"
                id="hud-hide"
                onClick={handleToggleHide}
                aria-label="Hide facilitator controls (H)"
                title="Hide controls (H)"
                data-hud-action="hide-controls"
                data-testid="hud-hide"
                className={ghostButtonClass}
              >
                <EyeOffIcon className="hud-icon" />
              </button>
            </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
      {sheetPanel}
    </div>
  );

  return createPortal(hudContent, portalContainer);
};

export const HUDMemo = React.memo(HUDComponentInner);
HUDMemo.displayName = "HUDMemo";

export const HUD: HUDComponent = (props) => {
  return <HUDMemo {...props} />;
};

HUD.displayName = "HUD";
HUD.defaultProps = {
  autoHideDelay: DEFAULT_AUTO_HIDE_DELAY_MS,
};

export default HUD;
