import type { LookStorage } from "../look";

/**
 * Whether topic patterns draw behind the questions (VOF-94). They are on by default in every look, Today included,
 * and the host can turn them off in setup, beside the look picker. Which a page shows is decided in one place per
 * surface, the way the look is (look.ts):
 * - The host page takes the URL flag `&pattern=on` or `&pattern=off` first (a testing override at load), then the
 *   switch this device remembered, then on. A switch made in setup applies at once and is the only thing remembered.
 *   The flag is never written to the device, so a test link cannot change a host's next game.
 * - A phone takes the URL flag, then what the room state carries (the host's switch, in the optional `patterns` key), then on.
 *   A phone never reads the host's remembered switch. A room that carries none, because the host or the relay sends none, shows
 *   patterns on a phone, since it finds the topic from the question itself.
 */

export const DEFAULT_PATTERNS = true;
export const REMEMBERED_PATTERNS_KEY = "vof:topic-patterns";

function parsePatterns(value: unknown): boolean | null {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase();
  return word === "on" ? true : word === "off" ? false : null;
}

/** The `&pattern=` testing flag in a query string (`on` or `off`), or null when it is absent or says neither. */
export function patternFlag(search: string): boolean | null {
  try {
    return parsePatterns(new URLSearchParams(search).get("pattern"));
  } catch {
    return null;
  }
}

function browserStorage(): LookStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The switch this device's host set for an earlier game, or null when none was set or storage is blocked. Leave
 * `storage` out to use the browser's own, or pass null for none.
 */
export function readRememberedPatterns(storage: LookStorage | null = browserStorage()): boolean | null {
  if (!storage) return null;
  try {
    return parsePatterns(storage.getItem(REMEMBERED_PATTERNS_KEY));
  } catch {
    return null;
  }
}

export function rememberPatterns(on: boolean, storage: LookStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(REMEMBERED_PATTERNS_KEY, on ? "on" : "off");
  } catch {
    // Storage can be blocked in a private window. The switch still applies for this page.
  }
}

/** Whether a question has asked for the pattern layer: it has before, or patterns are on and one is on screen now. */
export function askedFor(asked: boolean, patterns: boolean, statement: string | null): boolean {
  return asked || (patterns && Boolean(statement));
}

/**
 * Whether the layer is mounted. Once a question has asked it stays mounted between questions, so it can fade out with the
 * screen. A quiet viewer (one who asks for less transparency or forced colours, quiet-viewer.ts) never sees the layer, so
 * it is not mounted, and nothing of it is fetched, for them.
 */
export function layerMounted(asked: boolean, patterns: boolean, quiet: boolean = false): boolean {
  return patterns && asked && !quiet;
}

/** The host page's setting at load: the flag, then the remembered switch, then on. */
export function resolveHostPatterns(sources: { flag: boolean | null; remembered: boolean | null }): boolean {
  return sources.flag ?? sources.remembered ?? DEFAULT_PATTERNS;
}

/** A phone's setting: the flag, then what the room state carries, then on. The host's remembered switch is never read. */
export function resolvePhonePatterns(sources: { flag: boolean | null; room: boolean | null }): boolean {
  return sources.flag ?? sources.room ?? DEFAULT_PATTERNS;
}
