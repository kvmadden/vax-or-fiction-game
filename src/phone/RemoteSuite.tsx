import React, { useCallback, useEffect, useState } from 'react';
import PhoneLayout from './PhoneLayout';
import { PhoneBackdrop } from './PhoneBackdrop';
import { HOST_DISCONNECTED_MESSAGE, usePhoneLink } from '../network/usePhoneLink';
import { storedIdentity } from '../network/room';
import {
  isRemoteKey,
  parseRemoteCommand,
  readRemoteKeyFromUrl,
  remoteCommandNickname,
  remoteHostLine,
  remotePadModel,
  remotePairNickname,
  type RemoteCommand,
  type RemotePadModel,
} from '../network/presenter-remote';
import { remoteCueCard, type PresenterCue } from './presenter-cue-map';
import { triggerTactileFeedback } from './phone-vote-utils';

export interface RemoteSuiteProps {
  roomId?: string;
}

function remoteDeviceId(roomId: string): string {
  return storedIdentity(`vof-remote-device:${roomId}`, true);
}

export interface RemotePadProps {
  pad: RemotePadModel;
  topic: string | null;
  cue: PresenterCue | null;
  joinCode?: string;
  hostLine: string;
  paired: boolean;
  hostDown: boolean;
  disabled: boolean;
  endArmed: boolean;
  /** Phones joined, for the setup view's count and a question's meta line. */
  participants: number;
  /** Seconds left on a question, for its meta line. */
  timerSeconds: number;
  onAdvance: () => void;
  onBack: () => void;
  onLock: () => void;
  onReveal: () => void;
  onPause: () => void;
  onMute: () => void;
  onEnd: () => void;
  onAwardA: () => void;
  onAwardB: () => void;
}

/**
 * The presenter's pad. The top bar holds the kicker, its dot and End. The middle fills with real presenter content,
 * the status and instruction, then the room filling and the audience code at setup, or the cue on a question, and
 * the controls dock at the bottom with Next as the absorber, so its bottom edge never moves. Every control is
 * worded, never icon-only.
 */
export const RemotePad: React.FC<RemotePadProps> = ({
  pad, topic, cue, joinCode, hostLine, paired, hostDown, disabled, endArmed, participants, timerSeconds,
  onAdvance, onBack, onLock, onReveal, onPause, onMute, onEnd, onAwardA, onAwardB,
}) => {
  const coach = pad.coachLine;
  const instruction = paired
    ? coach ?? (!topic ? 'This device drives the show. Keep it off the projector.' : null)
    : hostLine;
  const onQuestion = Boolean(topic);
  const next = <button
    type="button"
    className="remote-pad__btn remote-pad__btn--primary remote-clicker__next"
    data-remote-command="ADVANCE"
    disabled={disabled}
    aria-label={coach ? `${pad.advanceLabel}. ${coach}` : pad.advanceLabel}
    onClick={onAdvance}
  >{pad.advanceLabel}</button>;
  const back = <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="BACK" disabled={disabled} onClick={onBack}>Back</button>;
  const lock = <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="LOCK" disabled={disabled || !pad.canLock} onClick={onLock}>Lock votes</button>;
  const reveal = <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="REVEAL" disabled={disabled || !pad.canReveal} onClick={onReveal}>Reveal</button>;
  const pause = <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="PAUSE" data-paused={pad.pauseLabel === 'Resume' ? 'true' : 'false'} disabled={disabled || !pad.canPause} onClick={onPause}>{pad.pauseLabel}</button>;
  const mute = <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="MUTE" disabled={disabled} onClick={onMute}>Mute</button>;

  return (
    <section
      className="remote-clicker"
      data-role="presenter-remote"
      data-paired={paired ? 'true' : 'false'}
      data-setup={pad.isSetup ? 'true' : 'false'}
      data-has-cue={cue ? 'true' : 'false'}
    >
      <div className="remote-pad__topbar" data-role="remote-topbar">
        <p className="remote-pad__kicker">
          Private controller
          <span className="remote-pad__dot" data-host={hostDown ? 'down' : 'up'} data-paired={paired ? 'true' : 'false'} aria-hidden="true" />
        </p>
        <button
          type="button"
          className={`remote-pad__end-bar${endArmed ? ' is-armed' : ''}`}
          data-remote-command="END"
          disabled={disabled}
          onClick={onEnd}
        >{endArmed ? 'Tap again to end' : 'End'}</button>
      </div>
      <div className="remote-clicker__middle" data-role="remote-pad-scroll" data-view={onQuestion ? 'question' : 'room'}>
        {/* Today's status row. Its join chip shows while a question is live. Whenever none is, the promoted audience code
            below shows the code instead, so it is on screen exactly once. */}
        <div className="remote-pad__status-row remote-clicker__status-row">
          <h1 className="remote-clicker__status" data-role="remote-status">{pad.statusLine}</h1>
          {joinCode && onQuestion ? <span className="remote-pad__join-chip" data-role="remote-audience-join">Join {joinCode}</span> : null}
        </div>
        {instruction ? <p className="remote-clicker__line" data-role="remote-coach" data-paired={paired ? 'true' : 'false'}>{instruction}</p> : null}
        {onQuestion ? (
          <div className="remote-clicker__cue" data-role="presenter-cue">
            <p className="remote-clicker__topic" data-role="presenter-cue-topic">{topic}</p>
            {cue ? <p className="remote-clicker__key" data-role="presenter-cue-key"><span className="remote-clicker__label">Key</span>{' '}<span className="remote-clicker__key-text">{cue.key}</span></p> : null}
            {cue ? <p className="remote-clicker__tip" data-role="presenter-cue-tip"><span className="remote-clicker__label">Tip</span>{' '}<span className="remote-clicker__tip-text">{cue.tip}</span></p> : null}
            <p className="remote-clicker__meta">{`${timerSeconds > 0 ? `${timerSeconds}s · ` : ''}${participants} ${participants === 1 ? 'phone' : 'phones'}`}</p>
          </div>
        ) : (
          <>
            <p className="remote-clicker__count"><span className="remote-clicker__count-num">{participants}</span>{' '}<span>{participants === 1 ? 'phone joined' : 'phones joined'}</span></p>
            {joinCode ? <p className="remote-clicker__code" data-role="remote-audience-code"><span className="remote-clicker__label">Audience code</span>{' '}<span className="remote-clicker__code-text">{joinCode}</span></p> : null}
          </>
        )}
      </div>
      {pad.showdownFinalists && pad.showdownFinalists.length === 2 ? (
        <div className="remote-clicker__row remote-clicker__row--award" data-role="remote-showdown-actions">
          <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="AWARD_A" disabled={disabled} onClick={onAwardA}>{`+1 ${pad.showdownFinalists[0]!.name}`}</button>
          <button type="button" className="remote-pad__btn remote-clicker__btn" data-remote-command="AWARD_B" disabled={disabled} onClick={onAwardB}>{`+1 ${pad.showdownFinalists[1]!.name}`}</button>
        </div>
      ) : null}
      {/* A clicker pair: Back beside Next, then Lock votes and Reveal, then Pause and a worded Mute. */}
      <div className="remote-clicker__controls">
        <div className="remote-clicker__row remote-clicker__row--main">{back}{next}</div>
        <div className="remote-clicker__row">{lock}{reveal}</div>
        <div className="remote-clicker__row">{pause}{mute}</div>
      </div>
    </section>
  );
};


/**
 * Presenter pocket remote. Fat, word-labeled controls — never icon-only.
 * Pairs through a private QR on the laptop; this page is not the audience join.
 */
export const RemoteSuite: React.FC<RemoteSuiteProps> = ({ roomId = '' }) => {
  const key = typeof window === 'undefined' ? '' : readRemoteKeyFromUrl(new URL(window.location.href));
  const [deviceId] = useState(() => (roomId ? remoteDeviceId(roomId) : ''));
  const link = usePhoneLink(roomId, deviceId, undefined, { maxReconnectAttempts: 40 });
  const { roomState, connectionStatus, error, pending, retry, sendHello } = link;
  const [paired, setPaired] = useState(false);
  const [pairSent, setPairSent] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const hostDown = Boolean(roomState && !roomState.hostConnected) || error === HOST_DISCONNECTED_MESSAGE;
  const keyOk = isRemoteKey(key);
  const pad = remotePadModel(roomState);
  const { topic, cue } = remoteCueCard(roomState, pad.onQuestion);

  useEffect(() => {
    if (connectionStatus !== 'connected' || hostDown) {
      setPaired(false);
      setPairSent(false);
    }
  }, [connectionStatus, hostDown]);

  useEffect(() => {
    if (!keyOk || !roomId || connectionStatus !== 'connected' || !roomState || hostDown) return;
    if (pairSent || pending || paired) return;
    if (sendHello(remotePairNickname(key))) setPairSent(true);
  }, [connectionStatus, hostDown, key, keyOk, pairSent, paired, pending, roomId, roomState, sendHello]);

  useEffect(() => {
    if (pairSent && !pending && !error && !hostDown) setPaired(true);
  }, [error, hostDown, pairSent, pending]);

  const sendCommand = useCallback((command: RemoteCommand) => {
    triggerTactileFeedback();
    sendHello(remoteCommandNickname(command));
  }, [sendHello]);

  const onAdvance = () => {
    setEndArmed(false);
    sendCommand('ADVANCE');
  };
  const onBack = () => {
    setEndArmed(false);
    sendCommand('BACK');
  };
  const onLock = () => {
    if (!pad.canLock) return;
    setEndArmed(false);
    sendCommand('LOCK');
  };
  const onReveal = () => {
    if (!pad.canReveal) return;
    setEndArmed(false);
    sendCommand('REVEAL');
  };
  const onPause = () => {
    if (!pad.canPause) return;
    setEndArmed(false);
    sendCommand('PAUSE');
  };
  const onAwardA = () => {
    if (!pad.showdownFinalists) return;
    setEndArmed(false);
    sendCommand('AWARD_A');
  };
  const onAwardB = () => {
    if (!pad.showdownFinalists) return;
    setEndArmed(false);
    sendCommand('AWARD_B');
  };
  const onMute = () => {
    setEndArmed(false);
    sendCommand('MUTE');
  };
  const onEnd = () => {
    if (!endArmed) {
      setEndArmed(true);
      return;
    }
    setEndArmed(false);
    sendCommand('END');
  };

  const missing = !roomId || !keyOk;
  const padProps = {
    pad,
    topic,
    cue,
    joinCode: roomId || undefined,
    hostLine: remoteHostLine({
      paired: paired && !missing,
      hostConnected: Boolean(roomState?.hostConnected) && !hostDown,
      roomId,
    }),
    paired,
    hostDown,
    disabled: missing || !paired || hostDown,
    endArmed,
    participants: roomState?.participants ?? 0,
    timerSeconds: roomState?.timerSeconds ?? 0,
    onAdvance,
    onBack,
    onLock,
    onReveal,
    onPause,
    onMute,
    onEnd,
    onAwardA,
    onAwardB,
  };
  const offline = connectionStatus === 'offline';
  const announcement = missing
    ? 'Scan the presenter QR on the host device. Not the audience join code.'
    : hostDown
      ? 'Host dropped. Stay here. Retry in about 5 seconds.'
      : error && parseRemoteCommand(error) === null
        ? error
        : offline
          ? 'Controller disconnected. Tap Retry.'
          : null;

  return (
    <PhoneLayout
      className="phone-live-shell remote-shell"
      brandMark="none"
      backdrop={<PhoneBackdrop scrim="stage" />}
      connectionStatus={missing ? undefined : connectionStatus}
      hostDown={hostDown}
      announcement={announcement}
      announcementType={missing || hostDown || offline || error ? 'error' : 'info'}
      announcementAction={offline || error ? { label: 'Retry', onClick: () => { setPairSent(false); setPaired(false); retry(); } } : undefined}
      showWakeLockIndicator={false}
      showHeader={false}
      showFooter={false}
    >
      <RemotePad {...padProps} />
    </PhoneLayout>
  );
};

export default RemoteSuite;
