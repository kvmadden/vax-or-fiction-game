import React, { useRef, useState } from 'react';
import { ArrivalKicker } from "./ArrivalKicker";
import { Question } from '../../data/types';
import {
  questionKind,
  kindEyebrow,
  letterFor,
  spokenReplyText,
  asksForReply,
  questionHeadline,
  stageScenarioLabel,
} from '../../engine/kinds';
import { useGameStore } from '../../store/game-store';
import { tapAnswer } from '../../engine/audio-cues';
import { stageFit } from './stage-fit';
import { useMeasuredStemStep } from './use-measured-stem-step';
import { useFontsReady } from './use-fonts-ready';
import { WidowGuardedText } from './WidowGuardedText';
import { tallyPlacement } from './stage-text';
import { EmphasizedText } from '../../components/EmphasizedText';
import type { FormatId } from '../../data/types';

export interface WhichPatientQuestionProps {
  question: Question;
  selectedChoice?: string | null;
  onSelectChoice?: (token: string) => void;
  onReveal?: () => void;
  className?: string;
  /** Map of choice tokens to vote counts; defaults to the room's live tally for this question. */
  votes?: Record<string, number | string>;
  /** Whether the split may show. Defaults to "the host has locked" (VOF-21: blind while open). */
  showVotes?: boolean;
  /** Canvas layout format (widescreen, square, portrait). Defaults to widescreen so a bare render
   * (existing tests, Storybook-style usage) keeps working. */
  format?: FormatId;
}

const CHOICE_ACCENT_COLORS: Record<string, string> = {
  a: "var(--color-vax)",
  b: "var(--color-fiction)",
  c: "var(--color-accent-cobalt)",
  d: "var(--color-accent-purple)",
  e: "var(--color-accent-pink)",
};

type AccentStyle = React.CSSProperties & { '--reply-accent': string };

export const WhichPatientQuestion: React.FC<WhichPatientQuestionProps> = React.memo(({
  question,
  selectedChoice: propSelectedChoice,
  onSelectChoice,
  onReveal,
  className = '',
  votes: propVotes,
  showVotes: propShowVotes,
  format = 'widescreen',
}) => {
  const storeVotesLocked = useGameStore((s) => Boolean(s.votesLocked));
  const storeVotes = useGameStore((s) => s.pollVotes?.[question.id] as Record<string, number | string> | undefined);
  const storeInteractionMode = useGameStore((s) => s.interactionMode);
  const offlineMode = useGameStore((s) => Boolean(s.offlineMode));
  const votesMayDisplay = propShowVotes ?? storeVotesLocked;
  const votes = votesMayDisplay ? (propVotes ?? storeVotes ?? {}) : {};
  const totalVotes = Object.values(votes).reduce<number>((sum, count) => sum + (Number(count) || 0), 0);
  const displayVotes = votesMayDisplay && totalVotes > 0;
  // STAGE-SPEC step 6/8 (spec section 3.5): the tally zone is reserved by play mode, not by beat.
  const polling = !offlineMode && storeInteractionMode === 'polling';

  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedToken = propSelectedChoice !== undefined ? propSelectedChoice : localSelected;

  const handleSelect = (token: string) => {
    tapAnswer();
    if (propSelectedChoice === undefined) {
      setLocalSelected(token);
    }
    onSelectChoice?.(token);
  };

  const eyebrow = kindEyebrow(question);
  const rawChoices = question.choices && question.choices.length > 0 ? question.choices : [];
  const replyBeat = asksForReply(question);

  const statementText = question.statement?.trim() ?? '';
  const scenarioCandidate = question.scenario?.trim() ?? '';
  const fillerScenario = !scenarioCandidate || scenarioCandidate === 'Choose the best answer.';
  const scenarioText = fillerScenario ? null : scenarioCandidate;

  const hasDistinctStatement = Boolean(statementText && statementText !== scenarioText);

  // Statement is the headline when it exists. A spoken-reply beat with only a
  // scenario still uses that quote as the stem so the big screen does not depend
  // on a presenter note to explain the beat. Shared with the Showdown recap
  // (Q16-RECAP) via questionHeadline so the two never drift apart.
  const headline: string = questionHeadline(question);

  const showScenarioUnderStem = Boolean(scenarioText && hasDistinctStatement);
  const stemLabel = replyBeat && !hasDistinctStatement ? 'Patient says' : null;
  // Clear-ask brief (2026-09-27, the owner): "Patient says" is for a real quoted line only
  // (`scenarioVoice: 'quote'`, VOF q16). Every narrated case, and any reply question that never set
  // scenarioVoice, reads "Scenario". Shared with the phone's own text-derived read via stageScenarioLabel
  // (src/engine/kinds.ts), which tests/unit/deck-scenario-copy.test.ts proves the two never disagree on.
  const scenarioLabel = stageScenarioLabel(question);

  // the design call (spec section 5.5, kept): 3 or 4 answers use a 2x2 grid on widescreen and
  // square, each card keeping its own tally. Portrait uses one column with the per-card tally
  // hidden. data-tally (spec 3.5) is reserved by play mode, not by beat: a polling room holds the
  // zone open from the posed beat on so a label never rewraps at lock.
  const tallyHiddenByRuling = format === 'portrait' && rawChoices.length >= 3;
  const dataTally = tallyPlacement('which-patient', format, polling, tallyHiddenByRuling);

  // STAGE-SPEC step 7 (spec section 4.2): the stem and answer size steps from text length alone.
  const stageFitResult = stageFit({
    kind: 'which-patient',
    format,
    stem: headline,
    scenario: showScenarioUnderStem ? scenarioText : null,
    options: rawChoices,
    count: rawChoices.length,
    tallyReserved: dataTally === 'beside' || dataTally === 'below',
  });

  // STAGE-SPEC pass 4c-1 (spec 4.2 step 2): the stem's real step, measured before first paint
  // rather than estimated from character length. See use-measured-stem-step.ts.
  const rootRef = useRef<HTMLElement | null>(null);
  const stemMeasureKey = `which-patient|${format}|${headline}|${showScenarioUnderStem ? scenarioText : ''}|${rawChoices.join('~')}|${dataTally}`;
  const measuredStem = useMeasuredStemStep(rootRef, 'which-patient', format, stageFitResult.stemStep, stemMeasureKey, headline, stageFitResult.answerStep);
  // STAGE-SPEC pass 4c-1 (brief item 4): shared font-ready gate for every per-choice
  // WidowGuardedText below.
  // Pass 4c-1b: and on the measured answer step, so a label only ever decides its widow join at
  // the size it will really render at (the rail can step down past a widow, see
  // use-measured-stem-step.ts). The answer rail itself stays hidden until then too, so a rail that
  // steps down is never seen resizing.
  const fontsReady = useFontsReady() && measuredStem.ready;

  return (
    <main
      ref={rootRef}
      className={`which-patient-question mechanic-reveal ${className}`}
      data-screen="question"
      data-kind={questionKind(question)}
      data-question-id={question.id}
      data-phase="deliberating"
      data-stem-step={measuredStem.stemStep}
      data-stem-measured={measuredStem.ready}
      data-answer-step={measuredStem.answerStep ?? undefined}
      data-answer-first-pass={stageFitResult.answerStep ?? undefined}
      data-density={stageFitResult.density}
      style={{
        color: "var(--color-ink)",
        fontFamily: "var(--kit-font-sans)",
      }}
    >
      {/* Header & Eyebrow */}
      <header
        className="question-stage-copy"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: "var(--kit-space-8)",
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: "var(--kit-space-8)",
            }}
          >
            <span
              data-role="kicker"
              style={{
                fontFamily: "var(--kit-font-mono)",
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: "var(--color-gold)",
              }}
            >
              {eyebrow}
            </span>
          </div>

          {question.guidelineRef && (
            <span
              style={{
                fontFamily: "var(--kit-font-mono)",
                fontSize: '12px',
                color: "var(--color-ink-dim)",
              }}
            >
              REF · {question.guidelineRef}
            </span>
          )}
        </div>

        {/* Clinical Headline */}
        {stemLabel && (
          <p
            className="question-stem-label"
            data-role="stem-label"
            style={{
              margin: "0",
              fontFamily: "var(--kit-font-mono)",
              fontSize: '16px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: "var(--color-gold)",
            }}
          >
            {stemLabel}
          </p>
        )}
        <ArrivalKicker />
        <h1
          data-comp-id="statement"
          data-balanced={measuredStem.balanced ? "true" : undefined}
          style={{ visibility: measuredStem.ready ? "visible" : "hidden" }}
        >
          <EmphasizedText text={measuredStem.guardedText} phrases={question.emphasis} tone="heading" compId="statement-emphasis" />
        </h1>
      </header>

      {/* Clinical Scenario Vignette (if distinct from statement) */}
      {showScenarioUnderStem && scenarioText && (
        <section
          className="question-stage-scenario"
          data-comp-id="scenario"
          data-role="scenario-kicker"
          style={{ gap: "var(--kit-space-4)" }}
        >
          <span
            data-role="scenario-label"
            style={{
              fontFamily: "var(--kit-font-mono)",
              fontSize: '26px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: "var(--color-gold)",
            }}
          >
            {scenarioLabel}
          </span>
          <p
            style={{
              margin: "0",
              fontSize: '28px',
              lineHeight: 1.5,
              color: "var(--color-ink)",
              fontStyle: 'normal',
            }}
          >
            {scenarioText}
          </p>
        </section>
      )}

      {/* Reply Options List / Grid */}
      <section
        className="answer-rail answer-rail--which-patient"
        data-role="answer-rail"
        style={{ visibility: measuredStem.ready ? undefined : "hidden" }}
        data-count={rawChoices.length}
        data-votes={displayVotes ? 'shown' : 'hidden'}
        data-tally={dataTally}
        aria-label="Spoken Reply Options"
      >
        {rawChoices.map((choiceText, index) => {
          const token = letterFor(index) ?? 'a';
          const label = token.toUpperCase();
          const isSelected = selectedToken === token;
          const accentColor = CHOICE_ACCENT_COLORS[token] || "var(--color-accent-cobalt)";
          const accentStyle: AccentStyle = { '--reply-accent': accentColor };
          const voteCount = Number(votes[token]) || 0;
          const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const cardBorder = isSelected ? `2px solid ${accentColor}` : "1px solid var(--color-hairline)";
          const cardBg = isSelected ? "var(--color-canvas-navy)" : "var(--color-panel-navy)";
          // Spec 2.2 / 5.5, section 7 markup: the 3-answer grid's third card is the one sanctioned
          // centered exception on wide and square (portrait stays one column, so it is never an
          // orphan there).
          const isOrphan = format !== 'portrait' && rawChoices.length === 3 && index === 2;

          return (
            <div
              className="answer-slot"
              key={token}
              data-slot={token}
              data-orphan={isOrphan ? 'true' : undefined}
            >
              <button
                type="button"
                className="answer-bar"
                data-choice={token}
                data-state={isSelected ? 'selected' : 'idle'}
                aria-pressed={isSelected}
                aria-label={
                  displayVotes
                    ? `${label}: ${choiceText}, ${percent}%, ${voteCount} ${voteCount === 1 ? "vote" : "votes"}`
                    : `${label}: ${choiceText}`
                }
                onClick={() => handleSelect(token)}
                style={{
                  ...accentStyle,
                  appearance: 'none',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'inherit',
                  borderRadius: "var(--kit-radius-12)",
                  backgroundColor: cardBg,
                  border: cardBorder,
                  cursor: 'pointer',
                  transition: 'background-color 240ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 240ms cubic-bezier(0.2, 0.8, 0.2, 1), border-width 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                  boxSizing: 'border-box',
                }}
              >
                {/* Letter disc + the reply / patient copy */}
                <div
                  className="answer-bar__main"
                >
                  <div
                    className="answer-bar__key"
                  >
                    {label}
                  </div>

                  <WidowGuardedText
                    as="p"
                    className="answer-bar__label"
                    text={spokenReplyText(question, choiceText)}
                    fontsReady={fontsReady}
                    scale={measuredStem.scale}
                    allowNarrowing
                  />
                </div>

                {/* Stat slot: present in every state, filled once the host locks (VOF-21). */}
                <div
                  className="answer-bar__poll"
                  data-role="stat-slot"
                >
                  {displayVotes && (
                    <>
                      <span
                        className="answer-bar__pct"
                        style={{
                          fontFamily: "var(--kit-font-mono)",
                          fontWeight: 700,
                          lineHeight: 1,
                          color: "var(--color-ink)",
                        }}
                      >
                        {percent}%
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
                        {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
                      </span>
                    </>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </section>

      {/* Optional Standalone Facilitator Toggle */}
      {onReveal && (
        <div className="question-kind-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="facilitator-press"
            onClick={onReveal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: "var(--kit-touch)",
              minWidth: '160px',
              padding: "var(--kit-space-8) var(--kit-space-24)",
              backgroundColor: "var(--color-gold)",
              color: "var(--color-void)",
              fontFamily: "var(--kit-font-mono)",
              fontSize: '16px',
              fontWeight: 700,
              borderRadius: "var(--kit-space-8)",
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reveal Best Reply
          </button>
        </div>
      )}
    </main>
  );
});

WhichPatientQuestion.displayName = 'WhichPatientQuestion';

export default WhichPatientQuestion;
