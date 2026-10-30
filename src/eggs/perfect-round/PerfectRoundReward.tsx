import React from 'react';
import { PerfectRoundSticker } from './PerfectRoundSticker';

export interface PerfectRoundRewardProps {
  /** How many questions the round had, every one of them answered right. */
  total: number;
}

/**
 * The perfect-round reward on the solo recap (2026-09-28): the Perfect round die-cut sticker, the owner's pick, in a
 * band of its own between the score and the stat tiles. The round's own count leads, a pun on the sticker follows,
 * and nothing repeats the words already printed on it. SoloSuite only renders it for a round that isPerfectRound
 * says earned it, on every pace. Styles live in perfect-round-reward.css, which SoloSuite loads.
 */
export const PerfectRoundReward: React.FC<PerfectRoundRewardProps> = ({ total }) => (
  <div className="perfect-round-reward" data-role="perfect-round-reward">
    <div className="perfect-round-reward__art">
      <PerfectRoundSticker />
    </div>
    <div className="perfect-round-reward__copy">
      <p className="perfect-round-reward__kicker">{`${total} for ${total}`}</p>
      <p className="perfect-round-reward__title">Stuck it.</p>
      <p className="perfect-round-reward__line">Not one miss.</p>
    </div>
  </div>
);

export default PerfectRoundReward;
