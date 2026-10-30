import React, { useEffect, useId, useRef, useState } from 'react';
import { KIND_POINTS, STREAK_BONUS_ROWS } from '../engine/points-table';

/**
 * The room phone while it waits: who you are, that the room is filling, then how points work, the one thing a player
 * can use before question 1. Every audience wait uses it, from the lobby to "Waiting for the next question", with the
 * wait's own kicker and line. It keeps data-role="phone-waiting", so every reader of the waiting screen still finds it.
 */

export interface LobbySeatProps {
  /** The wait's kicker ("You're in"). */
  kicker: string;
  /** The wait's line, from phone-wait.ts. */
  line: string;
  name?: string;
  participants: number;
  team?: string | null;
}

const playersLine = (count: number) => `${count === 1 ? 'player' : 'players'} in the room`;

/** The live count, with a small pulse when it changes. */
const RoomCount: React.FC<{ count: number }> = ({ count }) => {
  const [pulse, setPulse] = useState(0);
  const last = useRef(count);
  useEffect(() => {
    if (last.current === count) return;
    last.current = count;
    setPulse((n) => n + 1);
  }, [count]);
  return <span key={pulse} className="seat-room__count" data-pulse={pulse > 0 ? 'true' : undefined}>{count}</span>;
};

export const LobbySeat: React.FC<LobbySeatProps> = ({ kicker, line, name, participants, team }) => {
  const scoringTitle = useId();
  return (
    <section data-role="phone-waiting" className="lobby-seat">
      <div className="lobby-seat__absorb" aria-hidden="true" />
      <div className="seat-who">
        <p className="phone-state-kicker lobby-seat__kicker">{kicker}</p>
        {name ? <h2 className="seat-who__name">{name}</h2> : null}
        <p className="lobby-seat__line">{line}</p>
      </div>
      <div className="seat-room">
        <RoomCount count={participants} />{' '}
        <span className="seat-room__label">{playersLine(participants)}</span>
        {team ? <>{' '}<span className="seat-room__team">{team}</span></> : null}
      </div>
      <section className="seat-scoring" aria-labelledby={scoringTitle}>
        <p id={scoringTitle} className="phone-state-kicker lobby-seat__kicker">How points work</p>
        <ul className="glass-group seat-scoring__list">
          {[...KIND_POINTS, ...STREAK_BONUS_ROWS.map((row) => ({ ...row, bonus: true }))].map((row) => (
            <li key={row.label} className={`seat-scoring__row${'bonus' in row ? ' seat-scoring__row--bonus' : ''}`}>
              <span>{row.label}</span>
              <strong>{'bonus' in row ? `+${row.points}` : row.points}</strong>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
