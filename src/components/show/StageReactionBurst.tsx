import React, { useEffect, useState } from 'react';
import { reactionEmoji, reactionStageLabel, reactionsAreEnabled, STAGE_REACTION_BURST_MS } from '../../engine/reactions';
import { useGameStore } from '../../store/game-store';

/**
 * A projector-readable emoji that pops above the status rail when a phone
 * reaction lands, then clears. It never sits on the question stem.
 * Motion is CSS-only (`prefers-reduced-motion`), so SSR and a stubbed window
 * cannot trip Framer Motion's projection listeners.
 */
export const StageReactionBurst: React.FC = () => {
  const enabled = useGameStore(reactionsAreEnabled);
  const moment = useGameStore((state) => state.reactionMoment);
  const [, setTick] = useState(0);

  const emoji = enabled ? reactionEmoji(moment?.reaction) : null;
  const label = enabled ? reactionStageLabel(moment?.reaction) : null;
  const at = Number(moment?.firedAt ?? moment?.at ?? 0);
  const visible = Boolean(emoji && label && Number.isFinite(at) && at > 0 && Date.now() - at <= STAGE_REACTION_BURST_MS);

  useEffect(() => {
    if (!visible || typeof window === 'undefined') return undefined;
    const remaining = Math.max(0, STAGE_REACTION_BURST_MS - (Date.now() - at));
    const timer = window.setTimeout(() => setTick((tick) => tick + 1), remaining);
    return () => window.clearTimeout(timer);
  }, [visible, at]);

  if (!visible || !emoji || !label || !moment) return null;
  return (
    <span
      className="status-rail__burst"
      data-role="stage-reaction-burst"
      data-reaction={String(moment.reaction)}
      data-emoji={emoji}
      aria-hidden="true"
    >
      <span className="status-rail__burst-emoji" aria-hidden="true">{emoji}</span>
    </span>
  );
};

StageReactionBurst.displayName = 'StageReactionBurst';

export default StageReactionBurst;
