import React, { useId } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import type { AttendeeState, PublicRoomState } from '../network/protocol';
import { EmphasizedText } from '../components/EmphasizedText';
import { closingTakeawayLines, type ClosingTakeawayLine } from './closing-takeaways';
import { keepCompounds } from './keep-compounds';
import { isStripCompact, stripColumns } from './closing-strip';
import { ClosingPodium } from './ClosingPodium';

export interface PhoneClosingProps {
  attendee: AttendeeState | null;
  room: PublicRoomState | null;
  /** Solo play (VOF-44): one person's own round, so the score leads, in points too, with no room line and no place. */
  solo?: boolean;
  /** Solo only: right or wrong for each question of the round, in order. */
  outcomes?: readonly (boolean | null)[];
  /** Solo only: the perfect-round reward, shown with the stat tiles when the round earned it. */
  reward?: React.ReactNode;
  className?: string;
}

const outcomeKey = (outcome: boolean | null) => (outcome === null ? 'none' : outcome ? 'right' : 'missed');
const OUTCOME_WORDS = { right: 'right', missed: 'missed', none: 'not answered' } as const;

/**
 * Solo's close (VOF-44): the score as the headline with the round question by question under it, points and the
 * longest streak as two tiles, then the takeaways. A screen reader hears the strip as one image, named in play order.
 */
const SoloClosing: React.FC<{ attendee: AttendeeState; outcomes: readonly (boolean | null)[]; takeaways: ClosingTakeawayLine[]; heading: string; className: string; reward?: React.ReactNode }> = ({ attendee, outcomes, takeaways, heading, className, reward }) => {
  const headingId = useId();
  return <div data-role="phone-closing" data-variant="solo" className={`phone-closing-surface solo-closing ${className}`}>
    <header className="solo-closing__header">
      <p className="solo-closing__kicker">That’s the game</p>
      <h1 className="solo-closing__score" data-role="phone-closing-room-line">
        {attendee.answered > 0 ? `${attendee.correct} of ${attendee.answered} right` : 'Thanks for playing.'}
      </h1>
      {outcomes.length > 0 && <div className="solo-closing__strip" data-role="solo-closing-strip" data-size={isStripCompact(outcomes.length) ? 'compact' : 'roomy'} style={{ '--solo-strip-columns': stripColumns(outcomes.length) } as React.CSSProperties} role="img" aria-label={`Question by question: ${outcomes.map((outcome) => OUTCOME_WORDS[outcomeKey(outcome)]).join(', ')}`}>
        {outcomes.map((outcome, index) => <span key={index} className="solo-closing__mark" data-outcome={outcomeKey(outcome)}>{outcome === null ? '·' : outcome ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <X size={16} strokeWidth={3} aria-hidden="true" />}</span>)}
      </div>}
    </header>
    <ul className="solo-closing__stats" data-role="phone-closing-personal" aria-label="Your round">
      {reward ? <li data-stat="reward">{reward}</li> : null}
      <li data-stat="points"><strong>{attendee.score}</strong><span>{Math.abs(attendee.score) === 1 ? 'point' : 'points'}</span></li>
      <li data-stat="streak"><strong>{attendee.bestStreak}</strong><span>longest streak</span></li>
    </ul>
    {takeaways.length > 0 && <section data-role="phone-closing-takeaways" className="solo-closing__takeaways" aria-labelledby={headingId}>
      <h2 id={headingId}><Lightbulb size={18} aria-hidden="true" />{heading}</h2>
      <ol>{takeaways.map((line) => <li key={line.text} data-role="phone-closing-takeaway"><span><EmphasizedText text={line.text} phrases={line.phrases} renderText={keepCompounds} /></span></li>)}</ol>
    </section>}
  </div>;
};

/**
 * The phone ends where the stage ends (2026-09-14 design critique, item 9): the room line first, one personal
 * sentence, then the same takeaways. No points, no private dashboard tiles (VOF-12, VOF-22). The room line and
 * the takeaways arrive in the public closing reveal; the personal sentence comes from the attendee's own state.
 */
export const PhoneClosing: React.FC<PhoneClosingProps> = React.memo(({ attendee, room, solo = false, outcomes, reward, className = '' }) => {
  if (!attendee) {
    return <div data-role="phone-closing-empty" className={`phone-closing-empty phone-viewport-container ${className}`}>Your room has closed. Results are not available for this device.</div>;
  }
  // A room phone closes on the podium, with the room line, your sentence and the takeaways.
  if (!solo) return <ClosingPodium attendee={attendee} room={room} />;
  const recap = room?.phase === 'closing' ? room.reveal : null;
  const takeaways = closingTakeawayLines(recap);
  const takeawayHeading = recap?.explanation?.trim() || 'To take back to the counter';
  return <SoloClosing attendee={attendee} outcomes={outcomes ?? []} takeaways={takeaways} heading={takeawayHeading} className={className} reward={reward} />;
});

PhoneClosing.displayName = 'PhoneClosing';
export default PhoneClosing;
