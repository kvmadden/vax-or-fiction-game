import type { InteractionMode, Venue } from "../data/types";

/**
 * Phones can vote only on a live venue with polling on.
 * Hands-up (facilitator) and Offline stay off, including after a remount.
 */
export function phonesCanVote(venue: Venue, interactionMode: InteractionMode): boolean {
  return venue !== "offline" && interactionMode === "polling";
}
