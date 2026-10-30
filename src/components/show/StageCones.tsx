import React from "react";

/**
 * The show's two spotlight cones (VOF-88, the flavor specimen's Game night cones), for surfaces
 * outside the stage router: the landing page and the site pages get the calm end of the level.
 * The router's own stage atmosphere mounts the full-strength pair itself.
 */
export const StageCones: React.FC<{ calm?: boolean }> = ({ calm = false }) => (
  <div className={`stage-cones${calm ? " stage-cones--calm" : ""}`} aria-hidden="true">
    <span className="stage-cone stage-cone--vax" />
    <span className="stage-cone stage-cone--fiction" />
  </div>
);
