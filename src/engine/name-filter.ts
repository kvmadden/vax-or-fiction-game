/**
 * A small, conservative display-name filter (DEF-32). Player names reach the projector
 * unmoderated (the leaderboard, and anywhere else the stage prints a name), so a name containing
 * a flagged word is shown as a neutral fallback instead. The join itself never fails: this only
 * changes what gets displayed, never whether someone can play.
 *
 * Matching is whole-word only, so a word hidden inside a longer innocent word (Scunthorpe,
 * Cockburn, Hancock, assessment) passes unchanged, and ordinary first names are kept off the list
 * on purpose to keep false positives low.
 */

/** Shown in place of any display name that trips the filter below. */
export const NEUTRAL_FALLBACK_NAME = 'Player';

// Short and curated on purpose. General profanity plus a small set of severe slurs, whole-word
// matched only, with common first names deliberately left off (for example "Dick" stays a name).
const FLAGGED_WORDS = new Set([
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'ass', 'asshole', 'cock', 'pussy',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'whore', 'slut', 'twat',
]);

/** The name NFC-normalized and lowercased, before any substitution. Every substitution below swaps one
 * character for one, so an index into either string points at the same place in the other. */
function asTyped(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/**
 * NFC-normalizes first (W8: a decomposed accent, such as a combining mark from a name pasted in NFD
 * form, must read the same as its precomposed spelling), then lowercases and applies only the
 * substitutions named in DEF-32: 0 for o, 1 or ! for i, 3 for e, @ for a.
 */
function normalizeForMatch(text: string): string {
  return asTyped(text)
    .replace(/0/g, 'o')
    .replace(/[1!]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/@/g, 'a');
}

/**
 * W8: `[a-z]+` treated any accented letter as a word boundary, so "Ana Fagúndez", "Assía" and
 * "Cocké" left an ASCII-only fragment ("fag", "ass", "cock") behind that collided with a flagged
 * word even though the real word never matches one. `\p{L}+` tokenizes on Unicode letters instead,
 * so an accented name is one whole word again.
 */
function containsFlaggedWord(name: string): boolean {
  const typed = asTyped(name);
  const normalized = normalizeForMatch(name);
  for (const match of normalized.matchAll(/\p{L}+/gu)) {
    const word = match[0];
    if (!FLAGGED_WORDS.has(word)) continue;
    if (word === 'ass' && titleExemptionHolds(typed, normalized, match.index + word.length)) continue;
    return true;
  }
  return false;
}

/**
 * W8, narrowed by B4: "Ass" alone still trips the filter, and so does any flagged word before a
 * period, an apostrophe or a possessive ("Fag.", "Bitch's"). The one exemption is a title built on
 * "ass": 't ending the word, with either apostrophe since an iPhone types the curly one ("Ass't
 * Manager"), or a period followed by a space and another word ("Ass. Mgr"). It reads the name as
 * typed, so a symbol the substitutions turn into a letter ("Ass. !") is not a word, and a combining
 * accent after the t continues the word the way a letter does.
 */
const ASS_TITLE_ABBREVIATION = /^(?:['’]t(?![\p{L}\p{M}])|\.\s+\p{L})/u;

/**
 * NAME-ASS-HOLE: the exemption holds only while "ass" joined to the next word is not itself on the list,
 * so "Ass. Mgr" and "Ass't Manager" pass while "Ass. Hole" and "Ass't Hole" do not. The next word is the
 * first run of letters after the abbreviation, read after the substitutions like every other word here.
 * `end` is where "ass" ends, the same place in both strings.
 */
function titleExemptionHolds(typed: string, normalized: string, end: number): boolean {
  if (!ASS_TITLE_ABBREVIATION.test(typed.slice(end))) return false;
  const nextWord = normalized.slice(end).replace(/^['’]t/u, '').match(/^[^\p{L}]*(\p{L}+)/u)?.[1];
  return !nextWord || !FLAGGED_WORDS.has(`ass${nextWord}`);
}

/**
 * Returns the display name unchanged, or NEUTRAL_FALLBACK_NAME if any whole word in it (after the
 * substitutions above) matches the curated list. Never returns empty and never rejects the name.
 * The caller still records the join.
 */
export function filteredDisplayName(rawName: string): string {
  return containsFlaggedWord(rawName) ? NEUTRAL_FALLBACK_NAME : rawName;
}
