import React, { useRef, useState, useMemo } from 'react';
import { ArrivalKicker } from "./ArrivalKicker";
import { motion, useReducedMotion } from 'framer-motion';
import { Question, FormatId } from '../../data/types';
import { indexFor, kindEyebrow } from '../../engine/kinds';
import { randomOrderScramble } from '../../network/projection';
import { tapAnswer } from '../../engine/audio-cues';
import { stageFit } from './stage-fit';
import { useMeasuredStemStep } from './use-measured-stem-step';
import { useFontsReady } from './use-fonts-ready';
import { WidowGuardedText } from './WidowGuardedText';
import { EmphasizedText } from '../../components/EmphasizedText';

export interface OrderQuestionProps {
  /** Question data model */
  question: Question;
  /**
   * 8.6: the host's own random per-game display order (game-store.ts's orderScrambles,
   * keyed by questionInstanceId), so the stage shows exactly what the phones show. A caller
   * with no armed occurrence (the editorial preview) gets a fresh local scramble instead --
   * never the old id-seeded orderDisplay, which was recoverable from the wire.
   */
  displayOrder?: string[] | null;
  /** Callback when user reorders items during deliberation */
  onReorder?: (newOrderTokens: string[]) => void;
  /** Target canvas format */
  format?: FormatId;
  /** Optional container class name */
  className?: string;
  /** Show interactive practice/facilitation controls */
  showControls?: boolean;
}

interface StepItem {
  token: string;
  canonicalIndex: number;
  text: string;
}

/**
 * OrderQuestion — Clinical Sequence Ordering Screen
 *
 * Displays clinical steps in a deterministic scrambled order, allowing attendee
 * deliberation and reordering. The correct sequence is shown on the question's
 * dedicated result screen (Question.tsx).
 */
export const OrderQuestion: React.FC<OrderQuestionProps> = React.memo(({
  question,
  displayOrder,
  onReorder,
  format = 'widescreen',
  className = '',
  showControls = true,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const steps = useMemo(() => question.steps ?? [], [question.steps]);

  // The host's own armed scramble (see the OrderQuestionProps.displayOrder doc). No armed
  // occurrence (an editorial preview with no live game state) draws its own local one, freshly
  // random each mount, never a value the wire could recompute.
  const initialScrambledTokens = useMemo(() => {
    if (displayOrder && displayOrder.length === (question.steps ?? []).length) return displayOrder;
    return randomOrderScramble((question.steps ?? []).length).order;
  }, [question, displayOrder]);

  // Track previous question ID to reset local modifications on question change (React 19 pattern)
  const [prevQuestionId, setPrevQuestionId] = useState<string>(question.id);
  const [userTokens, setUserTokens] = useState<string[] | null>(null);
  // A11Y-09 (live-position announcement half): a live region for the reorder announcement below.
  const [moveAnnouncement, setMoveAnnouncement] = useState('');

  if (question.id !== prevQuestionId) {
    setPrevQuestionId(question.id);
    setUserTokens(null);
  }

  // Working order of tokens during deliberation
  const currentTokens = userTokens ?? initialScrambledTokens;

  // Map tokens to full step item data
  const stepItems: StepItem[] = useMemo(() => {
    return currentTokens.map((token) => {
      const canonicalIdx = indexFor(token) ?? 0;
      return {
        token,
        canonicalIndex: canonicalIdx,
        text: steps[canonicalIdx] ?? '',
      };
    });
  }, [currentTokens, steps]);

  // Move a step up during deliberation
  const handleMoveUp = (index: number) => {
    tapAnswer();
    if (index <= 0) return;
    const next = [...currentTokens];
    const temp = next[index];
    next[index] = next[index - 1] as string;
    next[index - 1] = temp as string;
    setUserTokens(next);
    onReorder?.(next);
    // A11Y-09: the button's own aria-label names the action ("Move X up"), never its result, so a
    // screen-reader user has to re-navigate the whole list to learn the new order. Announce it.
    setMoveAnnouncement(`${stepItems[index]?.text ?? temp} moved to position ${index} of ${next.length}`);
  };

  // Move a step down during deliberation
  const handleMoveDown = (index: number) => {
    tapAnswer();
    if (index >= currentTokens.length - 1) return;
    const next = [...currentTokens];
    const temp = next[index];
    next[index] = next[index + 1] as string;
    next[index + 1] = temp as string;
    setUserTokens(next);
    onReorder?.(next);
    setMoveAnnouncement(`${stepItems[index]?.text ?? temp} moved to position ${index + 2} of ${next.length}`);
  };

  // Reset order to original scrambled
  const handleReset = () => {
    tapAnswer();
    setUserTokens(null);
  };

  const kicker = kindEyebrow(question) || 'PUT IN ORDER';

  // STAGE-SPEC step 7 (spec section 4.2): the stem and step-text size steps from text length.
  // Order has no per-step tally (spec 5.4), so tallyReserved is always false.
  const stageFitResult = stageFit({
    kind: 'order',
    format,
    stem: question.statement ?? '',
    scenario: null,
    options: steps,
    count: steps.length,
    tallyReserved: false,
  });

  // STAGE-SPEC pass 4c-1 (spec 4.2 step 2): the stem's real step, measured before first paint
  // rather than estimated from character length. See use-measured-stem-step.ts.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stemMeasureKey = `order|${format}|${question.statement ?? ''}|${steps.join('~')}`;
  const measuredStem = useMeasuredStemStep(rootRef, 'order', format, stageFitResult.stemStep, stemMeasureKey, question.statement ?? '', stageFitResult.answerStep);
  // STAGE-SPEC pass 4c-1 (brief item 4): shared font-ready gate for the per-step WidowGuardedText
  // below.
  // Pass 4c-1b: and on the measured answer step, so a label only ever decides its widow join at
  // the size it will really render at (the rail can step down past a widow, see
  // use-measured-stem-step.ts). The answer rail itself stays hidden until then too, so a rail that
  // steps down is never seen resizing.
  const fontsReady = useFontsReady() && measuredStem.ready;

  return (
    <div
      ref={rootRef}
      className={`order-question-container mechanic-reveal ${className}`}
      style={{
        color: "var(--color-ink)",
      }}
      data-screen="question"
      data-kind="order"
      data-format={format}
      data-revealed="false"
      data-phase="deliberating"
      data-stem-step={measuredStem.stemStep}
      data-stem-measured={measuredStem.ready}
      data-answer-step={measuredStem.answerStep ?? undefined}
      data-answer-first-pass={stageFitResult.answerStep ?? undefined}
      data-density={stageFitResult.density}
    >
      {/* Stage lights/scrim live on ScreenRouter's .stage-atmosphere sibling.
          Kind roots must not paint a second wash on top. */}
      {/* Top Header: Badge, Kicker, and Question Statement */}
      <header className="question-stage-copy">
        <div className="order-kicker-row">
          <span
            className="order-id-badge"
            style={{
              borderColor: "var(--color-required-boundary)",
              color: "var(--color-ink-dim)",
              backgroundColor: "var(--color-panel-navy)",
              minHeight: "var(--kit-space-32)",
            }}
          >
            {question.id ? question.id.toUpperCase() : 'ORDER'}
          </span>
          <p
            className="order-kicker"
            style={{ color: "var(--color-gold)" }}
          >
            {kicker}
          </p>
        </div>

        {question.scenario && (
          <p
            className="order-scenario"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {question.scenario}
          </p>
        )}

        <ArrivalKicker />
        <h1
          className="order-statement"
          data-balanced={measuredStem.balanced ? "true" : undefined}
          style={{ color: "var(--color-ink)", visibility: measuredStem.ready ? "visible" : "hidden" }}
        >
          <EmphasizedText text={measuredStem.guardedText} phrases={question.emphasis} tone="heading" compId="statement-emphasis" />
        </h1>
        <p className="order-scramble-cue" data-role="order-scramble-cue">
          Scrambled. Put these in order on your device.
        </p>
      </header>

      {/* Center Main: Animated Scrambled Bars */}
      <main>
        <div
          className="order-rail answer-rail"
          data-role="answer-rail"
          style={{ visibility: measuredStem.ready ? undefined : "hidden" }}
          data-count={stepItems.length}
          data-tally="none"
          role="list"
          aria-label="Clinical step sequence"
        >
          {stepItems.map((item, index) => {
            return (
              <motion.div
                layout={!shouldReduceMotion}
                key={item.token}
                initial={false}
                animate={{ opacity: 1 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0.01 }
                    : {
                        type: 'spring',
                        stiffness: 320,
                        damping: 28,
                        mass: 0.9,
                      }
                }
                role="listitem"
                className="order-bar"
                style={{
                  backgroundColor: "var(--color-panel-navy)",
                  border: "1px solid var(--color-hairline)",
                  boxShadow: '0 4px 12px color-mix(in srgb, var(--color-void) 20%, transparent)',
                }}
              >
                {/* Left: Step Key Badge & Step Content */}
                <div className="order-bar__main">
                  <WidowGuardedText
                    as="span"
                    className="order-bar__label"
                    style={{
                      color: "var(--color-ink-muted)",
                    }}
                    text={item.text}
                    fontsReady={fontsReady}
                    scale={measuredStem.scale}
                    allowNarrowing
                  />
                </div>

                {/* Right: Interactive Reordering Controls (Active when deliberating) */}
                {showControls && (
                  <div className="order-bar__controls">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      aria-label={`Move ${item.text} up`}
                      className="order-nudge facilitator-press"
                      style={{
                        minWidth: "var(--kit-touch)",
                        minHeight: "var(--kit-touch)",
                        borderColor: "var(--color-hairline)",
                        backgroundColor: "var(--color-canvas-navy)",
                        color: "var(--color-ink)",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7"/>
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === stepItems.length - 1}
                      aria-label={`Move ${item.text} down`}
                      className="order-nudge facilitator-press"
                      style={{
                        minWidth: "var(--kit-touch)",
                        minHeight: "var(--kit-touch)",
                        borderColor: "var(--color-hairline)",
                        backgroundColor: "var(--color-canvas-navy)",
                        color: "var(--color-ink)",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M19 12l-7 7-7-7"/>
                      </svg>
                    </button>
                  </div>
                )}

                {/* No per-row "Step N" micro badge: the key badge carries the ordinal at stage scale. */}
              </motion.div>
            );
          })}
        </div>
        <p aria-live="polite" className="sr-only" data-role="order-move-announce">{moveAnnouncement}</p>
      </main>

      {/* Bottom Footer: Facilitator & Practice Controls */}
      {showControls && (
        <footer
          className="question-kind-footer order-footer"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          <div className="order-bar__controls">
            <button
              type="button"
              onClick={handleReset}
              disabled={currentTokens.join('-') === initialScrambledTokens.join('-')}
              className="order-reset facilitator-press"
              style={{
                minHeight: "var(--kit-touch)",
                backgroundColor: "var(--color-panel-navy)",
                borderColor: "var(--color-hairline)",
                color: "var(--color-ink-dim)",
              }}
            >
              Reset Sequence
            </button>
          </div>
        </footer>
      )}
    </div>
  );
});

OrderQuestion.displayName = 'OrderQuestion';

export default OrderQuestion;
