import type { PublicRoomState } from '../network/protocol';

/**
 * PAUSED-AFTER-ADD-TIME: whether the phone's vote screen shows the discussion as paused. It reads a
 * stopped clock the way the presenter remote does (W9, remotePadModel in src/network/presenter-remote.ts),
 * so the two never disagree. A clock that ran out on its own, a locked vote, or a question with no timer
 * is not a pause. During `entering` the clock has not started, so a stopped clock there is a pause only
 * once it has visibly run. Once deliberation starts, any stopped clock with time left is paused, even
 * above its duration (ADD_TIME raises the time left, never the duration) or at it in the first second.
 * Its own module so PhoneSuite.tsx exports only components.
 */
export function discussionPaused(room: Pick<PublicRoomState, 'phase' | 'votesLocked' | 'timerRunning' | 'timerSeconds' | 'timerDurationSeconds'>): boolean {
  const clockHasRun = room.phase === 'deliberating' || room.timerSeconds < room.timerDurationSeconds;
  return !room.timerRunning && !room.votesLocked && room.timerDurationSeconds > 0 && room.timerSeconds > 0 && clockHasRun;
}
