import React, { useId } from 'react';
import { Lightbulb, Medal, Trophy } from 'lucide-react';
import type { AttendeeState, PublicRoomState } from '../network/protocol';
import { EmphasizedText } from '../components/EmphasizedText';
import { closingTakeawayLines } from './closing-takeaways';
import { keepCompounds } from './keep-compounds';

/**
 * The room phone's close: the room line, a real podium, your one sentence, the takeaways, then "Play on your own",
 * the one next step the product already has. It keeps the guarded closing copy (the room line, "You won 1st Place!"
 * or the personal sentence, exactly the takeaways), shows scores as numbers only, and drops the champion banner
 * because the podium carries it.
 */

export interface ClosingPodiumProps {
  attendee: AttendeeState;
  room: PublicRoomState | null;
}

interface Place { name: string; score: number; rank: number; you: boolean }

/** 2nd, 1st, 3rd, as a podium stands. Only the places the board has. */
function podiumOrder(places: Place[]): Place[] {
  const [first, second, third] = places;
  return [second, first, third].filter((place): place is Place => Boolean(place));
}

export const ClosingPodium: React.FC<ClosingPodiumProps> = ({ attendee, room }) => {
  const headingId = useId();
  const recap = room?.phase === 'closing' ? room.reveal : null;
  const roomLine = recap?.answerLabel?.trim() || 'Thanks for playing.';
  const takeaways = closingTakeawayLines(recap);
  const takeawayHeading = recap?.explanation?.trim() || 'To take back to the counter';
  const answered = attendee.answered;
  const hasRank = attendee.rank !== null && attendee.totalParticipants > 0;
  const won = hasRank && attendee.rank === 1;
  // The guarded personal sentence, with its parenthetical kept whole so it never breaks inside "Best streak 3".
  const personal: React.ReactNode = hasRank
    ? <>{`You placed #${attendee.rank} of ${attendee.totalParticipants} `}<span className="keep-compound">{`(${attendee.correct} of ${answered} right · Best streak ${attendee.bestStreak})`}</span></>
    : answered > 0
      ? `${attendee.correct} of ${answered} right · Best streak ${attendee.bestStreak}`
      : 'You did not answer this time.';
  const leaderboard = room?.leaderboard ?? [];
  const board = leaderboard.slice(0, 3);
  // Ties are counted across the whole board, so a tie that crosses the podium cut never tags the wrong player.
  const sameRank = (rank: number) => leaderboard.filter((entry) => entry.rank === rank).length;
  const places: Place[] = board.map((entry) => ({
    name: entry.name,
    score: entry.score,
    rank: entry.rank,
    you: hasRank && entry.rank === attendee.rank && (entry.name === attendee.nickname || sameRank(entry.rank) === 1),
  }));

  const title = <header className="podium-close__title">
    <p className="podium-close__kicker">That’s the game</p>
    <h1 className="podium-close__room" data-role="phone-closing-room-line">{roomLine}</h1>
  </header>;

  const yourLine = <p className="podium-close__you" data-role="phone-closing-personal">
    {won ? <Trophy size={20} aria-hidden="true" /> : hasRank && (attendee.rank ?? 0) <= 3 ? <Medal size={20} aria-hidden="true" /> : null}
    <span>{won ? 'You won 1st Place!' : personal}</span>
  </p>;

  const podium = places.length ? <div className="podium-stand" data-count={places.length} role="list" aria-label="Top three">
    {podiumOrder(places).map((place) => (
      <div key={`${place.rank}:${place.name}`} className="podium-stand__col" data-place={place.rank} data-you={place.you ? 'true' : undefined} role="listitem">
        <span className="podium-stand__you">{place.you ? <span className="you-chip">You</span> : null}</span>
        <span className="podium-stand__name">{place.name}</span>
        <span className="podium-stand__score">{place.score}</span>
        <span className="podium-stand__plinth"><span aria-hidden="true">{place.rank}</span><span className="sr-only">{`Place ${place.rank}`}</span></span>
      </div>
    ))}
  </div> : null;

  const takeawayGroup = takeaways.length > 0 ? <section data-role="phone-closing-takeaways" className="podium-close__takeaways" aria-labelledby={headingId}>
    <h2 id={headingId} className="podium-close__takeaways-head"><Lightbulb size={18} aria-hidden="true" />{takeawayHeading}</h2>
    <ol className="podium-close__list">
      {takeaways.map((line, index) => <li key={`${index}:${line.text}`} data-role="phone-closing-takeaway"><span aria-hidden="true">{index + 1}</span><span><EmphasizedText text={line.text} phrases={line.phrases} renderText={keepCompounds} /></span></li>)}
    </ol>
  </section> : null;

  const commitments = attendee.commitments.length > 0
    ? <section data-role="phone-closing-commitments" className="phone-closing-commitments"><p>Your saved commitments</p><ul>{attendee.commitments.map((commitment) => <li key={commitment}>{commitment}</li>)}</ul></section>
    : null;

  return (
    <div data-role="phone-closing" className="podium-close">
      <div className="podium-close__absorb" aria-hidden="true" />
      {title}
      {podium}
      {yourLine}
      {takeawayGroup}
      {commitments}
      <div className="podium-close__next"><a className="podium-close__play" href="/play" data-action="closing-play-solo">Play on your own</a></div>
    </div>
  );
};

