import { stemKey, type PatternFamilyId } from "./families";
import { STEM_FAMILY } from "./topic-index";

/**
 * The family for a question's statement, or null when it has none. The stage passes the question's statement and
 * the phone passes the public statement (the stem, then the scenario after a blank line), and both reach the same
 * family because only the stem counts. A stem outside the bundled decks has no family and draws no pattern, which
 * tests/unit/topic-pattern-families.test.ts makes sure no bundled question ever does.
 */
export function familyForStatement(statement: string | null | undefined): PatternFamilyId | null {
  if (!statement || !statement.trim()) return null;
  return STEM_FAMILY[stemKey(statement)] ?? null;
}
