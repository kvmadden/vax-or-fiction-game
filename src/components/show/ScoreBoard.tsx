import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { StageLeaderboardLane } from '../../engine/leaderboard';
import { SCREEN_FADE_EASE } from '../../ui/screen-fade';

/** MOT-VQA-09: how long a lane takes to glide to its new rank. Framer's `layout` prop needs its
 * own duration, distinct from SCREEN_FADE_S (a screen-level opacity dissolve, not a position move). */
const LANE_REORDER_S = 0.4;

export type ScoreBoardTone = 'stage' | 'closing' | 'phone';

export interface ScoreBoardProps {
  entries: StageLeaderboardLane[];
  /** Question number this board is through, or null on the closing board. */
  through?: number | null;
  tone?: ScoreBoardTone;
  className?: string;
}

function kickerFor(through: number | null | undefined, tone: ScoreBoardTone, count: number): string {
  // N7: this used to say "The final five" even when the closing Top 3 (or any count other than
  // 5) rendered, a label that did not match what was on screen.
  if (tone === 'closing' || through == null) return `The top ${count}`;
  return `Through ${through}`;
}

function scoreUnit(score: number): string {
  return Math.abs(score) === 1 ? 'pt' : 'pts';
}

/**
 * The Top 5 board: five named lanes, gold on first, no table chrome.
 * Stage, closing, and phone share the lanes so the room and the hand match.
 */
export const ScoreBoard: React.FC<ScoreBoardProps> = React.memo(({
  entries,
  through = null,
  tone = 'stage',
  className = '',
}) => {
  const count = entries.length;
  const empty = count === 0;
  const kicker = kickerFor(through, tone, count);
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      className={`score-board score-board--${tone} ${className}`.trim()}
      data-role="score-board"
      data-tone={tone}
      data-count={count}
      data-through={through ?? 'final'}
      aria-label={empty ? 'Top 5. The board is waiting.' : `Top ${count}. ${kicker}.`}
    >
      <header className="score-board__header">
        {/* N7 follow-up: kickerFor counts entries, so an empty board used to show "The top 0"
            above "The board is waiting." The h1 and the empty copy below it already say
            everything an empty board needs to say. */}
        {!empty && <p className="score-board__kicker">{kicker}</p>}
        {empty || tone === 'phone' ? (
          <h1 className="score-board__title">{empty ? 'The board is waiting.' : `Top ${count}`}</h1>
        ) : null}
        {empty ? (
          <p className="score-board__empty" data-role="score-board-empty">
            Locked-in guesses land here.
          </p>
        ) : null}
      </header>
      {!empty ? (
        <ol className="score-board__lanes" data-role="score-board-lanes">
          {entries.map((entry, index) => {
            const unit = scoreUnit(entry.score);
            return (
              <motion.li
                key={entry.laneKey}
                layout={!shouldReduceMotion}
                transition={{ duration: shouldReduceMotion ? 0 : LANE_REORDER_S, ease: SCREEN_FADE_EASE }}
                className="score-board__lane"
                data-role="score-board-lane"
                data-rank={entry.rank}
                data-place={index + 1}
                aria-label={`${entry.rank}. ${entry.nickname}, ${entry.score} ${unit}`}
              >
                <span className="score-board__place" aria-hidden="true">{entry.rank}</span>
                <span className="score-board__name">{entry.nickname}</span>
                <span className="score-board__score">
                  <strong>{entry.score}</strong>
                  <span className="score-board__pts">{unit}</span>
                </span>
              </motion.li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
});

ScoreBoard.displayName = 'ScoreBoard';
export default ScoreBoard;
