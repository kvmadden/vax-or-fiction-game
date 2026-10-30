import { createContext, useContext } from "react";
import { DEFAULT_PATTERNS } from "./patterns/pattern-setting";

/**
 * Show looks (VOF-93). The host picks one in setup: Today, Studio set, Case file or 70s game show. Today is the
 * default for a first game, carries no art, and is what every phone, solo round and site page shows. The three
 * other looks are CSS layers scoped by `data-look` on the root plus small drawn SVG pieces, and each has a
 * picture on the big screen.
 *
 * Which look a page shows is decided in one place per surface:
 * - The host page takes the URL flag `?look=` first (a testing override at load), then the pick this device
 *   remembered, then Today. A pick made in setup applies at once and is the only thing remembered. The flag is
 *   never written to the device, so a test link cannot change a host's next game.
 * - A phone takes the URL flag, then the look the room state carries, then Today. The room state carries the host's look
 *   only once the production relay allows the key (network/room-look.ts), and until then a phone shows Today. A phone
 *   never reads the host's remembered pick, and a phone that does not know a look always falls back to Today.
 * - Solo and every other page show Today.
 *
 * Topic patterns (VOF-94) ride in the same context: `patterns` says whether the question's topic draws as a soft
 * texture behind the words. They are on in every look, Today included, and the host can switch them off in setup
 * (see patterns/pattern-setting.ts). Today carries no picture, and the topic pattern is not one.
 *
 * `&art=` is the second testing flag. With no flag the big screen shows its picture and a phone shows the drawn
 * set. `&art=ai` puts pictures on both and `&art=drawn` puts the drawn set on both. A picture only takes over
 * once it has decoded, so a missing file leaves the drawn look exactly as it was.
 */
export type LookId = "today" | "studio" | "casefile" | "seventies";
export type ArtChoice = "drawn" | "ai";
/** Where a picture goes: the big screen's stage canvas, or a phone's backdrop. */
export type ArtSurface = "stage" | "phone";

export interface LookInfo {
  id: LookId;
  /** The name the host reads in setup. */
  label: string;
  /** One plain line under the name. */
  line: string;
}

export const DEFAULT_LOOK: LookId = "today";

export const LOOKS: readonly LookInfo[] = [
  { id: "today", label: "Today", line: "The navy show you know" },
  { id: "studio", label: "Studio set", line: "A TV studio with marquee lights" },
  { id: "casefile", label: "Case file", line: "Evidence tags and a stamped verdict" },
  { id: "seventies", label: "70s game show", line: "Stripes, sunbursts and chunky tiles" },
];

/** The words on a Case file stamp: a false claim is fiction and a true one is fact. The answer word on the card stays TRUE or FALSE. */
export const STAMP_WORDS = { fiction: "FICTION", fact: "FACT" } as const;

export function lookLabel(look: LookId): string {
  return LOOKS.find((info) => info.id === look)?.label ?? LOOKS[0]!.label;
}

/** A look id from loose text, or null when it names no look. Case and surrounding space do not matter. */
export function parseLook(value: unknown): LookId | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return LOOKS.find((info) => info.id === id)?.id ?? null;
}

function parseArt(value: unknown): ArtChoice | null {
  if (typeof value !== "string") return null;
  const choice = value.trim().toLowerCase();
  return choice === "ai" || choice === "drawn" ? choice : null;
}

function param(search: string, name: string): string | null {
  try {
    return new URLSearchParams(search).get(name);
  } catch {
    return null;
  }
}

/** The `?look=` testing flag in a query string, or null when it is absent or names no look. */
export function lookFlag(search: string): LookId | null {
  return parseLook(param(search, "look"));
}

/** The `&art=` testing flag in a query string (`ai` or `drawn`), or null. */
export function artFlag(search: string): ArtChoice | null {
  return parseArt(param(search, "art"));
}

/** Pictures on the big screen, the drawn set on phones, unless the flag says otherwise for both. */
export function artFor(surface: ArtSurface, flag: ArtChoice | null): ArtChoice {
  if (flag) return flag;
  return surface === "stage" ? "ai" : "drawn";
}

/* ---- The pick this device remembers ---------------------------------------------------------------- */

export const REMEMBERED_LOOK_KEY = "vof:show-look";

export interface LookStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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
 * The look this device's host picked for an earlier game, or null when none was picked or storage is blocked.
 * Leave `storage` out to use the browser's own, or pass null for none.
 */
export function readRememberedLook(storage: LookStorage | null = browserStorage()): LookId | null {
  if (!storage) return null;
  try {
    return parseLook(storage.getItem(REMEMBERED_LOOK_KEY));
  } catch {
    return null;
  }
}

export function rememberLook(look: LookId, storage: LookStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(REMEMBERED_LOOK_KEY, look);
  } catch {
    // Storage can be blocked in a private window. The pick still applies for this page.
  }
}

/** The host page's look at load: the flag, then the remembered pick, then Today. */
export function resolveHostLook(sources: { flag: LookId | null; remembered: LookId | null }): LookId {
  return sources.flag ?? sources.remembered ?? DEFAULT_LOOK;
}

/**
 * A phone's look: the flag, then the look the room state carries (null when it carries none or one this build does not
 * know), then Today. The host's remembered pick is never consulted on a phone.
 */
export function resolvePhoneLook(sources: { flag: LookId | null; room?: LookId | null }): LookId {
  return sources.flag ?? sources.room ?? DEFAULT_LOOK;
}

/* ---- What a page's components read ----------------------------------------------------------------- */

/** The look in force for one page and how each surface gets its art. */
export interface LookValue {
  look: LookId;
  stageArt: ArtChoice;
  phoneArt: ArtChoice;
  /** Whether the question's topic draws as a soft pattern behind the words. */
  patterns: boolean;
}

export function lookValue(look: LookId, search: string, patterns: boolean = DEFAULT_PATTERNS): LookValue {
  const flag = artFlag(search);
  return { look, stageArt: artFor("stage", flag), phoneArt: artFor("phone", flag), patterns };
}

/** Outside a look root every component reads Today, so an unwrapped page, a solo round and a site page carry no picture. Topic patterns stay on. */
export const TODAY_VALUE: LookValue = { look: "today", stageArt: "drawn", phoneArt: "drawn", patterns: DEFAULT_PATTERNS };

export const LookContext = createContext<LookValue>(TODAY_VALUE);

export function useLook(): LookValue {
  return useContext(LookContext);
}

/** The file for a look's picture on one surface, under the site's base path. Only a drawn look has one. */
export function pictureUrl(look: LookId, surface: ArtSurface, base: string = import.meta.env?.BASE_URL ?? "/"): string | null {
  if (look === "today") return null;
  return `${base.replace(/\/?$/, "/")}look-art/${look}-${surface}.webp`;
}

/**
 * The still a look's card shows in setup: the look's real stage posing the sample question, under the site's base path.
 * Every look has one, Today included. scripts/capture-look-thumbs.mjs makes them from the running app.
 */
export function thumbUrl(look: LookId, base: string = import.meta.env?.BASE_URL ?? "/"): string {
  return `${base.replace(/\/?$/, "/")}look-thumbs/${look}.webp`;
}
