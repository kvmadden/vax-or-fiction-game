/**
 * Live-phone mash guards. A first Skip or Showdown Next with phones still
 * outstanding arms the control; the second press commits.
 */

export type PresenterArmKind = 'skip' | 'showdown';

export interface PresenterArm {
  kind: PresenterArmKind;
}

export interface SkipGuardInput {
  offlineMode?: boolean;
  interactionMode?: string | null;
  votesLocked?: boolean | null;
  phonesJoined: number;
  votesIn: number;
  onQuestion: boolean;
}

export interface ShowdownGuardInput {
  phase?: string | null;
  stage?: string | null;
  finalistCount: number;
  phonesJoined: number;
  predictionCount: number;
}

export function shouldGuardSkip({
  offlineMode = false,
  interactionMode,
  votesLocked = false,
  phonesJoined,
  votesIn,
  onQuestion,
}: SkipGuardInput): boolean {
  return !offlineMode
    && interactionMode === 'polling'
    && onQuestion
    && !votesLocked
    && phonesJoined > 0
    && votesIn < phonesJoined;
}

export function shouldGuardShowdownAdvance({
  phase,
  stage,
  finalistCount,
  phonesJoined,
  predictionCount,
}: ShowdownGuardInput): boolean {
  return phase === 'showdown'
    && stage === 'lineup'
    && finalistCount >= 2
    && phonesJoined > 0
    && predictionCount === 0;
}

export function armOrCommit<T extends { presenterArm?: PresenterArm | null }>(
  state: T,
  kind: PresenterArmKind,
  commit: (next: T) => T,
): T {
  if (state.presenterArm?.kind === kind) {
    return { ...commit(state), presenterArm: null };
  }
  return { ...state, presenterArm: { kind } };
}

export function clearPresenterArm<T extends { presenterArm?: PresenterArm | null }>(state: T): T {
  return state.presenterArm ? { ...state, presenterArm: null } : state;
}
