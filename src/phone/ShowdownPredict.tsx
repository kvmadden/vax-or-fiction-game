import React, { useState } from 'react';
import { Trophy } from 'lucide-react';
import type { AttendeeState, PublicFinalist, PublicShowdown } from '../network/protocol';
import { readShowdownPick, writeShowdownPick } from './phone-memory';
import { triggerTactileFeedback } from './phone-vote-utils';
import { tapAnswer } from '../engine/audio-cues';

/**
 * The room phone's final round. Everyone predicts on the answer-slab rule, and a finalist's own slab carries a YOU
 * tag, so a finalist can back themselves. A finalist is this phone's player at rank 1 or 2 whose name matches exactly
 * one finalist. Tickets carry no device link (VOF-12), so a shared name tags no one. The prediction counts on the wire
 * are never shown (VOF-21).
 */

export interface ShowdownPredictProps {
  showdown: PublicShowdown;
  attendee: AttendeeState | null;
  onPredict: (ticket: string) => void;
}

const PICK_ACK = 'Your pick is in. You can change it until the duel starts.';

/** The finalist this phone's player is, or null. */
function ownFinalist(showdown: PublicShowdown, attendee: AttendeeState | null): PublicFinalist | null {
  if (!attendee || attendee.rank === null || attendee.rank > 2) return null;
  const named = showdown.finalists.filter((finalist) => finalist.name === attendee.nickname);
  return named.length === 1 ? named[0]! : null;
}

export const ShowdownPredict: React.FC<ShowdownPredictProps> = ({ showdown, attendee, onPredict }) => {
  const [pickedFor, setPickedFor] = useState(showdown.id);
  const [picked, setPicked] = useState<string | null>(() => readShowdownPick(showdown.id));
  if (pickedFor !== showdown.id) {
    setPickedFor(showdown.id);
    setPicked(readShowdownPick(showdown.id));
  }
  const me = ownFinalist(showdown, attendee);
  const stage = showdown.stage;
  const winner = showdown.finalists.find((finalist) => finalist.ticket === showdown.winner) ?? null;
  const resultLine = showdown.winner ? `Winner: ${winner?.name ?? showdown.winner}` : 'The final round ended in a tie.';
  // Every big number carries its unit. At lineup it is the game score. After lineup it is the final round's own
  // count, which the big screen labels DUEL PTS, so a 1 never reads as first place.
  const tallyUnit = stage === 'lineup' ? 'Points' : 'Duel points';

  const pick = (ticket: string) => {
    if (stage !== 'lineup') return;
    triggerTactileFeedback();
    tapAnswer();
    writeShowdownPick(showdown.id, ticket);
    setPicked(ticket);
    onPredict(ticket);
  };
  const headline = stage === 'duel' ? 'The final round is underway' : stage === 'result' ? 'The final result is in' : 'Who should win the final round?';
  const status = stage === 'result' ? resultLine : stage === 'lineup' ? (picked ? PICK_ACK : 'Make your call') : null;
  return (
    <section data-role="phone-showdown" data-stage={stage} className="duel-pick">
      <div className="phone-vote-meta">
        <p className="phone-question-kicker">Final round</p>
      </div>
      <h2 className="duel-pick__headline">{headline}</h2>
      <div className="duel-pick__dock">
        {showdown.finalists.length === 0 ? <p className="answer-dock__status">Waiting for the finalists.</p> : status ? <p className="answer-dock__status" data-role={picked && stage === 'lineup' ? 'phone-showdown-pick-ack' : undefined} aria-live="polite">{status}</p> : null}
        <div className="duel-pick__slabs">
          {showdown.finalists.map((finalist, index) => {
            const chosen = picked === finalist.ticket;
            const mine = me?.ticket === finalist.ticket;
            const won = stage === 'result' && showdown.winner === finalist.ticket;
            return (
              <button
                key={finalist.ticket}
                type="button"
                className="answer-slab duel-pick__slab"
                data-finalist={finalist.ticket}
                data-selected={picked ? (chosen ? 'true' : 'false') : undefined}
                data-winner={won ? 'true' : undefined}
                aria-pressed={picked ? chosen : undefined}
                disabled={stage !== 'lineup'}
                onClick={() => pick(finalist.ticket)}
              >
                <span className="duel-pick__pick">{chosen ? 'Your pick' : null}</span>
                <span className="duel-pick__body">
                  {stage === 'lineup' ? <span className="duel-pick__rank" aria-hidden="true">{index + 1}</span> : null}
                  <span className="duel-pick__who">
                    <span className="duel-pick__name">{finalist.name}</span>
                    {mine ? <>{' '}<span className="you-chip">You</span></> : null}
                  </span>
                  {' '}
                  <span className="duel-pick__score">
                    <span className="duel-tally__unit">{tallyUnit}</span>{' '}
                    <span className="duel-pick__num">
                      {won ? <Trophy size={32} aria-hidden="true" /> : null}
                      {stage === 'lineup' ? finalist.score : finalist.duelPoints}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

