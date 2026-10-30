import React, { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { useGameStore } from "../store/game-store";
import type { FormatId, GamePhase } from "../data/types";
import { shouldTapPrimaryOnAdvance, tapPrimary } from "../engine/audio-cues";
import { slideAudioKind } from "../engine/audio-lifecycle";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";

import { Lobby } from "./Lobby";
import { Preflight } from "./Preflight";
import { TitleSlide } from "./TitleSlide";
import { InstructionsSlide } from "./InstructionsSlide";
import { QuestionShell } from "./QuestionShell";
import { Leaderboard } from "./Leaderboard";
import { Showdown } from "./Showdown";
import { Closing } from "./Closing";
import { LookStage } from "../looks/LookStage";
import { useAnnounceLookBeat } from "../looks/look-beat";
import { TopicPatternSlot } from "../looks/patterns/TopicPatternSlot";

export type ScreenName =
  | "Lobby"
  | "Preflight"
  | "TitleSlide"
  | "InstructionsSlide"
  | "QuestionShell"
  | "Leaderboard"
  | "Showdown"
  | "Closing";

export interface ScreenRouterProps {
  /** Explicit game phase override (takes precedence over store) */
  gamePhase?: GamePhase | string;
  /** Alias for gamePhase */
  phase?: GamePhase | string;
  /** Explicit screen component name override */
  screen?: ScreenName;
  /** Current slide data override */
  currentSlide?: any;
  /** Active layout format */
  format?: FormatId;
  /** Custom transition direction */
  transitionDirection?: "forward" | "backward" | "fade";
  /** Additional props passed directly to the rendered active screen component */
  screenProps?: Record<string, any>;
  /** Container CSS class name */
  className?: string;
  /** Container CSS inline styles */
  style?: React.CSSProperties;
  /** Custom onAdvance callback override */
  onAdvance?: () => void;
  /** Custom onBack callback override */
  onBack?: () => void;
}

/**
 * Opacity-only crossfade (mode="sync") — no slide chrome.
 * Enter and exit share one duration so the dissolve stays complementary.
 */
const screenTransitionVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: SCREEN_FADE_S,
      ease: SCREEN_FADE_EASE,
    },
  },
  exit: {
    opacity: 0,
    pointerEvents: "none",
    transition: {
      duration: SCREEN_FADE_S,
      ease: SCREEN_FADE_EASE,
    },
  },
};

const reducedMotionTransitionVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.01,
      ease: "linear",
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.01,
      ease: "linear",
    },
  },
};

/**
 * Persistent stage scrim for the router atmosphere layer.
 * Matches ShowFrame call-site choices so the field does not jump when content crossfades.
 */
function atmosphereScrimFor(
  screen: ScreenName,
  phase: GamePhase | string,
): "left" | "center" {
  if (screen === "Lobby" || screen === "InstructionsSlide") return "left";
  if (screen === "QuestionShell" && (phase === "revealed" || phase === "explaining")) return "left";
  return "center";
}

/**
 * ScreenRouter
 *
 * Root screen orchestrator and transition router for Vax or Fiction.
 * Reads gamePhase and active slide state from Zustand store (or takes overrides as props),
 * and smoothly switches between all 10 screen components with Framer Motion AnimatePresence.
 */
export const ScreenRouter: React.FC<ScreenRouterProps> = React.memo(({
  gamePhase: propGamePhase,
  phase: propPhase,
  screen: propScreen,
  currentSlide: propCurrentSlide,
  format: propFormat,
  screenProps = {},
  className = "",
  style = {},
  onAdvance: propOnAdvance,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Zustand Store Selectors
  const storePhase = useGameStore((s) => s.phase);
  const storeSlideIndex = useGameStore((s) => s.slideIndex);
  const storeRun = useGameStore((s) => s.run);
  const storeFormatId = useGameStore((s) => s.formatId);
  const storeVotesLocked = useGameStore((s) => s.votesLocked);
  const storeOffline = useGameStore((s) => Boolean(s.offlineMode));
  const dispatch = useGameStore((s) => s.dispatch);

  // Resolved Phase & Slide
  const activePhase = (propGamePhase ?? propPhase ?? storePhase ?? "lobby") as GamePhase | string;
  const activeFormat: FormatId = propFormat ?? storeFormatId ?? "widescreen";

  const activeSlide = useMemo(() => {
    if (propCurrentSlide !== undefined) return propCurrentSlide;
    if (Array.isArray(storeRun) && storeSlideIndex >= 0 && storeSlideIndex < storeRun.length) {
      return storeRun[storeSlideIndex];
    }
    return null;
  }, [propCurrentSlide, storeRun, storeSlideIndex]);

  // Screen Resolution Logic
  const activeScreenName: ScreenName = useMemo(() => {
    if (propScreen) return propScreen;

    // 1. Direct Phase Resolution
    switch (activePhase) {
      case "preFlight":
      case "modePicker":
      case "deckPicker":
      case "formatPicker":
        return "Preflight";
      case "lobby":
        return "Lobby";
      case "showdown":
        return "Showdown";
      case "leaderboard":
        return "Leaderboard";
      case "closing":
      case "outro":
        return "Closing";
      case "title":
        return "TitleSlide";
      case "instructions":
        return "InstructionsSlide";
    }

    // 2. Slide-Driven Resolution during Run / Gameplay Phases
    if (activeSlide) {
      const slideType = activeSlide.type || activeSlide.kind || activeSlide.id;
      if (slideType === "title" || activeSlide.id === "title") return "TitleSlide";
      if (slideType === "instructions" || activeSlide.id === "instructions") return "InstructionsSlide";
      if (slideType === "closing") return "Closing";
      if (slideType === "fork" || slideType === "halftime" || slideType === "focus") return "QuestionShell";
      if (slideType === "showdown") return "Showdown";
      return "QuestionShell";
    }

    // 3. Fallback for Question Deliberation Phases
    if (
      activePhase === "entering" ||
      activePhase === "deliberating" ||
      activePhase === "timedOut" ||
      activePhase === "locked" ||
      activePhase === "revealed" ||
      activePhase === "explaining" ||
      activePhase === "question"
    ) {
      return "QuestionShell";
    }

    // A leftover run slide must not snap back to lobby chrome (QR + walk-in).
    if (activeSlide) return "QuestionShell";
    return "Lobby";
  }, [activePhase, activeSlide, propScreen]);

  // Standard Navigation Actions
  const handleAdvance = () => {
    // Lobby Open the stage stays silent. Title Next is silent because the
    // walk-in fade onto instructions owns that beat. Instructions Start still taps.
    if (shouldTapPrimaryOnAdvance(String(activePhase), {
      votesLocked: storeVotesLocked,
      offlineMode: storeOffline,
      slideType: slideAudioKind(activeSlide),
    })) {
      tapPrimary();
    }
    if (propOnAdvance) {
      propOnAdvance();
    } else {
      dispatch({ type: "ADVANCE" });
    }
  };

  // Render Component Mapping
  const renderScreen = () => {
    switch (activeScreenName) {
      case "Preflight":
        // No format prop here (VOF-AUDIO-RETRY-ROT): every other case threads activeFormat to
        // shape its own stage canvas. Preflight has no canvas to shape, and it only reads the format
        // to check the right radio in its own picker. activeFormat is stageFormat from
        // PresentationSuite, deliberately pinned to widescreen while stageInSetupChrome is true
        // (every Preflight render), so passing it here permanently pinned the picker's checked
        // state to Widescreen regardless of what the host picked. Preflight's own storeState.formatId
        // fallback already reads the live selection correctly once this prop stops shadowing it.
        return (
          <Preflight
            onLaunchLobby={() => dispatch({ type: "ENTER_LOBBY" })}
            {...screenProps}
          />
        );
      case "Lobby":
        return (
          <Lobby
            format={activeFormat}
            
            onOpenStage={handleAdvance}
            
            {...screenProps}
          />
        );
      case "TitleSlide":
        return (
          <TitleSlide
            slide={activeSlide}
            format={activeFormat}
            
            title={activeSlide?.title}
            body={activeSlide?.body || activeSlide?.subtitle}
            eyebrow={activeSlide?.eyebrow}
            onStart={handleAdvance}
            {...screenProps}
          />
        );
      case "InstructionsSlide":
        return (
          <InstructionsSlide
            slide={activeSlide}
            format={activeFormat}
            
            title={activeSlide?.title}
            body={activeSlide?.body}
            steps={activeSlide?.steps}
            onStart={handleAdvance}
            {...screenProps}
          />
        );
      case "QuestionShell":
        return (
          <QuestionShell
            format={activeFormat}
            // AnimatePresence retains this element while the next store phase is already live.
            // Keep its settled beat stable so a new mechanic subtree cannot join an in-flight exit.
            phase={activePhase === "revealed" || activePhase === "explaining" ? activePhase : undefined}
            
            question={activeSlide}
            onReveal={() => dispatch({ type: "REVEAL" })}
            onLock={() => dispatch({ type: "LOCK_VOTES" })}
            {...screenProps}
          />
        );
      case "Leaderboard":
        return (
          <Leaderboard
            format={activeFormat}
            {...screenProps}
          />
        );
      case "Showdown":
        return (
          <Showdown
            format={activeFormat}
            {...screenProps}
          />
        );
      case "Closing":
        return (
          <Closing
            slide={activeSlide}
            format={activeFormat}
            
            
            
            {...screenProps}
          />
        );
      default:
        return (
          <Lobby
            format={activeFormat}
            
            onOpenStage={handleAdvance}
            
            {...screenProps}
          />
        );
    }
  };

  // Screen changes and question index only — beat changes (lock / reveal / why)
  // stay inside QuestionShell so chrome does not remount.
  const transitionKey = `${activeScreenName}-${storeSlideIndex >= 0 ? storeSlideIndex : activePhase}`;
  // A new screen or a new question is the moment a look's late picture is taken (look-beat.ts), so in a normal show it never lands mid-question.
  useAnnounceLookBeat(transitionKey);
  const atmosphereScrim = atmosphereScrimFor(activeScreenName, activePhase);
  // The topic pattern follows a question and nothing else. A showdown or a leaderboard leaves the last question's slide
  // in the run, so the screen decides, not the slide.
  const patternStatement = activeScreenName === "QuestionShell" && typeof activeSlide?.statement === "string" ? activeSlide.statement : null;

  return (
    <div
      className={`screen-router-root ${className}`}
      data-testid="screen-router"
      data-active-screen={activeScreenName}
      data-game-phase={activePhase}
      style={{
        backgroundColor: "var(--color-stage-deep)",
        ...style,
      }}
    >
      {/* One lights+scrim field for the stage. Both scrim weights stay mounted and
          crossfade so ask→reveal does not hard-cut the atmosphere under the beat dissolve.
          Per-screen ShowFrames still mount their own for standalone/SSR; CSS suppresses
          them inside the router so sync crossfades do not stack beam fields. */}
      <div className="stage-atmosphere" aria-hidden="true" data-scrim={atmosphereScrim}>
        {/* Show looks (VOF-93): the host's pick, drawn or as a picture, under the scrims. Nothing in today's look. */}
        <LookStage format={activeFormat} />
        {/* Topic patterns (VOF-94): the question's topic as a soft texture, over the set and under the scrims, on a question only. */}
        <TopicPatternSlot surface="stage" statement={patternStatement} />
        <div
          className="show-scrim show-scrim--left"
          data-active={atmosphereScrim === "left" ? "true" : "false"}
        />
        <div
          className="show-scrim show-scrim--center"
          data-active={atmosphereScrim === "center" ? "true" : "false"}
        />
        <div className="show-lights" />
        {/* The pre-show's spotlights. They crossfade with the question beams above when the show
            moves from the instructions into question 1, rather than cutting. */}
        <div className="stage-cones">
          <span className="stage-cone stage-cone--vax" />
          <span className="stage-cone stage-cone--fiction" />
        </div>
      </div>
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={transitionKey}
          variants={shouldReduceMotion ? reducedMotionTransitionVariants : screenTransitionVariants}
          initial={shouldReduceMotion ? false : "initial"}
          animate="animate"
          exit={shouldReduceMotion ? undefined : "exit"}
          className="screen-router-viewport"
          data-role="screen-container"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

ScreenRouter.displayName = "ScreenRouter";

export default ScreenRouter;
