import React from 'react';
import { Flame, Mountain, Target } from 'lucide-react';
import type { SoloPaceMode } from './soloPace';
import { RUN_MILESTONES, streakTier } from './soloPace';
import type { PersonalBest } from './personal-best';

export interface SoloPaceHUDProps {
  pace: SoloPaceMode;
  /** Run: the live streak straight from the store. */
  streak: number;
  /** Climb: this question's 1-based position and the round's total, and which 1-based positions are the checkpoint
   *  and the climax. Null once the round is not showing a question (revealing, explaining still count; closing does not). */
  position: { number: number; total: number } | null;
  checkpointAt: number | null;
  climaxAt: number | null;
  /** Best: the target to beat, or null on a topic's first run. */
  target: PersonalBest | null;
}

/**
 * A pace's own live readout, beside the wordmark (2026-09-27): Run's streak meter, Climb's path and beats, Best's
 * target. Today's pace renders nothing here -- its header stays exactly as it always has.
 */
export const SoloPaceHUD: React.FC<SoloPaceHUDProps> = ({ pace, streak, position, checkpointAt, climaxAt, target }) => {
  if (pace === 'run') {
    const tier = streakTier(streak);
    const milestone = (RUN_MILESTONES as readonly number[]).includes(streak);
    return <span className="solo-pace-hud solo-pace-hud--run" data-role="solo-pace-hud" data-pace="run" data-streak-tier={tier}>
      {/* Keying on the streak itself remounts this node the instant a milestone is reached, so its celebration
          keyframe (solo.css) plays exactly once per crossing -- a real beat, not a steady-state glow. A miss resets
          the streak to 0, which remounts too, so the meter's fall is the same gentle CSS transition as its rise,
          never a distinct "buzzer" animation. */}
      <span key={streak} className="solo-pace-hud__flame" data-milestone={milestone ? 'true' : 'false'}>
        <Flame size={16} aria-hidden="true" />
      </span>
      <span>{streak > 0 ? `Streak ${streak}` : 'Streak'}</span>
    </span>;
  }
  if (pace === 'climb' && position) {
    const atCheckpoint = checkpointAt !== null && position.number === checkpointAt;
    const atClimax = climaxAt !== null && position.number === climaxAt;
    return <span className="solo-pace-hud solo-pace-hud--climb" data-role="solo-pace-hud" data-pace="climb" data-checkpoint={atCheckpoint ? 'true' : 'false'} data-climax={atClimax ? 'true' : 'false'}>
      <Mountain size={16} aria-hidden="true" />
      <span className="solo-pace-hud__path" role="img" aria-label={`Climb: step ${position.number} of ${position.total}${atCheckpoint ? ', checkpoint' : ''}${atClimax ? ', the climax, worth double' : ''}`}>
        {Array.from({ length: position.total }, (_, index) => index + 1).map((step) => (
          <span key={step} className="solo-pace-hud__step" data-state={step < position.number ? 'done' : step === position.number ? 'now' : 'ahead'} data-checkpoint={checkpointAt === step ? 'true' : undefined} data-climax={climaxAt === step ? 'true' : undefined} aria-hidden="true" />
        ))}
      </span>
      {atCheckpoint && <span className="solo-pace-hud__flag">Checkpoint</span>}
      {atClimax && <span className="solo-pace-hud__flag" data-flag="climax">Climax · x2</span>}
    </span>;
  }
  if (pace === 'best') {
    return <span className="solo-pace-hud solo-pace-hud--best" data-role="solo-pace-hud" data-pace="best">
      <Target size={16} aria-hidden="true" />
      <span>{target ? `Beat ${target.score}` : 'New target'}</span>
    </span>;
  }
  return null;
};

export default SoloPaceHUD;
