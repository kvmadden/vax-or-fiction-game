import React, { useId } from 'react';

type Point = readonly [number, number];

const CX = 64;
const CY = 62;
/** The die-cut edge: the white border's scallops reach this far from the centre. */
const OUTER = 57;
const BUMPS = 16;
// The fold: a line across the bottom edge, a little right of centre. Its normal points out through the lifted part,
// and it sits FOLD_AT units from the centre, clear of the words, so the peel never covers a letter.
const FOLD_NORMAL: Point = [Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)];
const FOLD_AT = 41;

// A scalloped seal around (CX, CY): sixteen bumps swinging between radius `inner` and `outer`, each one quadratic
// curve drawn through the bump's peak.
function sealCurves(inner: number, outer: number): { start: Point; control: Point; end: Point }[] {
  const at = (radius: number, angle: number): Point => [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
  return Array.from({ length: BUMPS }, (_, index) => {
    const from = (index / BUMPS) * 2 * Math.PI - Math.PI / 2;
    const to = ((index + 1) / BUMPS) * 2 * Math.PI - Math.PI / 2;
    const start = at(inner, from);
    const peak = at(outer, (from + to) / 2);
    const end = at(inner, to);
    return { start, control: [2 * peak[0] - (start[0] + end[0]) / 2, 2 * peak[1] - (start[1] + end[1]) / 2], end };
  });
}

const fixed = (point: Point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
/** How far past the fold a point sits: negative on the stuck side, positive on the lifted side. */
const past = (point: Point) => (point[0] - CX) * FOLD_NORMAL[0] + (point[1] - CY) * FOLD_NORMAL[1] - FOLD_AT;
const mirror = (point: Point): Point => {
  const by = 2 * past(point);
  return [point[0] - by * FOLD_NORMAL[0], point[1] - by * FOLD_NORMAL[1]];
};
const cross = (a: Point, b: Point): Point => {
  const t = past(a) / (past(a) - past(b));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

function sealPath(inner: number, outer: number): string {
  const curves = sealCurves(inner, outer);
  return `M${fixed(curves[0]!.start)}${curves.map(({ control, end }) => `Q${fixed(control)} ${fixed(end)}`).join('')}Z`;
}

// The stuck side of the fold, as a clip: a generous box cut along the fold line.
function stuckPath(): string {
  const box: Point[] = [[-40, -40], [168, -40], [168, 168], [-40, 168]];
  const kept: Point[] = [];
  box.forEach((point, index) => {
    const next = box[(index + 1) % box.length]!;
    if (past(point) <= 0) kept.push(point);
    if ((past(point) <= 0) !== (past(next) <= 0)) kept.push(cross(point, next));
  });
  return `M${kept.map(fixed).join('L')}Z`;
}

// The flap: the part of the outline past the fold, mirrored back across it, the way a lifted edge folds over.
function flapPath(inner: number, outer: number): string {
  const samples: Point[] = [];
  for (const { start, control, end } of sealCurves(inner, outer)) {
    for (let step = 0; step < 12; step += 1) {
      const t = step / 12;
      const u = 1 - t;
      samples.push([u * u * start[0] + 2 * u * t * control[0] + t * t * end[0], u * u * start[1] + 2 * u * t * control[1] + t * t * end[1]]);
    }
  }
  const at = (index: number) => samples[(index + samples.length) % samples.length]!;
  const first = samples.findIndex((point, index) => past(point) > 0 && past(at(index - 1)) <= 0);
  const run: Point[] = [];
  for (let offset = 0; offset < samples.length && past(at(first + offset)) > 0; offset += 1) run.push(at(first + offset));
  const edge = [cross(at(first - 1), run[0]!), ...run.map(mirror), cross(run[run.length - 1]!, at(first + run.length))];
  return `M${edge.map(fixed).join('L')}Z`;
}

const OUTLINE = sealPath(49, OUTER);
const FACE = sealPath(43, 51);
const FLAP = flapPath(49, OUTER);
// The view box is the die-cut edge itself, so the art box is exactly the sticker. Its shadow and its arrival spill
// past the box, which the recap's own styles let them do.
const VIEW_BOX = `${CX - OUTER} ${CY - OUTER} ${2 * OUTER} ${2 * OUTER}`;
const STUCK = stuckPath();

/**
 * The "Perfect round" die-cut vinyl sticker (2026-09-28), the perfect-round reward the owner picked. A gold
 * scalloped seal inside its thick white die-cut border, with a teal check badge, the words and a vinyl sheen, set
 * at a slight tilt. Its bottom edge has peeled up: folded back over itself with the white backing showing, and
 * casting a soft shadow on the face. Every colour is a token, set in perfect-round-reward.css.
 */
export const PerfectRoundSticker: React.FC = () => {
  const id = `sticker${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className="perfect-sticker" viewBox={VIEW_BOX} role="img" aria-label="Perfect round sticker" focusable="false">
      <defs>
        <linearGradient id={`${id}-face`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" className="perfect-sticker__stop perfect-sticker__stop--face-light" />
          <stop offset="0.6" className="perfect-sticker__stop perfect-sticker__stop--face" />
          <stop offset="1" className="perfect-sticker__stop perfect-sticker__stop--face-dark" />
        </linearGradient>
        <linearGradient id={`${id}-backing`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0" className="perfect-sticker__stop perfect-sticker__stop--backing" />
          <stop offset="1" className="perfect-sticker__stop perfect-sticker__stop--backing-shade" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* Everything on the stuck side of the fold. What lifted past it is drawn as the flap instead. */}
        <clipPath id={`${id}-stuck`}>
          <path d={STUCK} />
        </clipPath>
      </defs>
      <g className="perfect-sticker__body">
        <g clipPath={`url(#${id}-stuck)`}>
          <path className="perfect-sticker__shadow" d={OUTLINE} transform="translate(2 5)" filter={`url(#${id}-soft)`} />
          <path className="perfect-sticker__border" d={OUTLINE} />
          <path className="perfect-sticker__face" d={FACE} fill={`url(#${id}-face)`} />
          <circle className="perfect-sticker__ring" cx={CX} cy={CY} r="37" />
          <circle className="perfect-sticker__badge" cx={CX} cy={CY - 30} r="10" />
          <path className="perfect-sticker__badge-check" d={`M${CX - 5} ${CY - 30}l3.6 3.6 6.8-7.2`} />
          <text className="perfect-sticker__word perfect-sticker__word--small" x={CX} y={CY - 3} textAnchor="middle">PERFECT</text>
          <text className="perfect-sticker__word perfect-sticker__word--big" x={CX} y={CY + 20} textAnchor="middle">ROUND</text>
          <path className="perfect-sticker__sheen" d={`M${CX - 41} ${CY - 13}a45 45 0 0 1 41-35a52 52 0 0 0-37 40z`} />
        </g>
        <path className="perfect-sticker__flap-shadow" d={FLAP} transform="translate(0 -3)" filter={`url(#${id}-soft)`} />
        <path className="perfect-sticker__flap" d={FLAP} fill={`url(#${id}-backing)`} />
      </g>
    </svg>
  );
};

export default PerfectRoundSticker;
