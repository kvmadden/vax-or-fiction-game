import React from "react";
import { useLook } from "./look";
import { useLookPicture } from "./use-look-picture";

/**
 * The phone's backdrop slot, inside PhoneBackdrop, under the phone's own contrast scrim, and empty in Today.
 * It is drawn in code for each look. A phone shows the drawn set unless the page asks for pictures with `&art=ai`,
 * and then `/look-art/<look>-phone.webp` (9:16) takes its place once it has decoded, with the wash alone while it loads
 * and for no longer than PICTURE_WAIT_MS. A picture that arrives after that waits for a beat the phone's page does not
 * announce (look-beat.ts), so the phone keeps its drawn set until its backdrop next mounts.
 * Coordinates are a 390 by 844 phone. The art anchors to the top and covers wider and taller screens.
 */

const PW = 390;
const PH = 844;
const PHONE_BULBS = Array.from({ length: 12 }, (_, i) => 16 + i * 32.5);
// Slim LED towers in the 16px gutters, from under the bar to the floor lip.
const PHONE_TOWER = Array.from({ length: 34 }, (_, i) => 92 + i * 20);

const StudioPhone: React.FC = () => (
  <svg className="look-art look-art--studio-phone" viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMin slice" focusable="false">
    <defs>
      <radialGradient id="studio-phone-bulb">
        <stop offset="0" className="studio-stop studio-stop--bulb-core" />
        <stop offset="0.35" className="studio-stop studio-stop--bulb-warm" />
        <stop offset="1" className="studio-stop studio-stop--clear" />
      </radialGradient>
      <linearGradient id="studio-phone-shaft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="studio-stop studio-stop--teal-hot" />
        <stop offset="1" className="studio-stop studio-stop--clear" />
      </linearGradient>
      <linearGradient id="studio-phone-shaft-orange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="studio-stop studio-stop--orange-hot" />
        <stop offset="1" className="studio-stop studio-stop--clear" />
      </linearGradient>
      <filter id="studio-phone-soft" x="-30%" y="-10%" width="160%" height="120%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
    </defs>
    <g filter="url(#studio-phone-soft)" className="studio-phone-shafts">
      <polygon className="studio-shaft" points="60,-20 74,-20 260,640 120,640" fill="url(#studio-phone-shaft)" />
      <polygon className="studio-shaft" points="330,-20 344,-20 300,640 160,640" fill="url(#studio-phone-shaft-orange)" />
    </g>
    <g className="studio-tower studio-tower--left">
      {PHONE_TOWER.map((y, i) => <rect key={y} className={`studio-tower__seg studio-tower__seg--${i % 4}`} x="3" y={y} width="8" height="12" rx="2" />)}
    </g>
    <g className="studio-tower studio-tower--right">
      {PHONE_TOWER.map((y, i) => <rect key={y} className={`studio-tower__seg studio-tower__seg--${i % 4}`} x={PW - 11} y={y} width="8" height="12" rx="2" />)}
    </g>
    <rect className="studio-floor__lip-glow" x="0" y={PH - 64} width={PW} height="10" />
    <rect className="studio-floor__lip" x="0" y={PH - 60} width={PW} height="2" />
    <g className="studio-marquee">
      <rect className="studio-marquee__rail" x="4" y="2" width={PW - 8} height="14" rx="7" />
      {PHONE_BULBS.map((x, i) => (
        <g key={x} className={`studio-bulb studio-bulb--${i % 3}`}>
          <circle className="studio-bulb__glow" cx={x} cy="9" r="11" fill="url(#studio-phone-bulb)" />
          <circle className="studio-bulb__core" cx={x} cy="9" r="3.4" />
        </g>
      ))}
    </g>
  </svg>
);

const CasePhone: React.FC = () => (
  <svg className="look-art look-art--casefile-phone" viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMin slice" focusable="false">
    <defs>
      <pattern id="case-phone-dots" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle className="case-dot" cx="9" cy="9" r="1.3" />
      </pattern>
    </defs>
    <rect className="case-desk" x="0" y="0" width={PW} height={PH} />
    <rect className="case-desk__dots" x="0" y="0" width={PW} height={PH} fill="url(#case-phone-dots)" />
    <path className="case-folder__tab" d={`M 0 26 L 150 26 Q 162 26 170 38 L 182 58 L 0 58 Z`} />
    <rect className="case-folder__body" x="0" y="50" width={PW} height={PH - 50} rx="0" />
    <rect className="case-folder__edge" x="0.5" y="50.5" width={PW - 1} height={PH - 51} rx="0" />
  </svg>
);

const SeventiesPhone: React.FC = () => (
  <svg className="look-art look-art--seventies-phone" viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMin slice" focusable="false">
    <g className="seventies-phone-band">
      {[0, 1, 2, 3].map((i) => <rect key={i} className={`seventies-band seventies-band--${i}`} x="0" y={i * 6} width={PW} height="5" />)}
    </g>
    <g className="seventies-phone-band seventies-phone-band--bottom">
      {[0, 1, 2, 3].map((i) => <rect key={i} className={`seventies-band seventies-band--${3 - i}`} x="0" y={PH - 24 + i * 6} width={PW} height="5" />)}
    </g>
  </svg>
);

export const LookPhoneArt: React.FC = React.memo(() => {
  const { look } = useLook();
  const { url: picture, status } = useLookPicture("phone");
  if (look === "today") return null;
  return (
    <div className="look-phone" data-look-layer={look} data-art={picture ? "ai" : status === "loading" ? "loading" : "drawn"} aria-hidden="true">
      <div className="look-slot look-slot--phone" data-slot="phone-backdrop">
        {picture ? <img className="look-slot__picture" src={picture} alt="" decoding="async" /> : status === "loading" ? null : (
          <>
            <div className="look-fx look-fx--a" />
            <div className="look-fx look-fx--b" />
            {look === "studio" ? <StudioPhone /> : null}
            {look === "casefile" ? <CasePhone /> : null}
            {look === "seventies" ? <SeventiesPhone /> : null}
          </>
        )}
      </div>
      {picture ? <div className="look-phone__calm" /> : null}
    </div>
  );
});

LookPhoneArt.displayName = "LookPhoneArt";

export default LookPhoneArt;
