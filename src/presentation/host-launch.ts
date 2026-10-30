/** Built-in Preflight quick setups the host URL may name. */
import type { Venue } from '../data/types';
import { ROOM_CURATED15_TIMER_SECONDS } from '../network/presenter-remote';

export const HOST_PRESET_IDS = ['curated8', 'curated8-room', 'curated15', 'curated15-room', 'standard', 'huddle', 'classroom', 'rehearsal'] as const;
export type HostPresetId = (typeof HOST_PRESET_IDS)[number];

export type HostLaunchAction =
  | { type: 'APPLY_PRESET'; presetId: Exclude<HostPresetId, 'curated15-room' | 'curated8-room'>; venue?: Venue; timerSeconds?: number }
  | { type: 'SELECT_MODE'; modeId: string; venue?: Venue; timerSeconds?: number };

function isHostPresetId(value: string): value is HostPresetId {
  return (HOST_PRESET_IDS as readonly string[]).includes(value);
}

const VENUES: readonly Venue[] = ['teams', 'room', 'offline'];

export function parseHostVenue(value: string | null | undefined): Venue | undefined {
  const venue = (value ?? '').trim().toLowerCase();
  return VENUES.includes(venue as Venue) ? venue as Venue : undefined;
}

/**
 * In-room launches should hear Smile after the first presenter gesture.
 * Teams and Offline stay muted until the host unmutes (VOF-25).
 */
export function hostLaunchPrefersAudibleWalkin(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const venue = parseHostVenue(params.get('venue'));
  if (venue === 'teams' || venue === 'offline') return false;
  if (venue === 'room') return true;
  return hostLaunchFromSearch(search)?.venue === 'room';
}

/**
 * One-click host query.
 *   `?preset=curated15` — in-room Curated 15, phone voting, 30s timer
 *   `?preset=curated15&venue=room` — same, explicit
 *   `?preset=curated15-room` — same alias
 *   `?preset=curated15&venue=teams` — Teams + phone voting (authored 20s timer)
 * Other `?mode=` values select that authored pace and leave runtime toggles alone.
 */
export function hostLaunchFromSearch(search: string): HostLaunchAction | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const venue = parseHostVenue(params.get('venue'));
  const preset = (params.get('preset') ?? '').trim();
  if (preset && isHostPresetId(preset)) {
    const presetId = preset === 'curated15-room' ? 'curated15' : preset === 'curated8-room' ? 'curated8' : preset;
    const isCurated = presetId === 'curated15' || presetId === 'curated8';
    const isCuratedRoomAlias = preset === 'curated15-room' || preset === 'curated8-room';
    const resolvedVenue = isCuratedRoomAlias
      ? 'room'
      : venue ?? (isCurated ? 'room' : undefined);
    const timerSeconds = isCurated && resolvedVenue === 'room' ? ROOM_CURATED15_TIMER_SECONDS : undefined;
    return { type: 'APPLY_PRESET', presetId, ...(resolvedVenue ? { venue: resolvedVenue } : {}), ...(timerSeconds ? { timerSeconds } : {}) };
  }
  const mode = (params.get('mode') ?? '').trim();
  if (!mode) return null;
  if (mode === 'curated15' || mode === 'curated8') {
    const resolvedVenue = venue ?? 'room';
    const timerSeconds = resolvedVenue === 'room' ? ROOM_CURATED15_TIMER_SECONDS : undefined;
    return { type: 'APPLY_PRESET', presetId: mode, venue: resolvedVenue, ...(timerSeconds ? { timerSeconds } : {}) };
  }
  return { type: 'SELECT_MODE', modeId: mode, ...(venue ? { venue } : {}) };
}

/** Host launch from the page's query string. */
export function hostLaunchFromLocation(search: string): HostLaunchAction | null {
  return hostLaunchFromSearch(search);
}

/** Alias for host launch resolution */
export const resolveHostLaunchParameters = hostLaunchFromSearch;

/**
 * FAC-10: the private controller-pairing QR may only auto-open on first paint when the launch is
 * actually landing in the room. A Teams (or Offline) show must never auto-open it, because anyone
 * watching a screen share could scan a QR that was never meant to leave the presenter's hands. A bare
 * `?preset=curated15`/`?mode=curated15` (no venue) resolves its own venue to 'room' already, so this
 * keeps it auto-opening without checking presetId directly.
 */
export function shouldAutoOpenPresenterPairing(launch: HostLaunchAction | null): boolean {
  return Boolean(launch && launch.venue === 'room');
}

