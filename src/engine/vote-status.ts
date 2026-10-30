/**
 * Vote status vocabulary shared by every surface that names the voting beat:
 * the stage status rail, the facilitator HUD chip, the stage aria-live region
 * and the phone eyebrow. Three words, one source, so a lock reads the same on
 * the shared screen and in every hand.
 *
 * StageBeat is the audience rail's four-beat line. VoteStatus stays the
 * three-way vote window (HUD chip, phone eyebrow). Explaining still collapses
 * to revealed for that window.
 */

export type VoteStatus = "open" | "locked" | "revealed";

export const VOTE_STATUS_WORDS: Readonly<Record<VoteStatus, string>> = Object.freeze({
  open: "Voting open",
  locked: "Votes locked",
  revealed: "Revealed",
});

export type StageBeat = "deliberating" | "locked" | "revealed" | "explaining";

export const STAGE_BEAT_WORDS: Readonly<Record<StageBeat, string>> = Object.freeze({
  deliberating: "Voting open",
  locked: "Votes locked",
  revealed: "Revealed",
  explaining: "Why it matters",
});

/** data-state stays "open" for deliberating so existing open/locked/revealed selectors keep working. */
export const STAGE_BEAT_DATA_STATE: Readonly<Record<StageBeat, "open" | "locked" | "revealed" | "explaining">> = Object.freeze({
  deliberating: "open",
  locked: "locked",
  revealed: "revealed",
  explaining: "explaining",
});

export const STAGE_BEAT_HINT: Readonly<Record<StageBeat, string>> = Object.freeze({
  deliberating: "Space · lock",
  locked: "Space · reveal",
  revealed: "Space · explain",
  explaining: "Space · next",
});

/** Short form for tight chips ("Q1 of 12 · Locked · 3"). */
export const VOTE_STATUS_SHORT: Readonly<Record<VoteStatus, string>> = Object.freeze({
  open: "Voting open",
  locked: "Locked",
  revealed: "Revealed",
});

/** What the next Space / → press does on a question in this state. */
export const NEXT_ACTION_HINT: Readonly<Record<VoteStatus, string>> = Object.freeze({
  open: "Space · lock",
  locked: "Space · reveal",
  revealed: "Space · next",
});

export interface VoteStatusInput {
  /** Question-shell phase or store phase. */
  phase?: string | null;
  /** Store `votesLocked`; a locked question with a non-revealed phase reads as locked. */
  votesLocked?: boolean | null;
}

/** Collapses a phase + lock flag into the three status words. */
export function voteStatusFor({ phase, votesLocked }: VoteStatusInput): VoteStatus {
  if (phase === "revealed" || phase === "explaining") return "revealed";
  if (phase === "locked" || phase === "timedOut" || votesLocked) return "locked";
  return "open";
}

export function stageBeatFor({ phase, votesLocked }: VoteStatusInput): StageBeat {
  if (phase === "explaining") return "explaining";
  if (phase === "revealed") return "revealed";
  if (phase === "locked" || phase === "timedOut" || votesLocked) return "locked";
  return "deliberating";
}

export function stageBeatWord(beat: StageBeat): string {
  return STAGE_BEAT_WORDS[beat];
}

export function stageBeatRailState(beat: StageBeat): "open" | "locked" | "revealed" | "explaining" {
  return STAGE_BEAT_DATA_STATE[beat];
}

export interface VoteStatusCounts {
  /** Votes received for the current question. */
  votesIn?: number;
  /** Phones joined to the room. */
  phonesJoined?: number;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function voteStatusMeta(status: VoteStatus, { votesIn = 0, phonesJoined = 0 }: VoteStatusCounts = {}): string {
  if (status === "revealed" || phonesJoined <= 0) return "";
  if (status === "open") return `${votesIn} of ${phonesJoined} in`;
  return plural(votesIn, "vote");
}

/**
 * The combined rail line for callers that still want one string.
 * Counts only appear when at least one phone has joined:
 * an empty Teams share reads "Voting open", never "0 of 0 in".
 *   open     → "Voting open · 3 of 5 in"
 *   locked   → "Votes locked · 3 votes"
 *   revealed → "Revealed"
 */
export function voteStatusLine(status: VoteStatus, counts: VoteStatusCounts = {}): string {
  const word = VOTE_STATUS_WORDS[status];
  const meta = voteStatusMeta(status, counts);
  return meta ? `${word} · ${meta}` : word;
}

/**
 * The HUD chip line: "Q1 of 12 · Voting open · 3 in" → "Q1 of 12 · Locked · 3" → "Q1 of 12 · Revealed".
 */
export function voteStatusChip(status: VoteStatus, { votesIn = 0, phonesJoined = 0 }: VoteStatusCounts = {}): string {
  const word = VOTE_STATUS_SHORT[status];
  if (status === "revealed" || phonesJoined <= 0) return word;
  if (status === "open") return `${word} · ${votesIn} in`;
  return `${word} · ${votesIn}`;
}

/**
 * Screen-reader announcement for a status change.
 *   locked   → "Votes locked. 3 votes."
 *   revealed → "Answer revealed."
 *   open     → "Voting open."
 */
export function voteStatusAnnouncement(status: VoteStatus, { votesIn = 0, phonesJoined = 0 }: VoteStatusCounts = {}): string {
  if (status === "revealed") return "Answer revealed.";
  if (status === "locked") return phonesJoined > 0 ? `${VOTE_STATUS_WORDS.locked}. ${plural(votesIn, "vote")}.` : `${VOTE_STATUS_WORDS.locked}.`;
  return `${VOTE_STATUS_WORDS.open}.`;
}
