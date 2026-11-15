import React, { useId } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import type { SoloTopic } from '../../data/decks/topics';
import type { SoloPaceMode } from './soloPace';
import type { PaceRoundRecap } from './pace-recap';
import type { BestComparison } from './personal-best';
import { keepCompounds } from '../../phone/keep-compounds';
import { EmphasizedText } from '../../components/EmphasizedText';
import { isStripCompact, stripColumns } from '../../phone/closing-strip';

const outcomeKey = (outcome: boolean | null) => (outcome === null ? 'none' : outcome ? 'right' : 'missed');
const OUTCOME_WORDS = { right: 'right', missed: 'missed', none: 'not answered' } as const;

/**
 * `cleanSweep` (9.3, VOF-W7 review) names a perfect round in words, ahead of the milestone tiers -- 12 is now a
 * real milestone (`RUN_MILESTONES`, soloPace.ts), so it gets its own line rather than folding into "Unstoppable
 * run." at 8. This is Run's own prose headline, not a visual badge: the eggs branch (fix/vof-w9-eggs) owns the
 * closing's Perfect round sticker and its "N FOR N" line, which render elsewhere on the same screen, and this
 * headline deliberately says "Clean sweep" rather than "Perfect" or "N for N" so the two never repeat each other.
 */
function runHeadline(bestStreak: number, cleanSweep: boolean): string {
  if (cleanSweep) return 'Clean sweep. Every question landed.';
  if (bestStreak >= 12) return 'Streak for the ages.';
  if (bestStreak >= 8) return 'Unstoppable run.';
  if (bestStreak >= 5) return 'Big run.';
  if (bestStreak >= 3) return 'Real momentum.';
  return 'Every round builds a streak.';
}

function climbHeadline(climaxHit: boolean | null): string {
  if (climaxHit === true) return 'Summit reached. The climax paid double.';
  if (climaxHit === false) return 'So close. The climax slipped away.';
  return 'The climb is over.';
}

const BEST_HEADLINE: Record<BestComparison['outcome'], string> = {
  'new-best': 'New personal best!',
  close: 'So close to your best.',
  'keep-going': 'Your best is still ahead.',
  'first-run': 'First run on this topic.',
};

export interface SoloPaceRecapProps {
  pace: Exclude<SoloPaceMode, 'today'>;
  outcomes: readonly (boolean | null)[];
  recap: PaceRoundRecap;
  best?: BestComparison;
  nextTopic: SoloTopic | null;
  onPlayNext: (topic: SoloTopic) => void;
  /** The perfect-round reward, shown with the stat tiles when the round earned it. */
  reward?: React.ReactNode;
}

/**
 * The round-end payoff for Run, Climb and Best (2026-09-27): the result scaled to how it went, the best streak, the
 * missed cards' own takeaway lines (unchanged clinical text), and a line naming the next topic. Same bones as the
 * default SoloClosing (src/phone/PhoneClosing.tsx) -- score headline, right/wrong strip, stat tiles, takeaways -- so
 * the game still looks like itself, with each pace's own headline and one extra payoff line on top.
 */
export const SoloPaceRecap: React.FC<SoloPaceRecapProps> = ({ pace, outcomes, recap, best, nextTopic, onPlayNext, reward }) => {
  const headingId = useId();
  const cleanSweep = recap.answered > 0 && recap.answered === outcomes.length && recap.correct === recap.answered;
  const headline = pace === 'run' ? runHeadline(recap.bestStreak, cleanSweep) : pace === 'climb' ? climbHeadline(recap.climaxHit) : BEST_HEADLINE[best?.outcome ?? 'first-run'];
  return <div data-role="phone-closing" data-variant="solo" data-pace={pace} className="phone-closing-surface solo-closing solo-pace-recap">
    <header className="solo-closing__header">
      <p className="solo-closing__kicker">That’s the game</p>
      <h1 className="solo-closing__score" data-role="phone-closing-room-line">{recap.answered > 0 ? `${recap.correct} of ${recap.answered} right` : 'Thanks for playing.'}</h1>
      <p className="solo-pace-recap__headline" data-role="solo-pace-recap-headline">{headline}</p>
      {outcomes.length > 0 && <div className="solo-closing__strip" data-role="solo-closing-strip" data-size={isStripCompact(outcomes.length) ? 'compact' : 'roomy'} style={{ '--solo-strip-columns': stripColumns(outcomes.length) } as React.CSSProperties} role="img" aria-label={`Question by question: ${outcomes.map((outcome) => OUTCOME_WORDS[outcomeKey(outcome)]).join(', ')}`}>
        {outcomes.map((outcome, index) => <span key={index} className="solo-closing__mark" data-outcome={outcomeKey(outcome)}>{outcome === null ? '·' : outcome ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <X size={16} strokeWidth={3} aria-hidden="true" />}</span>)}
      </div>}
    </header>
    <ul className="solo-closing__stats" data-role="phone-closing-personal" aria-label="Your round">
      {reward ? <li data-stat="reward">{reward}</li> : null}
      <li data-stat="points"><strong>{recap.points}</strong><span>{Math.abs(recap.points) === 1 ? 'point' : 'points'}</span></li>
      <li data-stat="streak"><strong>{recap.bestStreak}</strong><span>longest streak</span></li>
    </ul>
    {pace === 'best' && best && <p className="solo-pace-recap__best" data-role="solo-pace-recap-best" data-outcome={best.outcome} data-saved={best.saved ? 'true' : 'false'}>
      {(best.outcome === 'new-best' || best.outcome === 'first-run') && !best.saved
        ? `${best.best.score} points, but this device can't save a best to beat next time.`
        : best.outcome === 'first-run'
          ? `${best.best.score} points is the target now. Beat it next round.`
          : best.outcome === 'new-best'
            ? `Your best on this topic, set just now: ${best.best.score} points.`
            : `Your best on this topic: ${best.best.score} points.`}
    </p>}
    {recap.missedTakeaways.length > 0 && <section data-role="phone-closing-takeaways" className="solo-closing__takeaways" aria-labelledby={headingId}>
      <h2 id={headingId}><Lightbulb size={18} aria-hidden="true" />What to take back to the counter</h2>
      <ol>{recap.missedTakeaways.map((entry) => <li key={entry.id} data-role="phone-closing-takeaway"><span className="solo-closing__takeaway-copy"><EmphasizedText text={entry.takeaway} phrases={entry.takeawayEmphasis} renderText={keepCompounds} /></span></li>)}</ol>
    </section>}
    {nextTopic && <button type="button" className="solo-controls__primary solo-pace-recap__next" data-action="solo-play-next-topic" data-role="solo-pace-recap-next" onClick={() => onPlayNext(nextTopic)}>Play {nextTopic.label}</button>}
  </div>;
};

export default SoloPaceRecap;
