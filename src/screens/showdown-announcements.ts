// NIT: duelPointsAnnouncement lived as a named export inside Showdown.tsx alongside the Showdown
// component itself, tripping oxlint's react-refresh only-export-components rule (a file Fast
// Refresh treats as a component module should only export components). Moved here, the plain
// logic-only sibling module already established by question-state.ts for Question.tsx.

// NIT-5. "Now 1 duel points." read wrong. Both the awarded amount and the running total need
// their own singular/plural check. Exported because the sentence only ever reaches the DOM from a
// useEffect (previousPointsRef comparing renders) in Showdown.tsx, which never runs during the
// renderToString calls the A11Y-16 stage-announcement tests use.
export function duelPointsAnnouncement(delta: number, name: string, newTotal: number): string {
  const amount = Math.abs(delta);
  const verb = delta > 0 ? 'Awarded' : 'Subtracted';
  const preposition = delta > 0 ? 'to' : 'from';
  const plural = (count: number) => (count === 1 ? 'point' : 'points');
  return `${verb} ${amount} ${plural(amount)} ${preposition} ${name}. Now ${newTotal} duel ${plural(newTotal)}.`;
}
