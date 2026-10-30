/** A shared capability checked by the wire validator, reducer and phone projection. */
export function acceptsAttendeeInput(state: { interactionMode?: string; offlineMode?: boolean }): boolean {
  return state.interactionMode === 'polling' && !state.offlineMode;
}
