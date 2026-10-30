import React, { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FormatId, StaticSlide, SlideEntry, GameMode, Venue } from "../data/types";
import { ShowChrome } from "../components/show/ShowChrome";
import { ShowFrame } from "../components/show/ShowFrame";
import { ShowWordmark } from "../components/show/ShowWordmark";
import { useRoom } from "../presentation/RoomContext";
import { useStageHudOverlap } from "../presentation/useStageHudOverlap";
import { useAudioStore } from "../engine/audio-store";
import { useGameStore } from "../store/game-store";
import { WalkinLyrics } from "./WalkinLyrics";

export interface WordmarkProps {
  className?: string;
  size?: number | string;
  style?: React.CSSProperties;
  withQuestionMark?: boolean;
}

/** Backward-compatible wordmark export retained for existing consumers. */
export const Wordmark: React.FC<WordmarkProps> = React.memo(({
  className = "",
  size,
  style = {},
  withQuestionMark = true,
}) => (
  <span
    className={`vrc-wordmark ${className}`}
    style={{
      display: "inline-flex",
      alignItems: "baseline",
      fontWeight: 700,
      letterSpacing: "-0.04em",
      lineHeight: 0.95,
      fontSize: size,
      ...style,
    }}
    aria-label="Vax or Fiction?"
    data-comp-id="wordmark"
  >
    <span style={{ color: "var(--color-vax)" }}>VAX</span>
    <span
      style={{
        margin: "0 var(--kit-space-8)",
        color: "var(--color-gold)",
        fontWeight: 700,
        fontSize: "0.68em",
        letterSpacing: "0.02em",
        verticalAlign: "middle",
      }}
    >
      OR
    </span>
    <span style={{ color: "var(--color-fiction)" }}>
      FICTION
      {withQuestionMark ? (
        <span style={{ color: "var(--color-gold)", marginLeft: "var(--kit-space-4)" }}>?</span>
      ) : null}
    </span>
  </span>
));

Wordmark.displayName = "Wordmark";

export interface TitleSlideProps {
  slide?: StaticSlide | SlideEntry;
  title?: string;
  eyebrow?: string;
  body?: string;
  questionCount?: number;
  runtimeLabel?: string;
  timerEnabled?: boolean;
  mode?: GameMode;
  format?: FormatId;
  formatId?: FormatId;
  venue?: Venue;
  showWordmark?: boolean;
  interactive?: boolean;
  onStart?: () => void;
  className?: string;
}

export const TitleSlide: React.FC<TitleSlideProps> = React.memo(({
  slide,
  title: propTitle,
  body: propBody,
  format: propFormat,
  formatId: propFormatId,
  venue,
  showWordmark = true,
  interactive = true,
  onStart,
  className = "",
}) => {
  const format: FormatId = propFormat || propFormatId || "widescreen";
  const { roomId } = useRoom();
  const shellRef = useRef<HTMLElement>(null);
  // The facilitator HUD is a viewport portal over the letterboxed canvas; the title's bottom
  // band reserves whatever it actually covers instead of guessing a clearance.
  useStageHudOverlap(shellRef, format, "--preshow-hud-overlap");
  const shouldReduceMotion = useReducedMotion();
  const musicPlaying = useAudioStore((state) => state.status === "playing" && !state.muted);
  const isCurated = useGameStore((state) => state.modeId === "curated15" || state.modeId === "curated8");
  const resolvedTitle =
    propTitle ||
    slide?.title ||
    (slide && "headline" in slide && slide.headline) ||
    "Vax or Fiction?";
  const resolvedBody =
    propBody ||
    slide?.body ||
    "Reviewed questions built to start practical conversations.";
  const joinHost = typeof window === "undefined" ? "" : window.location.host;
  const isBrandTitle = showWordmark && /^vax or fiction\??$/i.test(resolvedTitle.trim());
  const tagline = isBrandTitle
    ? "Talk it through. Let the evidence surprise you."
    : resolvedBody;

  return (
    <main
      ref={shellRef}
      className={`screen title show-screen preshow-title ${className}`}
      data-screen="title"
      data-format={format}
      data-venue={venue}
      data-comp-id="title-slide"
    >
      <ShowFrame
        scrim="center"
        className="title-show-frame"
        beat="title"
      >
        <ShowChrome roomId={roomId} joinHost={joinHost} showJoin={venue !== 'offline'}>
          {null}
        </ShowChrome>
        {/* Bands are authored top to bottom: the ready call, the wordmark, the walk-in meter.
            The title grid lays them out in this order, so reading order is the stage order. */}
        <div className="title-stage" data-role="title-copy">
          <p className="title-ready-line" data-role="title-ready">ARE YOU READY TO PLAY…</p>
          <div className="title-mark-band">
            {isBrandTitle ? (
              <h1 className="title-source-mark" aria-label="Vax or Fiction?">
                <ShowWordmark />
              </h1>
            ) : (
              <h1 className="title-source-text">{resolvedTitle}</h1>
            )}
            {venue === "room" || (isCurated && venue !== "teams") || !tagline ? null : isBrandTitle ? (
              <p className="title-source-tagline">
                <span>Talk it through.</span>
                <span>Let the evidence surprise you.</span>
              </p>
            ) : (
              <p className="title-source-tagline">{tagline}</p>
            )}
          </div>
          <footer className={`title-walkin${musicPlaying ? " is-playing" : ""}`} data-role="title-walkin">
            <WalkinLyrics />
            <span className="now-playing-bars" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <motion.span
                  key={index}
                  className="lobby-meter-bar"
                  animate={shouldReduceMotion ? undefined : { scaleY: [0.5, 1, 0.65] }}
                  transition={{ duration: 0.8 + index * 0.15, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </span>
            <span className="sr-only">{musicPlaying ? "Walk-in music is playing" : "Walk-in music is stopped"}</span>
          </footer>
        </div>
        {interactive && onStart ? (
          <button className="opening-screen-action facilitator-press" type="button" onClick={onStart}>
            Start Session
          </button>
        ) : null}
      </ShowFrame>
    </main>
  );
});

TitleSlide.displayName = "TitleSlide";

export default TitleSlide;
