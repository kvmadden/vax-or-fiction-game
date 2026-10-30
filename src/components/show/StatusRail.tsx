import React from "react";
import { getQuestionInstanceId, useGameStore } from "../../store/game-store";
import {
  STAGE_BEAT_HINT,
  stageBeatFor,
  stageBeatRailState,
  stageBeatWord,
  voteStatusMeta,
  type StageBeat,
  type VoteStatus,
} from "../../engine/vote-status";
import { STAGE_REACTIONS, reactionsAreEnabled } from "../../engine/reactions";
import { StageReactionBurst } from "./StageReactionBurst";

/**
 * StatusRail — the one persistent, audience-safe read-out of the voting beat.
 *
 * Sits in the stage footer slot, right-aligned beside the source pill:
 *   "Voting open · 3 of 5 in"  →  "Votes locked · 3 votes"  →  "Revealed"
 * The dot goes teal → gold → ghost so a lock reads as a beat on a Teams share.
 * Counts are participation only (never a split), so VOF-21 holds while open.
 * The next-key hint ("Space · lock") appears on hover/focus only, so the room
 * never sees presenter chrome unless the presenter reaches for it.
 * When the presenter opts into the clock (T), the ring draws at the right end
 * so stage and phones show the same countdown.
 */
export interface StatusRailProps {
  beat?: StageBeat;
  status: VoteStatus;
  questionId?: string | null;
  /** Hands-up play has no votes to count and no lock beat: the rail stays off the canvas. */
  offline?: boolean;
  /** Draw the countdown ring when the timer is enabled and visible (default true). */
  showTimer?: boolean;
  className?: string;
  nextActionHint?: string;
}

const RING_RADIUS = 12;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatClock(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export const StatusRail: React.FC<StatusRailProps> = React.memo(({
  beat,
  status,
  questionId,
  offline = false,
  showTimer = true,
  className = "",
  nextActionHint,
}) => {
  const votesIn = useGameStore((s) => (questionId ? Object.keys(s.pollVoters[questionId] ?? {}).length : 0));
  const phonesJoined = useGameStore((s) => Object.keys(s.seenDevices).length);
  const timer = useGameStore((s) => s.timer);
  const reactionsEnabled = useGameStore(reactionsAreEnabled);
  const receivedReactions = useGameStore((s) => {
    const occurrence = getQuestionInstanceId(s);
    return occurrence && s.run[s.slideIndex]?.id === questionId ? s.reactions[occurrence] : undefined;
  });

  if (offline) return null;

  const resolvedBeat = beat ?? stageBeatFor({ phase: status === "open" ? "deliberating" : status });
  const word = stageBeatWord(resolvedBeat);
  const meta = voteStatusMeta(status, { votesIn, phonesJoined });
  const received = STAGE_REACTIONS.map((reaction) => ({
    label: reaction.label,
    emoji: reaction.emoji,
    count: Number(receivedReactions?.[reaction.value]),
  })).filter(({ count }) => Number.isSafeInteger(count) && count > 0);
  // H5: this gated to "revealed" only, so the summary vanished the moment the presenter advanced
  // to "explaining" one beat later. git log -S found no commit narrowing it on purpose after the
  // line was first introduced (2633d82), and no VOF ruling addresses it, so both settled beats show
  // the same already-per-occurrence-scoped reaction data (question-lifecycle.test.mjs expects the
  // exact same summary text to survive that ADVANCE, and seeds "explaining" directly for the fit check).
  const dominant = (resolvedBeat === "revealed" || resolvedBeat === "explaining") && reactionsEnabled
    ? received.reduce<(typeof received)[number] | undefined>((best, item) => !best || item.count > best.count ? item : best, undefined)
    : undefined;
  const timerOn = showTimer && resolvedBeat === "deliberating" && Boolean(timer?.enabled) && Boolean(timer?.visible) && (timer?.durationMs ?? 0) > 0;
  const remainingSeconds = Math.max(0, Math.ceil((timer?.remainingMs ?? 0) / 1000));
  const ratio = timerOn ? Math.max(0, Math.min(1, (timer?.remainingMs ?? 0) / timer.durationMs)) : 0;
  const urgency = remainingSeconds <= 5 ? "critical" : remainingSeconds <= 10 ? "warning" : "calm";

  return (
    <div
      className={`status-rail ${className}`.trim()}
      data-role="status-rail"
      data-state={stageBeatRailState(resolvedBeat)}
      data-votes-in={votesIn}
      data-phones={phonesJoined}
    >
      <span className="status-rail__dot" aria-hidden="true" />
      <span className="status-rail__text" data-role="status-rail-text">
        <span className="status-rail__phase">{word}</span>
        {meta ? <span className="status-rail__meta">{meta}</span> : null}
        {dominant && (
          <span data-role="stage-reaction-summary" title={received.map(({ label, count }) => `${label} ${count}`).join(', ')} aria-label={received.map(({ label, count }) => `${label} ${count}`).join(', ')}>
            <span className="status-rail__reaction-separator" aria-hidden="true"> · </span>
            <span className="status-rail__reaction-emoji" aria-hidden="true">{dominant.emoji}</span>
            <span className="status-rail__reaction-count"> {dominant.count}</span>
          </span>
        )}
      </span>
      <StageReactionBurst />
      <span className="status-rail__hint" data-role="status-rail-hint" aria-hidden="true">
        {nextActionHint ?? STAGE_BEAT_HINT[resolvedBeat]}
      </span>
      {timerOn && (
        <span className="status-rail__timer" data-role="status-rail-timer" data-urgency={urgency}>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle className="status-rail__ring-track" cx="16" cy="16" r={RING_RADIUS} fill="none" strokeWidth="3" />
            <circle
              className="status-rail__ring-fill"
              cx="16"
              cy="16"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
            />
          </svg>
          <span className="status-rail__clock" data-role="status-rail-clock">{formatClock(remainingSeconds)}</span>
        </span>
      )}
    </div>
  );
});

StatusRail.displayName = "StatusRail";

export default StatusRail;
