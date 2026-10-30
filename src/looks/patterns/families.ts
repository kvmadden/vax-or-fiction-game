/**
 * The families of the topic patterns (VOF-94). Every question belongs to exactly one, and each family has one
 * engraved tile in public/pattern-art/<family>.webp that the pattern layer draws behind the question.
 *
 * The fourteen families are built on the owner's solo topics (src/data/decks/topics/themes.ts): the seven
 * vaccine topics, the big picture and the two practice topics keep their questions, and four smaller families
 * split out where one picture says more than the vaccine's name does (pregnancy and newborns, heart and stroke,
 * egg allergy, storage and handling). Which question lands in which family is written by
 * scripts/build-pattern-index.mjs into topic-index.ts, and tests/unit/topic-pattern-families.test.ts keeps the
 * two in step with the decks.
 *
 * A question finds its family by its stem. The stage holds the whole question and the phone holds only the public
 * question (id, kind, statement), and ids repeat across decks (q1 is a different question in every deck), so the
 * key both surfaces share is a fingerprint of the stem text.
 */

export interface PatternFamily {
  label: string;
  /**
   * How large this family's tile draws, as a multiple of the surface's base tile. The tiles are not equally busy
   * (the RSV lungs are the densest and the vials of the one visit family the sparsest), so a busy tile draws larger
   * and a sparse one smaller, which brings every family to about the same amount of drawing per screen at the same
   * strength. Each is the tile's own edge length per area over the geometric mean of the fourteen, measured on the tile
   * and kept between 0.7 and 1.6, so no family draws more than 1.3 times the line the quietest one does. The strength is
   * the same 22 percent ink for every family, which a scale cannot change.
   */
  scale: number;
}

export const PATTERN_FAMILIES = {
  flu: { label: "Flu", scale: 1.25 },
  egg: { label: "Egg allergy and the flu shot", scale: 0.8 },
  rsv: { label: "RSV", scale: 1.6 },
  pneumococcal: { label: "Pneumococcal", scale: 1.05 },
  shingles: { label: "Shingles", scale: 0.85 },
  hpv: { label: "HPV", scale: 1.15 },
  "hepatitis-b": { label: "Hepatitis B", scale: 0.85 },
  tetanus: { label: "Tetanus and whooping cough", scale: 0.75 },
  newborns: { label: "Pregnancy and newborns", scale: 0.95 },
  heart: { label: "Heart and stroke", scale: 1.35 },
  "one-visit": { label: "Several vaccines, one visit", scale: 0.7 },
  storage: { label: "Storage and handling", scale: 1.15 },
  "what-to-say": { label: "What to say", scale: 0.75 },
  "big-picture": { label: "The big picture", scale: 1.15 },
} as const satisfies Record<string, PatternFamily>;

export type PatternFamilyId = keyof typeof PATTERN_FAMILIES;

/** The stem of a statement: the text before the first blank line. The phone's statement carries the question's scenario after one. */
function stemOf(statement: string): string {
  return statement.trim().split(/\n\s*\n/)[0] ?? "";
}

/**
 * The fingerprint of a stem: FNV-1a over its normalized text, as 8 hex digits. Normalizing is the same as the
 * held-question match in src/data/decks/index.ts, so a stem with different spacing or case is the same stem.
 */
export function stemKey(statement: string): string {
  const text = stemOf(statement).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
