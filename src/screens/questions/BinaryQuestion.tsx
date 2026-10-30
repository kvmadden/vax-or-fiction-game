import React, { useState, useMemo, useRef } from "react";
import { ArrivalKicker } from "./ArrivalKicker";
import { motion, useReducedMotion } from "framer-motion";
import { Question, FormatId, InteractionMode, Citation } from "../../data/types";
import { questionSplitRules } from "../../design/theme";
import { kindEyebrow } from "../../engine/kinds";
import { tapAnswer } from '../../engine/audio-cues';
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../../ui/screen-fade";
import { stageFit } from "./stage-fit";
import { useMeasuredStemStep } from "./use-measured-stem-step";
import { tallyPlacement } from "./stage-text";
import { EmphasizedText } from "../../components/EmphasizedText";
import { useGameStore } from "../../store/game-store";

export interface BinaryQuestionTally {
  trueCount: number;
  falseCount: number;
  truePercent: number;
  falsePercent: number;
}

export interface BinaryQuestionProps {
  /** The clinical question definition */
  question: Question;
  /** Currently selected choice token ('true' | 'false') */
  selectedChoice?: "true" | "false" | string | null;
  /** Callback fired when an attendee or presenter selects a choice */
  onSelectChoice?: (choice: "true" | "false") => void;
  /** Alias callback for choice selection */
  onChoice?: (choice: "true" | "false") => void;
  /** Direct map of choice tokens to vote counts (e.g. { true: 24, false: 12 }) */
  votes?: Record<string, number>;
  /** Structured tally with precalculated percentages */
  tally?: BinaryQuestionTally;
  /** Whether to render vote counts and percentage fills */
  showVotes?: boolean;
  /** Canvas layout format (widescreen, square, portrait) */
  format?: FormatId;
  /** Alias for format */
  formatId?: FormatId;
  /** Interaction mode */
  interactionMode?: InteractionMode;
  /** Whether local interaction (clicking choices) is enabled */
  interactive?: boolean;
  /** Optional container class name */
  className?: string;
}

export const BinaryQuestion: React.FC<BinaryQuestionProps> = React.memo(({
  question,
  selectedChoice: controlledSelected,
  onSelectChoice,
  onChoice,
  votes,
  tally: explicitTally,
  showVotes = false,
  format: propFormat,
  formatId: propFormatId,
  interactionMode,
  interactive = true,
  className = "",
}) => {
  const format = propFormat || propFormatId || "widescreen";
  const shouldReduceMotion = useReducedMotion();
  const offlineMode = useGameStore((s) => Boolean(s.offlineMode));
  const polling = !offlineMode && interactionMode === "polling";
  const dataTally = tallyPlacement("binary", format, polling);

  // Controlled vs internal state
  const [internalSelected, setInternalSelected] = useState<"true" | "false" | null>(null);

  const currentSelected = (controlledSelected !== undefined
    ? controlledSelected
    : internalSelected) as "true" | "false" | null;

  const handleSelect = (choice: "true" | "false") => {
    if (!interactive) return;
    tapAnswer();
    if (onSelectChoice) onSelectChoice(choice);
    if (onChoice) onChoice(choice);
    if (controlledSelected === undefined) {
      setInternalSelected(choice);
    }
  };

  // Determine copy thresholds
  const statementLength = question.statement?.length || 0;
  const isShortCopy = statementLength <= questionSplitRules.shortCopyThreshold;
  const isLongCopy = statementLength > questionSplitRules.longCopyThreshold;

  // Compute vote totals and percentages
  const tally = useMemo<BinaryQuestionTally | null>(() => {
    if (explicitTally) return explicitTally;
    if (!votes) return null;
    const trueCount = Math.max(0, Number(votes.true) || 0);
    const falseCount = Math.max(0, Number(votes.false) || 0);
    const total = trueCount + falseCount;
    const truePercent = total > 0 ? Math.round((trueCount / total) * 100) : 0;
    const falsePercent = total > 0 ? 100 - truePercent : 0;
    return { trueCount, falseCount, truePercent, falsePercent };
  }, [explicitTally, votes]);

  const displayVotes = showVotes && Boolean(tally && tally.trueCount + tally.falseCount > 0);

  // STAGE-SPEC step 7 (spec section 4.2): the stem step from text length alone, deterministic and
  // stable across renders. Binary carries no answer ladder (its label is fixed by format, 5.1).
  const stageFitResult = useMemo(
    () => stageFit({ kind: "binary", format, stem: question.statement ?? "", scenario: question.scenario ?? null, options: [], count: 2 }),
    [format, question.statement, question.scenario]
  );

  // STAGE-SPEC pass 4c-1 (spec 4.2 step 2): the stem's real step, measured before first paint
  // rather than estimated from character length. See use-measured-stem-step.ts. Also resolves
  // the widow guard's own real measurement (brief item 4, widow-guard.ts): guardedText is the
  // statement with its last two words joined only when that is proven safe.
  const rootRef = useRef<HTMLElement | null>(null);
  const stemMeasureKey = `binary|${format}|${question.statement ?? ""}|${question.scenario ?? ""}`;
  const measuredStem = useMeasuredStemStep(rootRef, "binary", format, stageFitResult.stemStep, stemMeasureKey, question.statement ?? "");

  // The widow-guarded statement with its authored emphasis marked (src/components/EmphasizedText.tsx).
  const renderFormattedStatement = (
    <EmphasizedText text={measuredStem.guardedText} phrases={question.emphasis} tone="heading" compId="statement-emphasis" />
  );

  const eyebrowText = kindEyebrow(question) || "TRUE OR FALSE?";
  const questionNumber = question.index ? `Q${question.index}` : question.id ? question.id.toUpperCase() : "Q";

  // Citations extraction
  const citations: Citation[] = Array.isArray(question.citations)
    ? question.citations
    : typeof question.source === "object" && question.source !== null
    ? [question.source as Citation]
    : [];

  const sourceLine = citations.length > 0
    ? citations.map((c) => [c.publisher, c.lastVerified ? `verified ${c.lastVerified}` : null].filter(Boolean).join(" · ")).join(" | ")
    : typeof question.source === "string"
    ? question.source
    : question.guidelineRef || "";

  // Framer Motion Animation Variants
  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
        delayChildren: shouldReduceMotion ? 0 : 0.04,
      },
    },
  }), [shouldReduceMotion]);

  const itemFadeUp = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
        ease: SCREEN_FADE_EASE,
      },
    },
  }), [shouldReduceMotion]);

  const barVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: (customDelay: number) => ({
      opacity: 1,
      transition: {
        delay: shouldReduceMotion ? 0 : customDelay,
        duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
        ease: SCREEN_FADE_EASE,
      },
    }),
  }), [shouldReduceMotion]);

  return (
    <motion.section
      ref={rootRef}
      className={`binary-question-screen ${className}`}
      data-screen="question"
      data-kind="binary"
      data-format={format}
      data-phase="deliberating"
      data-question-id={question.id}
      data-stem-step={measuredStem.stemStep}
      data-stem-measured={measuredStem.ready}
      data-density={stageFitResult.density}
      variants={containerVariants}
      initial={false}
      animate="visible"
      style={{
        color: "var(--color-ink)",
        fontFamily: "var(--kit-font-sans)",
      }}
    >
      {/* Stage lights/scrim live on ScreenRouter's .stage-atmosphere sibling.
          Kind roots must not paint a second glow layer on top. */}
      {/* ─── HEADER BAND ─────────────────────────────────────────────────── */}
      <motion.div
        className="question-stage-copy"
        variants={itemFadeUp}
      >
        {/* Eyebrow & Badging */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--kit-space-12)",
          }}
        >
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 9999,
              backgroundColor: "color-mix(in srgb, var(--color-light) 8%, transparent)",
              border: "1px solid var(--color-film-border)",
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-gold)",
            }}
          >
            {questionNumber} · {eyebrowText}
          </span>
          {question.scenario && (
            <span
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--color-ink-muted)",
                letterSpacing: "0.02em",
              }}
            >
              {question.scenario}
            </span>
          )}
        </div>

        {/* Statement Headline with dynamic Auto-Fit font size */}
        <ArrivalKicker />
        <h1
          data-comp-id="statement"
          data-copy={isShortCopy ? "short" : isLongCopy ? "xlong" : "long"}
          data-reveal-density={statementLength > 120 ? "dense" : "normal"}
          data-balanced={measuredStem.balanced ? "true" : undefined}
          style={{
            letterSpacing: "-0.02em",
            textWrap: "balance",
            // STAGE-SPEC pass 4c-1: hidden until the real measurement lands, so the audience never
            // sees the character-estimate size the measured step might still correct.
            visibility: measuredStem.ready ? "visible" : "hidden",
          }}
        >
          {renderFormattedStatement}
        </h1>
      </motion.div>

      {/* ─── 2-BAR RAIL: TRUE / FALSE ────────────────────────────────────── */}
      <div
        className="answer-rail answer-rail--2"
        data-role="answer-rail"
        data-kind="binary"
        data-count="2"
        data-tally={dataTally}
      >
        {/* TRUE Bar Slot */}
        <div
          className="answer-slot"
        >
          <motion.button
            className="answer-bar"
            type="button"
            variants={barVariants}
            custom={0.15}
            whileHover={interactive && !shouldReduceMotion ? { scale: 1.01 } : {}}
            whileTap={interactive && !shouldReduceMotion ? { scale: 0.98 } : {}}
            onClick={() => handleSelect("true")}
            aria-label={
              displayVotes && tally
                ? `True: ${tally.truePercent}%, ${tally.trueCount} ${tally.trueCount === 1 ? "vote" : "votes"}`
                : "True"
            }
            data-answer="true"
            data-state={currentSelected === "true" ? "selected" : "idle"}
            style={{
              borderRadius: 16,
              border:
                currentSelected === "true"
                  ? "2px solid var(--color-answer-true)"
                  : `1px solid color-mix(in srgb, var(--color-light) 12%, transparent)`,
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-panel-navy) 85%, transparent) 0%, color-mix(in srgb, var(--color-stage-deep) 92%, transparent) 100%)",
              backdropFilter: "blur(16px) saturate(1.4)",
              boxShadow:
                currentSelected === "true"
                  ? "0 0 24px color-mix(in srgb, var(--color-accent-teal) 35%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)"
                  : "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
              cursor: interactive ? "pointer" : "default",
              transition: "border 0.2s, box-shadow 0.2s",
              textAlign: "left",
            }}
          >
            {/* Left Cluster: Disc Key + Label */}
            <div
              className="answer-bar__main"
            >
              {/* Disc Key */}
              <div
                className="answer-bar__key"
              >
                T
              </div>

              {/* Label */}
              <span
                className="answer-bar__label"
                style={{
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--color-ink)",
                  textShadow: "none",
                }}
              >
                True
              </span>
            </div>

            {/* Right Cluster: the stat slot is always present so Lock only fills it (never reflows) */}
            <div
              className="answer-bar__poll"
              data-role="stat-slot"
            >
              {displayVotes && tally && (<>
                <span
                  className="answer-bar__pct"
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 700,
                    color: "var(--color-ink)",
                    lineHeight: 1.1,
                  }}
                >
                  {tally.truePercent}%
                </span>
                <span
                  className="answer-bar__votes"
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  {tally.trueCount} {tally.trueCount === 1 ? "VOTE" : "VOTES"}
                </span>
              </>)}
            </div>
          </motion.button>
        </div>

        {/* FALSE Bar Slot */}
        <div
          className="answer-slot"
        >
          <motion.button
            className="answer-bar"
            type="button"
            variants={barVariants}
            custom={0.22}
            whileHover={interactive && !shouldReduceMotion ? { scale: 1.01 } : {}}
            whileTap={interactive && !shouldReduceMotion ? { scale: 0.98 } : {}}
            onClick={() => handleSelect("false")}
            aria-label={
              displayVotes && tally
                ? `False: ${tally.falsePercent}%, ${tally.falseCount} ${tally.falseCount === 1 ? "vote" : "votes"}`
                : "False"
            }
            data-answer="false"
            data-state={currentSelected === "false" ? "selected" : "idle"}
            style={{
              borderRadius: 16,
              border:
                currentSelected === "false"
                  ? "2px solid var(--color-answer-false)"
                  : `1px solid color-mix(in srgb, var(--color-light) 12%, transparent)`,
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-panel-navy) 85%, transparent) 0%, color-mix(in srgb, var(--color-stage-deep) 92%, transparent) 100%)",
              backdropFilter: "blur(16px) saturate(1.4)",
              boxShadow:
                currentSelected === "false"
                  ? "0 0 24px color-mix(in srgb, var(--color-accent-orange) 35%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)"
                  : "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
              cursor: interactive ? "pointer" : "default",
              transition: "border 0.2s, box-shadow 0.2s",
              textAlign: "left",
            }}
          >
            {/* Left Cluster: Disc Key + Label */}
            <div
              className="answer-bar__main"
            >
              {/* Disc Key */}
              <div
                className="answer-bar__key"
              >
                F
              </div>

              {/* Label */}
              <span
                className="answer-bar__label"
                style={{
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--color-ink)",
                  textShadow: "none",
                }}
              >
                False
              </span>
            </div>

            {/* Right Cluster: the stat slot is always present so Lock only fills it (never reflows) */}
            <div
              className="answer-bar__poll"
              data-role="stat-slot"
            >
              {displayVotes && tally && (<>
                <span
                  className="answer-bar__pct"
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 700,
                    color: "var(--color-ink)",
                    lineHeight: 1.1,
                  }}
                >
                  {tally.falsePercent}%
                </span>
                <span
                  className="answer-bar__votes"
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  {tally.falseCount} {tally.falseCount === 1 ? "VOTE" : "VOTES"}
                </span>
              </>)}
            </div>
          </motion.button>
        </div>
      </div>

      {/* ─── FOOTER BAR (Source) ───────────────────── */}
      <div
        className="question-kind-footer"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "var(--kit-space-12)",
          fontSize: "14px",
          color: "var(--color-ink-dim)",
        }}
      >
        <span>{sourceLine ? `Evidence source: ${sourceLine}` : ""}</span>
      </div>
    </motion.section>
  );
});

BinaryQuestion.displayName = "BinaryQuestion";

export default BinaryQuestion;
