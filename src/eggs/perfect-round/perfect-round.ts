// The perfect-round rule (2026-09-28): a solo round earns the reward on its recap when every question in it was
// answered right. One miss, or one question left unanswered, and it does not. Neither does a round with no
// questions answered at all. The rule reads only right or wrong per question, the same outcomes the recap's own
// strip draws (soloOutcomes), so it holds for every pace (today, Run, Climb, Best) and every question kind alike.

export function isPerfectRound(outcomes: readonly (boolean | null)[]): boolean {
  return outcomes.length > 0 && outcomes.every((outcome) => outcome === true);
}

/**
 * The count the reward shows, as in "8 for 8": the round's own length, read from those same outcomes, so it follows
 * whatever size a round is (eight, Run's ten, or a whole topic's twenty) and is never a fixed number. Null for a
 * round that earned no reward.
 */
export function perfectRoundTotal(outcomes: readonly (boolean | null)[]): number | null {
  return isPerfectRound(outcomes) ? outcomes.length : null;
}
