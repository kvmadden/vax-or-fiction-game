import React, { type ReactNode } from "react";
import type { AtmosphericBeat } from "../../design/theme";

export type ShowScrim = "left" | "center";

export interface ShowFrameProps {
  layout?: "show" | "editorial";
  scrim: ShowScrim;
  children: ReactNode;
  className?: string;
  beat?: AtmosphericBeat;
}

/**
 * Stage frame chrome: scrim + lights markers (suppressed inside ScreenRouter;
 * the persistent .stage-atmosphere sibling owns the visible field) and the
 * readable safe area. No photographic plates. No motif art.
 */
export const ShowFrame: React.FC<ShowFrameProps> = React.memo(({
  layout = "show",
  scrim,
  children,
  className,
  beat = "setup",
}) => {
  return (
    <section
      className={`show-frame ${className ?? ""}`}
      data-show-frame
      data-artwork="none"
      data-layout={layout}
      data-beat={beat}
    >
      <div className={`show-scrim show-scrim--${scrim}`} aria-hidden="true" />
      <div className="show-lights" aria-hidden="true" />
      <div className="show-safe">{children}</div>
    </section>
  );
});

ShowFrame.displayName = "ShowFrame";

export default ShowFrame;
