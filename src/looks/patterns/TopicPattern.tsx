import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PATTERN_FAMILIES, type PatternFamilyId } from "./families";
import { familyForStatement } from "./topic-map";
import "./patterns.css";

/**
 * The topic pattern layer (VOF-94): the question's topic as a soft engraved texture behind every word, on the big
 * screen and on the phone. It reads only the question's statement, so it draws once per question and never with the
 * beat. The tile is a mask in public/pattern-art/<family>.webp and takes its ink and strength from patterns.css, so
 * the tile carries no colour of its own and every look tints it.
 *
 * This module, its stylesheet and the index of questions load only when a question first needs them (see
 * TopicPatternSlot), and a family's tile loads only when a question of that family is asked. A tile that is still
 * loading draws nothing and keeps the layer already on screen, so a pattern never pops in half drawn. A tile that
 * will not load, or that has not come within a few seconds, lets the layer on screen leave and leaves the question
 * exactly as it was. The next question asks for the tile again.
 */

/** The big screen, a phone, or the sample question on the setup Look screen (LookSample.tsx). */
type Surface = "stage" | "phone" | "preview";

/** How long a layer takes to arrive and to leave. */
const ENTER_MS = 900;
const LEAVE_MS = 420;
/** How long a question's tile may take before the layer already on screen leaves without it. The tile still draws if it arrives later. */
const STALL_MS = 2500;

const tileUrl = (family: PatternFamilyId) => `${(import.meta.env?.BASE_URL ?? "/").replace(/\/?$/, "/")}pattern-art/${family}.webp`;

/** The tiles this page has decoded, so a layer that comes back shows on its first frame. A failure is never remembered. */
const decoded = new Set<PatternFamilyId>();
/** The tiles on their way, so two questions of one family asking in quick succession share one request. */
const inFlight = new Map<PatternFamilyId, Promise<boolean>>();

function loadTile(family: PatternFamilyId): Promise<boolean> {
  if (decoded.has(family)) return Promise.resolve(true);
  if (typeof Image === "undefined") return Promise.resolve(false);
  const pending = inFlight.get(family);
  if (pending) return pending;
  const request = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const ok = image.naturalWidth > 0;
      if (ok) decoded.add(family);
      resolve(ok);
    };
    image.onerror = () => resolve(false);
    image.src = tileUrl(family);
  }).finally(() => {
    inFlight.delete(family);
  });
  inFlight.set(family, request);
  return request;
}

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Where a layer stands: drawing now, or leaving while the next one comes in. */
interface Layer {
  id: number;
  family: PatternFamilyId;
  leaving: boolean;
}

interface PatternLayerProps {
  layer: Layer;
  surface: Surface;
  onGone: (id: number) => void;
}

/**
 * One layer on screen. It fades in when it arrives. When its question has gone it fades out from wherever the fade-in had
 * reached, so a question that is replaced in the middle of its arrival never jumps to full strength on the way out. Both
 * fades are animations of the page's own, not of the stylesheet, because only the page knows how far the first one got.
 * With reduced motion there is no fade at all, and the stylesheet hides a layer that is leaving at once.
 */
const PatternLayer: React.FC<PatternLayerProps> = ({ layer, surface, onGone }) => {
  const node = useRef<HTMLDivElement>(null);
  const arriving = useRef<Animation | null>(null);
  const leaveFrom = useRef<number | null>(null);

  // The arrival starts before the first paint, so the layer is never seen at full strength for a frame.
  useLayoutEffect(() => {
    const element = node.current;
    if (!element || typeof element.animate !== "function" || reducedMotion()) return undefined;
    const easing = getComputedStyle(element).getPropertyValue("--kit-ease").trim() || "ease-out";
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_MS, easing });
    arriving.current = animation;
    return () => {
      animation.cancel();
    };
  }, []);

  useLayoutEffect(() => {
    if (!layer.leaving) return undefined;
    const element = node.current;
    let leave: Animation | undefined;
    if (element && typeof element.animate === "function" && !reducedMotion()) {
      // Read once, so the departure always starts from where the arrival had reached, even if this effect ever runs again for the same layer.
      if (leaveFrom.current === null) {
        const reached = Number.parseFloat(getComputedStyle(element).opacity);
        leaveFrom.current = Number.isFinite(reached) ? reached : 1;
      }
      arriving.current?.cancel();
      leave = element.animate([{ opacity: leaveFrom.current }, { opacity: 0 }], { duration: LEAVE_MS, easing: "ease-in", fill: "forwards" });
    }
    const timer = window.setTimeout(() => onGone(layer.id), LEAVE_MS);
    return () => {
      window.clearTimeout(timer);
      leave?.cancel();
    };
  }, [layer.leaving, layer.id, onGone]);

  return (
    <div
      ref={node}
      className="topic-pattern"
      data-family={layer.family}
      data-surface={surface}
      data-leaving={layer.leaving || undefined}
      aria-hidden="true"
    >
      <div className="topic-pattern__hold">
        <div
          className="topic-pattern__tile"
          style={{ ["--pattern-tile" as string]: `url("${tileUrl(layer.family)}")`, ["--pattern-scale" as string]: PATTERN_FAMILIES[layer.family].scale }}
        />
      </div>
    </div>
  );
};

export interface TopicPatternProps {
  surface: Surface;
  /** The question's statement, or nothing between questions. */
  statement?: string | null;
}

export const TopicPattern: React.FC<TopicPatternProps> = React.memo(({ surface, statement }) => {
  const wanted = useMemo(() => familyForStatement(statement), [statement]);
  const key = statement ?? null;
  // A tile starts loading when a question of its family is asked. The page's record of decoded tiles is read while rendering,
  // so the layer draws on the very frame the tile is ready, and a settled load only asks for a new render.
  const [, announce] = useState(0);
  // The question whose tile would not load or has not come in time. The next question asks for the tile again, so one bad moment
  // on the network costs one question and not the rest of the game, and a tile that arrives late still draws.
  const [gaveUpFor, setGaveUpFor] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted || decoded.has(wanted)) return undefined;
    let alive = true;
    const stalled = window.setTimeout(() => {
      if (alive) setGaveUpFor(key);
    }, STALL_MS);
    void loadTile(wanted).then((ok) => {
      if (!alive) return;
      window.clearTimeout(stalled);
      if (ok) announce((count) => count + 1);
      else setGaveUpFor(key);
    });
    return () => {
      alive = false;
      window.clearTimeout(stalled);
    };
  }, [wanted, key]);
  // The family to draw: null for none (no question, or a tile that will not load), undefined while its tile is still loading.
  const ready = !wanted ? null : decoded.has(wanted) ? wanted : gaveUpFor === key ? null : undefined;

  // The layers on screen. A new family fades in while the one before it fades out, and no family at all fades the last one out.
  // This is derived from `ready` while rendering, so there is no frame in between.
  const [layers, setLayers] = useState<Layer[]>([]);
  const [shown, setShown] = useState<PatternFamilyId | null | undefined>(undefined);
  if (ready !== undefined && ready !== shown) {
    setShown(ready);
    setLayers((current) => {
      const leaving = current.map((layer) => ({ ...layer, leaving: true }));
      return ready === null ? leaving : [...leaving, { id: (current.at(-1)?.id ?? 0) + 1, family: ready, leaving: false }];
    });
  }
  const gone = useCallback((id: number) => setLayers((current) => current.filter((layer) => layer.id !== id)), []);

  return (
    <>
      {layers.map((layer) => (
        <PatternLayer key={layer.id} layer={layer} surface={surface} onGone={gone} />
      ))}
    </>
  );
});

TopicPattern.displayName = "TopicPattern";

export default TopicPattern;
