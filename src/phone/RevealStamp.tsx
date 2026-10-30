import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AttendeeState, PublicQuestion, PublicReveal } from '../network/protocol';
import { kindEyebrow } from '../engine/kinds';
import { STAMP_WORDS, useLook } from '../looks/look';
import { describeAnswer, describeResult } from './reveal-copy';
import { formatChoice } from './choice-label';
import { VOTE_STATUS } from './vote-status';
import { EmphasizedText } from '../components/EmphasizedText';
import { keepCompounds } from './keep-compounds';
import { REVEAL_MISSED, REVEAL_PENDING, REVEAL_RIGHT } from './phone-live-copy';
import { PhoneReactions } from './PhoneReveal';
import { triggerTactileFeedback } from './phone-vote-utils';

/**
 * The room phone's reveal, result presentation: the claim fills the screen and the verdict lands on it as a rubber
 * stamp. A lettered kind stamps the right reply itself, under a quiet recap of the question. Then what it means for
 * you, your standing in place of the score pill, and a labeled reactions dock. It never pages at short heights: the
 * recap and the reactions label hide instead. Order reveals keep PhoneReveal, which pages them.
 */

export interface RevealStampProps {
  reveal: PublicReveal;
  question: PublicQuestion | null | undefined;
  attendee: AttendeeState | null;
  onReaction?: (reaction: string) => void;
}

type Tone = 'vax' | 'fiction' | 'gold';

const toneOf = (tone: string): Tone => (tone === 'vax' || tone === 'fiction' ? tone : 'gold');

export const RevealStamp: React.FC<RevealStampProps> = ({ reveal, question, attendee, onReaction }) => {
  const result = attendee?.result && attendee.result.questionInstanceId === question?.questionInstanceId ? attendee.result : null;
  const awaitingResult = Boolean(attendee?.result && attendee.result.questionInstanceId !== question?.questionInstanceId)
    || Boolean(attendee?.vote?.questionInstanceId === question?.questionInstanceId && !result);
  const answer = describeAnswer(reveal, question);
  const tone = toneOf(answer.tone);
  const kind = question?.kind ?? 'binary';
  const lettered = Boolean(answer.letter);
  const revealKicker = kind === 'estimate' ? 'ESTIMATE' : kindEyebrow({ kind: question?.kind, statement: question?.statement, reply: question?.reply });
  const [stem = ''] = (question?.statement ?? '').split('\n\n');
  const hasRank = Boolean(attendee && typeof attendee.rank === 'number' && attendee.rank > 0 && attendee.totalParticipants > 0);
  const rank = hasRank ? attendee!.rank as number : null;
  const outcome = result && !awaitingResult ? (result.isCorrect ? 'right' : 'missed') : awaitingResult ? 'pending' : 'none';
  const said = awaitingResult ? REVEAL_PENDING : describeResult(result, question, { withPoints: false });
  // The stamp lands with a haptic tick once its 240ms entrance ends. With reduced motion it is already down.
  const [landed, setLanded] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    if (landed) return undefined;
    const timer = setTimeout(() => { setLanded(true); triggerTactileFeedback(); }, 240);
    return () => clearTimeout(timer);
  }, [landed]);

  // The answer word or letter as the stamp shows it.
  const verdictWord = kind === 'binary' ? answer.text : answer.letter ?? answer.text;
  // Case file stamps a true or false claim with the show's own pair, as its big screen does: a false claim is FICTION and a true
  // one is FACT. The answer itself stays TRUE or FALSE for a screen reader, and every other kind and look is stamped as before.
  const { look } = useLook();
  const casefilePair = look === 'casefile' && kind === 'binary';
  const stampWord = casefilePair ? (tone === 'fiction' ? STAMP_WORDS.fiction : STAMP_WORDS.fact) : verdictWord;
  // The stamp's length rides on it in every look, so a look can size and tilt a long word, such as "40.4 percent", to the claim.
  const stampLength = { ['--look-stamp-len' as string]: Math.max(1, stampWord.length) };
  const outcomeLine = outcome === 'right' ? REVEAL_RIGHT : outcome === 'missed' ? REVEAL_MISSED : said;
  const chosen = result ? question?.options.find((o) => o.token === result.choice) : undefined;
  const chosenTone: Tone = result?.choice === 'true' ? 'vax' : result?.choice === 'false' ? 'fiction' : 'gold';

  const pointsRow = result && result.isCorrect && result.points > 0 ? (
    <div className="stamp-points-row">
      <span className="stamp-points" data-role="phone-reveal-points" aria-hidden="true"><span className="stamp-points__sign">+</span>{result.points}</span>
      <span className="sr-only">{`${result.points} points`}</span>
      {result.streakBonus !== undefined && result.streakBonus > 0 ? <span className="phone-streak-bonus stamp-streak" data-role="streak-bonus-pill">+{result.streakBonus} Streak Bonus!</span> : null}
    </div>
  ) : null;

  const missPill = result && !result.isCorrect ? (
    <div className="stamp-miss">
      <span className="stamp-miss__label">Your answer</span>
      <span className="stamp-miss__pill" data-tone={chosenTone} data-shape={chosen?.text && kind !== 'estimate' && kind !== 'binary' ? 'lettered' : 'word'}>
        <X size={20} strokeWidth={3} aria-hidden="true" />
        {kind === 'binary' || !chosen
          ? <span>{formatChoice(result.choice)}</span>
          : kind === 'estimate'
            ? <span className="stamp-miss__value">{chosen.label || chosen.text}</span>
            : <span className="stamp-miss__text"><strong>{chosen.label}</strong> {keepCompounds(chosen.text)}</span>}
      </span>
    </div>
  ) : null;

  const standing = hasRank ? (
    <div className="stamp-standing" data-role="phone-reveal-score-bar">
      <div className="stamp-standing__cell">
        <span className="stamp-standing__label">Score</span>{' '}
        <span className="stamp-standing__value">{attendee!.score}</span>
      </div>
      <div className="stamp-standing__cell">
        <span className="stamp-standing__label">Rank</span>{' '}
        <span className="stamp-standing__value stamp-standing__value--rank"><span>{`#${rank}`}</span><span className="stamp-standing__rank-of">{` of ${attendee!.totalParticipants}`}</span></span>
      </div>
    </div>
  ) : null;

  const reactions = onReaction ? (
    <section className="stamp-reactions" data-role="phone-reveal-reactions-page">
      <p className="stamp-reactions__label">React to the room</p>
      <PhoneReactions key={question?.questionInstanceId ?? reveal.answerToken} questionInstanceId={question?.questionInstanceId} onReaction={onReaction} />
    </section>
  ) : null;

  return (
    <div
      data-role="phone-reveal"
      data-screen="result"
      data-outcome={outcome}
      data-kind={kind}
      className={`stamp-reveal${lettered ? ' stamp-reveal--lettered' : ''}`}
    >
      <div className="phone-vote-meta phone-reveal-meta">
        <p data-role="phone-question-kicker" className="phone-question-kicker">{revealKicker}</p>
        <span data-role="phone-vote-status" data-state="result" className="phone-vote-status">{VOTE_STATUS.revealed}</span>
      </div>
      {lettered ? <p className="stamp-reveal__recap stamp-claim__recap"><EmphasizedText text={stem} phrases={question?.emphasis} renderText={keepCompounds} /></p> : null}
      <section data-role="outcome-banner" className="stamp-claim" data-tone={tone} data-shape={lettered ? 'reply' : 'claim'}>
        <p className="stamp-claim__text" data-role={lettered ? 'canonical-verdict' : undefined} data-length={lettered ? undefined : stem.length > 110 ? 'long' : stem.length > 60 ? 'medium' : 'short'}>
          {lettered ? <><span className="sr-only">{`${answer.letter} · `}</span>{keepCompounds(answer.text)}</> : <EmphasizedText text={stem} phrases={question?.emphasis} tone="heading" renderText={keepCompounds} />}
        </p>
        {/* A lettered kind's reply is the verdict, in words, and its stamped letter repeats what the reply already says,
            so screen readers skip the letter. */}
        <span className="stamp-mark" data-role={lettered ? undefined : 'canonical-verdict'} aria-hidden={lettered ? 'true' : undefined} data-landed={landed ? 'true' : 'false'} data-shape={kind === 'binary' ? 'word' : 'mono'} style={stampLength}>{casefilePair ? <><span aria-hidden="true">{stampWord}</span><span className="sr-only">{verdictWord}</span></> : verdictWord}</span>
      </section>
      {/* An estimate stamps the exact number, so the range it falls in follows, the way PhoneReveal says it. */}
      {answer.detail ? <p className="stamp-reveal__detail" data-role="phone-verdict-detail">{keepCompounds(answer.detail)}</p> : null}
      <p className="stamp-reveal__outcome" data-role="phone-reveal-outcome" data-outcome={outcome}>{outcomeLine}</p>
      {pointsRow ?? missPill}
      {outcome === 'right' || outcome === 'missed' ? <p className="sr-only" data-role="phone-reveal-said">{said}</p> : null}
      <div className="stamp-reveal__absorb" aria-hidden="true" />
      {standing}
      {reactions}
    </div>
  );
};
