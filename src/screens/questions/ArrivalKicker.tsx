import React from "react";
import { ARRIVAL_KICKER } from "../../engine/room-flavor";

/**
 * Game night's arrival line (VOF-89 call 16), directly above the stem on every kind. It is flavor,
 * never the ask: the question-type kicker in the header (VOF-05) and the stem keep the lead, so this
 * line is never larger than the type kicker and far smaller than the stem. It lands with the question
 * and bows out once the room is voting (game-night.css), on the posed beat only. Its box stays, so the
 * stem never moves when it leaves.
 * A span, not a paragraph: it is a kicker, and the stage's paragraph rules (the order stem's hide rules,
 * the sweep's scenario text floor) are written for scenario text. The rollout suite holds its size and
 * its place instead (tests/integration/flavor-rollout.test.mjs).
 */
export const ArrivalKicker: React.FC = () => (
  <span className="stage-arrival-kicker" data-role="arrival-kicker" aria-hidden="true">{ARRIVAL_KICKER}</span>
);
