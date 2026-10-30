/**
 * The three status words the stage rail speaks (critique item 1: "Voting open" → "Votes locked" → "Revealed").
 * The phone says the same three words, never its own variants ("Voting closed", "VOTING OPEN").
 *
 * Defined locally because `src/engine/vote-status.ts` does not exist on this branch; when the stage lane lands
 * that module, re-point this import at it and delete the literals here. The phone never imports from
 * `src/engine` for answer-bearing data (tests/unit/phone-public-boundary.test.mjs), so a status-only module
 * is the only safe shared home.
 */
export const VOTE_STATUS = Object.freeze({
  open: 'Voting open',
  locked: 'Votes locked',
  revealed: 'Revealed',
});

export type VoteStatusWord = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];
