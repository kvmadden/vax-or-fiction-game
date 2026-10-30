// The whole-topic dealer (VOF-68, docs/QUESTION-BANK.md section 9). Pure functions only: no store, no DOM, so
// a round's shape is cheap to test and never drifts from what solo-game.ts actually deals. The regular dealer uses
// settled difficulty metadata for 9.4's three level bands, and Climb sorts by that same level under 9.3.
// Metadata never spreads onto a question object (4.7): every function here takes the
// plain deck questions and a separate id-keyed metadata map.
import type { RuntimeMeta } from '../data/bank/types';
import type { Question, QuestionKind } from '../data/types';

/** A question's bank record, or null while the backfill has not reached it yet. */
export type SoloMeta = ReadonlyMap<string, RuntimeMeta | null>;

/** 9.2: a topic needs this many playable questions to appear on the picker. */
export const SOLO_PICKER_MINIMUM = 10;

function byIdMap(questions: readonly Question[]): Map<string, Question> {
  return new Map(questions.map((question) => [question.id, question]));
}

function kindOf(id: string, byId: ReadonlyMap<string, Question>, meta: SoloMeta): QuestionKind {
  return meta.get(id)?.kind ?? byId.get(id)?.kind ?? 'binary';
}

/** A question with no bank record yet stands for its own concept, so it always plays as core -- today's behavior,
 *  kept because the spec is silent on a question the backfill has not reached. */
function conceptOf(id: string, meta: SoloMeta): string {
  return meta.get(id)?.conceptId ?? id;
}

function rotationOf(id: string, meta: SoloMeta): 'core' | 'alternate' {
  return meta.get(id)?.rotation ?? 'core';
}

/**
 * A topic's whole rotation (9.2): every core question, plus every alternate whose concept is not already in the
 * round, deduped so a concept with more than one live alternate only ever lends the round one of them. `sequence`
 * is the topic's playable ids -- held questions already filtered out.
 *
 * 9.4's true-or-false rotation cap (at most 7 of 20) has no separate enforcement here: this loop only ever adds an
 * alternate for a concept nothing else in the round already covers, so removing one to satisfy the cap would
 * always drop that concept out of the round entirely -- exactly the case 9.4 says relaxes the cap rather than
 * shrinking the round. Given that, the cap is met by construction for every shape this function can produce, and a
 * real trim (dropping a true-or-false alternate whose concept IS covered elsewhere) can never happen here; growth
 * (phase 5) may still need a real enforcement once a fully grown topic can carry more than one alternate per
 * concept.
 */
export function buildTopicRotation(sequence: readonly string[], meta: SoloMeta): string[] {
  const core = sequence.filter((id) => rotationOf(id, meta) === 'core');
  const coreConcepts = new Set(core.map((id) => conceptOf(id, meta)));
  const seenAltConcepts = new Set<string>();
  const alternates: string[] = [];
  for (const id of sequence) {
    if (rotationOf(id, meta) !== 'alternate') continue;
    const concept = conceptOf(id, meta);
    if (coreConcepts.has(concept) || seenAltConcepts.has(concept)) continue;
    seenAltConcepts.add(concept);
    alternates.push(id);
  }
  return [...core, ...alternates];
}

/** Uses the fewest same-kind neighbors the kind counts allow (9.4). Ties keep the input's kind order. A lone kind
 *  stays between repeated kinds whenever an equal-pair-minimum order can do that. Within each third, items prefer
 *  the difficulty levels named in 9.4 and fall back to the closest available level. */
export function orderKindVariety(ids: readonly string[], questions: readonly Question[], meta: SoloMeta): string[] {
  const byId = byIdMap(questions);
  const kinds: QuestionKind[] = [];
  const idsByKind = new Map<QuestionKind, string[]>();
  for (const id of ids) {
    const kind = kindOf(id, byId, meta);
    const queue = idsByKind.get(kind);
    if (queue) queue.push(id);
    else {
      kinds.push(kind);
      idsByKind.set(kind, [id]);
    }
  }
  if (ids.length < 2) return [...ids];

  const kindCounts = kinds.map((kind) => idsByKind.get(kind)?.length ?? 0);
  type KindPlan = { pairs: number; collisionPositions: number[]; loneEnds: number; kinds: number[] };
  const memo = new Map<string, KindPlan>();
  const compareCollisionPositions = (candidate: readonly number[], current: readonly number[]): number => {
    for (let index = 0; index < candidate.length; index += 1) {
      const candidatePosition = candidate[index];
      const currentPosition = current[index];
      if (candidatePosition !== undefined && currentPosition !== undefined && candidatePosition !== currentPosition) {
        return candidatePosition > currentPosition ? 1 : -1;
      }
    }
    return 0;
  };
  const scheduleKinds = (remaining: readonly number[], previous: number, first: number): KindPlan => {
    const remainingTotal = remaining.reduce((sum, count) => sum + count, 0);
    if (remainingTotal === 0) return { pairs: 0, collisionPositions: [], loneEnds: 0, kinds: [] };
    const key = `${remaining.join(',')}|${previous}|${first}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const choices = kinds
      .map((_, index) => index)
      .filter((index) => (remaining[index] ?? 0) > 0)
      .sort((a, b) => (remaining[b] ?? 0) - (remaining[a] ?? 0) || a - b);
    let best: KindPlan | null = null;
    for (const choice of choices) {
      const next = [...remaining];
      next[choice] = (next[choice] ?? 0) - 1;
      const nextFirst = first < 0 ? choice : first;
      const tail = scheduleKinds(next, choice, nextFirst);
      const endpointPenalty = (remainingTotal === ids.length && kindCounts[choice] === 1 ? 1 : 0)
        + (remainingTotal === 1 && kindCounts[choice] === 1 ? 1 : 0);
      const candidate: KindPlan = {
        pairs: tail.pairs + (previous === choice ? 1 : 0),
        collisionPositions: previous === choice ? [ids.length - remainingTotal, ...tail.collisionPositions] : tail.collisionPositions,
        loneEnds: tail.loneEnds + endpointPenalty,
        kinds: [choice, ...tail.kinds],
      };
      const collisionOrder = best ? compareCollisionPositions(candidate.collisionPositions, best.collisionPositions) : 0;
      if (!best || candidate.pairs < best.pairs
        || (candidate.pairs === best.pairs && candidate.loneEnds < best.loneEnds)
        || (candidate.pairs === best.pairs && candidate.loneEnds === best.loneEnds && collisionOrder > 0)) {
        best = candidate;
      }
    }
    const result = best ?? { pairs: 0, collisionPositions: [], loneEnds: 0, kinds: [] };
    memo.set(key, result);
    return result;
  };

  const plan = scheduleKinds(kindCounts, -1, -1);
  const firstThird = Math.round(ids.length / 3);
  const secondEnd = firstThird * 2;
  const bandPenalty = (id: string, position: number): number => {
    const level = meta.get(id)?.difficulty;
    if (level !== 'easy' && level !== 'medium' && level !== 'hard' && level !== 'expert') return 0;
    const band = position < firstThird ? 0 : position < secondEnd ? 1 : 2;
    if (band === 0) return level === 'easy' || level === 'medium' ? 0 : level === 'hard' ? 1 : 2;
    if (band === 1) return level === 'medium' || level === 'hard' ? 0 : level === 'easy' ? 1 : 2;
    return level === 'hard' || level === 'expert' ? 0 : level === 'medium' ? 1 : 2;
  };
  const levelPenalty = (id: string, position: number): number => {
    const level = meta.get(id)?.difficulty;
    if (level !== 'easy' && level !== 'medium' && level !== 'hard' && level !== 'expert') return 0;
    const band = position < firstThird ? 0 : position < secondEnd ? 1 : 2;
    const remainingLevels = [...idsByKind.values()].flat().map((remainingId) => meta.get(remainingId)?.difficulty);
    const hardCount = remainingLevels.filter((remainingLevel) => remainingLevel === 'hard').length;
    const expertCount = remainingLevels.filter((remainingLevel) => remainingLevel === 'expert').length;
    const finalSlots = ids.length - secondEnd;
    const finalSupported = hardCount + expertCount >= finalSlots;
    const hardNeededForFinal = Math.max(0, finalSlots - expertCount);
    const reserveHard = band === 1 && level === 'hard' && finalSupported && hardCount <= hardNeededForFinal;
    if (band === 1 && reserveHard) return 2;
    return bandPenalty(id, position);
  };
  const ordered: string[] = [];
  for (const [position, kindIndex] of plan.kinds.entries()) {
    const kind = kinds[kindIndex];
    if (kind === undefined) continue;
    const queue = idsByKind.get(kind);
    if (!queue?.length) continue;
    let chosenIndex = 0;
    let chosenPenalty = Number.POSITIVE_INFINITY;
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      if (id === undefined) continue;
      const penalty = levelPenalty(id, position);
      if (penalty < chosenPenalty) {
        chosenIndex = index;
        chosenPenalty = penalty;
      }
    }
    const [chosen] = queue.splice(chosenIndex, 1);
    if (chosen !== undefined) ordered.push(chosen);
  }

  const kindById = new Map(ids.map((id) => [id, kindOf(id, byId, meta)]));
  const countByKind = new Map(kinds.map((kind, index) => [kind, kindCounts[index] ?? 0]));
  const adjacentPairs = (candidate: readonly string[]): number => {
    let pairs = 0;
    for (let index = 1; index < candidate.length; index += 1) {
      const current = candidate[index];
      const previous = candidate[index - 1];
      if (current !== undefined && previous !== undefined && kindById.get(current) === kindById.get(previous)) pairs += 1;
    }
    return pairs;
  };
  const loneEnds = (candidate: readonly string[]): number => {
    const first = candidate[0];
    const last = candidate.at(-1);
    const firstKind = first === undefined ? undefined : kindById.get(first);
    const lastKind = last === undefined ? undefined : kindById.get(last);
    return Number(firstKind !== undefined && countByKind.get(firstKind) === 1)
      + Number(lastKind !== undefined && countByKind.get(lastKind) === 1);
  };
  while (true) {
    let bestOrder = [...ordered];
    let bestImprovement = 0;
    let improved = false;
    const currentPenalty = ordered.reduce((sum, id, position) => sum + bandPenalty(id, position), 0);
    const consider = (candidate: string[]) => {
      if (adjacentPairs(candidate) !== plan.pairs || loneEnds(candidate) !== plan.loneEnds) return;
      const candidatePenalty = candidate.reduce((sum, id, position) => sum + bandPenalty(id, position), 0);
      const improvement = currentPenalty - candidatePenalty;
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        bestOrder = candidate;
        improved = true;
      }
    };
    for (let left = 0; left < ordered.length; left += 1) {
      for (let right = left + 1; right < ordered.length; right += 1) {
        const candidate = [...ordered];
        [candidate[left], candidate[right]] = [candidate[right]!, candidate[left]!];
        consider(candidate);
      }
    }
    for (let first = 0; first < ordered.length; first += 1) {
      for (let second = first + 1; second < ordered.length; second += 1) {
        for (let third = second + 1; third < ordered.length; third += 1) {
          const forward = [...ordered];
          [forward[first], forward[second], forward[third]] = [ordered[second]!, ordered[third]!, ordered[first]!];
          consider(forward);
          const backward = [...ordered];
          [backward[first], backward[second], backward[third]] = [ordered[third]!, ordered[first]!, ordered[second]!];
          consider(backward);
        }
      }
    }
    if (!improved) break;
    ordered.splice(0, ordered.length, ...bestOrder);
  }
  return ordered;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A rotation stride that actually cycles through every position before repeating: the smallest of 3, 5, 7 that
 *  shares no factor with the round length, falling back to 1 (always coprime) for a short or stubborn length. A
 *  fixed stride of 3 alone repeats early on a short round -- The big picture's 6 would see play 2 land back on
 *  play 0's exact order, and RSV's 12 would see play 4 repeat play 0 -- since 3 divides both. */
function strideFor(length: number): number {
  for (const candidate of [3, 5, 7]) if (gcd(candidate, length) === 1) return candidate;
  return 1;
}

/**
 * A later play opens differently from every play before it (9.5), not just the one immediately prior. Distinct
 * rotations run out after the round length. The six-question Big picture can repeat from play 7, and a ten-question
 * Climb can repeat from play 11. DealTopicPlay rotates first, runs the variety pass, then checks that final order
 * against this visit's history.
 */
export function rotateOpening(ids: readonly string[], playIndex: number, history: readonly (readonly string[])[] = []): string[] {
  if (ids.length === 0) return [];
  const stride = strideFor(ids.length);
  let shift = (((playIndex * stride) % ids.length) + ids.length) % ids.length;
  const sameAs = (candidate: readonly string[]) => history.some((past) => past.length === candidate.length && past.every((id, index) => id === candidate[index]));
  let rotated = [...ids.slice(shift), ...ids.slice(0, shift)];
  for (let guard = 0; sameAs(rotated) && guard < ids.length; guard += 1) {
    shift = (shift + 1) % ids.length;
    rotated = [...ids.slice(shift), ...ids.slice(0, shift)];
  }
  return rotated;
}

/**
 * One play of a topic's whole rotation (9.5). `playIndex` is 0 for a topic's first play this visit, 1 for its
 * second, and so on. Every concept in the rotation gets its own variant list: its own dealt id first, then every
 * other live question of the same concept and kind, in pool order -- never the pick order those twins happen to
 * be authored in, so which one is "the core" never depends on whether an alternate was picked before or after it.
 * Even plays (0, 2, 4...) deal the concept's own rotation id. Odd plays cycle through its twins: play 1 deals the
 * first twin, play 3 the next, and so on, wrapping once every twin has had a turn. A concept with no twin always
 * deals the same id, so the round's own kind mix and length never change -- only its order does, and a topic with
 * no twins at all simply reshuffles via `rotateOpening`.
 *
 * When a final order callback is supplied, history is checked on its output. If that ordering collapses distinct
 * openings, the dealer tries tie order variations only while the rotation still has an unused play.
 *
 * Deferred: 9.5 also describes a growing topic differently in its own words ("the second play swaps each
 * remaining twin in for its same-concept core question"), separately from the fully-grown case above it. This one
 * rule covers both today, since no topic is fully grown yet (phase 5) and every topic here carries at most one
 * alternate per concept -- once growth can put more than one live alternate on a single concept, this may need a
 * real growing-vs-grown split rather than the even/odd cycle alone.
 */
export function dealTopicPlay(
  rotation: readonly string[],
  sequence: readonly string[],
  questions: readonly Question[],
  meta: SoloMeta,
  playIndex: number,
  history: readonly (readonly string[])[] = [],
  finalOrder?: (ids: readonly string[]) => string[],
): string[] {
  const byId = byIdMap(questions);
  // Group every playable id by concept and kind, never swapping a concept across a kind change.
  const byConceptKind = new Map<string, string[]>();
  for (const id of sequence) {
    const key = `${conceptOf(id, meta)}::${kindOf(id, byId, meta)}`;
    const group = byConceptKind.get(key);
    if (group) group.push(id); else byConceptKind.set(key, [id]);
  }
  const played = rotation.map((roundId) => {
    const key = `${conceptOf(roundId, meta)}::${kindOf(roundId, byId, meta)}`;
    const group = byConceptKind.get(key) ?? [roundId];
    const twins = group.filter((candidate) => candidate !== roundId);
    if (twins.length === 0) return roundId;
    if (playIndex % 2 === 0) return roundId;
    const twinIndex = Math.floor((playIndex - 1) / 2) % twins.length;
    return twins[twinIndex] ?? roundId;
  });

  const sameOrder = (candidate: readonly string[]) => history.some((past) =>
    past.length === candidate.length && past.every((id, index) => id === candidate[index]));
  const firstPlayIndex = Math.max(0, playIndex);
  let firstCandidate: string[] = [];
  const orderedCandidates: string[][] = [];
  for (let attempt = 0; attempt < Math.max(1, played.length); attempt += 1) {
    const rotated = rotateOpening(played, firstPlayIndex + attempt);
    const varied = orderKindVariety(rotated, questions, meta);
    const ordered = finalOrder?.(varied) ?? varied;
    if (attempt === 0) firstCandidate = ordered;
    if (!sameOrder(ordered)) return ordered;
    orderedCandidates.push(ordered);
  }

  if (finalOrder && playIndex < played.length) {
    for (const candidate of orderedCandidates) {
      for (let left = 0; left < candidate.length; left += 1) {
        for (let right = left + 1; right < candidate.length; right += 1) {
          const swapped = [...candidate];
          [swapped[left], swapped[right]] = [swapped[right]!, swapped[left]!];
          const ordered = finalOrder(swapped);
          if (!sameOrder(ordered)) return ordered;
        }
      }
    }
  }
  return firstCandidate;
}

/** 9.2's picker gate: a topic needs ten or more playable questions to appear. The big picture is exempt while it
 *  waits for General public health and COVID-19 to both clear that bar and split off it (9.2). */
export function passesSoloPickerGate(topicId: string, playableCount: number): boolean {
  return topicId === 'big-picture' || playableCount >= SOLO_PICKER_MINIMUM;
}

/**
 * A topic's playable count for the picker gate, from its picks alone -- solo-wide holds only (SOLO_HOLDS), never a
 * deck's own `heldQuestionIds`, since that lives inside the deck module a topic has not loaded yet at picker time.
 * That makes this an overcount on a topic carrying a deck-authored hold of its own (today, only pneumococcal's own
 * q1, and shingles' own late-dose hold): both still clear ten by several questions either way, and
 * `passesSoloPickerGate` agrees with the real, dynamically loaded count for every topic today (checked in
 * solo-dealer.test.ts against loadSoloPool itself, not just asserted here). `loadSoloPool`'s own
 * `pool.sequence.length` is the exact count once a topic opens.
 */
export function estimatedPlayableCount(picks: readonly (readonly [string, string])[], soloHolds: Readonly<Record<string, readonly string[]>>): number {
  return picks.filter(([deckId, questionId]) => !(soloHolds[deckId] ?? []).includes(questionId)).length;
}
