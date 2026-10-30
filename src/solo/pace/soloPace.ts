// Solo pace (2026-09-27): three playable variants behind ?soloPace=, built for build-up, momentum and a real
// round-end payoff. Run is the default under VOF-100 (2026-10-21). Explicit pace links stay available.

export type SoloPaceMode = 'today' | 'run' | 'climb' | 'best';

const SOLO_PACE_MODES: readonly SoloPaceMode[] = ['today', 'run', 'climb', 'best'];

/** Reads ?soloPace= from the address. Missing or unrecognized values play Run. */
export function readSoloPace(search: string = typeof window !== 'undefined' ? window.location.search : ''): SoloPaceMode {
  const value = new URLSearchParams(search).get('soloPace');
  return (SOLO_PACE_MODES as readonly string[]).includes(value ?? '') ? (value as SoloPaceMode) : 'run';
}

/** The streak counts Run celebrates: milestones at 3, 5, 8 and 12, now that a round can run past eight (9.3). A
 *  round's own length is the topic's whole rotation in every pace now (VOF-68, `SoloPool.rotation`,
 *  `solo-game.ts`) -- Run no longer deals a longer round of its own the way it used to (ten instead of eight). */
export const RUN_MILESTONES = [3, 5, 8, 12] as const;

/**
 * The streak tier a shown streak has reached, 0 through 3. Run's screen rises one tier per milestone crossed --
 * brighter stage lights, a bolder accent, a small scale lift -- and resets to 0 the moment a miss deflates it.
 */
export function streakTier(streak: number): 0 | 1 | 2 | 3 {
  if (streak >= RUN_MILESTONES[2]) return 3;
  if (streak >= RUN_MILESTONES[1]) return 2;
  if (streak >= RUN_MILESTONES[0]) return 1;
  return 0;
}

/** The human label for a pace, used only in this file's own UI (never the clinical copy). */
export const PACE_LABEL: Readonly<Record<SoloPaceMode, string>> = {
  today: 'Today',
  run: 'Run',
  climb: 'Climb',
  best: 'Best',
};
