/**
 * Presenter key sheet contents. A plain module (no components) so the lists can be imported by the
 * help sheet, tests and any future surface without tripping fast-refresh boundaries.
 */

export interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
}

/**
 * A11Y-18: the sheet shows raw arrow glyphs as plain text, so a screen reader has nothing to say for
 * them. Every other key already reads its own letter or word. Only the two arrows need a name.
 */
export function arrowKeyAccessibleName(key: string): string | undefined {
  if (key === "→") return "Right arrow";
  if (key === "←") return "Left arrow";
  return undefined;
}

/**
 * PRES-06/07: five keys run the show. Everything else stays reachable behind "More" so the sheet a
 * presenter opens mid-question is five lines in show typography, not seventeen cards in three columns.
 */
export const PRIMARY_SHORTCUTS: ShortcutItem[] = [
  { keys: ["Space"], label: "Lock, then reveal", description: "First press locks the votes, second press reveals, then moves on." },
  { keys: ["→", "←"], label: "Next / back", description: "Same beat as Space. Left steps back." },
  { keys: ["L"], label: "Lock now", description: "Close voting without revealing." },
  { keys: ["T"], label: "Timer", description: "Put the countdown on the stage and every phone." },
  { keys: ["H"], label: "Controls", description: "Show or hide the presenter bar." },
];

export const MORE_SHORTCUTS: ShortcutItem[] = [
  { keys: ["Enter"], label: "Reveal now", description: "Skip the lock beat and show the answer." },
  { keys: ["R"], label: "Restart timer", description: "Back to full time and counting." },
  { keys: ["P"], label: "Pause / resume", description: "Hold the countdown." },
  { keys: ["+"], label: "Add time", description: "Fifteen more seconds." },
  { keys: ["D"], label: "Discussion timer", description: "Holds the parked talk-timer switch. The timer is not on stage yet." },
  { keys: ["S"], label: "Skip", description: "Move past this question without scoring it." },
  { keys: ["K"], label: "Park", description: "Flag this question for later." },
  { keys: ["M"], label: "Mute", description: "Sound on or off." },
  { keys: ["F"], label: "Full screen", description: "In or out." },
  { keys: ["Shift", "R"], label: "Restart run", description: "Asks before it does anything." },
  { keys: ["?"], label: "This sheet", description: "Open or close it." },
  { keys: ["Esc"], label: "Close", description: "Close this sheet or leave full screen." },
];
