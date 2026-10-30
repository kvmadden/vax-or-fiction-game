// NIT-7: rank and (filtered) name are not a safe React key alone, since two tied players who also
// share a display name (both flagged to "Player" by DEF-32, for example) produce the exact same pair.
// The wire entry carries only the four fields the production relay accepts, so the row's place in the
// ranked list is what makes its key unique. Its own module so PhoneSuite.tsx exports only components
// (oxlint react only-export-components, which keeps fast refresh working).
export function leaderboardRowKey(entry: { rank: number }, index: number): string {
  return `${entry.rank}-${index}`;
}
