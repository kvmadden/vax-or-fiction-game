import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { PublicQuestion } from '../network/protocol';
import { asksForReply, kindEyebrow, phoneScenarioLabel } from '../engine/kinds';
import { kindInstructionLine } from '../engine/instruction-lines';
import { VOTE_STATUS } from './vote-status';
import { createSubmitHandler, cuePhoneChrome, triggerTactileFeedback } from './phone-vote-utils';
import { keepCompounds } from './keep-compounds';
import { EmphasizedText } from '../components/EmphasizedText';
import { LOCKED_SAT_OUT, LOCKED_WAIT } from './phone-live-copy';
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from '../ui/screen-fade';
import { VoteDock } from './VoteDock';

export type QuestionType = 'binary' | 'myth' | 'myth-among-three' | 'estimate' | 'order' | 'which-patient';

export interface PhoneVoteProps {
  questionType: QuestionType;
  questionData?: PublicQuestion | null;
  timerSeconds?: number;
  onSubmit: (answer: string, conviction?: string) => void;
  votesLocked?: boolean;
  initialVote?: string | null;
  pendingChoice?: string | null;
  isSubmitting?: boolean;
  isDiscussionPaused?: boolean;
  /** A successful host ACK for this exact submission. This carries occurrence, not just choice equality. */
  acknowledgedSubmission?: { questionInstanceId: string; choice: string; sequence: number } | null;
  /** Solo play uses the same submit path as a room. Confidence is not a second tap. */
  solo?: boolean;
}

const EMPTY_STEPS: NonNullable<PublicQuestion['steps']> = [];

const PhoneVoteForm: React.FC<PhoneVoteProps> = ({
  questionType,
  questionData,
  timerSeconds,
  onSubmit,
  votesLocked = false,
  initialVote = null,
  pendingChoice = null,
  isSubmitting = false,
  isDiscussionPaused = false,
  acknowledgedSubmission = null,
  solo = false,
}) => {
  const [reviewingChoices, setReviewingChoices] = useState(false);
  const [order, setOrder] = useState(() => questionData?.steps?.map((step) => step.token) ?? []);
  const [orderAnnouncement, setOrderAnnouncement] = useState('');
  const acceptedChoiceRef = useRef(initialVote);
  const shouldReduceMotion = useReducedMotion();
  const receiptRef = useRef<HTMLDivElement>(null);
  // W4 (A11Y-10 regression): the submission's own sequence, not just the `acknowledged` boolean.
  // Locking then reopening the same accepted vote (ADD_TIME after TIME_EXPIRED) flips `acknowledged`
  // false then true again for the exact same submission, and a reload starts with it already true.
  // Neither is a new acknowledgement, so neither may move focus. The ref starts at whatever sequence is
  // already in hand when this mounts, so coming back to the same question (after the hold screen, say)
  // is not new either. A reload mounts with no acknowledgement at all, and the effect below never
  // counts a null sequence as new.
  const acknowledgedSequenceRef = useRef<number | null>(acknowledgedSubmission?.sequence ?? null);

  const acceptedChoice = initialVote;
  const visibleChoice = pendingChoice ?? acceptedChoice;
  const legacyTimerSeconds = (questionData as (PublicQuestion & { timerSeconds?: number }) | null | undefined)?.timerSeconds;
  const effectiveTimerSeconds = timerSeconds ?? legacyTimerSeconds ?? 0;
  const locked = votesLocked;
  const disabled = locked || isSubmitting || Boolean(pendingChoice);
  const options = questionData?.options ?? [];
  const steps = questionData?.steps ?? EMPTY_STEPS;
  const byToken = useMemo(() => new Map(steps.map((step) => [step.token, step])), [steps]);
  const isOrder = questionType === 'order';

  // A changed answer remains on the editable page until the relay returns the authoritative choice. A new choice
  // changes `acceptedChoice`; a same-token resubmission needs the ACK occurrence from PhoneSuite to prove it was
  // accepted rather than rejected or timed out.
  useEffect(() => {
    const acknowledgementMatchesQuestion = acknowledgedSubmission !== null
      && acknowledgedSubmission.questionInstanceId === questionData?.questionInstanceId
      && acknowledgedSubmission.choice === acceptedChoice;
    const acceptedChoiceChanged = acceptedChoiceRef.current !== acceptedChoice;
    acceptedChoiceRef.current = acceptedChoice;
    if (!acceptedChoice || (!acceptedChoiceChanged && !acknowledgementMatchesQuestion)) return;
    setReviewingChoices(false);
  }, [acceptedChoice, acknowledgedSubmission, questionData?.questionInstanceId]);

  const handleChoice = (choice: string) => {
    if (disabled) return;
    triggerTactileFeedback();
    createSubmitHandler(onSubmit, 'fairly-sure')(choice);
  };
  const submit = handleChoice;
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (disabled || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    cuePhoneChrome();
    setOrder(next);
    // A11Y-09 (live-position announcement half): the move button's own aria-label names the action
    // ("Move X up"), never its result, so a screen-reader user has to re-navigate the whole list to
    // learn the new order. Announce it instead.
    const movedText = byToken.get(order[index]!)?.text ?? order[index];
    setOrderAnnouncement(`${movedText} moved to position ${target + 1} of ${next.length}`);
  };
  const showChoices = () => {
    cuePhoneChrome();
    // Reopening an accepted order starts from the host's canonical submitted sequence, including after a reload.
    // This runs only when entering the edit route, so an in-progress reorder is never overwritten mid-draft.
    if (isOrder && acceptedChoice) {
      const acceptedOrder = acceptedChoice.split('-');
      if (acceptedOrder.length === steps.length && acceptedOrder.every((token) => byToken.has(token))) setOrder(acceptedOrder);
    }
    setReviewingChoices(true);
  };

  const actionStyle = { minHeight: "var(--kit-touch)", paddingInline: "var(--kit-space-8)", borderRadius: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", backgroundColor: 'transparent', color: "var(--color-ink)", touchAction: 'manipulation' } as const;
  const primaryButton = (token: string, label: string, accent: string = "var(--color-accent-cobalt)", text?: string, range?: string) => (
    <button key={token} type="button" data-choice={token} data-action={`vote-${token}`} data-selected={visibleChoice ? (visibleChoice === token ? 'true' : 'false') : undefined} aria-pressed={visibleChoice ? visibleChoice === token : undefined} disabled={disabled}
      className={`phone-choice phone-vote-choice phone-vote-choice--${token} phone-option-card`}
      style={{ minHeight: "var(--kit-space-64)", padding: "var(--kit-space-12)", borderRadius: "var(--kit-radius-12)", border: `2px solid ${accent}`, backgroundColor: "var(--color-panel-navy)", color: "var(--color-ink)", touchAction: 'manipulation' }}
      onClick={() => handleChoice(token)}>
      {text || range ? <><span className="phone-choice__key" aria-hidden={text ? 'true' : undefined}>{label}</span>{text ? <span className="phone-choice__text">{keepCompounds(text)}</span> : null}{range ? <span className="phone-choice__range">{range}</span> : null}</> : label}
    </button>
  );
  // projectPublicQuestion (src/network/projection.ts) merges statement and scenario into one string,
  // joined by a blank line, because PublicQuestion carries no separate scenario field over the wire.
  // An <h3> collapses that blank line to a single space, so the question used to land mid-paragraph
  // with its scenario (review finding, 2026-09-27). Splitting on the same "\n\n" the merge used lets
  // the phone render the scenario as its own element, the way the stage already does.
  const rawStatement = questionData?.statement ?? '';
  const [stemText = '', ...scenarioParts] = rawStatement.split('\n\n');
  const scenarioText = scenarioParts.join('\n\n').trim();
  // The room wire carries no scenarioVoice (PublicQuestion, src/network/protocol.ts), so the phone
  // derives its own "Patient says" vs "Scenario" call from the scenario text itself.
  const scenarioLabel = phoneScenarioLabel(
    asksForReply({ kind: questionData?.kind, statement: questionData?.statement, reply: questionData?.reply }),
    scenarioText,
  );
  const stemLength = stemText.length;
  const stemSize = stemLength > 96 ? 'long' : stemLength > 48 ? 'medium' : 'short';
  const acknowledged = Boolean(acceptedChoice) && !locked && !reviewingChoices;

  // A11Y-10: the button a person just tapped unmounts the instant it is acknowledged and replaced by
  // the receipt, so keyboard focus falls back to the body. Follow it onto the receipt, but only when
  // a genuinely new acknowledgement arrives (W4: the submission's own sequence goes up, not merely
  // `acknowledged` turning true again for a vote already accounted for, as happens when the host
  // reopens a locked question with ADD_TIME) and only if focus is where the player would expect it
  // to move from: on body, or already inside the vote dock. A person who has since tabbed elsewhere,
  // scrolled away, or reopened Change answer never has focus pulled back.
  useEffect(() => {
    const sequence = acknowledgedSubmission?.sequence ?? null;
    const isNewAcknowledgement = acknowledged && sequence !== null && sequence !== acknowledgedSequenceRef.current;
    if (isNewAcknowledgement) {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const focusIsFree = !active || active === document.body || Boolean((active as HTMLElement).closest?.('[data-role="phone-dock"]'));
      if (focusIsFree) receiptRef.current?.focus();
    }
    if (sequence !== null) acknowledgedSequenceRef.current = sequence;
  }, [acknowledged, acknowledgedSubmission]);

  const selectedOption = options.find((option) => option.token === acceptedChoice);
  const lockedUnanswered = locked && !visibleChoice;
  const receiptTokens = acceptedChoice?.split('-') ?? [];
  const receiptText = isOrder
    ? receiptTokens.map((token) => byToken.get(token)?.text).filter((text): text is string => Boolean(text)).join(' → ') || 'Your submitted order'
    : selectedOption?.text || selectedOption?.label || acceptedChoice?.toUpperCase() || '';
  const badgeState = pendingChoice ? 'sending' : visibleChoice ? (locked ? 'locked' : 'in') : locked ? 'none' : 'open';
  // F-05: the locked-and-answered state used to show three redundant lines (this badge's own
  // "Locked in. Watch the screen.", the gold phone-locked-wait line below, and "Votes locked" in
  // the top-right status slot). The badge now stays silent for that one state, so the reveal only
  // says the same thing once, and the answer itself gets the visual weight instead.
  // The sat-out receipt below already carries LOCKED_SAT_OUT once. Silencing the badge here too,
  // the same move F-05 made for the locked-and-answered state, so it says it once, not twice.
  const badgeCopy = {
    open: kindInstructionLine(questionData ? { kind: questionData.kind, statement: questionData.statement, reply: questionData.reply } : null, 'phone'),
    sending: 'Sending…',
    in: isOrder ? 'Your order is in' : 'Your answer is in',
    locked: '',
    none: '',
  }[badgeState];
  // W7: each of these is a direct child of the phone-dock motion.section below, and the dock's own
  // layout animation applies a scale transform while it resizes. Without a matching `layout` prop of
  // their own, a plain child renders at that scale too, visibly stretching or squashing its text for
  // the duration of the transition. `layout` here lets Framer Motion correct for the parent's scale
  // instead (the "correct the children" half of the fix, as opposed to animating height directly).
  // B1: "position", not a full layout animation. A child whose own height changes (the receipt losing
  // Change answer when votes lock, or regaining it on an ADD_TIME reopen) would otherwise animate that
  // size as a scale too, squashing its text to 0.574x or stretching it to 1.743x. Size snaps, and
  // only position animates. The option lists that Change answer brings back take the same prop, since
  // with none at all the dock's own resize stretched them (1.309x on binary q17).
  const childLayout = shouldReduceMotion ? false : 'position';
  const confirmation = <motion.p layout={childLayout} data-role="vote-confirmation-badge" data-state={badgeState} aria-live="polite" className="phone-vote-badge" style={{ minHeight: "var(--kit-touch)" }}>{badgeCopy}</motion.p>;
  const changeAnswerControl = <button type="button" data-action="review-answer-options" disabled={disabled} onClick={showChoices} className="phone-change-answer" style={actionStyle}>Change answer</button>;
  // An order lists its steps as the result does. On a roomy screen the way to change an answer sits on the answer it changes.
  // F-05: the locked receipt drops its own border, background and padding so the answer reads as
  // the one thing on the card, not a 14px value boxed inside a box. The value itself carries the
  // true/false tone for a binary question, the same pairing the vote buttons already use.
  const choiceReceipt = acceptedChoice ? <motion.div key="receipt" layout={childLayout} ref={receiptRef} tabIndex={-1} data-role="phone-choice-receipt" className="phone-choice-receipt" data-kind={questionType} data-locked={locked ? 'true' : 'false'}><span className="phone-choice-receipt__label">{isOrder ? 'Your order' : 'Your answer'}</span>{isOrder && receiptTokens.length > 0 && receiptTokens.every((token) => byToken.get(token)?.text) ? <ol className="phone-receipt-order">{receiptTokens.map((token) => <li key={token}>{byToken.get(token)?.text}</li>)}</ol> : <strong data-answer-token={questionType === 'binary' && locked ? acceptedChoice : undefined}>{receiptText}</strong>}{acknowledged ? changeAnswerControl : null}</motion.div> : null;
  // The top-right status slot already says "Votes locked", so this drops its own copy of that
  // label, and drops data-locked (the badge is silent for this state too, so nothing else reads
  // it) rather than picking up the answered receipt's 34px, colored-by-choice styling.
  const lockedEmptyReceipt = <motion.div layout={childLayout} data-role="phone-no-answer-receipt" className="phone-choice-receipt" data-kind={questionType}><strong>{LOCKED_SAT_OUT}</strong></motion.div>;
  // F-13: the position is its own column now, in mono and muted, so the number reads as a rank
  // rather than wrapping into the label and looking like an answer key.
  const renderOrderSteps = (tokens: string[]) => tokens.map((token, index) => {
    const step = byToken.get(token);
    return <div key={token} className="phone-order-step phone-option-card" style={{ minHeight: "var(--kit-touch)", padding: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", borderRadius: "var(--kit-radius-12)", backgroundColor: "var(--color-panel-navy)" }}><span className="phone-order-step__position" aria-hidden="true">{index + 1}</span><span className="phone-order-step__label">{step?.text}</span><div className="phone-order-step__actions"><button type="button" data-role="order-move-up" aria-label={`Move ${step?.text ?? token} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)} style={{ ...actionStyle, minWidth: "var(--kit-touch)" }}>↑</button><button type="button" data-role="order-move-down" aria-label={`Move ${step?.text ?? token} down`} disabled={disabled || index === order.length - 1} onClick={() => move(index, 1)} style={{ ...actionStyle, minWidth: "var(--kit-touch)" }}>↓</button></div></div>;
  });
  const orderControls = <motion.div key="order-controls" layout={childLayout} className="phone-order-list" data-role="phone-order-list">{steps.length ? <>{renderOrderSteps(order)}<p aria-live="polite" className="sr-only" data-role="order-move-announce">{orderAnnouncement}</p><button type="button" data-action="submit-order" disabled={disabled} className="phone-submit" onClick={() => submit(order.join('-'))} style={{ ...actionStyle, minHeight: "var(--kit-touch)", border: 0, backgroundColor: "var(--color-gold)", color: "var(--color-stage-deep)", fontWeight: 'bold' }}>Submit order</button></> : <p style={{ color: "var(--color-ink-dim)" }}>Waiting for order steps.</p>}</motion.div>;

  return <section className="phone-vote-surface phone-question-screen" data-role="phone-vote-container" data-screen="question" data-kind={questionType} data-question-id={questionData?.id} data-discussion-paused={isDiscussionPaused ? 'true' : 'false'} style={{ minHeight: 0, padding: "var(--kit-space-16)", gap: "var(--kit-space-16)", color: "var(--color-ink)", backgroundColor: isDiscussionPaused ? 'color-mix(in srgb, var(--color-void) 92%, black)' : "var(--color-canvas-navy)", touchAction: 'manipulation', overscrollBehaviorY: 'contain' }}>
    <div data-role="phone-vote-top" className="phone-vote-hero">
      <div className="phone-vote-meta">
        <p data-role="phone-question-kicker" className="phone-question-kicker">{kindEyebrow({ kind: questionData?.kind, statement: questionData?.statement, reply: questionData?.reply })}</p>
        <span data-role="phone-vote-status" data-state={isDiscussionPaused ? 'paused' : locked ? 'locked' : 'open'} className={isDiscussionPaused || locked ? 'phone-vote-status' : 'sr-only'}>{isDiscussionPaused ? 'PAUSED FOR DISCUSSION' : locked ? VOTE_STATUS.locked : VOTE_STATUS.open}</span>
        <span data-role="timer-ring" data-urgent={!locked && effectiveTimerSeconds > 0 && effectiveTimerSeconds <= 10 ? 'true' : 'false'} className={locked || isDiscussionPaused || effectiveTimerSeconds <= 0 ? 'sr-only' : 'phone-vote-timer'}>{effectiveTimerSeconds > 0 || locked ? `${Math.max(0, effectiveTimerSeconds)}s` : ''}</span>
      </div>
      <h3 data-role="question-stem" data-length={stemSize} className="phone-vote-stem"><EmphasizedText text={stemText || 'Waiting for the next question'} phrases={questionData?.emphasis} tone="heading" renderText={keepCompounds} /></h3>
      {scenarioText ? (
        <p data-role="phone-question-scenario" className="phone-vote-scenario" style={{ margin: 0, whiteSpace: 'pre-line' }}>
          <span data-role="phone-scenario-label" className="phone-scenario-label">{scenarioLabel}</span>
          {keepCompounds(scenarioText)}
        </p>
      ) : null}
    </div>
    {/* A room phone answers on the dock that fills the screen under the stem. Solo keeps its own dock, which its
        pace screens and Next button sit around. */}
    {!solo ? <VoteDock
      questionType={questionType}
      question={questionData}
      badgeState={badgeState}
      openLine={kindInstructionLine(questionData ? { kind: questionData.kind, statement: questionData.statement, reply: questionData.reply } : null, 'phone')}
      inLine={isOrder ? 'Your order is in' : 'Your answer is in'}
      visibleChoice={visibleChoice}
      locked={locked}
      answered={acknowledged}
      disabled={disabled}
      onChoose={handleChoice}
      onChangeAnswer={showChoices}
      // The receipt and the order controls carry their own keys, so swapping one for the other mounts the receipt
      // fresh and its ref attaches: a reused motion element keeps the ref it first mounted with, which was none.
      orderBody={acknowledged || (locked && visibleChoice) ? choiceReceipt : orderControls}
    /> : <motion.section
      className="phone-vote-dock"
      data-role="phone-dock"
      data-kind={questionType}
      data-locked={locked ? 'true' : 'false'}
      data-answered={visibleChoice ? 'true' : 'false'}
      layout={!shouldReduceMotion}
      transition={{ layout: { duration: shouldReduceMotion ? 0 : SCREEN_FADE_S, ease: SCREEN_FADE_EASE } }}
    >
      {badgeCopy ? confirmation : null}
      {/* Locking used to be announced by the badge's own "Locked in" text, which F-05 silenced.
          This line already carries the visible lock message, so it carries the announcement too,
          rather than adding a second, invisible live region for the same event. */}
      {locked && visibleChoice ? <motion.p layout={childLayout} data-role="phone-locked-wait" aria-live="polite" className="phone-locked-wait">{LOCKED_WAIT}</motion.p> : null}
      {acknowledged || (locked && visibleChoice) ? choiceReceipt : lockedUnanswered ? lockedEmptyReceipt : (
        <>
          {questionType === 'binary' ? (
            <motion.div layout={childLayout} data-role="thumb-zone-actions" className="phone-thumb-zone">
              <div className="phone-binary-choices">
                {primaryButton('true', options.find((option) => option.token === 'true')?.label ?? 'True', "var(--color-answer-true)")}
                {primaryButton('false', options.find((option) => option.token === 'false')?.label ?? 'False', "var(--color-answer-false)")}
              </div>
            </motion.div>
          ) : null}
          {(questionType === 'myth' || questionType === 'myth-among-three' || questionType === 'which-patient' || questionType === 'estimate') && (
            <motion.div layout={childLayout} className={`phone-option-list${questionType === 'estimate' ? ' phone-range-grid' : ''}`} data-role="phone-options" data-count={options.length}>
              {options.length ? options.map((option) => questionType === 'estimate' ? primaryButton(option.token, option.label || option.text || (option.min !== undefined && option.max !== undefined ? `${option.min}–${option.max}${questionData?.unit ? ` ${questionData.unit}` : ''}` : option.token.toUpperCase()), "var(--color-gold)") : primaryButton(option.token, option.label || option.text, "var(--color-accent-cobalt)", option.label && option.text ? option.text : undefined)) : <p style={{ color: "var(--color-ink-dim)" }}>Waiting for answer options.</p>}
            </motion.div>
          )}
          {questionType === 'order' && orderControls}
        </>
      )}
    </motion.section>}
  </section>;
};

export const PhoneVote: React.FC<PhoneVoteProps> = React.memo((props) => {
  const questionResetKey = `${props.questionData?.questionInstanceId ?? ''}:${props.questionData?.id ?? ''}`;
  return <PhoneVoteForm key={questionResetKey} {...props} />;
});

PhoneVote.displayName = 'PhoneVote';
export default PhoneVote;
