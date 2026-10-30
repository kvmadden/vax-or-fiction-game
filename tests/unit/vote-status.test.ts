import test from "node:test";
import assert from "node:assert/strict";
import {
  VOTE_STATUS_WORDS,
  STAGE_BEAT_WORDS,
  STAGE_BEAT_HINT,
  voteStatusFor,
  stageBeatFor,
  stageBeatRailState,
  voteStatusMeta,
  voteStatusLine,
  voteStatusChip,
  voteStatusAnnouncement,
  NEXT_ACTION_HINT,
} from "../../src/engine/vote-status";

// ==============================================================================
// PRES-01/03/05/11: one vocabulary for the stage rail, the HUD chip, the
// aria-live region and the phone eyebrow.
// ==============================================================================

test("the three status words are fixed", () => {
  assert.deepEqual(VOTE_STATUS_WORDS, { open: "Voting open", locked: "Votes locked", revealed: "Revealed" });
});

test("voteStatusFor collapses phase + lock flag", () => {
  assert.equal(voteStatusFor({ phase: "entering", votesLocked: false }), "open");
  assert.equal(voteStatusFor({ phase: "deliberating", votesLocked: false }), "open");
  assert.equal(voteStatusFor({ phase: "deliberating", votesLocked: true }), "locked");
  assert.equal(voteStatusFor({ phase: "locked" }), "locked");
  assert.equal(voteStatusFor({ phase: "timedOut" }), "locked");
  assert.equal(voteStatusFor({ phase: "revealed", votesLocked: true }), "revealed");
});

test("the rail line reads Voting open · 3 of 5 in → Votes locked · 3 votes → Revealed", () => {
  const counts = { votesIn: 3, phonesJoined: 5 };
  assert.equal(voteStatusLine("open", counts), "Voting open · 3 of 5 in");
  assert.equal(voteStatusLine("locked", counts), "Votes locked · 3 votes");
  assert.equal(voteStatusLine("revealed", counts), "Revealed");
  assert.equal(voteStatusLine("locked", { votesIn: 1, phonesJoined: 2 }), "Votes locked · 1 vote");
});

test("an empty room shows the word alone, never 0 of 0", () => {
  assert.equal(voteStatusLine("open", { votesIn: 0, phonesJoined: 0 }), "Voting open");
  assert.equal(voteStatusLine("locked", { votesIn: 0, phonesJoined: 0 }), "Votes locked");
  assert.equal(voteStatusLine("open"), "Voting open");
});

test("the HUD chip uses the short forms", () => {
  const counts = { votesIn: 3, phonesJoined: 5 };
  assert.equal(voteStatusChip("open", counts), "Voting open · 3 in");
  assert.equal(voteStatusChip("locked", counts), "Locked · 3");
  assert.equal(voteStatusChip("revealed", counts), "Revealed");
  assert.equal(voteStatusChip("open"), "Voting open");
});

test("the aria-live announcement says Votes locked with the count, never Revealing answer", () => {
  assert.equal(voteStatusAnnouncement("locked", { votesIn: 3, phonesJoined: 5 }), "Votes locked. 3 votes.");
  assert.equal(voteStatusAnnouncement("locked", { votesIn: 1, phonesJoined: 1 }), "Votes locked. 1 vote.");
  assert.equal(voteStatusAnnouncement("locked"), "Votes locked.");
  assert.equal(voteStatusAnnouncement("revealed"), "Answer revealed.");
  assert.doesNotMatch(voteStatusAnnouncement("locked", { votesIn: 3, phonesJoined: 5 }), /Revealing/);
});

test("the next-action hint follows the beat", () => {
  assert.deepEqual(NEXT_ACTION_HINT, { open: "Space · lock", locked: "Space · reveal", revealed: "Space · next" });
});

test("stage beats keep explaining distinct from revealed", () => {
  assert.deepEqual(STAGE_BEAT_WORDS, {
    deliberating: "Voting open",
    locked: "Votes locked",
    revealed: "Revealed",
    explaining: "Why it matters",
  });
  assert.equal(stageBeatFor({ phase: "entering" }), "deliberating");
  assert.equal(stageBeatFor({ phase: "deliberating", votesLocked: true }), "locked");
  assert.equal(stageBeatFor({ phase: "revealed" }), "revealed");
  assert.equal(stageBeatFor({ phase: "explaining" }), "explaining");
  assert.equal(voteStatusFor({ phase: "explaining" }), "revealed");
  assert.equal(stageBeatRailState("deliberating"), "open");
  assert.equal(stageBeatRailState("explaining"), "explaining");
  assert.deepEqual(STAGE_BEAT_HINT, {
    deliberating: "Space · lock",
    locked: "Space · reveal",
    revealed: "Space · explain",
    explaining: "Space · next",
  });
});

test("rail meta is quiet counts, never 0 of 0", () => {
  assert.equal(voteStatusMeta("open", { votesIn: 3, phonesJoined: 5 }), "3 of 5 in");
  assert.equal(voteStatusMeta("locked", { votesIn: 1, phonesJoined: 2 }), "1 vote");
  assert.equal(voteStatusMeta("revealed", { votesIn: 3, phonesJoined: 5 }), "");
  assert.equal(voteStatusMeta("open", { votesIn: 0, phonesJoined: 0 }), "");
});
