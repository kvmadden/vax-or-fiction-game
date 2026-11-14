import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { AttendeeState, PublicQuestion, PublicReveal } from '../network/protocol';
import { asksForReply, kindEyebrow, phoneScenarioLabel } from '../engine/kinds';
import { describeAnswer, describeResult, revealTeaching } from './reveal-copy';
import { VOTE_STATUS } from './vote-status';
import { keepCompounds } from './keep-compounds';
import { EmphasizedText } from '../components/EmphasizedText';
import { cuePhoneChrome } from './phone-vote-utils';
import { REVEAL_MISSED, REVEAL_PENDING, REVEAL_RIGHT, REVEAL_WAITING } from './phone-live-copy';
import { readPhoneReaction, writePhoneReaction } from './phone-memory';
import { STAGE_REACTIONS } from '../engine/reactions';

export interface PhoneRevealProps {
  reveal: PublicReveal | null;
  question?: PublicQuestion | null;
  attendee: AttendeeState | null;
  onReaction?: (reaction: string) => void;
  /**
   * Result settles the answer; explanation is the next host-driven teaching phase. Combined is solo only
   * (VOF-W7): the verdict and the reason on one screen, since one player alone has no host to walk them
   * apart.
   */
  presentation: 'result' | 'explanation' | 'combined';
  /** Solo play (VOF-44): this answer's points show as a chip, a confident miss's minus one included. */
  solo?: boolean;
  className?: string;
}

/** The ✓ and × read to a screen reader as symbols, so they show to the eye and say "right" or "wrong" instead. */
const saidLine = (copy: string): React.ReactNode => {
  // The verdict mark is the last one, so an answer whose own words hold a × keeps them.
  const [, before, glyph, after] = copy.match(/^([\s\S]*) ([✓×])([^✓×]*)$/) ?? [];
  if (!glyph) return copy;
  // One inline run, so a result line laid out as a row keeps the mark against its words.
  return <span className="phone-reveal-said__text">{before} <span aria-hidden="true">{glyph}</span><span className="sr-only">{glyph === '✓' ? ', right' : ', wrong'}</span>{after}</span>;
};

const REACTIONS = STAGE_REACTIONS;

/** How long "Sent to the room" stays under the reactions after a tap (critique item 7). */
export const REACTION_ACK_MS = 1500;

// At 664px the takeaway is already visible; a jump button only pushes it further down.
// The shorter 548px layout still needs a direct route past the sticky Next control.
const SOLO_TAKEAWAY_JUMP_MAX_HEIGHT = 620;

/**
 * One reaction per reveal: the tapped button fills gold, the others step back, and a reserved
 * line says "Sent to the room" for 1.5s. Keyed by the question instance so a new reveal starts clean.
 */
export const PhoneReactions: React.FC<{ questionInstanceId?: string; onReaction: (reaction: string) => void; onSent?: () => void }> = ({ questionInstanceId, onReaction, onSent }) => {
  const [sent, setSent] = useState<string | null>(() => readPhoneReaction(questionInstanceId));
  const [ackVisible, setAckVisible] = useState(false);
  useEffect(() => {
    if (!ackVisible) return undefined;
    const timer = setTimeout(() => setAckVisible(false), REACTION_ACK_MS);
    return () => clearTimeout(timer);
  }, [ackVisible]);
  const react = (value: string) => {
    if (sent) return;
    setSent(value);
    setAckVisible(true);
    writePhoneReaction(questionInstanceId, value);
    cuePhoneChrome();
    onReaction(value);
    // Move focus before React disables the selected button, rather than letting it fall to BODY.
    onSent?.();
  };
  return <>
    <div data-role="phone-reactions" data-sent={sent ? 'true' : 'false'}>
      {REACTIONS.map((reaction) => <button key={reaction.value} type="button" className="phone-reaction" data-reaction={reaction.value} data-selected={sent ? (sent === reaction.value ? 'true' : 'false') : undefined} aria-label={reaction.label} aria-pressed={sent ? sent === reaction.value : undefined} disabled={Boolean(sent)} onClick={() => react(reaction.value)}>
        <span className="phone-reaction__emoji" aria-hidden="true">{reaction.emoji}</span>
      </button>)}
    </div>
    <p data-role="phone-reaction-ack" data-visible={ackVisible ? 'true' : 'false'} aria-live="polite" className="phone-reaction-ack">{ackVisible ? 'Sent to the room' : ''}</p>
  </>;
};

export const PhoneReveal: React.FC<PhoneRevealProps> = React.memo(({ reveal, question, attendee, onReaction, presentation, solo = false, className = '' }) => {
  // Read the height before the first paint, so a short phone never flashes the tall layout for a frame.
  const [compactViewport, setCompactViewport] = useState(() => typeof window !== 'undefined' && window.innerHeight < 700);
  const [soloJumpViewport, setSoloJumpViewport] = useState(() => typeof window !== 'undefined' && window.innerHeight < SOLO_TAKEAWAY_JUMP_MAX_HEIGHT);
  const [compactPage, setCompactPage] = useState<'main' | 'reactions'>('main');
  const [orderResultPage, setOrderResultPage] = useState(0);
  const verdictHeadingRef = useRef<HTMLParagraphElement>(null);
  const takeawayHeadingRef = useRef<HTMLHeadingElement>(null);
  const continuationHeadingRef = useRef<HTMLParagraphElement>(null);
  const openContinuationButtonRef = useRef<HTMLButtonElement>(null);
  const continuationBackButtonRef = useRef<HTMLButtonElement>(null);
  const previousCompactPageRef = useRef<'main' | 'reactions'>('main');
  const focusedVerdictRef = useRef<string | null>(null);
  useEffect(() => {
    const syncViewport = () => {
      setCompactViewport(window.innerHeight < 700);
      setSoloJumpViewport(window.innerHeight < SOLO_TAKEAWAY_JUMP_MAX_HEIGHT);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);
  useEffect(() => {
    setCompactPage('main');
    setOrderResultPage(0);
  }, [presentation, question?.questionInstanceId, reveal?.answerToken]);
  // The short-phone Sources/Reactions pane replaces its trigger. Move focus to the
  // newly exposed heading, then return focus to the restored trigger on Back.
  // Otherwise keyboard and screen-reader users can be stranded on a removed button.
  useEffect(() => {
    if (previousCompactPageRef.current === compactPage) return;
    previousCompactPageRef.current = compactPage;
    if (compactPage === 'reactions') continuationHeadingRef.current?.focus();
    else openContinuationButtonRef.current?.focus();
  }, [compactPage]);
  // Solo's combined screen is the whole reveal beat in one go (VOF-W7): a tap lands here with no lead-in
  // screen to have already put a person's attention on the verdict, so focus moves to it here and it
  // announces itself. PhoneLayout keys its content on screenKey (`reveal-${presentation}-${questionId}`),
  // so PhoneReveal actually remounts fresh on every phase and presentation change -- a room's own reveal-
  // then-explain for one question is two separate mounts, not one. The question-keyed guard here is not
  // about surviving that remount (a fresh mount always starts the ref at null); it only stops a second,
  // same-key re-render of the same screen from stealing focus back a second time.
  useEffect(() => {
    if (presentation !== 'combined') return;
    const key = question?.questionInstanceId ?? null;
    if (!key || focusedVerdictRef.current === key) return;
    focusedVerdictRef.current = key;
    verdictHeadingRef.current?.focus();
  }, [presentation, question?.questionInstanceId]);
  if (!reveal) {
    return <div data-role="phone-reveal-waiting" className={className}>{REVEAL_WAITING}</div>;
  }
  const result = attendee?.result && attendee.result.questionInstanceId === question?.questionInstanceId ? attendee.result : null;
  const awaitingResult = Boolean(attendee?.result && attendee.result.questionInstanceId !== question?.questionInstanceId)
    || Boolean(attendee?.vote?.questionInstanceId === question?.questionInstanceId && !result);
  const answer = describeAnswer(reveal, question);
  const teaching = revealTeaching(reveal, question);
  // Combined is solo only (VOF-W7): the verdict and the reason share one screen, so both sections show.
  const showsVerdict = presentation === 'result' || presentation === 'combined';
  const showsTakeaway = presentation === 'explanation' || presentation === 'combined';
  const compactOrderResult = compactViewport && showsVerdict && teaching.steps.length > 0;
  // Without reactions (solo play) the continuation page only exists to hold the explanation's sources.
  const hasReactions = Boolean(onReaction);
  // Solo keeps the authored source links alongside the takeaway, even on short phones.
  // Only hosted play needs a separate reactions/sources pane; its flow is unchanged.
  const compactContinuation = !solo && compactViewport && (showsTakeaway ? hasReactions || reveal.citations.length > 0 : hasReactions && teaching.steps.length > 0);
  const mainVisible = !compactContinuation || compactPage === 'main';
  const reactionsVisible = !compactContinuation || compactPage === 'reactions';
  const continuationLabel = showsTakeaway ? (hasReactions ? 'Sources and reactions' : 'Sources') : 'Reactions';
  const resultStepCount = Math.max(1, Math.ceil(teaching.steps.length / 2));
  const shownResultSteps = compactOrderResult ? teaching.steps.slice(orderResultPage * 2, (orderResultPage + 1) * 2) : teaching.steps;
  const showReactionContinuation = !compactOrderResult || orderResultPage === resultStepCount - 1;
  // Once revealed, an estimate's kicker drops "your", since the value under it is the answer, not the player's pick.
  const revealKicker = question?.kind === 'estimate' ? 'ESTIMATE' : kindEyebrow({ kind: question?.kind, statement: question?.statement, reply: question?.reply });
  // projectPublicQuestion (src/network/projection.ts) merges statement and scenario into one string,
  // joined by "\n\n", because PublicQuestion carries no separate scenario field over the wire. Split it
  // the same way PhoneVote.tsx's question screen does (review finding, 2026-09-28), so a which-patient
  // reveal renders the question and its scenario as two labeled elements, not one long run-on paragraph.
  const rawRevealStatement = question?.statement ?? '';
  const [revealStemText = '', ...revealScenarioParts] = rawRevealStatement.split('\n\n');
  const revealScenarioText = revealScenarioParts.join('\n\n').trim();
  const revealScenarioLabel = phoneScenarioLabel(asksForReply({ kind: question?.kind, statement: question?.statement, reply: question?.reply }), revealScenarioText);
  const outcomeCopy = awaitingResult ? REVEAL_PENDING : describeResult(result, question, { withPoints: false });
  // F-35: solo's merged verdict screen said "That's right" then repeated the exact same answer
  // word in "You said TRUE" right under it. On a binary hit, "That's right" is the headline and
  // the answer only needs to show once more, as a chip in the points row. A miss still needs the
  // said line, since it names what was actually picked, which the verdict pill does not. Scoped to
  // binary: every other kind's "said" text is already short (a letter or a range, not the option's
  // full words), and a lettered kind's answer.text is that full option sentence, which does not
  // fit a one-line chip.
  const soloRedundantSaid = solo && presentation === 'combined' && question?.kind === 'binary' && Boolean(result?.isCorrect);
  const hasRank = attendee !== null && attendee !== undefined && typeof attendee.rank === 'number' && attendee.rank > 0 && attendee.totalParticipants > 0;
  // Combined carries both the result and the explanation classes, so every rule already written for those two
  // screens (the scroll floor, the wide-screen two-column grid, the top-aligned solo result) still applies to
  // solo's one merged screen, with no separate stylesheet to keep in step with them.
  const screenClasses = presentation === 'combined' ? 'phone-result-screen phone-explanation-screen phone-combined-screen' : `phone-${presentation}-screen`;
  return <div data-role="phone-reveal" data-screen={presentation} data-compact-page={compactContinuation ? compactPage : 'combined'} data-outcome={result?.isCorrect ? 'right' : result ? 'missed' : awaitingResult ? 'pending' : 'none'} className={`phone-reveal-surface ${screenClasses} ${className}`} style={{ minHeight: 0, color: "var(--color-ink)", fontFamily: "var(--kit-font-sans)" }}>
    {/* F-07: one kicker row, not two stacked labels for the same screen. The question type and
        the phase now share one line, separated by a dot, with the phase word muted. */}
    {presentation === 'explanation' ? <div data-role="phone-explanation-header" className="phone-explanation-header">
      <p data-role="phone-question-kicker" className="phone-question-kicker">{revealKicker}<span aria-hidden="true" className="phone-explanation-kicker-sep"> · </span><span data-role="phone-vote-status" data-state="explanation" className="phone-vote-status">EXPLANATION</span></p>
    </div> : <div className="phone-vote-meta phone-reveal-meta">
      <p data-role="phone-question-kicker" className="phone-question-kicker">{revealKicker}</p>
      <span data-role="phone-vote-status" data-state="result" className="phone-vote-status">{VOTE_STATUS.revealed}</span>
    </div>}
    {!solo && mainVisible && hasRank && (
      <div data-role="phone-reveal-score-bar" className="phone-reveal-score-bar">
        <span>Score: {attendee.score} pts</span>
        <span>·</span>
        <span style={{ color: "var(--color-gold)" }}>Rank: #{attendee.rank} of {attendee.totalParticipants}</span>
      </div>
    )}
    {solo && (!compactViewport || ['binary', 'estimate'].includes(question?.kind ?? 'binary')) && mainVisible && showsVerdict && revealStemText ? (
      <div data-role="solo-reveal-question" className="solo-reveal-question">
        <p data-role="solo-reveal-stem" className="solo-reveal-stem"><EmphasizedText text={revealStemText} phrases={question?.emphasis} tone="heading" renderText={keepCompounds} /></p>
        {revealScenarioText ? (
          <p data-role="phone-question-scenario" className="solo-reveal-scenario" style={{ whiteSpace: 'pre-line' }}>
            <span data-role="phone-scenario-label" className="phone-scenario-label">{revealScenarioLabel}</span>
            {keepCompounds(revealScenarioText)}
          </p>
        ) : null}
      </div>
    ) : null}
    {mainVisible && showsVerdict ? <section data-role="outcome-banner" data-kind={answer.kind} data-tone={answer.tone} className="phone-verdict-card">
      {answer.eyebrow && <p className="phone-verdict-eyebrow">{answer.eyebrow}</p>}
      <div className="phone-verdict-answer" data-role="phone-verdict-pill" data-shape={answer.letter ? 'lettered' : 'pill'}>
        {answer.letter && <span className="phone-verdict-letter" aria-hidden="true">{answer.letter}</span>}
        <p ref={verdictHeadingRef} tabIndex={presentation === 'combined' ? -1 : undefined} aria-live={presentation === 'combined' ? 'polite' : undefined} role={presentation === 'combined' ? 'heading' : undefined} aria-level={presentation === 'combined' ? 2 : undefined} data-role="canonical-verdict" className="phone-canonical-verdict">{answer.letter ? <span className="sr-only">{answer.letter} · </span> : null}{teaching.steps.length ? 'Correct order' : answer.text}</p>
      </div>
      {answer.detail ? <p className="phone-verdict-detail" data-role="phone-verdict-detail">{answer.detail}</p> : null}
      {teaching.steps.length > 0 && <><ol data-role="correct-order" className="phone-reveal-order" start={compactOrderResult ? orderResultPage * 2 + 1 : undefined}>{shownResultSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>{compactOrderResult && resultStepCount > 1 && <div className="phone-order-page-nav">{orderResultPage > 0 && <button type="button" data-action="previous-correct-order-page" onClick={() => { cuePhoneChrome(); setOrderResultPage((page) => page - 1); }} className="phone-reveal-return" style={{ minHeight: "var(--kit-touch)", paddingInline: "var(--kit-space-12)", borderRadius: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", backgroundColor: 'transparent', color: "var(--color-ink)" }}>Previous steps</button>}{orderResultPage < resultStepCount - 1 ? <button type="button" data-action="next-correct-order-page" onClick={() => { cuePhoneChrome(); setOrderResultPage((page) => page + 1); }} className="phone-reveal-continue" style={{ minHeight: "var(--kit-touch)", paddingInline: "var(--kit-space-12)", borderRadius: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", backgroundColor: "var(--color-panel-navy)", color: "var(--color-ink)" }}>Next steps</button> : compactContinuation ? <button type="button" ref={openContinuationButtonRef} data-action="show-reveal-reactions" onClick={() => { cuePhoneChrome(); setCompactPage('reactions'); }} className="phone-reveal-continue" style={{ minHeight: "var(--kit-touch)", paddingInline: "var(--kit-space-12)", borderRadius: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", backgroundColor: "var(--color-panel-navy)", color: "var(--color-ink)" }}>{continuationLabel}</button> : null}</div>}</>}
      {(!compactOrderResult || orderResultPage === 0) && <>
        {result && !awaitingResult ? <p className="phone-reveal-outcome" data-role="phone-reveal-outcome" data-outcome={result.isCorrect ? 'right' : 'missed'}>{result.isCorrect ? REVEAL_RIGHT : REVEAL_MISSED}</p> : null}
        <p className="phone-reveal-said" data-role="phone-reveal-said" data-outcome={result?.isCorrect ? 'right' : result ? 'missed' : awaitingResult ? 'pending' : 'none'}>
          {soloRedundantSaid ? null : saidLine(outcomeCopy)}
          {result && (result.points > 0 || solo) ? (
            <>
              {/* Fresh-review finding: the verdict pill above already names the answer on a hit
                  (the big TRUE or FALSE badge), so this chip does not repeat it a third time.
                  It carries only the points, on every path, solo or not. */}
              <span className="solo-points" data-role="phone-reveal-points" data-sign={result.points > 0 ? 'plus' : result.points < 0 ? 'minus' : 'none'} aria-hidden="true">
                {result.points > 0 ? `+${result.points} pts` : result.points < 0 ? `−${Math.abs(result.points)} pts` : '0 pts'}
              </span>
              <span className="sr-only">
                {`, ${result.points < 0 ? 'minus ' : ''}${Math.abs(result.points)} points`}
              </span>
              {result.streakBonus !== undefined && result.streakBonus > 0 ? (
                <span className="phone-streak-bonus" data-role="streak-bonus-pill" aria-hidden="true">
                  +{result.streakBonus} Streak Bonus!
                </span>
              ) : null}
            </>
          ) : null}
        </p>
      </>}
    </section> : null}
    {/* Only the short-phone solo reveal needs a jump to the lesson below its scroll fold.
        On taller screens the takeaway is already in view, so avoid a redundant button.
        Keep the keyboard-operable route and ordered-answer pagination on short phones. */}
    {solo && soloJumpViewport && mainVisible && showsVerdict && showsTakeaway && (!compactOrderResult || orderResultPage === resultStepCount - 1) ? (
      <button
        type="button"
        data-action="jump-to-takeaway"
        className="phone-reveal-continue"
        onClick={() => {
          cuePhoneChrome();
          takeawayHeadingRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
          takeawayHeadingRef.current?.focus({ preventScroll: true });
        }}
        style={{ alignSelf: 'flex-start', width: 'auto', minHeight: 'var(--kit-touch)', padding: '0 var(--kit-space-12)', border: '1px solid var(--color-film-border)', borderRadius: 'var(--kit-space-8)', background: 'transparent', color: 'var(--color-gold)', font: '600 16px var(--kit-font-sans)', cursor: 'pointer' }}
      >
        Read takeaway <span aria-hidden="true">↓</span>
      </button>
    ) : null}
    {mainVisible && showsTakeaway ? <>
      <section data-role="takeaway-card" className="phone-takeaway-card">
        <div className="phone-takeaway-heading"><Lightbulb size={16} style={{ color: "var(--color-gold)" }} /><h2 ref={takeawayHeadingRef} tabIndex={-1}>Takeaway</h2></div>
        <p><EmphasizedText text={reveal.takeaway || teaching.explanation} phrases={reveal.takeaway ? reveal.takeawayEmphasis : reveal.explanationEmphasis} renderText={keepCompounds} /></p>
        {reveal.takeaway && teaching.explanation && teaching.explanation !== reveal.takeaway && <p style={{ color: "var(--color-ink-dim)" }}><EmphasizedText text={teaching.explanation} phrases={reveal.explanationEmphasis} renderText={keepCompounds} /></p>}
      </section>
      {!compactContinuation && reveal.citations.length > 0 && <section data-role="reveal-citations" >{reveal.citations.map((citation) => citation.url ? <a key={`${citation.label}:${citation.url}`} href={citation.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-gold)", minHeight: "var(--kit-touch)", display: 'inline-flex', alignItems: 'center' }}>{citation.label}</a> : <span key={citation.label} style={{ color: "var(--color-ink-dim)" }}>{citation.label}</span>)}</section>}
    </> : null}
    {compactContinuation && mainVisible && showReactionContinuation && !(compactOrderResult && resultStepCount > 1) && <button type="button" ref={openContinuationButtonRef} data-action="show-reveal-reactions" onClick={() => { cuePhoneChrome(); setCompactPage('reactions'); }} className="phone-reveal-continue" style={{ minHeight: "var(--kit-touch)", paddingInline: "var(--kit-space-12)", borderRadius: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", backgroundColor: "var(--color-panel-navy)", color: "var(--color-ink)" }}>{continuationLabel}</button>}
    <section data-role="phone-reveal-reactions-page" hidden={!reactionsVisible} className="phone-reveal-reactions-page">
      {compactContinuation && <><p ref={continuationHeadingRef} tabIndex={-1} role="heading" aria-level={2} className="phone-reveal-page-label">{continuationLabel}</p>{showsTakeaway && reveal.citations.length > 0 && <section data-role="reveal-citations" >{reveal.citations.map((citation) => citation.url ? <a key={`${citation.label}:${citation.url}`} href={citation.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-gold)", minHeight: "var(--kit-touch)", display: 'inline-flex', alignItems: 'center' }}>{citation.label}</a> : <span key={citation.label} style={{ color: "var(--color-ink-dim)" }}>{citation.label}</span>)}</section>}</>}
      {onReaction && <PhoneReactions key={question?.questionInstanceId ?? reveal.answerToken} questionInstanceId={question?.questionInstanceId} onReaction={onReaction} onSent={() => continuationBackButtonRef.current?.focus()} />}
      {compactContinuation && <button type="button" ref={continuationBackButtonRef} data-action="return-reveal-main" onClick={() => { cuePhoneChrome(); setCompactPage('main'); }} className="phone-reveal-return" style={{ minHeight: "var(--kit-touch)", paddingInline: "var(--kit-space-12)", borderRadius: "var(--kit-space-8)", border: "1px solid var(--color-hairline)", backgroundColor: 'transparent', color: "var(--color-ink)" }}>Back</button>}
    </section>
  </div>;
});

PhoneReveal.displayName = 'PhoneReveal';
export default PhoneReveal;
