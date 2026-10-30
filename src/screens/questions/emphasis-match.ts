/**
 * STAGE-SPEC pass 4c-1b (blocker fix). Shared by every kind component that highlights authored
 * emphasis phrases (BinaryQuestion, EstimateQuestion, MythAmongThree, WhichPatientQuestion). Each
 * used to build its own literal-phrase regex and split the raw stem on it directly, which matched
 * a multi-word emphasis phrase only when the rendered text also had an ordinary space between
 * every one of its words. The widow guard (widow-guard.ts) joins a stem's tail with U+00A0 in
 * place of the ordinary space between two or more of its words (an escalating join can touch more
 * than the very last space once a stem needs a wider one), so an emphasis phrase whose own words
 * sat inside that joined tail lost its underline entirely: the phrase's own regex, built from
 * ordinary spaces, never matched the U+00A0 the join actually wrote there, and the whole tail fell
 * through as one un-emphasized chunk. Reported live: vax-or-fiction q3 "no longer recommended",
 * q10 "one month", q33 "65 or older", flagship q10 "age 50" (2-word joins) and q2, flagship q3
 * "six times" (3-word joins).
 *
 * Each phrase's own words are escaped and matched separately, joined by `[\s\u00a0]+` instead of a
 * literal space, so the pattern matches the phrase whether its own internal spacing is ordinary or
 * joined.
 */
export function buildEmphasisPattern(phrases: (string | null | undefined)[]): RegExp | null {
  const escaped = phrases
    .filter((phrase): phrase is string => String(phrase ?? "").trim().length > 0)
    .map((phrase) =>
      String(phrase)
        .split(/\s+/)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[\\s\\u00a0]+")
    );
  if (!escaped.length) return null;
  return new RegExp(`(${escaped.join("|")})`, "gi");
}

/**
 * True when `part` (one piece of a `String.split` on `buildEmphasisPattern`'s own regex) is the
 * emphasis phrase `phrase`, allowing a widow join's U+00A0 wherever `phrase` has an ordinary
 * space: `part`'s own U+00A0 is normalized back to an ordinary space before the two are compared.
 */
export function matchesEmphasisPhrase(phrase: string, part: string): boolean {
  return phrase.toLowerCase() === part.replace(/ /g, " ").toLowerCase();
}

export interface EmphasisPart {
  text: string;
  emphasized: boolean;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const isWordChar = (value: string | undefined) => value !== undefined && WORD_CHAR.test(value);

/**
 * Splits `text` into plain and emphasized runs for the authored `phrases`, the one splitter every screen shares.
 * It keeps `buildEmphasisPattern`'s tolerance for a widow join's U+00A0, and it is stricter than the four stage
 * kinds' own split was in two ways the authored data already honours: a run must match its phrase's exact case
 * ("every" in "Every 10 years, every adult" marks only the second), and it must not start or end inside a word
 * ("only" never lights up inside "commonly").
 */
export function splitEmphasis(text: string, phrases: readonly (string | null | undefined)[] | null | undefined): EmphasisPart[] {
  const authored = (phrases ?? []).filter((phrase): phrase is string => String(phrase ?? '').trim().length > 0);
  // Longest first, so a phrase that begins another one never wins the alternation over it.
  const regex = buildEmphasisPattern([...authored].sort((a, b) => b.length - a.length));
  if (!text) return [];
  if (!regex) return [{ text, emphasized: false }];
  const parts: EmphasisPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(regex)) {
    const found = match[0];
    const start = match.index ?? 0;
    const end = start + found.length;
    // A widow join's no-break space, or a wrapped line, still reads as the authored phrase's single space.
    const exact = authored.includes(found.replace(/\s+/g, ' '));
    const insideWord = (isWordChar(found[0]) && isWordChar(text[start - 1]))
      || (isWordChar(found[found.length - 1]) && isWordChar(text[end]));
    if (!exact || insideWord) continue;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), emphasized: false });
    parts.push({ text: found, emphasized: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), emphasized: false });
  return parts;
}
