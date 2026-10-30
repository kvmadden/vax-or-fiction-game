import React, { useRef, useState } from 'react';
import { ArrivalKicker } from "./ArrivalKicker";
import { useReducedMotion } from 'framer-motion';
import { Question, FormatId } from '../../data/types';
import {
  kindEyebrow,
  optionTally,
  estimateRead,
  TallyOption,
  EstimateRead
} from '../../engine/kinds';
import { useGameStore } from '../../store/game-store';
import { tapAnswer } from '../../engine/audio-cues';
import { stageFit, threeRowEstimate } from './stage-fit';
import { useMeasuredStemStep } from './use-measured-stem-step';
import { useFontsReady } from './use-fonts-ready';
import { WidowGuardedText } from './WidowGuardedText';
import { tallyPlacement } from './stage-text';
import { EmphasizedText } from '../../components/EmphasizedText';
import { estimateRangeAccent } from './estimate-accents';

export interface EstimateQuestionProps {
  question: Question;
  choices?: Record<string, number | string>;
  /** Whether room distribution data may be shown after the host locks voting. */
  showVotes?: boolean;
  /** Whether authored ranges must remain visible for facilitator-led or offline hands-up play. */
  /** Retained for callers; range labels always render so the room can vote. */
  showChoicesBeforeLock?: boolean;
  format?: FormatId;
  onSelectRange?: (token: string) => void;
  selectedToken?: string;
  className?: string;
}

type AccentStyle = React.CSSProperties & { '--range-accent': string };

/**
 * EstimateQuestion component for Vax or Fiction platform port.
 *
 * Renders a numeric estimation clinical challenge:
 * 1. Question prompt and clinical scenario header.
 * 2. Range plates depicting room estimate distribution across authored bins.
 * 3. Room typical-answer summary (hidden on the stage, kept for the report projection).
 * The exact answer and explanation are shown on the question's dedicated result and explanation screens.
 */
export const EstimateQuestion: React.FC<EstimateQuestionProps> = React.memo(({
  question,
  choices,
  showVotes,
  format = 'widescreen',
  onSelectRange,
  selectedToken,
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [internalSelection, setInternalSelection] = useState<string | null>(null);

  // Store integration with fallback to direct props
  const storePollVotes = useGameStore((s) => s.pollVotes);
  const storeInteractionMode = useGameStore((s) => s.interactionMode);
  const offlineMode = useGameStore((s) => Boolean(s.offlineMode));
  const polling = !offlineMode && storeInteractionMode === 'polling';

  const votesMayDisplay = Boolean(showVotes);
  const activeChoices: Record<string, number | string> = votesMayDisplay
    ? (choices
      ?? (storePollVotes?.[question.id] as Record<string, number | string> | undefined)
      ?? (storePollVotes as Record<string, number | string> | undefined)
      ?? {})
    : {};

  const activeSelection = selectedToken ?? internalSelection;

  const handleSelect = (token: string) => {
    tapAnswer();
    setInternalSelection(token);
    onSelectRange?.(token);
  };

  // Derive distribution tallies and room median
  const tallies: TallyOption[] = optionTally(question, activeChoices);
  const medianData: EstimateRead | null = estimateRead(question, activeChoices);
  const eyebrow = kindEyebrow(question);

  const totalVotes = tallies.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  const displayVotes = votesMayDisplay && totalVotes > 0;
  // "MOST COMMON" marks a strict plurality only; a tie marks nothing (the classic "typical room answer").
  const maxCount = tallies.reduce((max, item) => Math.max(max, Number(item.count) || 0), 0);
  const leaders = tallies.filter((item) => (Number(item.count) || 0) === maxCount);
  const pluralityToken = displayVotes && maxCount > 0 && leaders.length === 1 ? leaders[0]!.token : null;

  // STAGE-SPEC step 8 (spec section 3.5): beside on widescreen while polling, below elsewhere.
  const dataTally = tallyPlacement('estimate', format, polling);

  // STAGE-SPEC step 7 (spec section 4.2): the stem and range-label size steps from text length.
  const stageFitResult = stageFit({
    kind: 'estimate',
    format,
    stem: question.statement ?? '',
    scenario: question.scenario ?? null,
    options: tallies.map((t) => t.label),
    count: tallies.length,
    tallyReserved: dataTally !== 'none',
  });

  // STAGE-SPEC pass 4c-1 (spec 4.2 step 2): the stem's real step, measured before first paint
  // rather than estimated from character length. See use-measured-stem-step.ts.
  const rootRef = useRef<HTMLElement | null>(null);
  const stemMeasureKey = `estimate|${format}|${question.statement ?? ''}|${question.scenario ?? ''}|${tallies.map((t) => t.label).join('~')}|${dataTally}`;
  const measuredStem = useMeasuredStemStep(rootRef, 'estimate', format, stageFitResult.stemStep, stemMeasureKey, question.statement ?? '', stageFitResult.answerStep);
  // STAGE-SPEC pass 4c-1 (brief item 4): shared font-ready gate for every WidowGuardedText this
  // component renders (the range labels below).
  // Pass 4c-1b: and on the measured answer step, so a label only ever decides its widow join at
  // the size it will really render at (the rail can step down past a widow, see
  // use-measured-stem-step.ts). The answer rail itself stays hidden until then too, so a rail that
  // steps down is never seen resizing.
  const fontsReady = useFontsReady() && measuredStem.ready;

  // The widow-guarded statement with its authored emphasis marked (src/components/EmphasizedText.tsx).
  const renderFormattedStatement = (
    <EmphasizedText text={measuredStem.guardedText} phrases={question.emphasis} tone="heading" compId="statement-emphasis" />
  );

  return (
    <main
      ref={rootRef}
      className={`screen question estimate-question mechanic-reveal ${className}`}
      data-screen="question"
      data-kind="estimate"
      data-question-id={question.id}
      data-format={format}
      data-phase="deliberating"
      data-stem-step={measuredStem.stemStep}
      data-stem-measured={measuredStem.ready}
      data-answer-step={measuredStem.answerStep ?? undefined}
      data-answer-first-pass={stageFitResult.answerStep ?? undefined}
      data-density={stageFitResult.density}
      data-cards={threeRowEstimate('estimate', format, tallies.length) && stageFitResult.density === 'compact' ? 'tight' : undefined}
      style={{
        color: "var(--color-ink)",
        fontFamily: "var(--kit-font-sans)",
      }}
    >
      {/* Question Header & Prompt */}
      <header
        className="question-header question-stage-copy"
        data-comp-id="statement-card"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="kicker__main"
              data-role="kicker"
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: "var(--color-gold)"
              }}
            >
              {eyebrow}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '4px 8px',
                borderRadius: 6,
                textTransform: 'uppercase',
                backgroundColor: "var(--color-panel-navy)",
                color: "var(--color-accent-cobalt-text)",
                border: "1px solid var(--color-hairline)",
              }}
            >
              DELIBERATING
            </span>
            {question.index !== undefined && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--kit-font-mono)",
                  color: "var(--color-ink-dim)",
                  padding: '4px 8px',
                  borderRadius: 4,
                  backgroundColor: "var(--color-stage-deep)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                Q{question.index}
              </span>
            )}
          </div>
        </div>

        {question.scenario && (
          <p
            className="scenario-kicker"
            data-role="scenario-kicker"
            style={{ fontSize: 16, color: "var(--color-ink-muted)", margin: 0 }}
          >
            {question.scenario}
          </p>
        )}

        <ArrivalKicker />
        <h1
          className="t-h1"
          data-comp-id="statement"
          data-balanced={measuredStem.balanced ? "true" : undefined}
          style={{ visibility: measuredStem.ready ? "visible" : "hidden" }}
        >
          {renderFormattedStatement}
        </h1>
      </header>

      {/* Room Typical Answer Display Card (report projection; the stage composition hides it) */}
      {displayVotes && <section
        className="median-display backer"
        data-role="median-display"
        aria-label="Room Typical Answer Summary"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 16,
          borderRadius: 12,
          backgroundColor: "var(--color-panel-navy)",
          border: "1px solid var(--color-hairline)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: "var(--color-ink-dim)"
              }}
            >
              ROOM'S TYPICAL ANSWER
            </span>
            {medianData ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: medianData.direction === 'ON THE MONEY'
                    ? "var(--color-verdict-true)"
                    : "var(--color-gold)",
                  color: "var(--color-void)",
                }}
              >
                {medianData.direction === 'ON THE MONEY' ? '✓ CLOSE ENOUGH' : `MOST COMMON GUESS ${medianData.direction}`}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: 6,
                  color: "var(--color-ink-dim)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                {totalVotes > 0 ? 'CALCULATING' : 'AWAITING VOTES'}
              </span>
            )}
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)" }}>
          {medianData
            ? `${medianData.medianLabel} · ${medianData.direction === 'ON THE MONEY' ? 'CLOSE ENOUGH' : `MOST COMMON GUESS ${medianData.direction}`}`
            : (totalVotes > 0 ? 'Room votes recorded' : 'No estimates cast yet')}
        </div>
      </section>}

      {/* Range Plate Rail */}
      <section
        className="range-histogram answer-rail estimate-answer-rail"
        data-role="answer-rail"
        style={{ visibility: measuredStem.ready ? undefined : "hidden" }}
        data-range-histogram="true"
        data-count={tallies.length}
        data-tally={dataTally}
        aria-label="Estimate Range Distribution"
      >
        {/* Report-only caption. The stage hides it, so it is a named sibling of the option grid
            rather than an unlabelled first child that positional selectors would miscount. */}
        <div
          className="estimate-answer-rail__header"
        >
          <span
            style={{
              fontSize: 12,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: "var(--color-ink-dim)"
            }}
          >
            ANSWER RANGES
          </span>
          {displayVotes && (
            <span style={{ fontSize: 12, color: "var(--color-ink-dim)", fontFamily: "var(--kit-font-mono)" }}>
              {totalVotes} {totalVotes === 1 ? 'TOTAL VOTE' : 'TOTAL VOTES'}
            </span>
          )}
        </div>

        {tallies.length === 0 ? (
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              backgroundColor: "var(--color-panel-navy)",
              border: "1px solid var(--color-hairline)",
              color: "var(--color-ink-dim)",
              textAlign: 'center'
            }}
          >
            No estimate ranges configured for this question.
          </div>
        ) : (
          <div
            className="estimate-answer-rail__options"
            data-count={tallies.length}
          >
            {tallies.map((row, index) => {
              const isPlurality = pluralityToken === row.token;
              const isSelected = activeSelection === row.token;
              // Range bands take the classic estimate colours in authored order, from the one list in estimate-accents.ts.
              const accent = estimateRangeAccent(index);
              const accentStyle: AccentStyle = { '--range-accent': accent };
              const borderColor = isSelected ? "var(--color-accent-cobalt)" : "var(--color-hairline)";
              // Section 7 markup: an odd range count's own last card is the sanctioned centered
              // exception (spec 2.2, question-stage.css's own :last-child rule keeps it at its
              // peers' width).
              const isOrphan = tallies.length % 2 === 1 && index === tallies.length - 1;

              return (
                <div
                  className="answer-slot"
                  key={row.token}
                  data-slot={row.token}
                  data-orphan={isOrphan ? 'true' : undefined}
                >
                  <button
                    className="answer-bar"
                    type="button"
                    onClick={() => handleSelect(row.token)}
                    aria-label={`Range ${row.label}${displayVotes ? `: ${row.percent}%, ${row.count} ${row.count === 1 ? "vote" : "votes"}` : ""}`}
                    data-token={row.token}
                    data-state="idle"
                    style={{
                      ...accentStyle,
                      borderRadius: 12,
                      backgroundColor: "var(--color-panel-navy)",
                      border: `1px solid ${borderColor}`,
                      cursor: onSelectRange ? 'pointer' : 'default',
                      textAlign: 'left',
                      overflow: 'hidden',
                      transition: shouldReduceMotion ? 'none' : 'border-color 240ms ease, background-color 240ms ease',
                    }}
                  >
                    {/* Background Histogram Fill Bar */}
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: '100%',
                        transform: `scaleX(${displayVotes ? Math.min(100, Math.max(0, row.percent)) / 100 : 0})`,
                        transformOrigin: 'left',
                        backgroundColor: "var(--color-accent-cobalt)",
                        opacity: displayVotes ? 0.2 : 0,
                        transition: shouldReduceMotion ? 'none' : 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                        zIndex: 0,
                      }}
                    />

                    {/* Left: range label plus the locked-room notes. Always rendered: the audience must see the
                        ranges to vote (VOF-02); percentages, plurality and truth marks stay gated below. */}
                    <div
                      className="answer-bar__main"
                    >
                      <WidowGuardedText
                        as="span"
                        className="answer-bar__label"
                        style={{
                          fontWeight: 600,
                          color: "var(--color-ink)",
                        }}
                        text={row.label}
                        fontsReady={fontsReady}
                        scale={measuredStem.scale}
                        allowNarrowing
                      />

                      {/* STAGE-SPEC step 8 fix (spec 5.2, beat-stable): the note's own line is reserved in
                          polling mode (spec 5.2's own words), the same way the tally zone is, not only once
                          a real plurality exists. Rendering it structurally at every beat and filling its
                          text conditionally keeps every card the same height at posed and locked; only
                          rendering the whole element when isPlurality (locked-only, since plurality is
                          undecided before votes) grew the plurality card's own row by a full text line the
                          instant the room locked, which a scoped sweep caught as a beat-stable failure. */}
                      {dataTally !== 'none' && (
                        <span
                          className="answer-bar__note"
                          data-role="typical-room-answer"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            fontFamily: "var(--kit-font-mono)",
                            color: "var(--color-gold)",
                            textTransform: 'uppercase',
                            display: isPlurality ? undefined : 'none',
                          }}
                        >
                          Most common
                        </span>
                      )}
                    </div>

                    {/* Right: the stat slot. Present in every state so Lock only fills it. */}
                    <div
                      className="answer-bar__poll"
                      data-role="stat-slot"
                    >
                      {displayVotes && (
                        <>
                          <span
                            className="answer-bar__pct"
                            style={{
                              fontWeight: 700,
                              fontFamily: "var(--kit-font-mono)",
                              lineHeight: 1,
                              color: "var(--color-ink)",
                              textAlign: 'right',
                            }}
                          >
                            {row.percent}%
                          </span>
                          <span
                            className="answer-bar__votes"
                            style={{
                              fontFamily: "var(--kit-font-mono)",
                              lineHeight: 1,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: "var(--color-ink-muted)",
                            }}
                          >
                            {row.count} {row.count === 1 ? 'vote' : 'votes'}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
});

EstimateQuestion.displayName = 'EstimateQuestion';

export default EstimateQuestion;
