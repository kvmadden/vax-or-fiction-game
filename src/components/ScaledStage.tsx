import React, { useLayoutEffect, useMemo, useState, useRef, ReactNode } from "react";
import { FormatId } from "../data/types";
import { computeScale, FORMAT_DIMENSIONS } from "../engine/scaler";
import { useGameStore } from "../store/game-store";

interface ScaledStageProps {
  format?: FormatId;
  children: ReactNode;
  className?: string;
  announcementText?: string;
  topOffset?: number;
}

export const ScaledStage: React.FC<ScaledStageProps> = React.memo(({ 
  format = "widescreen", 
  children,
  className = "",
  announcementText: propAnnouncementText,
  topOffset = 0,
}) => {
  // MOT-VQA-03: computed lazily so the first render already carries the real scale instead of a
  // hardcoded 1 that snaps after mount (a measured 0.125 layout shift). SSR has no window, so it
  // falls back to 1 there exactly as before. The browser always re-measures via useLayoutEffect
  // below, so this is a best first guess, not the source of truth.
  const [scale, setScale] = useState<number>(() => (
    typeof window === "undefined" ? 1 : computeScale(window.innerWidth, window.innerHeight, format)
  ));
  const container = useRef<HTMLDivElement>(null);
  const storeSlideIndex = useGameStore((s) => s.slideIndex);
  const storeRun = useGameStore((s) => s.run);

  const stageAnnouncement = useMemo(() => {
    if (propAnnouncementText !== undefined) return "";
    if (!Array.isArray(storeRun) || storeSlideIndex < 0 || storeSlideIndex >= storeRun.length) return "";

    const slide: any = storeRun[storeSlideIndex];
    if (!slide) return "";

    // Leave question slide announcements exclusively to Question.tsx to avoid dual-region double-speaking.
    const isQuestion = slide.type === "question" || Boolean(slide.statement) || Boolean(slide.kind);
    if (isQuestion) return "";

    const rawTitle = slide.title || slide.headline || slide.type || "Slide";
    const cleanTitle = String(rawTitle).trim().replace(/\.+$/, "");
    return `${cleanTitle}.`;
  }, [storeSlideIndex, storeRun, propAnnouncementText]);

  useLayoutEffect(() => {
    const handleResize = () => {
      const element = container.current;
      setScale(computeScale(element?.clientWidth ?? window.innerWidth, element?.clientHeight ?? window.innerHeight, format));
    };

    // Initial scale computation
    handleResize();

    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(handleResize);
    if (container.current) observer.observe(container.current);
    return () => { window.removeEventListener("resize", handleResize); observer.disconnect(); };
  }, [format]);

  const dimensions = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.widescreen;
  const effectiveAnnouncement = propAnnouncementText !== undefined ? propAnnouncementText : stageAnnouncement;

  return (
    <div 
      ref={container}
      data-format={format}
      className={`scaled-stage-container ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100vw",
        height: `calc(100dvh - 96px - ${topOffset}px)`,
        marginTop: topOffset > 0 ? `${topOffset}px` : undefined,
        overflow: "clip",
        backgroundColor: "var(--color-stage-deep)",
        ['--stage-aspect-ratio' as string]: `${dimensions.width} / ${dimensions.height}`,
      }}
    >
      {/* Dynamic aria-live status region for screen readers (WCAG 4.1.3 / A11Y-04 / JUDGE-A06) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {effectiveAnnouncement}
      </div>
      <div style={{ width: dimensions.width * scale, height: dimensions.height * scale, position: "relative", flexShrink: 0 }}>
      <div
        className="scaled-stage-content"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          left: 0,
          top: 0,
          ['--stage-scale' as string]: scale,
        }}
      >
        {children}
      </div>
      </div>
    </div>
  );
});

ScaledStage.displayName = "ScaledStage";

export default ScaledStage;
