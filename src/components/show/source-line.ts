import type { Citation } from "../../data/types";

/** The stage source line: an org and an optional verified month, never a clipped citation title. */
export interface SourceLine {
  org: string;
  verified: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SOURCE_ORG_MAX_CHARS = 40;

/** "2026-09-09" / "2026-08" / "August 2026" -> "Sep 2026" / "Aug 2026" / "Aug 2026"; anything else passes through. */
export function formatVerifiedMonth(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    return month ? `${month} ${iso[1]}` : iso[1]!;
  }
  const named = raw.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.find((candidate) => named[1]!.toLowerCase().startsWith(candidate.toLowerCase()));
    return month ? `${month} ${named[2]}` : raw;
  }
  return raw;
}

/** Cut a long org line at a word boundary under the cap, never with an ellipsis (VOF-02: no clipped audience text). */
function clampOrg(text: string): string {
  const clean = text.trim();
  if (clean.length <= SOURCE_ORG_MAX_CHARS) return clean;
  const cut = clean.slice(0, SOURCE_ORG_MAX_CHARS);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > 12 ? cut.slice(0, boundary) : cut).replace(/[\s·:,;-]+$/, "");
}

/**
 * The stage source line from structured fields first (publisher + verified/accessed date), falling back to the
 * display label's leading "ORG · ..." segment and a trailing "verified <date>" if the label carries one.
 */
export function describeSource(sourceLabel: string | undefined, citation?: Citation | null): SourceLine | null {
  const label = String(sourceLabel ?? "").trim();
  const publisher = String(citation?.publisherLabel ?? citation?.publisher ?? "").trim();
  const verifiedFromCitation = formatVerifiedMonth(citation?.lastVerified ?? citation?.accessedDate);
  if (publisher) return { org: clampOrg(publisher), verified: verifiedFromCitation };
  if (!label) return null;
  const verifiedInLabel = label.match(/\bverified\s+([A-Za-z]+\.?\s+\d{4}|\d{4}-\d{2}(?:-\d{2})?)\s*$/i);
  const head = verifiedInLabel ? label.slice(0, verifiedInLabel.index).replace(/[\s·]+$/, "") : label;
  const org = clampOrg(head.split(/\s+[·|]\s+/)[0] || head || label);
  return { org, verified: verifiedInLabel ? formatVerifiedMonth(verifiedInLabel[1]) : verifiedFromCitation };
}
