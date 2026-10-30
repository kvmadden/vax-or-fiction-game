import React from "react";
import { useLook } from "./look";
import { useLookPicture } from "./use-look-picture";

/**
 * The drawn set behind the stage, one per look. It mounts inside the router's stage atmosphere, under
 * every word, and reads the screen, the question kind and the room's outcome from the router's own
 * attributes in CSS, so it never needs props and never re-renders with the beat. Coordinates are the
 * 1600 by 900 wide canvas. Every color comes from a class in the look's stylesheet, never from here.
 */

const W = 1600;
const H = 900;

/** A soft light shaft from a cone tip: narrow at the source, wide and faded at the far end. */
function shaft(ox: number, oy: number, angleDeg: number, length: number, nearHalf: number, farHalf: number): string {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // Perpendicular unit vector.
  const px = -dy;
  const py = dx;
  const fx = ox + dx * length;
  const fy = oy + dy * length;
  const pts: Array<[number, number]> = [
    [ox + px * nearHalf, oy + py * nearHalf],
    [fx + px * farHalf, fy + py * farHalf],
    [fx - px * farHalf, fy - py * farHalf],
    [ox - px * nearHalf, oy - py * nearHalf],
  ];
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/* ---------------------------------------------------------------------------------------------- */
/* Studio set: marquee bulbs across the top, LED light towers down both sides, light shafts from the  */
/* two cone tips, set rings on the back wall, and a glossy stage floor with a light pool.             */
/* ---------------------------------------------------------------------------------------------- */

const BULB_Y = 22;
const BULBS = Array.from({ length: 44 }, (_, i) => 28 + i * 35.3);
const TOWER_TOP = 72;
const TOWER_BOTTOM = 748;
const TOWER_STEP = 18;
const TOWER_SEGMENTS = Array.from({ length: Math.floor((TOWER_BOTTOM - TOWER_TOP) / TOWER_STEP) }, (_, i) => TOWER_TOP + i * TOWER_STEP);
const FLOOR_Y = 772;
// The cones' own tips (preshow-stage.css): the teal one at 18% across, the orange one just past the right edge.
const TEAL_TIP = { x: W * 0.18, y: -H * 0.08 };
const ORANGE_TIP = { x: W * 1.01, y: -H * 0.08 };
const TEAL_SHAFTS = [60, 69, 78, 88];
const ORANGE_SHAFTS = [92, 102, 111, 120];
const FLOOR_LINES = Array.from({ length: 15 }, (_, i) => -560 + i * 194);

const SVG_PROPS = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid slice", focusable: "false" as const };

/**
 * One light shaft fan from a cone tip, in an SVG of its own: the blur rasterizes once, and the whole layer
 * turns on its tip as one composited element, so the sway never repaints the set.
 */
const StudioShafts: React.FC<{ side: "teal" | "orange" }> = ({ side }) => {
  const tip = side === "teal" ? TEAL_TIP : ORANGE_TIP;
  const angles = side === "teal" ? TEAL_SHAFTS : ORANGE_SHAFTS;
  const length = side === "teal" ? 1180 : 1240;
  const far = side === "teal" ? 88 : 92;
  return (
    <svg className={`look-art look-art--studio-shafts look-art--studio-shafts-${side}`} {...SVG_PROPS}>
      <defs>
        <linearGradient id={`studio-shaft-${side}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={`studio-stop studio-stop--${side}-hot`} />
          <stop offset="0.55" className={`studio-stop studio-stop--${side}-mid`} />
          <stop offset="1" className="studio-stop studio-stop--clear" />
        </linearGradient>
        <filter id={`studio-soft-${side}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <g filter={`url(#studio-soft-${side})`}>
        {angles.map((angle) => (
          <polygon key={angle} className="studio-shaft" points={shaft(tip.x, tip.y, angle, length, 6, far)} fill={`url(#studio-shaft-${side})`} />
        ))}
      </g>
    </svg>
  );
};

const StudioSet: React.FC = () => (
  <>
    {/* The back wall and the floor: static, so this layer paints once. */}
    <svg className="look-art look-art--studio" {...SVG_PROPS}>
      <defs>
        <radialGradient id="studio-pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="studio-stop studio-stop--pool" />
          <stop offset="1" className="studio-stop studio-stop--clear" />
        </radialGradient>
        <linearGradient id="studio-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="studio-stop studio-stop--floor-top" />
          <stop offset="1" className="studio-stop studio-stop--floor-bottom" />
        </linearGradient>
        <clipPath id="studio-floor-clip">
          <rect x="0" y={FLOOR_Y} width={W} height={H - FLOOR_Y} />
        </clipPath>
      </defs>

      {/* The back wall: two set rings and a soft glow behind centre stage. */}
      <g className="studio-wall">
        <ellipse className="studio-wall__glow" cx={W / 2} cy={430} rx={720} ry={380} />
        <circle className="studio-ring studio-ring--outer" cx={W / 2} cy={452} r={430} />
        <circle className="studio-ring studio-ring--inner" cx={W / 2} cy={452} r={352} />
      </g>

      {/* The stage floor: a lit lip, perspective seams, a light pool, all clipped to the floor. */}
      <g className="studio-floor">
        <rect className="studio-floor__plane" x="0" y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill="url(#studio-floor)" />
        <g clipPath="url(#studio-floor-clip)">
          {FLOOR_LINES.map((x) => (
            <line key={x} className="studio-floor__seam" x1={W / 2} y1={FLOOR_Y - 260} x2={x} y2={H + 40} />
          ))}
          <ellipse className="studio-floor__pool" cx={W / 2} cy={842} rx={600} ry={62} fill="url(#studio-pool)" />
        </g>
        <rect className="studio-floor__lip-glow" x="0" y={FLOOR_Y - 6} width={W} height={12} />
        <rect className="studio-floor__lip" x="0" y={FLOOR_Y - 1} width={W} height={2} />
      </g>
    </svg>

    <StudioShafts side="teal" />
    <StudioShafts side="orange" />

    {/* The lights: towers and the marquee. Simple shapes and no filters, so their stepped chase is cheap. */}
    <svg className="look-art look-art--studio-lights" {...SVG_PROPS}>
      <defs>
        <radialGradient id="studio-bulb-glow">
          <stop offset="0" className="studio-stop studio-stop--bulb-core" />
          <stop offset="0.35" className="studio-stop studio-stop--bulb-warm" />
          <stop offset="1" className="studio-stop studio-stop--clear" />
        </radialGradient>
      </defs>
      <g className="studio-tower studio-tower--left">
        {TOWER_SEGMENTS.map((y, i) => <rect key={y} className={`studio-tower__seg studio-tower__seg--${i % 4}`} x={14} y={y} width={30} height={10} rx={3} />)}
      </g>
      <g className="studio-tower studio-tower--right">
        {TOWER_SEGMENTS.map((y, i) => <rect key={y} className={`studio-tower__seg studio-tower__seg--${i % 4}`} x={W - 44} y={y} width={30} height={10} rx={3} />)}
      </g>
      <g className="studio-marquee">
        <rect className="studio-marquee__rail" x="10" y={BULB_Y - 9} width={W - 20} height={18} rx={9} />
        {BULBS.map((x, i) => (
          <g key={x} className={`studio-bulb studio-bulb--${i % 3}`}>
            <circle className="studio-bulb__glow" cx={x} cy={BULB_Y} r={15} fill="url(#studio-bulb-glow)" />
            <circle className="studio-bulb__core" cx={x} cy={BULB_Y} r={4.5} />
          </g>
        ))}
      </g>
    </svg>
  </>
);

/* ---------------------------------------------------------------------------------------------- */
/* Case file: a navy desk with a dot grid, and a teal folder whose tab sits under the case number.   */
/* ---------------------------------------------------------------------------------------------- */

const FOLDER = { x: 28, y: 112, w: 1544, h: 772, r: 20 };
const TAB = { x: 28, y: 30, w: 600, h: 110, r: 18 };

const CaseDesk: React.FC = () => (
  <svg className="look-art look-art--casefile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
    <defs>
      <pattern id="case-dots" width="24" height="24" patternUnits="userSpaceOnUse">
        <circle className="case-dot" cx="12" cy="12" r="1.6" />
      </pattern>
      <pattern id="case-grid" width="32" height="32" patternUnits="userSpaceOnUse">
        <path className="case-grid-line" d="M 32 0 L 0 0 0 32" />
      </pattern>
      <linearGradient id="case-folder-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="case-stop case-stop--folder-top" />
        <stop offset="1" className="case-stop case-stop--folder-bottom" />
      </linearGradient>
      <radialGradient id="case-lamp" cx="0.18" cy="0.0" r="0.9">
        <stop offset="0" className="case-stop case-stop--lamp" />
        <stop offset="1" className="case-stop case-stop--clear" />
      </radialGradient>
    </defs>

    <rect className="case-desk" x="0" y="0" width={W} height={H} />
    <rect className="case-desk__dots" x="0" y="0" width={W} height={H} fill="url(#case-dots)" />

    {/* The folder: its back panel, the tab that carries the case number, and the panel's texture. */}
    <g className="case-folder">
      <rect className="case-folder__back" x={FOLDER.x + 10} y={FOLDER.y - 10} width={FOLDER.w} height={FOLDER.h} rx={FOLDER.r} />
      <path
        className="case-folder__tab"
        d={`M ${TAB.x} ${TAB.y + TAB.h} L ${TAB.x} ${TAB.y + TAB.r} Q ${TAB.x} ${TAB.y} ${TAB.x + TAB.r} ${TAB.y} L ${TAB.x + TAB.w - 70} ${TAB.y} Q ${TAB.x + TAB.w - 52} ${TAB.y} ${TAB.x + TAB.w - 40} ${TAB.y + 16} L ${TAB.x + TAB.w} ${TAB.y + TAB.h} Z`}
      />
      <rect className="case-folder__body" x={FOLDER.x} y={FOLDER.y} width={FOLDER.w} height={FOLDER.h} rx={FOLDER.r} fill="url(#case-folder-shade)" />
      <rect className="case-folder__texture" x={FOLDER.x} y={FOLDER.y} width={FOLDER.w} height={FOLDER.h} rx={FOLDER.r} fill="url(#case-grid)" />
      <rect className="case-folder__edge" x={FOLDER.x + 1} y={FOLDER.y + 1} width={FOLDER.w - 2} height={FOLDER.h - 2} rx={FOLDER.r - 1} />
    </g>

    <rect className="case-lamp" x="0" y="0" width={W} height={H} fill="url(#case-lamp)" />

  </svg>
);

/* ---------------------------------------------------------------------------------------------- */
/* 70s game show: a slow sunburst from below the floor, a four-stripe swoosh that runs up the left  */
/* margin and along the bottom, halftone dot fields in the side gutters, and a TV prop in the lobby. */
/* ---------------------------------------------------------------------------------------------- */

const STRIPE_W = 9;
const STRIPE_GAP = 3;
const STRIPES = [0, 1, 2, 3];

/** One stripe of the swoosh: up the left margin, round the corner, along the bottom margin. */
function swoosh(i: number): string {
  const inset = 10 + i * (STRIPE_W + STRIPE_GAP) + STRIPE_W / 2;
  const x = inset;
  const y = H - inset;
  const r = 96 - i * (STRIPE_W + STRIPE_GAP);
  return `M ${x} 168 L ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} L ${W - 220 + i * 26} ${y}`;
}

const SeventiesSet: React.FC = () => (
  <svg className="look-art look-art--seventies" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
    <g className="seventies-swoosh">
      {STRIPES.map((i) => <path key={i} className={`seventies-stripe seventies-stripe--${i}`} d={swoosh(i)} strokeWidth={STRIPE_W} />)}
    </g>

    {/* The top right flash: four short stripes that close the frame over the join pill's corner. */}
    <g className="seventies-flash">
      {STRIPES.map((i) => (
        <line key={i} className={`seventies-stripe seventies-stripe--${i}`} x1={W - 300 + i * 22} y1={10 + i * (STRIPE_W + STRIPE_GAP)} x2={W - 10} y2={10 + i * (STRIPE_W + STRIPE_GAP)} strokeWidth={STRIPE_W} />
      ))}
    </g>
  </svg>
);

/**
 * The stage backdrop slot, empty in Today. The big screen asks for its picture. While the picture loads the slot
 * holds the wash alone, so the drawn set never flashes before the picture replaces it, but only for PICTURE_WAIT_MS.
 * Once the picture has decoded it fills the slot, and the calm scrim keeps the middle of the canvas, where the words
 * sit, quiet. If the picture is missing, or has not come when the wait runs out, the drawn set takes the slot. A
 * picture that arrives after that takes the slot at the next new screen or question, never mid-question
 * (use-look-picture.ts). The UI and the look's own plates stay on top either way.
 *
 * Layers, bottom to top, all inside the stage atmosphere: the wash, the slot (the picture or the drawn set),
 * then the calm hold. The topic pattern (VOF-94) is not drawn here. The screen router mounts it as the next layer of the
 * atmosphere, over this one and under the scrims, so it sits on the picture, the drawn set and Today's plain stage alike
 * and holds its own calm through the middle (src/looks/patterns/).
 */
export const LookStage: React.FC<{ format?: string }> = React.memo(({ format }) => {
  const { look } = useLook();
  // A portrait canvas is as tall as a phone, so a picture drawn for a phone fits it where a wide one would be cropped to a sliver.
  const { url: picture, status } = useLookPicture("stage", format === "portrait" ? "phone" : "stage");
  if (look === "today") return null;
  return (
    <div className="look-stage" data-look-layer={look} data-art={picture ? "ai" : status === "loading" ? "loading" : "drawn"} aria-hidden="true">
      <div className="look-stage__wash" />
      <div className="look-slot look-slot--stage" data-slot="stage-backdrop">
        {picture ? <img className="look-slot__picture" src={picture} alt="" decoding="async" /> : status === "loading" ? null : (
          <>
            {/* Two paint-only layers each look's stylesheet draws on: halftone fields, a lamp, a turning burst. */}
            <div className="look-fx look-fx--a" />
            <div className="look-fx look-fx--b" />
            {look === "studio" ? <StudioSet /> : null}
            {look === "casefile" ? <CaseDesk /> : null}
            {look === "seventies" ? <SeventiesSet /> : null}
          </>
        )}
      </div>
      {picture ? <div className="look-stage__calm" /> : null}
    </div>
  );
});

LookStage.displayName = "LookStage";

export default LookStage;
