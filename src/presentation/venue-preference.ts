import type { Venue } from '../data/types';

const STORAGE_PREFIX = 'vof:presentation-venue:';
const VALID_VENUES: readonly Venue[] = ['teams', 'room', 'offline'];

export interface VenuePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserSessionStorage(): VenuePreferenceStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function normalizedRoomId(roomId: string): string {
  return roomId.trim() || 'default-room';
}

export function presentationVenueStorageKey(roomId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(normalizedRoomId(roomId))}`;
}

export function readPresentationVenue(
  roomId: string,
  storage: VenuePreferenceStorage | undefined = browserSessionStorage(),
): Venue {
  if (!storage) return 'teams';
  try {
    const stored = storage.getItem(presentationVenueStorageKey(roomId));
    return VALID_VENUES.includes(stored as Venue) ? stored as Venue : 'teams';
  } catch {
    return 'teams';
  }
}

export function writePresentationVenue(
  roomId: string,
  venue: Venue,
  storage: VenuePreferenceStorage | undefined = browserSessionStorage(),
): void {
  if (!storage || !VALID_VENUES.includes(venue)) return;
  try {
    storage.setItem(presentationVenueStorageKey(roomId), venue);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
