import { parseLook, type LookId } from "../looks/look";

/**
 * Phones follow the host's look and its topic pattern switch (VOF-93 and VOF-94) through two optional keys of the public
 * room state, `look` and `patterns`. The host adds them in host-live-link.ts and the room phone reads them through
 * `readRoomLook` in PhoneSuite.tsx. Nothing else knows about them but the three validators that must agree: guards.ts, the
 * dev relay in server/room-relay.mjs and the production SQL.
 *
 * The production relay lists the keys a room state may carry (vof_relay.valid_room_state) and refuses the whole state when it
 * sees one it does not list. The owner approved the additive migration that lists these two on 2026-10-02
 * (supabase/migrations/20261002140000_vax_or_fiction_production_relay_room_look.sql), and it goes first in the release, the
 * order VOF-84 set, with no live room, since a phone tab on an older build also refuses a state with a key it does not know.
 *
 * Two fallbacks keep a room working whenever the keys do not arrive:
 * - A phone that gets no key, or a look this build does not know, shows Today with topic patterns on, because it finds the
 *   topic from the question itself.
 * - A host whose relay refuses its first state with the keys (a production relay before the migration, or one rolled back)
 *   takes them off and publishes plain states until its next reconnect (host-live-link.ts), so the room never stalls. The reason the relay
 *   gives is also the one for a stale revision, which a host alone in its room never causes. Two hosts on one room could, and
 *   the keys would then stay off until the next reconnect, which only means phones show Today with patterns on.
 */

/** The reason the production relay gives a host for a room state it will not take: invalid, or no newer than the one it holds. */
export const ROOM_STATE_REFUSED = "Invalid or stale room state";

/** The two optional keys of the room state. */
export interface RoomLookKeys {
  look?: string;
  patterns?: boolean;
}

/** The keys a host adds to its room state: the look it wears and whether topic patterns draw. */
export function roomLookKeys(pick: { look: LookId; patterns: boolean }): RoomLookKeys {
  return { look: pick.look, patterns: pick.patterns };
}

/** Where the host's live link gets the keys and learns the pick changed, so a test can hand it a source of its own. */
export interface RoomLookSource {
  keys(): RoomLookKeys;
  /** Calls `listener` whenever the pick changes. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/** What a phone takes from a room state: the look it knows, or null, and the switch, or null when the room says nothing. */
export function readRoomLook(state: { look?: unknown; patterns?: unknown } | null | undefined): { look: LookId | null; patterns: boolean | null } {
  return { look: parseLook(state?.look), patterns: typeof state?.patterns === "boolean" ? state.patterns : null };
}
