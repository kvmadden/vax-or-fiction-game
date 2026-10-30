import React from "react";
import { useBandAidEgg } from "../../eggs/band-aid/useBandAidEgg";

export interface ShowWordmarkProps {
  compact?: boolean;
  /** The stage title's stacked three-row mark (VAX / — OR — / FICTION?). Sized by the surface's font-size. */
  stacked?: boolean;
  /**
   * The landing page's Easter egg (2026-09-28): five quick taps on the syringe slap a band-aid on it, and a tap on
   * the band-aid peels it off. Off by default, so the other screens that draw this mark never carry it.
   */
  bandAidEgg?: boolean;
}

/**
 * The classic show's syringe glyph (public/classic wordmark path, stroke 7 in a 70x228 box): a barrel with
 * three tick marks, a plunger and a needle. Inline so the stage draws the same mark the classic drew; the
 * surface's `.show-wordmark__syringe` rule still sizes, colours and rotates it.
 */
const SYRINGE_PATH = "M15 0h40M35 0v40M5 40h60M16 40v112q0 22 19 22t19-22V40M35 174v54M16 70h20M16 97h20M16 124h20";

export const ShowWordmark: React.FC<ShowWordmarkProps> = React.memo(({
  compact = false,
  stacked = false,
  bandAidEgg = false,
}) => {
  const egg = useBandAidEgg(bandAidEgg);
  return (
    <span
      className={`show-wordmark${compact ? " show-wordmark--compact" : ""}${stacked ? " show-wordmark--stacked" : ""}`}
      data-show-wordmark
      aria-label="Vax or Fiction?"
      {...egg.rootProps}
    >
      <span className="show-wordmark__vax">
        {/* The letters carry the gradient and the glow on their own, so no filter ever sits over the
            syringe's jab. A filter over a moving child repaints its blur every frame, which held the
            title beat near 11 frames a second wherever the browser paints without a GPU. */}
        <span className="show-wordmark__vax-glyphs">VAX</span>
        <svg
          className="show-wordmark__syringe"
          viewBox="-5 -5 80 238"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d={SYRINGE_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {egg.bandAid}
        </svg>
        {egg.target}
      </span>
      <span className="show-wordmark__or">OR</span>
      <span className="show-wordmark__fiction">
        <span>FICTION</span>
        <span className="show-wordmark__question">?</span>
      </span>
    </span>
  );
});

ShowWordmark.displayName = "ShowWordmark";

export default ShowWordmark;
