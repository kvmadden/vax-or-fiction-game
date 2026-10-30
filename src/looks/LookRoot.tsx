import React, { useEffect, useMemo, useState } from "react";
import { LookContext, lookValue, type LookId } from "./look";
import { useBeforePaint } from "./use-before-paint";

/**
 * How long a page that starts on a look waits for the look's stylesheets before it shows Today and carries on. A
 * request that hangs on slow venue Wi-Fi never fails and never finishes, so without this wait the host's page
 * (setup and all) and every phone would stay blank until it did.
 */
export const LOOK_STYLES_WAIT_MS = 1500;

/**
 * The drawn looks' stylesheets load the first time a page wears a look other than Today (see looks-styles.ts).
 * A node render has no stylesheet to wait for. A failed load is remembered, so the page falls back to Today instead
 * of waiting on a file that is not coming.
 */
let stylesLoaded = typeof window === "undefined";
let stylesFailed = false;
let stylesRequest: Promise<void> | null = null;

function loadLookStyles(): Promise<void> {
  stylesRequest ??= import("./looks-styles").then(
    () => {
      stylesLoaded = true;
    },
    (error: unknown) => {
      stylesRequest = null;
      stylesFailed = true;
      throw error;
    },
  );
  return stylesRequest;
}

/**
 * Puts one look in force for everything under it. It marks the root with `data-look`, which every look stylesheet
 * scopes itself by, and hands the same look to the components that draw the set, the reveal art and the picture
 * slots. Today puts no mark on the root at all, so a page in Today is exactly what it was. A page that mounts no
 * root, such as solo play and the site pages, reads Today and carries no art. `patterns` says whether topic patterns
 * draw behind the questions (on unless the page says otherwise), and it follows the look's own page: the host's switch
 * on the big screen, and the flag or the room on a phone.
 *
 * Until the stylesheets for a look have loaded the page keeps the look it had, which is Today at the start, and then
 * switches in one step, so no page ever shows a look without its styles. A page that starts on a look waits for
 * its styles before it shows anything, so it never flashes Today first, but only for LOOK_STYLES_WAIT_MS. If the
 * styles are not there by then the page shows Today and switches to the look when they arrive, so it is never blank.
 */
export const LookRoot: React.FC<{ look: LookId; patterns?: boolean; children?: React.ReactNode }> = ({ look, patterns, children }) => {
  const [, announce] = useState(0);
  // Released once the first load has settled or its wait has run out, so a page that starts on a look shows nothing
  // until then, and a pick made later in setup never unmounts the page.
  const [released, setReleased] = useState(look === "today" || stylesLoaded);

  useEffect(() => {
    if (look === "today" || stylesLoaded) return undefined;
    let alive = true;
    const settle = () => {
      if (!alive) return;
      setReleased(true);
      announce((count) => count + 1);
    };
    // Running out of the wait releases the page on Today. The load keeps going, and settle switches to the look then.
    const waited = setTimeout(() => {
      if (alive) setReleased(true);
    }, LOOK_STYLES_WAIT_MS);
    loadLookStyles().then(settle, settle);
    return () => {
      alive = false;
      clearTimeout(waited);
    };
  }, [look]);

  const ready = look === "today" || stylesLoaded;
  const applied: LookId = ready ? look : "today";
  const value = useMemo(() => lookValue(applied, typeof window === "undefined" ? "" : window.location.search, patterns), [applied, patterns]);

  useBeforePaint(() => {
    if (applied === "today") return undefined;
    const root = document.documentElement;
    root.dataset.look = applied;
    return () => {
      delete root.dataset.look;
    };
  }, [applied]);

  if (!released && !ready && !stylesFailed) return null;
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
};

export default LookRoot;
