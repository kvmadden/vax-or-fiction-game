/**
 * The largest streakBonus score() (src/engine/scoring.ts) can ever return (the every-5 milestone
 * amount, see score()'s own comment). The 3-streak milestone only ever pays 50, and the every-5
 * milestone always pays a flat 100 regardless of how long the streak runs, so 100 is a real
 * ceiling, not an estimate. This is the wire-contract bound for AttendeeState.result.streakBonus
 * (STREAK-PILL): src/network/guards.ts, server/room-relay.mjs and the production migration all
 * reject a streakBonus above this value.
 *
 * Lives in its own file, separate from scoring.ts (boundary finding, 2026-09-28): scoring.ts also
 * exports evalAnswer, which reads a question's real answer to score a voter's choice, so any module
 * that imports scoring.ts for this one bound would pull that answer-reading code into the same file
 * and, with it, into any bundle that reaches the file. src/network/guards.ts is reachable from the
 * phone bundle (PhoneSuite.tsx -> usePhoneLink.ts -> guards.ts) for its shape validators, and needs
 * only this bound, never evalAnswer, so it imports the bound from here instead. scoring.ts still
 * re-exports MAX_STREAK_BONUS, so every other caller is unaffected.
 */
export const MAX_STREAK_BONUS = 100;
