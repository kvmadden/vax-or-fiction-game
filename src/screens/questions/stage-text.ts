import type { FormatId, QuestionKind } from "../../data/types";

export type TallyPlacement = "beside" | "below" | "hidden" | "none";

/**
 * STAGE-SPEC pass 4b (4B-W4, spec 3.5): the one shared reader for "where does this rail's tally
 * zone live", replacing the four near-identical `const dataTally = !polling ? 'none' : format ===
 * 'widescreen' ? 'beside' : 'below'` copies that used to live one per kind component (binary,
 * estimate, myth, which-patient), each free to drift from the others. The reservation rule itself
 * is judgment call 10 (spec 3.5): "by play mode, not by beat". `hidden` is which-patient's own
 * ruling (spec 5.5, 3 or 4 answers on portrait), passed in rather than decided here, since only
 * that one kind carries it.
 */
export function tallyPlacement(kind: QuestionKind, format: FormatId, polling: boolean, hidden = false): TallyPlacement {
  if (hidden) return "hidden";
  if (!polling) return "none";
  if (kind === "binary") return "below";
  return format === "widescreen" ? "beside" : "below";
}

// STAGE-SPEC pass 4b (F8, F13, spec 4.5): shared text helpers for two orphan defects an
// independent designer's own critique found on real rendered content: a wrapped last line down to
// a single word, and a compound word breaking at its own internal hyphen. Both are text-shape
// fixes at the string the kind components already render, not a layout rule, so they live here
// instead of in a stylesheet that never sees the string.

/**
 * Compound words an independent designer's own critique named as breaking badly at their own
 * internal hyphen (F8). Kept as a short, named list rather than a general no-hyphen-breaks rule:
 * most authored hyphens are legitimate break points that spec 4.5's own `text-wrap: pretty` already
 * handles, and only this one has been measured to leave an orphan word behind.
 */
const KEEP_COMPOUNDS = ["flu-like"];

/**
 * Splits text on the known keep-compound words, marking each match so a caller can wrap it in a
 * `.keep-compound` (white-space: nowrap) span, F8's exact fix, without disturbing the rest of the
 * sentence around it.
 */
export function splitKeepCompounds(text: string): Array<{ text: string; keepTogether: boolean }> {
  if (!text) return [];
  const escaped = KEEP_COMPOUNDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  return text
    .split(regex)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, keepTogether: KEEP_COMPOUNDS.includes(part) }));
}
