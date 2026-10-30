import { useEffect, useState } from "react";
import { LOOKS, pictureUrl, useLook, type ArtSurface } from "./look";
import { onLookBeat } from "./look-beat";
import { useBeforePaint } from "./use-before-paint";

/**
 * How long a surface holds the wash alone for its picture before it gives up waiting and shows the drawn set. A
 * request that stalls on slow venue Wi-Fi never fails and never finishes, so without this wait the big screen would
 * sit on a bare wash for as long as the page was open.
 */
export const PICTURE_WAIT_MS = 4000;

/**
 * Where a surface's picture stands:
 * - `off`: no picture was asked for (Today, or a surface whose art is the drawn set).
 * - `loading`: asked for, not decoded yet, and the wait is not over. The surface shows its wash and nothing else, so
 *   the drawn set never flashes up for a moment before the picture replaces it.
 * - `ready`: decoded, so it can show.
 * - `late`: the wait ran out, so the drawn set shows. If the picture still arrives it is taken at the page's next beat
 *   (see look-beat.ts) and never in the middle of a question, or at once if the host picks that look.
 * - `failed`: the file is missing or will not decode (the dev server and the host both answer a missing file with
 *   the app page). The drawn set stays for as long as the page holds this look, so a picture is never required and
 *   never arrives in the middle of a question.
 */
export type PictureStatus = "off" | "loading" | "ready" | "late" | "failed";

/** The pictures this page has decoded, so a remount knows on its first frame. A failure is never remembered, so a later mount tries again. */
const decoded = new Set<string>();
const loading = new Map<string, Promise<boolean>>();

function load(url: string): Promise<boolean> {
  const known = loading.get(url);
  if (known) return known;
  const settled = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const ok = image.naturalWidth > 0;
      if (ok) decoded.add(url);
      loading.delete(url);
      resolve(ok);
    };
    image.onerror = () => {
      loading.delete(url);
      resolve(false);
    };
    image.src = url;
  });
  loading.set(url, settled);
  return settled;
}

/**
 * Starts every look's picture for a surface, so a pick made a moment later finds it decoded and the new look never
 * shows a bare wash. Setup calls this when the look picker opens.
 */
export function preloadLookPictures(surface: ArtSurface): void {
  if (typeof Image === "undefined") return;
  for (const info of LOOKS) {
    const url = pictureUrl(info.id, surface);
    if (url) void load(url);
  }
}

/**
 * The picture for a surface and where it stands. While a picture is `ready` it also marks the root,
 * `data-look-art-stage` or `data-look-art-phone`, before paint, so the plates under that surface's small words come
 * on in the same frame as the picture. `asset` names which file shape the surface wears, when it is not its own.
 */
export function useLookPicture(surface: ArtSurface, asset: ArtSurface = surface): { url: string | null; status: PictureStatus } {
  const { look, stageArt, phoneArt } = useLook();
  const art = surface === "stage" ? stageArt : phoneArt;
  // `asset` is the file's shape. The portrait stage canvas is as tall as a phone, so it wears the phone's picture.
  const url = art === "ai" ? pictureUrl(look, asset) : null;
  // Only a settled load asks for a new render. Whether a picture decoded is read from the page's own record.
  const [, announce] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  // The picture whose wait ran out, and the one of those that has since been taken at a beat.
  const [late, setLate] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  // The picture this surface last asked for. When the host's pick changes it to a picture that is already here, that swap is
  // one the host chose, so the picture is taken in this very render and the drawn set is never committed for a frame first.
  const [lastUrl, setLastUrl] = useState(url);
  if (lastUrl !== url) {
    setLastUrl(url);
    if (url && decoded.has(url)) setTaken(url);
  }

  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    if (decoded.has(url)) {
      // It is already here, so nothing is loaded. It may have decoded after this render drew the wash, as a preload the picker
      // started can, and nothing else would ask for the render that shows it. Taking it asks for that render.
      void Promise.resolve().then(() => {
        if (alive) setTaken(url);
      });
      return () => {
        alive = false;
      };
    }
    const giveUp = setTimeout(() => {
      if (alive) setLate(url);
    }, PICTURE_WAIT_MS);
    void load(url).then((ok) => {
      if (!alive) return;
      clearTimeout(giveUp);
      if (ok) announce((count) => count + 1);
      else setFailed(url);
    });
    return () => {
      alive = false;
      clearTimeout(giveUp);
    };
  }, [url]);

  // A picture that arrives after the wait is held until the page's next beat, so it never lands in the middle of a question.
  const arrived = url !== null && decoded.has(url);
  const held = arrived && late === url && taken !== url;
  const status: PictureStatus = url === null ? "off" : arrived && !held ? "ready" : failed === url ? "failed" : late === url ? "late" : "loading";
  const shown = status === "ready" ? url : null;

  useEffect(() => {
    if (!url || !held) return undefined;
    return onLookBeat(() => setTaken(url));
  }, [url, held]);

  useBeforePaint(() => {
    if (!shown) return undefined;
    const root = document.documentElement;
    const attribute = `data-look-art-${surface}`;
    root.setAttribute(attribute, "ai");
    return () => root.removeAttribute(attribute);
  }, [shown, surface]);

  return { url: shown, status };
}
