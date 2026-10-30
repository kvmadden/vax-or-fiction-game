import React from "react";
import { thumbUrl, type LookId } from "./look";

/**
 * A look's card in setup shows a still of the look's real stage posing the sample question, so the four cards compare the
 * looks the way the room will see them. The stills are made from the running app (scripts/capture-look-thumbs.mjs) at
 * twice the card's size on a 1920 wide screen. A still is decoration only (aria-hidden), and the radio it sits in is what
 * names the look. A still that will not load leaves the frame's navy base, and the name and the line still say which
 * look it is.
 */
export const LookThumb: React.FC<{ look: LookId }> = React.memo(({ look }) => (
  <span className="look-thumb" data-thumb={look} aria-hidden="true">
    <img className="look-thumb__picture" src={thumbUrl(look)} alt="" decoding="async" width={432} height={243} />
  </span>
));

LookThumb.displayName = "LookThumb";

export default LookThumb;
