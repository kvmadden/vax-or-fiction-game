import React, { useMemo, useRef } from 'react';
import type { FormatId } from '../data/types';
import { computeStageLanes, questionDisplayNumber } from '../engine/leaderboard';
import { useGameStore } from '../store/game-store';
import { useRoom } from '../presentation/RoomContext';
import { useStageHudOverlap } from '../presentation/useStageHudOverlap';
import { ShowFrame } from '../components/show/ShowFrame';
import { ShowChrome } from '../components/show/ShowChrome';
import { ScoreBoard } from '../components/show/ScoreBoard';
export interface LeaderboardProps {
  format?: FormatId;
  className?: string;
}

export const Leaderboard: React.FC<LeaderboardProps> = React.memo(({
  format = 'widescreen',
  className = '',
}) => {
  const seenDevices = useGameStore((state) => state.seenDevices);
  const run = useGameStore((state) => state.run);
  const slideIndex = useGameStore((state) => state.slideIndex);
  const { roomId } = useRoom();
  const shellRef = useRef<HTMLElement>(null);
  useStageHudOverlap(shellRef, format, '--leaderboard-hud-overlap');
  const entries = useMemo(() => computeStageLanes(seenDevices), [seenDevices]);
  const through = questionDisplayNumber(run?.[slideIndex]);
  const joinHost = typeof window === 'undefined' ? '' : window.location.host;

  return (
    <main
      ref={shellRef}
      className={`leaderboard-screen screen leaderboard ${className}`.trim()}
      data-screen="leaderboard"
      data-role="leaderboard-screen"
      data-format={format}
      data-through={through ?? undefined}
      aria-label={through != null ? `Standings through question ${through}` : 'Standings'}
    >
      <ShowFrame
        scrim="center"
        className="leaderboard-show-frame"
        beat="leaderboard"
      >
        <div className="leaderboard-source-header"><span>STANDINGS</span></div>
        <ShowChrome roomId={roomId} joinHost={joinHost}>
          <div className="leaderboard-board-content">
            <ScoreBoard entries={entries} through={through} tone="stage" />
          </div>
        </ShowChrome>
      </ShowFrame>
    </main>
  );
});

Leaderboard.displayName = 'Leaderboard';
export default Leaderboard;
