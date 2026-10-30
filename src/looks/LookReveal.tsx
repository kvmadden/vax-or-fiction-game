import React from "react";
import { STAMP_WORDS, useLook } from "./look";

/**
 * Reveal art for the drawn looks. Small pieces, all decoration (aria-hidden), and all absent in today's look:
 * - LookRevealBackdrop shares the result card's grid cell, behind the card: the studio's sunburst and bulb
 *   frame, the 70s burst. It never sits under a word, because the card face is opaque.
 * - LookRevealMark sits in the card's own flow, after the verdict, so it takes its own room and can never
 *   land on a word: the case file's stamp (a binary verdict) or its marker ring and rosette.
 */

interface RevealArtProps {
  kind: string;
  /** "fiction" for a false binary, "vax" for a true one, "gold" for every other kind. */
  tone: string;
  outcome: "right" | "wrong" | null;
}

const BURST_POINTS = 18;

/** Glint positions round the board's centre (640, 640 in a 1280 box): x, y and size, kept to the sides. */
const GLINTS: Array<[number, number, number]> = [
  [140, 520, 30], [96, 668, 18], [188, 790, 24],
  [1140, 500, 26], [1192, 650, 34], [1094, 800, 18],
];

/** A starburst outline for the 70s badge: alternating outer and inner radii around a centre. */
function starburst(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    out.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return out.join(" ");
}

export const LookRevealBackdrop: React.FC<RevealArtProps> = ({ kind, tone, outcome }) => {
  const { look } = useLook();
  if (look !== "studio" && look !== "seventies") return null;
  // A span, not a div: the stage hides any aria-hidden div that sits directly in a question screen.
  return (
    <span className="look-reveal-backdrop" data-kind={kind} data-tone={tone} data-room-outcome={outcome ?? "none"} aria-hidden="true">
      <span className="look-sunburst" />
      {look === "studio" && outcome === "right" ? (
        // Glints either side of the board for a room that called it, in the open air left and right of the card.
        <svg className="look-glints" viewBox="0 0 1280 1280" focusable="false">
          {GLINTS.map(([x, y, r], i) => (
            <path key={i} className={`look-glint look-glint--${i % 3}`} d={`M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z`} />
          ))}
        </svg>
      ) : null}
      {look === "seventies" ? (
        <svg className="look-starburst" viewBox="0 0 1000 1000" focusable="false">
          <polygon className="look-starburst__back" points={starburst(500, 500, 500, 404, BURST_POINTS)} />
          <polygon className="look-starburst__front" points={starburst(500, 500, 470, 386, BURST_POINTS)} />
        </svg>
      ) : null}
    </span>
  );
};

/** A gold prize rosette for a room that called it: scalloped disc, two ribbon tails, no words. */
const Rosette: React.FC = () => (
  <svg className="look-rosette" viewBox="0 0 120 170" focusable="false">
    <path className="look-rosette__tail look-rosette__tail--left" d="M 44 92 L 22 166 L 40 152 L 54 168 L 66 96 Z" />
    <path className="look-rosette__tail look-rosette__tail--right" d="M 76 92 L 98 166 L 80 152 L 66 168 L 54 96 Z" />
    <polygon className="look-rosette__ruff" points={starburst(60, 60, 58, 48, 16)} />
    <circle className="look-rosette__disc" cx="60" cy="60" r="38" />
    <circle className="look-rosette__ring" cx="60" cy="60" r="30" />
  </svg>
);

/**
 * Sits right after the verdict, inside the card's copy. A binary verdict gets the stamp, in flow under the
 * word. An estimate's number gets a marker ring drawn round it, clear of its glyphs. A sentence verdict
 * (the better reply, the myth, the order) gets neither.
 */
export const LookRevealMark: React.FC<RevealArtProps> = ({ kind, tone, outcome }) => {
  const { look } = useLook();
  if (look !== "casefile" || (kind !== "binary" && kind !== "estimate")) return null;
  const binary = kind === "binary";
  return (
    <span className="look-reveal-mark" data-kind={kind} data-tone={tone} data-room-outcome={outcome ?? "none"} aria-hidden="true">
      {binary ? (
        // The show's own pair: a false claim is fiction, a true one is fact. The answer word on the card stays TRUE or FALSE.
        <span className="look-stamp" data-look-text>
          <span className="look-stamp__word">{tone === "fiction" ? STAMP_WORDS.fiction : STAMP_WORDS.fact}</span>
        </span>
      ) : (
        // A number is circled in marker, never stamped: a modelled estimate is the answer, not a certainty.
        <svg className="look-marker-ring" viewBox="0 0 600 260" preserveAspectRatio="none" focusable="false">
          <path className="look-marker-ring__stroke" pathLength={1} d="M 300 18 C 470 14 588 64 584 132 C 580 206 450 246 292 244 C 132 242 14 204 18 130 C 22 62 140 22 316 26 C 400 28 468 40 520 62" />
        </svg>
      )}
    </span>
  );
};

/**
 * One answer's share of the room as a bar a look fills to its width or height. It renders only in a drawn look,
 * so today's markup is exactly what it was. Every look hides it outside the wide stage.
 */
export const LookShareBar: React.FC = () => {
  const { look } = useLook();
  if (look === "today") return null;
  return (
    <i className="look-bar" aria-hidden="true">
      <i className="look-bar__fill" />
    </i>
  );
};

/** The case file's prize rosette, pinned to the card's edge, only when the room called it. */
export const LookRevealRibbon: React.FC<RevealArtProps> = ({ outcome }) => {
  const { look } = useLook();
  if (look !== "casefile" || outcome !== "right") return null;
  return (
    <span className="look-reveal-ribbon" aria-hidden="true">
      <Rosette />
    </span>
  );
};
