/**
 * The room wire's bounds on authored emphasis (content/editorial/emphasis.json): the phrase lists a question, a
 * reveal and a closing recap may carry. src/network/guards.ts reads these, server/room-relay.mjs keeps a plain-JS
 * copy, and the production relay holds the same numbers in vof_relay.valid_phrase_list and vof_relay.valid_reveal
 * (supabase/migrations/20260929140000_vax_or_fiction_production_relay_emphasis_reply.sql).
 * tests/integration/production-relay-db.test.mjs proves the three surfaces agree at every edge.
 *
 * The shipped bank peaks at 2 phrases of 32 characters, so each bound leaves about four times that room. Lengths count
 * code points, the way Postgres char_length does, so a phrase with an astral character measures the same on all three.
 *
 * Lives on its own, like src/engine/streak-bonus-bound.ts, so the phone bundle's guards import only these numbers.
 */
export const MAX_WIRE_PHRASES = 8;
export const MAX_WIRE_PHRASE_LENGTH = 128;
/** The closing recap sends one phrase list per takeaway line, and buildClosingRecap sends three. */
export const MAX_WIRE_TAKEAWAY_LINES = 16;

export function isWirePhraseList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_WIRE_PHRASES && value.every((phrase) => {
    if (typeof phrase !== 'string') return false;
    const length = Array.from(phrase).length;
    return length >= 1 && length <= MAX_WIRE_PHRASE_LENGTH;
  });
}

export function isWireLineEmphasis(value: unknown): value is string[][] {
  return Array.isArray(value) && value.length <= MAX_WIRE_TAKEAWAY_LINES && value.every(isWirePhraseList);
}

/**
 * What the host puts on the wire for one text's phrases: the list itself when it has any and fits the bounds, and
 * nothing otherwise. The marks only decorate the text, so a list that would not fit is dropped rather than risking a
 * refused room state, and the every-deck sweep in tests/unit/network-projection.test.ts keeps shipped content from
 * ever losing its marks this way.
 */
export function wirePhrases(phrases: readonly string[] | null | undefined): string[] | undefined {
  return phrases?.length && isWirePhraseList(phrases) ? [...phrases] : undefined;
}
