import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../network/room';
import { assignedTeamForDevice, getOrCreateDeviceId, isJoinableRoomCode, joinRoomCodeError, sanitizeName } from './phone-join-utils';
import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ConnectionStatus, JoinProfile } from "../network/protocol";
import { ShowWordmark } from "../components/show/ShowWordmark";
import { tapUi } from "../engine/audio-cues";
import { triggerTactileFeedback } from "./phone-vote-utils";
import { WALKIN_JOIN_LINE } from "../data/walkin-lyrics";
import { JOIN_CONNECTED, JOIN_NAME_ERROR, joinNextStatus } from "./phone-live-copy";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";

// ============================================================================
// TYPES & COMPONENT INTERFACE
// ============================================================================

export interface PhoneJoinPayload {
  roomCode: string;
  nickname: string;
  team: JoinProfile['team'];
  device: string;
}

export interface PhoneJoinProps {
  /** Explicit device ID to align across mobile controller and transport */
  deviceId?: string;
  /** Initial room code (e.g. from QR scan or ?room=XXXX query parameter) */
  initialRoomCode?: string;
  /** Initial attendee display name or handle */
  initialNickname?: string;
  /** Optional team assignment supplied by the room. */
  initialTeam?: NonNullable<JoinProfile['team']>;
  /** Whether this room uses automatic neutral team assignment. */
  teamsEnabled?: boolean;
  /** Callback fired when attendee completes onboarding and taps Join */
  onJoin?: (payload: PhoneJoinPayload) => void;
  /** Whether a network join request is actively in-flight */
  isLoading?: boolean;
  /** Server or network error message string to render */
  errorMessage?: string | null;
  /** The presenter's screen is not connected to the room right now. */
  hostDown?: boolean;
  /** Live link status, so join can say it will retry in about 5 seconds. */
  connectionStatus?: ConnectionStatus;
  /** Subtitle or session context text */
  sessionSubtitle?: string;
  /** Optional container class name */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

// ============================================================================
// 3. COMPONENT IMPLEMENTATION
// ============================================================================


/**
 * PhoneJoin — Attendee Mobile Onboarding Screen
 *
 * Implements the responsive mobile phone onboarding screen for Vax or Fiction:
 * 1. 4-character room code entry with segmented high-contrast slot tiles.
 * 2. First name entry with standard text input.
 * 3. Automatic neutral team assignment when a room uses teams.
 * 4. High-contrast primary call-to-action button (>=44pt touch target).
 * 5. Full keyboard accessibility, ARIA compliance, zero emoji, zero inline hex.
 */
const PhoneJoinComponent: React.FC<PhoneJoinProps> = React.memo(({
  deviceId: propDeviceId,
  initialRoomCode,
  initialNickname,
  initialTeam,
  teamsEnabled = false,
  onJoin,
  isLoading = false,
  errorMessage = null,
  hostDown = false,
  connectionStatus,
  className = "",
  style = {},
}) => {
  const shouldReduceMotion = useReducedMotion();

  // The room identity is public URL state. It must be preserved exactly.
  const defaultRoomCode = (() => {
    if (initialRoomCode && initialRoomCode.trim()) {
      return initialRoomCode.trim();
    }
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const queryRoom = params.get("room") || params.get("code");
        if (queryRoom && queryRoom.trim()) {
          return queryRoom.trim();
        }
      } catch {
        // Ignore URL parsing errors
      }
    }
    return "";
  })();

  // Form states
  const [roomCode, setRoomCode] = useState<string>(defaultRoomCode);
  const [nickname, setNickname] = useState<string>(() => {
    if (initialNickname && initialNickname.trim()) {
      return initialNickname.trim();
    }
    return "";
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [compactViewport, setCompactViewport] = useState(false);
  const [compactJoinPage, setCompactJoinPage] = useState<'form' | 'next'>('form');
  // F-17: `isLoading` is the socket connect state, which starts true before anyone has typed a
  // name. "Joining…" only means something once this attendee has actually tapped Join.
  const [submitted, setSubmitted] = useState(false);

  // Fresh-review finding: without this, a failed submit left `submitted` true forever, so a
  // later, unrelated isLoading spell (a plain reconnect attempt, say) would still read as
  // "Joining…" instead of the plain "Join" a person who has not tapped again should see.
  useEffect(() => {
    if (errorMessage) setSubmitted(false);
  }, [errorMessage]);

  useEffect(() => {
    const syncViewport = () => setCompactViewport(window.innerHeight < 700);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  // Hidden/overlaid input ref for room code
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Persistent device ID
  const [deviceId] = useState<string>(() => propDeviceId || getOrCreateDeviceId());
  const effectiveDeviceId = propDeviceId || deviceId;
  const team = initialTeam ?? assignedTeamForDevice(effectiveDeviceId);

  // Handle room code typing
  const handleRoomCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
      setRoomCode(sanitized);
      if (localError) setLocalError(null);
    },
    [localError]
  );

  // Validate and submit onboarding
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
      }

      // PHO-10: the nickname input keeps focus and the virtual keyboard after a submit that
      // succeeds, covering half the screen for a form that is gone. Any validation error below
      // that wants a specific field re-focused (the code input) still does so after this.
      (document.activeElement as HTMLElement | null)?.blur();

      const trimmedCode = roomCode.trim();
      const sanitizedName = sanitizeName(nickname);

      const codeError = joinRoomCodeError(trimmedCode, "address");
      if (codeError) {
        setLocalError(codeError);
        codeInputRef.current?.focus();
        return;
      }

      if (!sanitizedName) {
        setLocalError(JOIN_NAME_ERROR);
        return;
      }

      setLocalError(null);
      setSubmitted(true);
      tapUi();

      const payload: PhoneJoinPayload = {
        roomCode: trimmedCode,
        nickname: sanitizedName,
        team: teamsEnabled ? team : null,
        device: effectiveDeviceId,
      };

      if (onJoin) {
        onJoin(payload);
      }
    },
    [roomCode, nickname, team, teamsEnabled, effectiveDeviceId, onJoin]
  );

  const isCodeComplete = isJoinableRoomCode(roomCode, "address");
  const isFormValid = isCodeComplete && sanitizeName(nickname).length > 0;
  const activeError = errorMessage || localError;
  const reconnecting = connectionStatus === "reconnecting";
  const nextStatus = joinNextStatus({ hostDown, reconnecting, loading: isLoading });
  const returnToJoinForm = () => {
    tapUi();
    triggerTactileFeedback();
    setCompactJoinPage('form');
    requestAnimationFrame(() => document.getElementById('nickname-input')?.focus());
  };

  if (defaultRoomCode) {
    return (
      <div
        className={`phone-join-source ${className}`}
        data-role="phone-join"
        data-team={teamsEnabled ? team : undefined}
        style={{
          touchAction: "manipulation",
          color: "var(--color-ink)",
          fontFamily: "var(--kit-font-sans)",
          ...style,
        }}
      >
        {/* The hero is the one mark on this screen (critique item 23); the app bar carries none until Join. */}
        <div className="phone-hero-mark" data-role="phone-branding" data-mark="hero"><ShowWordmark stacked /></div>
        {(!compactViewport || compactJoinPage === 'form') ? <p className="phone-join-lyric" data-role="join-walkin-lyric">{WALKIN_JOIN_LINE}</p> : null}
        {activeError && (
          <motion.div
            className="phone-join-source__error"
            role="alert"
            id="join-error-banner"
            data-role="join-error-banner"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : SCREEN_FADE_S, ease: SCREEN_FADE_EASE }}
          >
            <strong aria-hidden="true">×</strong>
            <span>{activeError}</span>
          </motion.div>
        )}
        {(!compactViewport || compactJoinPage === 'form') && <form className="phone-name-card" onSubmit={handleSubmit} noValidate>
          <h1>What should we call you?</h1>
          <p>
            Your name can show on the big screen.
          </p>
          <div className="phone-name-card__row">
            <input
              id="nickname-input"
              name="nickname"
              type="text"
              value={nickname}
              onChange={(event) => {
                setNickname(event.target.value.slice(0, 24));
                if (localError) setLocalError(null);
              }}
              placeholder="First name"
              maxLength={24}
              required
              autoComplete="given-name"
              autoCorrect="off"
              spellCheck={false}
              data-role="nickname-input"
              aria-label="Enter your first name"
              aria-invalid={activeError ? true : undefined}
              aria-describedby={activeError ? "join-error-banner" : undefined}
            />
            <button
              type="submit"
              disabled={isLoading || !isFormValid || hostDown}
              data-role="join-submit-btn"
            >
              {submitted && isLoading ? "Joining…" : "Join"}
            </button>
          </div>
          {hostDown && <p className="phone-join-host-down-note" data-role="join-host-down-note">The presenter's screen is away, so Join is off for now. This page tries again in about 5 seconds.</p>}
        </form>}
        {(!compactViewport || compactJoinPage === 'next') && <section className="phone-join-next" data-role="phone-join-next">
          {/* F-18: the heading is a fixed label now, not a status message wearing a heading's
              styling. The app bar above this screen already carries its own connection dot
              (PhoneSuite.tsx, PhoneLayout), so this section does not repeat it with a second dot.
              Instead it shows the status as plain visible text whenever it is not "Connected",
              since a gold dot alone read the same for "connecting" and "host down". While the
              host is down, the join-host-down-note above already carries that fact, so this line
              goes quiet rather than saying it a second time. The paragraph itself stays mounted
              either way (fresh-review finding): an aria-live region only announces a text change
              inside an element already in the DOM, not the element's own arrival, so unmounting
              and remounting it on every status change had stopped it announcing anything. */}
          <h2>What happens next</h2>
          <p className="phone-join-next-status" data-role="join-next-status" aria-live="polite" data-host={hostDown ? "down" : "up"} data-reconnect={reconnecting ? "true" : "false"} data-loading={isLoading ? "true" : "false"}>{hostDown || nextStatus === JOIN_CONNECTED ? '' : nextStatus}</p>
          <ol>
            <li><span aria-hidden="true">1</span>Watch the big screen. Each question shows up here the moment it opens.</li>
            <li><span aria-hidden="true">2</span>Tap your answer on this device. Nothing to install, no sign-in.</li>
          </ol>
          {compactViewport && <button type="button" data-action="return-to-join-form" onClick={returnToJoinForm}>Back to join</button>}
        </section>}
        {compactViewport && compactJoinPage === 'form' && <button type="button" data-action="show-join-next" className="phone-join-continue" onClick={() => { tapUi(); triggerTactileFeedback(); setCompactJoinPage('next'); }}>What happens next</button>}
      </div>
    );
  }

  // No room in the address (VOF-T02): a plain code-entry screen. Nothing connects until a code is typed; the
  // room page then asks for the name. Join stays enabled and the code is checked on submit.
  const submitCode = (event?: React.FormEvent) => {
    event?.preventDefault();
    // PHO-10: see the matching note in handleSubmit above.
    (document.activeElement as HTMLElement | null)?.blur();
    const code = roomCode.trim().toUpperCase();
    const codeError = joinRoomCodeError(code, "typed");
    if (codeError) {
      setLocalError(codeError);
      codeInputRef.current?.focus();
      return;
    }
    setLocalError(null);
    tapUi();
    if (onJoin) onJoin({ roomCode: normalizeRoomCode(code), nickname: sanitizeName(nickname), team: teamsEnabled ? team : null, device: effectiveDeviceId });
    else if (typeof window !== "undefined") window.location.assign(`/join?room=${encodeURIComponent(code)}`);
  };
  return (
    <div
      className={`phone-join-container phone-join-source phone-code-screen ${className}`}
      data-role="phone-join"
      data-team={teamsEnabled ? team : undefined}
      style={{ touchAction: "manipulation", overscrollBehaviorY: "contain", color: "var(--color-ink)", fontFamily: "var(--kit-font-sans)", ...style }}
    >
      <p className="phone-join-kicker" data-role="join-header">JOIN THE GAME</p>
      <div className="phone-hero-mark" data-role="phone-branding" data-mark="hero"><ShowWordmark stacked /></div>
      <p className="phone-join-lyric" data-role="join-walkin-lyric">{WALKIN_JOIN_LINE}</p>
      {activeError && (
        <motion.div className="phone-join-source__error" role="alert" id="join-error-banner" data-role="join-error-banner" initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : SCREEN_FADE_S, ease: SCREEN_FADE_EASE }}>
          <strong aria-hidden="true">×</strong>
          <span>{activeError}</span>
        </motion.div>
      )}
      <form className="phone-name-card phone-code-card" onSubmit={submitCode} noValidate data-role="room-code-section">
        <label htmlFor="room-code-input">Room code</label>
        <p>Enter the 4-character code on the screen.</p>
        <div className="phone-name-card__row phone-code-card__row">
          <input
            ref={codeInputRef}
            id="room-code-input"
            name="roomCode"
            type="text"
            value={roomCode}
            onChange={handleRoomCodeChange}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            placeholder="----"
            aria-label="Room code"
            aria-invalid={activeError ? true : undefined}
            aria-describedby={activeError ? "join-error-banner" : undefined}
            data-role="room-code-input"
          />
          <button type="submit" data-role="join-submit-btn" disabled={isLoading}>{isLoading ? "Joining…" : "Join"}</button>
        </div>
        <p className="phone-code-card__note">No sign-in · Your name stays here</p>
      </form>
    </div>
  );
});

export const PhoneJoin = PhoneJoinComponent;

PhoneJoin.displayName = "PhoneJoin";

export default PhoneJoin;
