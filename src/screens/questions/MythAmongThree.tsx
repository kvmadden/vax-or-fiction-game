import React, { useMemo, useRef, useState } from "react";
import { ArrivalKicker } from "./ArrivalKicker";
import { motion, useReducedMotion } from "framer-motion";
import { Question, FormatId } from "../../data/types";
import { kindEyebrow, letterFor } from "../../engine/kinds";
import { useGameStore } from "../../store/game-store";
import { tapAnswer } from '../../engine/audio-cues';
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../../ui/screen-fade";
import { stageFit } from "./stage-fit";
import { useMeasuredStemStep } from "./use-measured-stem-step";
import { useFontsReady } from "./use-fonts-ready";
import { WidowGuardedText } from "./WidowGuardedText";
import { splitKeepCompounds, tallyPlacement } from "./stage-text";
import { EmphasizedText } from "../../components/EmphasizedText";

export interface MythAmongThreeProps {
  /** The clinical question definition */
  question: Question;
  /** Currently selected choice token ('a' | 'b' | 'c') */
  selectedChoice?: string | null;
  /** Callback fired when an attendee or presenter selects a choice */
  onSelectChoice?: (token: string) => void;
  /** Map of choice tokens to vote counts (e.g. { a: 12, b: 4, c: 18 }) */
  votes?: Record<string, number>;
  /** Whether to render vote counts and percentage bars */
  showVotes?: boolean;
  /** Viewport format (widescreen, square, portrait) */
  format?: FormatId;
  /** Whether interactive local controls (selection) are enabled */
  interactive?: boolean;
  /** Discussion pause state */
  isDiscussionPaused?: boolean;
  /** Callback when discussion pause is toggled */
  onToggleDiscussion?: () => void;
  /** Optional container class name */
  className?: string;
}

const OPTION_COLORS: Record<string, string> = {
  a: "var(--color-vax)",
  b: "var(--color-fiction)",
  c: "var(--color-accent-cobalt)",
};

type AccentStyle = React.CSSProperties & { "--answer-accent": string };

export const MythAmongThree: React.FC<MythAmongThreeProps> = React.memo(({
  question,
  selectedChoice,
  onSelectChoice,
  votes,
  showVotes = false,
  format = "widescreen",
  interactive = true,
  isDiscussionPaused: propIsDiscussionPaused,
  className = "",
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Controlled vs uncontrolled state support
  const [internalSelected, setInternalSelected] = useState<string | null>(null);

  const storeTimer = useGameStore((s) => s.timer);
  const storeVoting = useGameStore((s) => s.voting);
  const storeInteractionMode = useGameStore((s) => s.interactionMode);
  const offlineMode = useGameStore((s) => Boolean(s.offlineMode));
  const polling = !offlineMode && storeInteractionMode === "polling";
  const internalDiscussionPaused = false;
  const isDiscussionActive =
    propIsDiscussionPaused !== undefined
      ? propIsDiscussionPaused
      : internalDiscussionPaused ||
        Boolean(storeTimer && !storeTimer.running && storeTimer.pauseReason === "manual") ||
        storeVoting?.window === "talk";

  const currentSelected = selectedChoice !== undefined ? selectedChoice : internalSelected;

  const handleSelect = (token: string) => {
    tapAnswer();
    if (!interactive) return;
    if (onSelectChoice) {
      onSelectChoice(token);
    }
    if (selectedChoice === undefined) {
      setInternalSelected(token);
    }
  };

  // Extract statements (fallback if not provided or incomplete)
  const statements: string[] = (
    Array.isArray(question.statements) && question.statements.length > 0
      ? question.statements
      : [
          question.statement || "First clinical statement",
          "Second clinical statement",
          "Third clinical statement",
        ]
  ).slice(0, 3);

  // Compute vote totals and percentages if available
  const totalVotes = Object.values(votes || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  // VOF-21: the split exists on the canvas only once the host has locked (showVotes) and someone answered.
  const displayVotes = showVotes && totalVotes > 0;

  const eyebrowText = kindEyebrow(question) || "PICK THE MYTH";
  const questionNumber = question.index ? `Q${question.index}` : question.id ? question.id.toUpperCase() : "Q";

  // STAGE-SPEC step 8 (spec section 3.5): beside on widescreen while polling, below elsewhere.
  const dataTally = tallyPlacement("myth-among-three", format, polling);

  // STAGE-SPEC step 7 (spec section 4.2): the stem and statement size steps from text length.
  const stageFitResult = stageFit({
    kind: "myth-among-three",
    format,
    stem: question.statement ?? "",
    scenario: question.scenario ?? null,
    options: statements,
    count: statements.length,
    tallyReserved: dataTally !== "none",
  });

  // STAGE-SPEC pass 4c-1 (spec 4.2 step 2): the stem's real step, measured before first paint
  // rather than estimated from character length. See use-measured-stem-step.ts.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stemMeasureKey = `myth-among-three|${format}|${question.statement ?? ""}|${question.scenario ?? ""}|${statements.join("~")}|${dataTally}`;
  const measuredStem = useMeasuredStemStep(rootRef, "myth-among-three", format, stageFitResult.stemStep, stemMeasureKey, question.statement ?? "", stageFitResult.answerStep);
  // STAGE-SPEC pass 4c-1 (brief item 4): shared font-ready gate for every per-statement
  // WidowGuardedText below.
  // Pass 4c-1b: and on the measured answer step, so a label only ever decides its widow join at
  // the size it will really render at (the rail can step down past a widow, see
  // use-measured-stem-step.ts). The answer rail itself stays hidden until then too, so a rail that
  // steps down is never seen resizing.
  const fontsReady = useFontsReady() && measuredStem.ready;

  // The widow-guarded statement with its authored emphasis marked (src/components/EmphasizedText.tsx).
  const renderFormattedStatement = (
    <EmphasizedText text={measuredStem.guardedText} phrases={question.emphasis} tone="heading" compId="statement-emphasis" />
  );

  // MOT-VQA-05: the outer stagger group's variants. Identical for every render that shares
  // shouldReduceMotion, so it is computed once instead of a fresh object literal each time.
  const railVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: shouldReduceMotion ? 0 : 0.1 },
    },
  }), [shouldReduceMotion]);

  // MOT-VQA-05: the per-option entrance variants. Identical across every statement in the
  // statements.map() below (it depends only on shouldReduceMotion, not on the option itself),
  // so it is computed once here rather than reallocated on every iteration.
  const optionVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: SCREEN_FADE_S, ease: SCREEN_FADE_EASE },
    },
  }), [shouldReduceMotion]);

  return (
    <div
      ref={rootRef}
      className={`myth-among-three-screen mechanic-reveal ${className}`}
      data-screen="question"
      data-kind="myth-among-three"
      data-format={format}
      data-phase="deliberating"
      data-question-id={question.id}
      data-role="question-frame"
      data-stem-step={measuredStem.stemStep}
      data-stem-measured={measuredStem.ready}
      data-answer-step={measuredStem.answerStep ?? undefined}
      data-answer-first-pass={stageFitResult.answerStep ?? undefined}
      data-density={stageFitResult.density}
      style={{
        color: "var(--color-ink)",
      }}
    >
      {/* ─── HEADER BAND ─────────────────────────────────────────────────── */}
      <header
        className="myth-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--kit-space-16)",
          paddingBottom: "var(--kit-space-16)",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--kit-space-12)" }}>
          {/* Question Number Badge */}
          <div
            data-comp-id="q-badge"
            data-role="question-count"
            aria-label={`Question ${questionNumber}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 44,
              minHeight: 44,
              paddingLeft: "var(--kit-space-12)",
              paddingRight: "var(--kit-space-12)",
              borderRadius: "var(--kit-radius-12)",
              backgroundColor: "var(--color-panel-navy)",
              border: "1px solid var(--color-hairline)",
              fontWeight: 700,
              fontSize: 16,
              color: "var(--color-gold)",
              boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
            }}
          >
            {questionNumber}
          </div>

          {/* Kicker */}
          <div data-comp-id="kicker" style={{ display: "flex", flexDirection: "column", gap: "var(--kit-space-4)" }}>
            <span
              data-role="kicker"
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--color-fiction)",
              }}
            >
              {eyebrowText}
            </span>
            <span
              data-role="kicker-sub"
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: "var(--color-ink-dim)",
              }}
            >
              Two statements are true clinical facts · Exactly one is false
            </span>
          </div>
        </div>

      </header>

      {/* ─── STATEMENT / PROMPT CARD ────────────────────────────────────── */}
      <section
        className="question-stage-copy"
        data-comp-id="statement-card"
      >
        {question.scenario && (
          <p
            data-role="scenario"
            style={{
            fontWeight: 500,
              color: "var(--color-gold)",
              margin: 0,
            }}
          >
            {question.scenario}
          </p>
        )}
        <ArrivalKicker />
        <h1
          data-comp-id="statement"
          data-reveal-density={(question.statement?.length ?? 0) > 50 ? "dense" : "normal"}
          data-balanced={measuredStem.balanced ? "true" : undefined}
          style={{ visibility: measuredStem.ready ? "visible" : "hidden" }}
        >
          {renderFormattedStatement}
        </h1>

      </section>

      {/* ─── MAIN CONTENT: 3-BAR RAIL + PENDING SLOT ─────────────────── */}
      <div
        className="myth-main-split"
      >
        {/* ─── 3-BAR RAIL ────────────────────────────────────────────── */}
        <section
          className="answer-rail answer-rail--3"
          data-role="answer-rail"
          style={{ visibility: measuredStem.ready ? undefined : "hidden" }}
          data-kind="myth-among-three"
          data-count="3"
          data-tally={dataTally}
          aria-label="Clinical statement options"
        >
          <motion.div
            initial={false}
            animate="visible"
            variants={railVariants}
            style={{ display: "flex", flexDirection: "column", gap: "var(--kit-space-12)" }}
          >
            {statements.map((statementText, index) => {
              const token = letterFor(index) ?? "a";
              const label = token.toUpperCase();
              const isSelected = currentSelected === token;
              const optionColor = OPTION_COLORS[token] || "var(--color-accent-cobalt)";
              const barState = isSelected ? "selected" : "idle";

              // Vote share percentage
              const voteCount = votes?.[token] ?? 0;
              const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
              const accentStyle: AccentStyle = { "--answer-accent": optionColor };

              return (
                <motion.div
                  className="answer-slot"
                  key={token}
                  data-slot={token}
                  variants={optionVariants}
                >
                  <button
                    type="button"
                    className="answer-bar"
                    onClick={() => handleSelect(token)}
                    tabIndex={interactive ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={
                      displayVotes
                        ? `${label}: ${statementText}, ${percent}%, ${voteCount} ${voteCount === 1 ? "vote" : "votes"}`
                        : `${label}: ${statementText}`
                    }
                    data-answer={token}
                    data-comp-id={`bar-${token}`}
                    data-state={barState}
                    style={{
                      ...accentStyle,
                      appearance: "none",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                      borderRadius: "var(--kit-radius-16)",
                      backgroundColor: isSelected
                        ? `color-mix(in srgb, ${optionColor} 18%, var(--color-panel-navy))`
                        : "var(--color-panel-navy)",
                      border: `1px solid ${isSelected ? optionColor : "var(--color-hairline)"}`,
                      cursor: interactive ? "pointer" : "default",
                      boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
                      transition: "border-color 0.2s ease, background-color 0.2s ease",
                      overflow: "hidden",
                    }}
                  >
                    {/* Optional Vote Percentage Fill Underlay */}
                    {displayVotes && (
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: "100%",
                          transform: `scaleX(${percent / 100})`,
                          transformOrigin: "left",
                          backgroundColor: `color-mix(in srgb, ${optionColor} 12%, transparent)`,
                          zIndex: 0,
                          transition: "transform 0.6s ease-out",
                        }}
                      />
                    )}

                    <div
                      className="answer-bar__main"
                    >
                      {/* Letter Key Pill */}
                      <div
                        className="answer-bar__key"
                        data-comp-id={`bar-${token}-key`}
                      >
                        {label}
                      </div>

                      {/* Statement Text */}
                      <WidowGuardedText
                        as="span"
                        className="answer-bar__label"
                        data-comp-id={`bar-${token}-label`}
                        text={statementText}
                        fontsReady={fontsReady}
                        scale={measuredStem.scale}
                        allowNarrowing
                        render={(resolvedText) =>
                          splitKeepCompounds(resolvedText).map((part, partIndex) =>
                            part.keepTogether ? (
                              <span className="keep-compound" key={partIndex}>{part.text}</span>
                            ) : (
                              <React.Fragment key={partIndex}>{part.text}</React.Fragment>
                            )
                          )
                        }
                      />
                    </div>

                    {/* Stat slot: present in every state, filled only once the host locks the room (VOF-21). */}
                    <div
                      className="answer-bar__poll"
                      data-role="stat-slot"
                    >
                      {displayVotes && (
                        <>
                          <span
                            className="answer-bar__pct"
                            data-comp-id={`bar-${token}-pct`}
                            style={{
                              fontWeight: 700,
                              fontFamily: "var(--kit-font-mono)",
                              lineHeight: 1,
                              color: "var(--color-ink)",
                            }}
                          >
                            {percent}%
                          </span>
                          <span
                            className="answer-bar__votes"
                            data-comp-id={`bar-${token}-votes`}
                            style={{
                              fontFamily: "var(--kit-font-mono)",
                              lineHeight: 1,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: "var(--color-ink-muted)",
                            }}
                          >
                            {voteCount} {voteCount === 1 ? "vote" : "votes"}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* ─── PENDING SLOT (hidden on stage) ─────────────────────────── */}
        <section
          data-role="evidence-slot"
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 280,
          }}
        >
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            data-role="pending-card"
            data-discussion-paused={isDiscussionActive ? "true" : "false"}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--kit-space-32)",
              backgroundColor: isDiscussionActive
                ? "color-mix(in srgb, var(--color-void) 88%, black)"
                : "var(--color-panel-navy)",
              borderRadius: "var(--kit-radius-16)",
              border: `1px solid ${
                isDiscussionActive ? "var(--color-gold)" : "var(--color-hairline)"
              }`,
              boxShadow: isDiscussionActive
                ? `0 0 24px color-mix(in srgb, var(--color-anticipation-gold) 20%, transparent)`
                : "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
              textAlign: "center",
              gap: "var(--kit-space-12)",
              minHeight: 240,
              transition: shouldReduceMotion
                ? "none"
                : "background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
            }}
          >
          </motion.div>
        </section>
      </div>
    </div>
  );
});

MythAmongThree.displayName = "MythAmongThree";

export default MythAmongThree;
