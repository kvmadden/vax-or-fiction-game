import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FormatId, InteractionMode, Venue } from "../data/types";
import { useGameStore } from "../store/game-store";
import { useAudioStore } from "../engine/audio-store";
import { useRoom } from "../presentation/RoomContext";
import { useStageHudOverlap } from "../presentation/useStageHudOverlap";
import { displayJoinHost, joinUrl, PUBLIC_JOIN_HOST_DISPLAY, resolveJoinOrigin } from "../network/room";
import { generateQrMatrix } from "../components/qr-matrix";
import { ShowFrame } from "../components/show/ShowFrame";
import { ShowWordmark } from "../components/show/ShowWordmark";
import { formatLobbyCountdown } from "./lobby-countdown";
import { WalkinLyrics } from "./WalkinLyrics";
import { LOBBY_EMPTY_LINE, LOBBY_JOINED_LINE } from "../engine/room-flavor";
import { LobbyArrivals } from "./LobbyArrivals";
import { phonesCanVote } from "./setup-polling";

export interface QrCodeProps {
  text?: string | null;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

export const QrCode: React.FC<QrCodeProps> = React.memo(({
  text,
  size = 140,
  className = "",
  ariaLabel = "QR code for audience join",
}) => {
  const matrix = useMemo(() => {
    if (!text || !text.trim()) return null;
    try { return generateQrMatrix(text.trim()); }
    catch { return null; }
  }, [text]);

  if (!matrix) {
    return (
      <div
        className={`qr-placeholder ${className}`}
        style={{ width: size, height: size, backgroundColor: "var(--color-panel-navy)", borderRadius: "var(--kit-radius-12)" }}
        role="img"
        aria-label="QR Code placeholder"
        data-role="qr-placeholder"
      />
    );
  }

  const matrixSize = matrix.length;
  const cellSize = size / (matrixSize + 8);
  const cellSizeFixed = cellSize.toFixed(2);
  let pathData = "";
  for (let row = 0; row < matrixSize; row++) {
    for (let column = 0; column < matrixSize; column++) {
      if (matrix[row]?.[column]) {
        const x = ((column + 4) * cellSize).toFixed(2);
        const y = ((row + 4) * cellSize).toFixed(2);
        pathData += `M${x},${y}h${cellSizeFixed}v${cellSizeFixed}h-${cellSizeFixed}z `;
      }
    }
  }

  return (
    <svg
      className={`qr-matrix-svg ${className}`}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      data-role="qr-code"
      style={{ display: "block", borderRadius: "var(--kit-space-8)" }}
    >
      <rect width={size} height={size} fill="var(--color-light)" rx="8" />
      <path d={pathData.trim()} fill="var(--color-stage-deep)" />
    </svg>
  );
});

QrCode.displayName = "QrCode";

export interface LobbyProps {
  roomCode?: string | null;
  joinedCount?: number;
  startTime?: number | string | null;
  countdownText?: string | null;
  onOpenStage?: () => void;
  onAdvance?: () => void;
  pollingUrl?: string | null;
  pollingDisplay?: string | null;
  format?: FormatId;
  formatId?: FormatId;
  interactionMode?: InteractionMode;
  venue?: Venue;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  musicPlaying?: boolean;
  /** Overrides the store's Top 5 scores switch, which decides whether joined names show (VOF-88). */
  showNames?: boolean;
  className?: string;
}

export const Lobby: React.FC<LobbyProps> = React.memo(({
  roomCode: propRoomCode,
  joinedCount: propJoinedCount,
  startTime: propStartTime,
  countdownText: propCountdownText,
  onOpenStage,
  onAdvance,
  pollingUrl: propPollingUrl,
  pollingDisplay: propPollingDisplay,
  format: propFormat,
  formatId: propFormatId,
  interactionMode: propInteractionMode,
  venue: propVenue,
  musicPlaying: propMusicPlaying,
  showNames: propShowNames,
  className = "",
}) => {
  const format = propFormat || propFormatId || "widescreen";
  const shellRef = useRef<HTMLElement>(null);
  // The facilitator HUD is a viewport portal over the letterboxed canvas; the walk-in band
  // reserves whatever it actually covers instead of guessing a clearance.
  useStageHudOverlap(shellRef, format, "--preshow-hud-overlap");
  const shouldReduceMotion = useReducedMotion();
  const room = useRoom();
  const audioPlaying = useAudioStore((state) => state.status === "playing" && !state.muted);
  const musicPlaying = propMusicPlaying ?? audioPlaying;
  const storeStartTime = useGameStore((state) => state.startTime);
  const joined = useGameStore((state) => Object.keys(state.seenDevices).length);
  const storeInteractionMode = useGameStore((state) => state.interactionMode);
  const dispatch = useGameStore((state) => state.dispatch);
  const activeRoomCode = String(propRoomCode ?? room.roomId).toUpperCase();
  const activeJoinedCount = propJoinedCount ?? joined;
  const activeInteractionMode = propInteractionMode ?? storeInteractionMode ?? "facilitator";
  const activeVenue = propVenue ?? "teams";
  // B1 (premium-host pass 2): venue and interaction mode are independent state (a returning host
  // can load with venue="offline" while interactionMode still carries a live "polling" value from
  // the same session, or with venue="teams"/"room" while interactionMode sits at "facilitator").
  // One flag drives both the join card and the grid shape it needs, so a desynced state never
  // shows a scannable code phones cannot use, and never reserves an empty join column either.
  // WARNING-3 (premium-host-fix-3): this was its own copy of the same rule setup-polling.ts
  // already carries as phonesCanVote, one source of truth instead of two that could drift apart.
  const phonesVote = phonesCanVote(activeVenue, activeInteractionMode);
  // VOF-88: a host who turned Top 5 scores off chose to keep names off the shared screen, so the lobby
  // shows the count alone, larger, instead of the names landing.
  const storeLeaderboardEnabled = useGameStore((state) => state.leaderboardEnabled);
  const namesOn = phonesVote && (propShowNames ?? storeLeaderboardEnabled !== false);
  const activePollingUrl = propPollingUrl ?? joinUrl(resolveJoinOrigin(window.location.origin), activeRoomCode);
  const activePollingDisplay = propPollingDisplay ?? displayJoinHost(new URL(activePollingUrl).origin);
  const activeStartTime = propStartTime !== undefined ? propStartTime : storeStartTime;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeStartTime) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeStartTime]);

  const countdown = propCountdownText ?? formatLobbyCountdown(activeStartTime, now);
  const handleOpenStage = useCallback(() => {
    if (onOpenStage) onOpenStage();
    else if (onAdvance) onAdvance();
    else {
      dispatch({ type: "START_BROADCAST" });
      dispatch({ type: "ADVANCE" });
    }
  }, [dispatch, onAdvance, onOpenStage]);

  return (
    <main
      ref={shellRef}
      className={`screen lobby show-screen preshow-lobby ${className}`}
      data-screen="lobby"
      data-interaction-mode={activeInteractionMode}
      data-audience-boundary="true"
      data-format={format}
      data-venue={activeVenue}
      data-phones={phonesVote ? "true" : "false"}
      data-names={phonesVote ? String(namesOn) : undefined}
    >
      <ShowFrame scrim="left" className="lobby-show-frame" beat="lobby">
        {/* Opacity dissolve is owned by ScreenRouter — a nested mount fade compounds
           with the viewport and reads as a late, muddy open. */}
        <div className="lobby-stage">
          <div className="lobby-copy">
            <h1 className="lobby-title" aria-label="Vax or Fiction?"><ShowWordmark /></h1>
            <div className="lobby-count" data-role="joined-count" aria-live="polite" data-count={phonesVote ? activeJoinedCount : undefined}>
              {!phonesVote ? (
                <span>{activeVenue === "offline" ? "Hands up. The room calls it out loud." : "The lights are up. The show starts soon."}</span>
              ) : (
                <>
                  {/* Keyed by the count, so each new phone replays the number's landing beat. */}
                  <strong key={activeJoinedCount} data-role="joined-count-number">{activeJoinedCount}</strong>
                  <span>{activeJoinedCount === 1 ? "phone in" : "phones in"}</span>
                </>
              )}
            </div>
            {/* A start time set in the setup sheet puts a big clock where the hype line sits (VOF-88):
                the room knows when the show begins, and the two never compete. */}
            {countdown ? (
              <p className="lobby-countdown" data-role="lobby-countdown">{countdown}</p>
            ) : phonesVote ? (
              <p className="lobby-hype" data-role="lobby-hype">
                {activeJoinedCount > 0 ? LOBBY_JOINED_LINE : LOBBY_EMPTY_LINE}
              </p>
            ) : null}
            {namesOn ? <LobbyArrivals /> : null}
          </div>

          {phonesVote ? (
            <section className="join-card lobby-join" data-role="lobby-polling" aria-label="Join the game">
              <div className="lobby-qr-frame">
                <QrCode text={activePollingUrl} size={320} ariaLabel={`Scan to join room ${activeRoomCode}`} />
              </div>
              <p className="lobby-join-type-hint">{"Can't scan? Type"}</p>
              <p className="lobby-join-host" data-role="join-type-fallback">{activePollingDisplay || PUBLIC_JOIN_HOST_DISPLAY}</p>
              <p className="lobby-join-label">Join a game</p>
              <strong className="lobby-room-code" data-role="room-code">{activeRoomCode}</strong>
            </section>
          ) : null}

          {/* The lyric leads so it starts on the same left edge as the wordmark, the count and
              the hype; the meter trails it as the "music is live" tick. */}
          <footer className={`lobby-footer${musicPlaying ? " is-playing" : ""}`}>
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

          {!shouldReduceMotion && <span className="lobby-live-pulse" aria-hidden="true" />}
          <button className="lobby-open-stage facilitator-press" type="button" data-role="open-stage-btn" onClick={handleOpenStage}>Open the stage</button>
        </div>
      </ShowFrame>
    </main>
  );
});

Lobby.displayName = "Lobby";

export default Lobby;
