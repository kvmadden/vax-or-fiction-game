import React, { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Question as QuestionData,
  FormatId,
  VotingWindow,
  InteractionMode,
} from "../data/types";
import { answerLine, asksForReply, estimateStingLine, kindOptions, questionKind, rightToken, spokenReplyText, stageKindKicker } from "../engine/kinds";
import { stageBeatFor, voteStatusFor } from "../engine/vote-status";
import { getQuestionInstanceId, useGameStore } from "../store/game-store";
import { useRoom } from "../presentation/RoomContext";
import { useStageHudOverlap } from "../presentation/useStageHudOverlap";
import { ShowFrame } from "../components/show/ShowFrame";
import { ShowChrome } from "../components/show/ShowChrome";
import { StatusRail } from "../components/show/StatusRail";
// Question kind components
import { BinaryQuestion } from "./questions/BinaryQuestion";
import { MythAmongThree } from "./questions/MythAmongThree";
import { EstimateQuestion } from "./questions/EstimateQuestion";
import { OrderQuestion } from "./questions/OrderQuestion";
import { WhichPatientQuestion } from "./questions/WhichPatientQuestion";
import {
  createQuestionLocalState,
  localStateForQuestion,
  questionAnnouncement,
  updateLocalStateForQuestion,
  type QuestionPhase,
} from "./question-state";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";
import { EmphasizedText } from "../components/EmphasizedText";
import { questionIndexInRun, roomOutcome, roomRevealLine, roomStreakAt, roomStreakLine, showsRoomStreak } from "../engine/room-flavor";
import { useLook } from "../looks/look";
import { LookRevealBackdrop, LookRevealMark, LookRevealRibbon, LookShareBar } from "../looks/LookReveal";

export type { QuestionPhase } from "./question-state";

export interface QuestionProps {
  /** The clinical challenge question model */
  question?: QuestionData | null;
  /** Controlled question phase */
  phase?: QuestionPhase;
  /** Callback fired when phase changes */
  onPhaseChange?: (phase: QuestionPhase) => void;
  /** Callback fired when answer is revealed */
  onReveal?: () => void;
  /** Callback fired when votes are locked */
  onLock?: () => void;
  /** Default countdown timer duration in seconds (default: 30) */
  timerSeconds?: number;
  /** Viewport format (widescreen, square, portrait) */
  format?: FormatId;
  /** Alias for format */
  formatId?: FormatId;
  /** Controlled voting window state ('open' | 'talk' | 'locked') */
  votingWindow?: VotingWindow;
  /** Callback fired when voting window changes */
  onVotingWindowChange?: (window: VotingWindow) => void;
  /** Map of choice tokens to vote counts */
  votes?: Record<string, number>;
  /** Selected choice token */
  selectedChoice?: string | null;
  /** Callback fired when a choice is selected */
  onSelectChoice?: (choice: string) => void;
  /** Facilitation interaction mode ('facilitator' | 'polling') */
  interactionMode?: InteractionMode;
  /** Whether attendee interaction is enabled */
  interactive?: boolean;
  /** Auto-transition delay from entering to deliberating in ms (default: 700ms, 0 to disable) */
  autoDeliberateDelayMs?: number;
  /** Whether to render the countdown timer overlay (default: true) */
  showTimer?: boolean;
  /** Whether to render the voting window status overlay (default: true) */
  showVotingOverlay?: boolean;
  /** Optional container class name */
  className?: string;
}

/**
 * Question — Question Shell Screen Component
 *
 * Serves as the presentation shell for clinical questions in the Vax or Fiction deck:
 * 1. Routes to the specific question kind component:
 *    - BinaryQuestion ('binary')
 *    - MythAmongThree ('myth-among-three')
 *    - EstimateQuestion ('estimate')
 *    - OrderQuestion ('order')
 *    - WhichPatientQuestion ('which-patient')
 * 2. Manages the question lifecycle phases:
 *    entering -> deliberating -> locked -> revealed
 * 3. Mounts the stage status rail (Voting open · N in → Votes locked → Revealed) in the
 *    footer slot, with the countdown ring when the presenter has opted into the clock.
 *    Lock / Reveal / Next live in the facilitator HUD and on the keyboard (Space, L, Enter).
 * 4. Adheres strictly to the design system rules (no inline hex, 44px min touch targets,
 *    spacing scale, accessible typography).
 */
export const Question: React.FC<QuestionProps> = React.memo(({
  question,
  phase: controlledPhase,
  onPhaseChange,
  onReveal,
  onLock,
  timerSeconds: propTimerSeconds,
  format: propFormat,
  formatId: propFormatId,
  votingWindow: controlledVotingWindow,
  onVotingWindowChange,
  votes: propVotes,
  selectedChoice: controlledSelectedChoice,
  onSelectChoice,
  interactionMode: propInteractionMode,
  autoDeliberateDelayMs = 700,
  showTimer = true,
  showVotingOverlay = true,
  className = "",
}) => {
  const resolvedFormat: FormatId = propFormat || propFormatId || "widescreen";
  const reducedMotion = useReducedMotion();
  const { look } = useLook();
  const shellRef = useRef<HTMLDivElement>(null);

  useStageHudOverlap(shellRef, resolvedFormat, '--question-hud-overlap');

  // Store integration with fallback
  const storePhase = useGameStore((s) => s.phase);
  const storeDispatch = useGameStore((s) => s.dispatch);
  const storePollVotes = useGameStore((s) => s.pollVotes);
  const storePollVoters = useGameStore((s) => s.pollVoters);
  const storeInteractionMode = useGameStore((s) => s.interactionMode);
  const storeTimer = useGameStore((s) => s.timer);
  const storeRun = useGameStore((s) => s.run);
  const storeSlideIndex = useGameStore((s) => s.slideIndex);
  const storeQuestionInstanceId = useGameStore(getQuestionInstanceId);
  // 8.6: the host's own armed per-occurrence scramble, so the stage's order matches the phones'.
  const storeOrderScrambles = useGameStore((s) => s.orderScrambles);
  const storePhonesJoined = useGameStore((s) => Object.keys(s.seenDevices).length);
  const offlineMode = useGameStore((s) => Boolean(s.offlineMode));
  // The store's lock flag is the lock truth: L, Space and the HUD lock there without touching this
  // component's local sub-phase, and a reload keeps a locked question locked.
  const storeVotesLocked = useGameStore((s) => Boolean(s.votesLocked));
  const storeRoomQuestionStats = useGameStore((s) => s.roomStats?.questions);
  const { roomId } = useRoom();

  const interactionMode = propInteractionMode || storeInteractionMode || "facilitator";

  // Derive initial timer duration from props or question
  const initialSeconds = useMemo(() => {
    if (propTimerSeconds !== undefined) return Math.max(5, propTimerSeconds);
    return storeTimer.durationMs > 0 ? storeTimer.durationMs / 1000 : 30;
  }, [propTimerSeconds, storeTimer.durationMs]);

  // Local interaction state is keyed by question identity. A new question reads
  // as a clean session immediately, without an effect synchronizing old state.
  const questionId = question?.id ?? "";
  const ownsLiveQuestion = controlledPhase === undefined && question != null && question.id === storeRun[storeSlideIndex]?.id;
  const [storedLocalState, setStoredLocalState] = useState(() => createQuestionLocalState(questionId));
  const localState = localStateForQuestion(storedLocalState, questionId);
  const updateLocalState = useCallback(
    (update: Partial<Omit<typeof localState, "questionId">>) => {
      setStoredLocalState((current) => updateLocalStateForQuestion(current, questionId, update));
    },
    [questionId],
  );
  const { subPhase, votingWindow: internalVotingWindow, selectedChoice: internalSelectedChoice } = localState;

  // Synchronized Game Store Timer selection
  const storeRemainingMs = storeTimer?.remainingMs ?? 0;
  const storeTimerRunning = storeTimer?.running ?? false;
  const storeTimerDurationMs = storeTimer?.durationMs ?? 0;

  const remainingSeconds = storeTimerDurationMs > 0
    ? Math.max(0, Math.ceil(storeRemainingMs / 1000))
    : initialSeconds;

  // Helper to compute slide change announcement: "Question 2 of 5: Influenza Vaccination."
  const getSlideAnnouncement = useCallback(() => {
    if (!question) return "";
    const runQuestions = Array.isArray(storeRun)
      ? storeRun.filter((s: any) => s.type === "question" || Boolean(s.statement) || Boolean(s.kind) || Boolean(s.questionId))
      : [];
    const currentQIdx = runQuestions.findIndex((q: any) => q.id === question.id);
    const qAny = question as Record<string, any>;
    const qNum = qAny.displayNumber ?? question.index ?? (currentQIdx >= 0 ? currentQIdx + 1 : (storeSlideIndex >= 0 ? storeSlideIndex + 1 : 1));
    const qTotal = qAny.displayCount ?? (runQuestions.length > 0 ? runQuestions.length : 5);
    const rawTitle = qAny.title || question.topic || qAny.headline || question.statement || "Question";
    const cleanTitle = String(rawTitle).trim().replace(/\.+$/, "");
    return `Question ${qNum} of ${qTotal}: ${cleanTitle}.`;
  }, [question, storeRun, storeSlideIndex]);

  const timerQuestionIdRef = useRef<string>(questionId);

  // Resolve effective phase
  const effectivePhase: QuestionPhase = useMemo(() => {
    if (controlledPhase !== undefined) return controlledPhase;
    // Map store phase if available
    if (storePhase === "revealed" || storePhase === "explaining") return storePhase;
    if (storePhase === "timedOut") return "locked";
    if (storeVotesLocked && (subPhase === "entering" || subPhase === "deliberating")) return "locked";
    if (ownsLiveQuestion && storePhase === "deliberating") return "deliberating";
    // Local transitions must trigger rendering even when the host phase stays entering.
    return subPhase;
  }, [controlledPhase, storePhase, storeVotesLocked, subPhase, ownsLiveQuestion]);

  // Resolve effective voting window
  const effectiveVotingWindow: VotingWindow = useMemo(() => {
    if (controlledVotingWindow !== undefined) return controlledVotingWindow;
    if (["locked", "revealed", "explaining"].includes(effectivePhase)) return "locked";
    return internalVotingWindow;
  }, [controlledVotingWindow, effectivePhase, internalVotingWindow]);

  const currentSelectedChoice =
    controlledSelectedChoice !== undefined ? controlledSelectedChoice : internalSelectedChoice;

  // Handle phase change
  const changePhase = useCallback(
    (nextPhase: QuestionPhase) => {
      updateLocalState({
        subPhase: nextPhase,
        ...(["locked", "revealed", "explaining"].includes(nextPhase)
          ? { votingWindow: "locked" as const }
          : nextPhase === "deliberating"
            ? { votingWindow: "open" as const }
            : {}),
      });
      onPhaseChange?.(nextPhase);

      if (nextPhase === "locked" && ownsLiveQuestion) {
        storeDispatch?.({ type: "LOCK_VOTES" });
        storeDispatch?.({ type: "SET_TIMER", running: false, pauseReason: "timedOut" });
        onVotingWindowChange?.("locked");
        onLock?.();
      } else if (nextPhase === "revealed" && ownsLiveQuestion) {
        storeDispatch?.({ type: "REVEAL" });
        storeDispatch?.({ type: "SET_TIMER", running: false, pauseReason: "revealed" });
        onVotingWindowChange?.("locked");
        onReveal?.();
      } else if (nextPhase === "deliberating" && ownsLiveQuestion && storeQuestionInstanceId) {
        storeDispatch?.({ type: "BEGIN_DELIBERATION", questionInstanceId: storeQuestionInstanceId });
        onVotingWindowChange?.("open");
      }
    },
    [updateLocalState, onPhaseChange, onVotingWindowChange, onLock, onReveal, storeDispatch, ownsLiveQuestion, storeQuestionInstanceId]
  );

  // A11Y-06: the same text and framing the reveal card's canonical-verdict heading shows,
  // computed once so the announcement and the visible card can never say something different.
  // W3: also carries the card's own eyebrow ("The myth", "Better reply") and whether the text is
  // already a full sentence (order's "Correct order"), so questionAnnouncement never re-derives
  // a framing the card does not use.
  // LINT: this was a useMemo, but the React Compiler could not prove it stayed memoized (oxlint
  // react(preserve-manual-memoization) at this line). Nothing downstream depends on its identity
  // (only questionAnnouncement's plain object arg and the JSX text below, both value consumers, not
  // dependency-array entries), and computing it is a handful of lookups on a small options array, so
  // manual memoization is not required for semantics. Plain const, per the lint's own suggested fix.
  const revealedAnswer = (() => {
    if (!question) return { text: "", label: undefined as string | undefined, isSentence: false };
    const kindId = questionKind(question);
    const options = kindOptions(question) ?? [];
    const correctToken = rightToken(question);
    const correctOption = options.find((option) => option.token === correctToken);
    if (kindId === "which-patient") {
      return {
        text: spokenReplyText(question, correctOption?.text ?? ""),
        label: asksForReply(question) ? "Better reply" : "Best answer",
        isSentence: false,
      };
    }
    if (kindId === "myth-among-three") return { text: correctOption?.text ?? "", label: "The myth", isSentence: false };
    if (kindId === "order") return { text: "Correct order", label: undefined, isSentence: true };
    return { text: answerLine(question), label: undefined, isSentence: false };
  })();
  const revealedAnswerText = revealedAnswer.text;

  const announcementText = questionAnnouncement({
    phase: effectivePhase,
    remainingSeconds,
    slideAnnouncement: getSlideAnnouncement(),
    votesIn: questionId ? Object.keys(storePollVoters[questionId] ?? {}).length : 0,
    phonesJoined: storePhonesJoined,
    revealedAnswerText,
    revealedAnswerLabel: revealedAnswer.label,
    revealedAnswerIsSentence: revealedAnswer.isSentence,
  });

  // The timer is external store state. Synchronize it once when the question identity changes.
  useEffect(() => {
    if (ownsLiveQuestion && questionId && questionId !== timerQuestionIdRef.current) {
      timerQuestionIdRef.current = questionId;
      storeDispatch?.({
        type: "SET_TIMER",
        durationMs: initialSeconds * 1000,
        remainingMs: initialSeconds * 1000,
        running: false,
        enabled: storeTimer.enabled,
        visible: storeTimer.visible,
      });
    }
  }, [questionId, initialSeconds, storeDispatch, storeTimer.enabled, storeTimer.visible, ownsLiveQuestion]);

  // Ensure store timer is initialized for current question if entering directly into deliberating
  useEffect(() => {
    if (ownsLiveQuestion && effectivePhase === "deliberating" && storeTimer.enabled && storeTimerDurationMs === 0) {
      storeDispatch?.({
        type: "SET_TIMER",
        durationMs: initialSeconds * 1000,
        remainingMs: initialSeconds * 1000,
        running: true,
        enabled: true,
        visible: true,
      });
    }
  }, [effectivePhase, storeTimerDurationMs, initialSeconds, storeDispatch, storeTimer.enabled, ownsLiveQuestion]);

  // Auto-advance from entering to deliberating
  useEffect(() => {
    if (effectivePhase === "entering") {
      if (autoDeliberateDelayMs > 0) {
        const timer = setTimeout(() => {
          changePhase("deliberating");
        }, autoDeliberateDelayMs);
        return () => clearTimeout(timer);
      }
    }
  }, [effectivePhase, autoDeliberateDelayMs, changePhase]);

  // Facilitator countdown clock effect during deliberating phase
  useEffect(() => {
    if (!ownsLiveQuestion || effectivePhase !== "deliberating" || !storeTimerRunning) {
      return;
    }

    const interval = setInterval(() => {
      storeDispatch?.({ type: "TICK_TIMER" });
    }, 1000);

    return () => clearInterval(interval);
  }, [effectivePhase, storeTimerRunning, storeDispatch, ownsLiveQuestion]);

  // Transition to locked when countdown reaches 0
  useEffect(() => {
    if (storeTimer.enabled && remainingSeconds === 0 && effectivePhase === "deliberating") {
      const timer = setTimeout(() => changePhase("locked"), 0);
      return () => clearTimeout(timer);
    }
  }, [remainingSeconds, effectivePhase, changePhase, storeTimer.enabled]);

  // Choice selection handler
  const handleSelectChoice = useCallback(
    (choice: string) => {
      if (["locked", "revealed", "explaining"].includes(effectivePhase)) return;
      if (controlledSelectedChoice === undefined) {
        updateLocalState({ selectedChoice: choice });
      }
      onSelectChoice?.(choice);
    },
    [effectivePhase, controlledSelectedChoice, onSelectChoice, updateLocalState]
  );

  // Reveal handler
  const handleReveal = useCallback(() => {
    if (effectivePhase !== "revealed" && effectivePhase !== "explaining") {
      changePhase("revealed");
    }
  }, [effectivePhase, changePhase]);

  // Resolve votes data
  const votes = useMemo(() => {
    if (propVotes) return propVotes;
    if (storePollVotes && question?.id && storePollVotes[question.id]) {
      return storePollVotes[question.id] as Record<string, number>;
    }
    return undefined;
  }, [propVotes, storePollVotes, question?.id]);

  // Derived kind
  const kind = questionKind(question);
  const stageKicker = stageKindKicker(question);
  const joinHost = typeof window === "undefined" ? "" : window.location.host;
  // Run slots carry their position in the run (displayNumber); the authored index is the fallback.
  const questionNumber = (question as Record<string, any> | null)?.displayNumber ?? question?.index ?? Math.max(1, storeSlideIndex + 1);
  const revealBeat = effectivePhase === "revealed" || effectivePhase === "explaining";
  const beatKey = effectivePhase === "explaining" ? "explain" : effectivePhase === "revealed" ? "result" : "ask";
  // Game night (VOF-88, VOF-89): the room's own outcome decides the reveal line, the gold burst and
  // the room streak pill. Only a phone-voting room has an outcome, and only the revealed beat names it.
  const outcome = effectivePhase === "revealed" && question && !offlineMode && interactionMode === "polling"
    ? roomOutcome(question, votes)
    : null;
  const roomLine = roomRevealLine(outcome);
  // Walked from the question's own place in the run, never the live slide index: a card leaving the
  // stage re-renders after the index has moved on, and it keeps its pill through the dissolve.
  const ownRunIndex = questionIndexInRun(storeRun, storeSlideIndex, question?.id);
  const roomStreak = outcome === "right"
    ? ownRunIndex >= 0 ? roomStreakAt(storeRun, ownRunIndex, storeRoomQuestionStats, true) : 1
    : 0;
  const showRoomStreak = showsRoomStreak(outcome, roomStreak);
  // The arrival line belongs to a question's first posed beat. Once its votes lock it is spent, so a
  // reopened vote, or a locked card on its way out, never plays it again (game-night.css). The question
  // that spent it is remembered from the render that saw the lock, the same way this component keeps the
  // rest of its per-question state.
  const [arrivalSpentFor, setArrivalSpentFor] = useState<string | null>(null);
  const pastPosed = effectivePhase === "locked" || effectivePhase === "revealed" || effectivePhase === "explaining";
  if (questionId && pastPosed && arrivalSpentFor !== questionId) setArrivalSpentFor(questionId);
  const arrivalSpent = questionId !== "" && arrivalSpentFor === questionId;
  const sourceLabel = useMemo(() => {
    if (typeof question?.source === "string") return question.source;
    if (question?.source?.shortDisplayLine) return question.source.shortDisplayLine;
    return question?.citations?.[0]?.shortDisplayLine || question?.guidelineRef || "";
  }, [question]);

  // Render specific kind component
  const renderKindComponent = () => {
    if (!question) {
      return (
        <section className="question-beat question-hold" data-screen="question" data-stage-beat="next" data-role="empty-question">
          <h1>Next question</h1>
          <p>Look up. The next one is coming.</p>
        </section>
      );
    }

    if (effectivePhase === "explaining") {
      const explanation = question.reveal?.trim() || question.takeaway?.trim() || "Look up. The presenter is walking through the evidence.";
      const explanationEmphasis = question.reveal?.trim() ? question.revealEmphasis : question.takeawayEmphasis;
      const takeaway = question.takeaway?.trim();
      return <section className="question-beat question-explanation" data-screen="question" data-kind={kind} data-question-id={question.id} data-stage-beat="explanation">
        <div className="question-explanation-copy stage-glass" data-role="stage-explanation">
          {/* FAC-08 (design call 2026-09-25): every kind keeps the statement here, matching how
              estimate and order already showed it. question.scenario is the fallback for the rare
              question missing a statement, same as ShowChrome's evidenceDetails below (VOF-31: never
              hide the statement behind the scenario). */}
          {(question.statement || question.scenario) && <p className="question-beat-context" data-role="question-context"><EmphasizedText text={question.statement || question.scenario || ""} phrases={question.emphasis} /></p>}
          {takeaway && takeaway !== explanation && <h2 data-role="takeaway"><EmphasizedText text={takeaway} phrases={question.takeawayEmphasis} tone="heading" /></h2>}
          <p data-role="reveal-reason"><EmphasizedText text={explanation} phrases={explanationEmphasis} /></p>
        </div>
      </section>;
    }
    if (effectivePhase === "revealed") {
      const options = kindOptions(question) ?? [];
      const correctToken = rightToken(question);
      const correctOption = options.find(option => option.token === correctToken);
      const lettered = kind === "which-patient" || kind === "myth-among-three";
      const total = Object.values(votes ?? {}).reduce((sum, count) => sum + count, 0);
      const tone = kind === "binary" ? question.answer === false ? "fiction" : "vax" : "gold";
      const sting = kind === "estimate" ? estimateStingLine(question) : "";
      // W3: the same label the sr-only announcement above now uses, so the card and the
      // announcement can never name the choice differently.
      const resultEyebrow = revealedAnswer.label;
      const lookArt = { kind, tone, outcome };
      // In a drawn look the verdict's length rides on the section, so the look can size a binary or number verdict to its card.
      const verdictLength = look === "today" ? undefined : { ["--look-verdict-len" as string]: Math.max(1, revealedAnswerText.length) };
      return <section className="question-beat question-result" data-screen="question" data-kind={kind} data-question-id={question.id} data-stage-beat="result" data-tone={tone} data-sting={sting ? "true" : "false"} data-room-outcome={outcome ?? undefined} style={verdictLength}>
        {/* Show looks: behind the card, and nothing in today's look. */}
        <LookRevealBackdrop {...lookArt} />
        <div className="question-result-card stage-glass">
          {roomLine && <p className="question-result-room-line" data-role="room-reveal-line">{roomLine}</p>}
          {showRoomStreak && <p className="room-streak-pill" data-role="room-streak-pill" data-streak={roomStreak}>{roomStreakLine(roomStreak)}</p>}
          {lettered && <span className="question-result-key" aria-hidden="true">{correctOption?.label}</span>}
          <div className="question-result-copy">
            {lettered && <p className="question-result-eyebrow">{resultEyebrow}</p>}
            <h1 data-role="canonical-verdict" className="question-result-answer">{revealedAnswerText}</h1>
            <LookRevealMark {...lookArt} />
            {sting ? <p className="question-result-sting" data-role="result-sting">{sting}</p> : null}
            {kind === "order" && <ol className="question-result-order" data-role="correct-order">{question.steps?.map((step, index) => <li key={index}>{step}</li>)}</ol>}
          </div>
          <LookRevealRibbon {...lookArt} />
        </div>
        {!offlineMode && interactionMode === "polling" && total > 0 && options.length > 0 && <div className="question-result-poll" data-role="result-distribution" aria-label="Room answers" data-count={look === "today" ? undefined : options.length}>
          {options.map(option => {
            const count = votes?.[option.token] ?? 0;
            const countLabel = `${count} ${count === 1 ? "vote" : "votes"}`;
            const share = Math.round((count / total) * 100);
            // In a drawn look the share also rides on the row as a number, so the look can fill a bar to it.
            return <div key={option.token} data-correct={option.token === correctToken} aria-label={`${option.label}: ${countLabel}`} style={look === "today" ? undefined : { ["--share" as string]: share }}>
              <span>{option.label}</span><strong>{share}%</strong>
              <small>{countLabel}</small>
              <LookShareBar />
            </div>;
          })}
        </div>}
      </section>;
    }
    switch (kind) {
      case "myth-among-three":
        return (
          <MythAmongThree
            question={question}
            selectedChoice={currentSelectedChoice}
            onSelectChoice={handleSelectChoice}
            votes={votes}
            showVotes={effectivePhase === "locked"}
            format={resolvedFormat}
            interactive={false}
          />
        );

      case "estimate":
        return (
          <EstimateQuestion
            question={question}
            choices={effectivePhase === "locked" ? votes : undefined}
            showVotes={effectivePhase === "locked"}
            showChoicesBeforeLock={offlineMode || interactionMode !== "polling"}
            format={resolvedFormat}
            selectedToken={currentSelectedChoice ?? undefined}
            onSelectRange={handleSelectChoice}
          />
        );

      case "order":
        return (
          <OrderQuestion
            question={question}
            displayOrder={storeQuestionInstanceId ? storeOrderScrambles[storeQuestionInstanceId]?.order ?? null : null}
            format={resolvedFormat}
            showControls={false}
          />
        );

      case "which-patient":
        return (
          <WhichPatientQuestion
            question={question}
            selectedChoice={currentSelectedChoice}
            onSelectChoice={handleSelectChoice}
            onReveal={handleReveal}
            format={resolvedFormat}
          />
        );

      case "binary":
      default:
        return (
          <BinaryQuestion
            question={question}
            selectedChoice={currentSelectedChoice as "true" | "false" | null}
            onSelectChoice={(choice) => handleSelectChoice(choice)}
            votes={votes}
            showVotes={effectivePhase === "locked"}
            format={resolvedFormat}
            formatId={resolvedFormat}
            interactionMode={interactionMode}
            interactive={false}
          />
        );
    }
  };

  return (
    <div
      ref={shellRef}
      className={`question-shell question-flow ${className}`}
      data-comp-id="question-shell"
      data-kind={kind}
      data-phase={effectivePhase}
      data-stage-beat={!question ? "next" : effectivePhase === "revealed" ? "result" : effectivePhase === "explaining" ? "explanation" : effectivePhase === "locked" ? "locked" : "posed"}
      data-voting-window={effectiveVotingWindow}
      data-arrival={arrivalSpent ? "spent" : "fresh"}
      data-room-outcome={outcome ?? undefined}
      data-format={resolvedFormat}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        // Transparent (Game night rollout): inside the show the router's stage atmosphere, the
        // spotlight cones and the scrims, lives behind every beat. On its own the ShowFrame paints
        // the stage.
        backgroundColor: "transparent",
        color: "var(--color-ink)",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Live Region for Screen Readers (WCAG 4.1.3 / A11Y-04 / JUDGE-A06) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcementText}
      </div>

      {/* ─── MAIN QUESTION KIND SURFACE ────────────────────────────────────── */}
      <div
        className="question-kind-container"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        <ShowFrame
          layout="show"
          scrim={revealBeat ? "left" : "center"}
          className={`question-show-frame question-show-frame--${kind}`}
          beat={revealBeat ? "reveal" : "deliberating"}
        >
          {question ? (
          <div className="question-source-header">
            <span className="question-source-number" data-role="question-number">
              {String(questionNumber).padStart(2, "0")}
            </span>
            <p className="question-source-kicker" data-role="question-kicker">
              {/* The words carry their own box, so a plate painted on them hugs every line (VOF-99, Today's kicker). */}
              <span className="question-source-kicker__words">{effectivePhase === "revealed" ? "The answer" : effectivePhase === "explaining" ? "Why it matters" : stageKicker}</span>
            </p>
          </div>
          ) : null}
          <ShowChrome roomId={roomId} joinHost={joinHost} sourceLabel={sourceLabel}
            sourceCitation={question?.citations?.[0] ?? (question?.source && typeof question.source === "object" ? question.source : null)}
            footerStatus={showVotingOverlay && question ? (
              <StatusRail
                status={voteStatusFor({ phase: effectivePhase, votesLocked: storeVotesLocked })}
                beat={stageBeatFor({ phase: effectivePhase, votesLocked: storeVotesLocked })}
                questionId={question?.id ?? null}
                offline={offlineMode || interactionMode !== "polling"}
                showTimer={showTimer}
              />
            ) : undefined}
            evidenceVisible={revealBeat}
            evidenceDetails={effectivePhase === "explaining" && question ? {
              question: question.statement || question.scenario || "",
              questionEmphasis: question.emphasis,
              takeaway: question.takeaway,
              takeawayEmphasis: question.takeawayEmphasis,
              explanation: question.reveal,
              explanationEmphasis: question.revealEmphasis,
              citations: question.citations ?? (question.source && typeof question.source === "object" ? [question.source] : []),
            } : undefined}>
            <div className="question-beat-stack">
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={`${questionId}:${beatKey}`}
                  className="question-beat-pane"
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reducedMotion ? undefined : { opacity: 0, pointerEvents: "none" }}
                  transition={{
                    duration: reducedMotion ? 0 : SCREEN_FADE_S,
                    ease: SCREEN_FADE_EASE,
                  }}
                >
                  {renderKindComponent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </ShowChrome>
        </ShowFrame>
      </div>

    </div>
  );
});

Question.displayName = "Question";

export default Question;
export { Question as QuestionShell };
