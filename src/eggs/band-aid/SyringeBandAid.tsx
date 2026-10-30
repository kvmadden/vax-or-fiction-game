import React from 'react';

/**
 * The band-aid the landing syringe wears after five quick taps (2026-09-28). An svg nested inside the syringe's own
 * svg, so it rides the syringe's tilt and its idle jab without any second transform to keep in step. Placed in the
 * syringe's coordinates (viewBox -5 -5 80 238, barrel x 16 to 54 and y 40 to 174), across the middle of the barrel
 * and wider than it. No slogan and no emblem: a gold fabric strip with a small check print on its ends and a cream
 * pad, the owner's pick. Every colour is a token, set in band-aid-egg.css.
 */
export interface SyringeBandAidProps {
  /** `on` slaps it on with a squash and settle. `peeling` lifts it off. */
  phase: 'on' | 'peeling';
}

// The strip in its own 120 x 44 box, drawn 110 syringe units wide, centred on the barrel (x 35, y 107).
const WIDTH = 110;
const HEIGHT = (WIDTH * 44) / 120;
const X = 35 - WIDTH / 2;
const Y = 107 - HEIGHT / 2;

// The check print: three small ticks on each end, staggered like a printed fabric.
const CHECKS: readonly (readonly [number, number])[] = [[15, 15], [28, 17], [21, 29], [92, 15], [105, 17], [98, 29]];

export const SyringeBandAid: React.FC<SyringeBandAidProps> = ({ phase }) => (
  <svg
    className="syringe-band-aid"
    data-role="syringe-band-aid"
    data-phase={phase}
    x={X}
    y={Y}
    width={WIDTH}
    height={HEIGHT}
    viewBox="0 0 120 44"
    overflow="visible"
    aria-hidden="true"
    focusable="false"
  >
    <g className="syringe-band-aid__slap">
      {/* The shadow it casts on the barrel: the same strip, dropped and softened, under everything else. */}
      <rect className="syringe-band-aid__shadow" x="3" y="6" width="116" height="38" rx="19" />
      <rect className="syringe-band-aid__body" x="2" y="3" width="116" height="38" rx="19" />
      <rect className="syringe-band-aid__sheen" x="12" y="6.5" width="96" height="4.5" rx="2.25" />
      {CHECKS.map(([x, y]) => <path key={`${x}-${y}`} className="syringe-band-aid__check" d={`M${x - 3.6} ${y}l2.8 2.8 5.4-5.8`} />)}
      <rect className="syringe-band-aid__pad" x="40" y="8" width="40" height="28" rx="5" />
      <rect className="syringe-band-aid__pad-shade" x="40" y="29" width="40" height="7" rx="3.5" />
    </g>
  </svg>
);

export default SyringeBandAid;
