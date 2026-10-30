// Browser-test fixture: every distinct question in the bundled host decks, so a suite can pick the longest (worst
// case) or shortest card of a kind from real content instead of a hand-written fixture.
import { BUNDLED_DECKS } from "../../src/data/decks/index";
import { questionKind } from "../../src/engine/kinds";
import type { Question, QuestionKind } from "../../src/data/types";

export interface SpecimenCard { id: string; question: Question }

const signature = (q: Question) => JSON.stringify(["statement", "scenario", "kind", "answer", "choices", "statements", "mythIndex", "bestIndex", "estimate", "steps"].map((k) => (q as unknown as Record<string, unknown>)[k] ?? null));
const seen = new Set<string>();
export const SPECIMEN_POPULATION: SpecimenCard[] = [];
for (const deck of BUNDLED_DECKS) for (const source of deck.questions) {
  const key = signature(source);
  if (seen.has(key)) continue;
  seen.add(key);
  SPECIMEN_POPULATION.push({ id: `BUNDLE-${deck.id}-${source.id}`, question: source });
}

// One synthetic layout fixture: the shipped estimates all have five ranges, so a four-range variant of the first one
// (its last two ranges merged) keeps the four-row estimate layout covered. It is never part of a playable deck.
{
  const base = SPECIMEN_POPULATION.map((c) => c.question).find((q) => (q.estimate?.ranges ?? []).length === 5);
  if (base?.estimate) {
    const ranges = base.estimate.ranges.slice(0, 3);
    const tail = base.estimate.ranges[3]!;
    const last = base.estimate.ranges[4]!;
    const unit = base.estimate.unit ?? "";
    ranges.push({ ...tail, label: `Over ${tail.min}${unit}`, max: last.max });
    SPECIMEN_POPULATION.push({ id: "FIXTURE-four-range-estimate", question: { ...base, id: "fixture-four-range", estimate: { ...base.estimate, ranges } } });
  }
}

/** Total question text length: stem, scenario and every answer role. */
export function textLength(card: SpecimenCard): number {
  const q = card.question as any;
  const parts = [q.statement, q.scenario, ...(q.choices ?? []).map((c: any) => c.label ?? c), ...(q.statements ?? []), ...(q.steps ?? []), ...((q.estimate?.ranges ?? []).map((r: any) => r.label ?? ""))];
  return parts.filter(Boolean).join(" ").length;
}

export function cardsForKind(kind: QuestionKind): SpecimenCard[] {
  return SPECIMEN_POPULATION.filter((c) => questionKind(c.question) === kind);
}

/** Every card of a kind, longest text first. */
export function cardsForKindByLengthDesc(kind: QuestionKind): SpecimenCard[] {
  return cardsForKind(kind)
    .map((c) => ({ c, len: textLength(c) }))
    .sort((a, b) => b.len - a.len)
    .map(({ c }) => c);
}
