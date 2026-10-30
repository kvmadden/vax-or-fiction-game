import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectConfiguredRoom } from './configured-room';
import type { AttendeeState, ClientEnvelope, ConnectionStatus, JoinProfile, PublicRoomState } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { validateAttendeeState, validatePublicRoomState, VOTING_CLOSED } from './guards';
import { storedIdentity } from './room';
import type { RoomConnection } from './room-socket';

interface RelayMessage {
  kind?: string;
  state?: unknown;
  connected?: unknown;
  messageId?: unknown;
  accepted?: unknown;
  reason?: unknown;
}

export const HOST_DISCONNECTED_MESSAGE = 'The host is disconnected.';

/** The show's own line when the room does not take a phone's message. */
export const NOT_TAKEN = "The room didn't take that. Try once more.";

/**
 * What a phone shows when the room refuses one of its messages. A reaction is best effort, so a refused one shows nothing. A
 * refused vote shows the show's own line, never the relay's or the host's reason, except once voting has closed: the dock's
 * own "You sat this one out" says that already. A join or a prediction keeps the reason the host gave, else the same line.
 */
export function refusalNotice(type: ClientEnvelope['type'] | undefined, reason: unknown): string | null {
  if (type === 'REACTION') return null;
  if (type === 'VOTE') return reason === VOTING_CLOSED ? null : NOT_TAKEN;
  return typeof reason === 'string' ? reason : NOT_TAKEN;
}

/** True when the messages on their way hold the answer dock: a vote does, a join, a reaction or a prediction never does. */
export function holdsAnswerDock(pendingTypes: Iterable<ClientEnvelope['type']>): boolean {
  for (const type of pendingTypes) if (type === 'VOTE') return true;
  return false;
}

export function errorAfterHostStatus(currentError: string | null, connected: boolean): string | null {
  if (!connected) return HOST_DISCONNECTED_MESSAGE;
  return currentError === HOST_DISCONNECTED_MESSAGE ? null : currentError;
}

function messageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function usePhoneLink(
  roomId: string,
  deviceId: string,
  suppliedCredential?: string,
  options?: { maxReconnectAttempts?: number },
) {
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [attendeeState, setAttendeeState] = useState<AttendeeState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(roomId && deviceId ? 'connecting' : 'offline');
  const [error, setError] = useState<string | null>(roomId && deviceId ? null : 'A valid room and device identity are required.');
  const [pending, setPending] = useState(false);
  // A vote on its way is the only message that holds the answer dock. A reaction or a prediction on its way never does.
  const [votePending, setVotePending] = useState(false);
  const connectionRef = useRef<RoomConnection | null>(null);
  const roomStateRef = useRef<PublicRoomState | null>(null);
  const attendeeStateRef = useRef<AttendeeState | null>(null);
  const pendingRef = useRef(new Map<string, ClientEnvelope['type']>());
  const syncPending = useCallback(() => {
    setPending(pendingRef.current.size > 0);
    setVotePending(holdsAnswerDock(pendingRef.current.values()));
  }, []);
  const pendingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queuedJoinRef = useRef<JoinProfile | null>(null);
  const credential = useMemo(() => suppliedCredential && /^[A-Za-z0-9_-]{24,128}$/.test(suppliedCredential)
    ? suppliedCredential
    : storedIdentity(`vof-attendee-credential:${roomId}:${deviceId}`, true), [deviceId, roomId, suppliedCredential]);

  const send = useCallback((type: ClientEnvelope['type'], fields: Partial<ClientEnvelope>) => {
    const state = roomStateRef.current;
    if (!state || connectionStatus !== 'connected') {
      setError("Room's not ready yet. Hang tight. This phone tries again in about 5 seconds.");
      return false;
    }
    const id = messageId();
    const envelope: ClientEnvelope = {
      version: PROTOCOL_VERSION,
      type,
      roomId,
      sessionId: state.sessionId,
      deviceId,
      messageId: id,
      ...fields,
    };
    if (!connectionRef.current?.send({ kind: 'CLIENT_MESSAGE', message: envelope })) {
      setError("That didn't go through. Hang tight. This phone tries again in about 5 seconds.");
      return false;
    }
    pendingRef.current.set(id, type);
    const timeout = setTimeout(() => {
      pendingRef.current.delete(id);
      pendingTimersRef.current.delete(id);
      syncPending();
      setError("Didn't hear back. Hang tight. This phone tries again in about 5 seconds.");
    }, 8_000);
    pendingTimersRef.current.set(id, timeout);
    syncPending();
    setError(null);
    return true;
  }, [connectionStatus, deviceId, roomId, syncPending]);

  useEffect(() => {
    if (!roomId || !deviceId) {
      return;
    }
    let active = true;
    const pendingMessages = pendingRef.current;
    const pendingTimers = pendingTimersRef.current;
    const clearPending = (reason?: string) => {
      for (const timeout of pendingTimers.values()) clearTimeout(timeout);
      pendingTimers.clear();
      if (pendingMessages.size > 0 && reason) setError(reason);
      pendingMessages.clear();
      setPending(false);
      setVotePending(false);
    };
    roomStateRef.current = null;
    attendeeStateRef.current = null;
    pendingMessages.clear();
    const connection = connectConfiguredRoom({
      roomId,
      role: 'attendee',
      credential,
      deviceId,
      ...(options?.maxReconnectAttempts != null ? { maxReconnectAttempts: options.maxReconnectAttempts } : {}),
      onStatus: (status) => {
        if (!active) return;
        setConnectionStatus(status);
        if (status !== 'connected') clearPending("Connection hiccup. Hang tight. This phone tries again in about 5 seconds.");
      },
      onError: (reason) => { if (active) setError(reason); },
      onMessage: (raw) => {
        if (!active || !raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const message = raw as RelayMessage;
        if (message.kind === 'READY') { setError(null); return; }
        if (message.kind === 'ROOM_STATE' && validatePublicRoomState(message.state, roomId)) {
          const current = roomStateRef.current;
          if (current && message.state.revision < current.revision) return;
          roomStateRef.current = message.state;
          setRoomState(message.state);
          // A fresh snapshot from a reconnected host clears the stale host-disconnected alert (VOF-T04 / CH-01).
          const { hostConnected } = message.state;
          setError((current) => errorAfterHostStatus(current, hostConnected));
          if (attendeeStateRef.current && attendeeStateRef.current.sessionId !== message.state.sessionId) {
            attendeeStateRef.current = null;
            setAttendeeState(null);
          }
          return;
        }
        if (message.kind === 'HOST_STATUS' && typeof message.connected === 'boolean') {
          const connected = message.connected;
          // JOIN-RACE: derive the next state from the ref and write the ref here, as ROOM_STATE does. A
          // setRoomState updater runs later, at render, so when the host's first ROOM_STATE lands right
          // behind this frame an updater would put the ref back to the state from before that snapshot.
          const current = roomStateRef.current;
          if (current) {
            const next = { ...current, hostConnected: connected };
            roomStateRef.current = next;
            setRoomState(next);
          }
          setError((currentError) => errorAfterHostStatus(currentError, connected));
          return;
        }
        if (message.kind === 'ATTENDEE_STATE') {
          const sessionId = roomStateRef.current?.sessionId;
          if (sessionId && validateAttendeeState(message.state, sessionId)) {
            attendeeStateRef.current = message.state;
            setAttendeeState(message.state);
          }
          return;
        }
        if (message.kind === 'ACK' && typeof message.messageId === 'string' && pendingRef.current.has(message.messageId)) {
          const type = pendingRef.current.get(message.messageId);
          const timeout = pendingTimers.get(message.messageId);
          if (timeout) clearTimeout(timeout);
          pendingTimers.delete(message.messageId);
          pendingRef.current.delete(message.messageId);
          syncPending();
          if (message.accepted !== true) {
            const notice = refusalNotice(type, message.reason);
            if (notice) setError(notice);
          }
        }
      },
    });
    connectionRef.current = connection;
    return () => {
      active = false;
      connection.close();
      connectionRef.current = null;
      roomStateRef.current = null;
      attendeeStateRef.current = null;
      queuedJoinRef.current = null;
      clearPending();
    };
  }, [credential, deviceId, options?.maxReconnectAttempts, roomId, syncPending]);

  const sendHello = useCallback((nickname: string, team?: JoinProfile['team']) => {
    return send('HELLO', { nickname: nickname.trim(), team: team ?? null });
  }, [send]);
  const join = useCallback((profile: JoinProfile) => {
    const sent = sendHello(profile.nickname, profile.team);
    // JOIN-RACE: the refusal copy promises this phone tries again, so a join the room could not take
    // yet waits here and goes out once it can. Only the attendee's own join, never sendHello itself:
    // the presenter remote sends its commands through sendHello, and a stale command must not replay.
    queuedJoinRef.current = sent ? null : profile;
    return sent;
  }, [sendHello]);
  useEffect(() => {
    const queued = queuedJoinRef.current;
    if (!queued || !roomState || connectionStatus !== 'connected') return;
    queuedJoinRef.current = null;
    if (!sendHello(queued.nickname, queued.team)) queuedJoinRef.current = queued;
  }, [connectionStatus, roomState, sendHello]);
  const sendVote = useCallback((choice: string, conviction?: string) => {
    const questionInstanceId = roomStateRef.current?.questionData?.questionInstanceId;
    if (!questionInstanceId) { setError('No question is open yet. Watch the screen.'); return; }
    send('VOTE', { choice, conviction, questionInstanceId });
  }, [send]);
  const sendReaction = useCallback((reaction: string) => {
    const questionInstanceId = roomStateRef.current?.questionData?.questionInstanceId;
    if (!questionInstanceId) return;
    send('REACTION', { reaction, questionInstanceId });
  }, [send]);
  const sendPrediction = useCallback((winner: string) => {
    const showdownId = roomStateRef.current?.showdown?.id;
    if (!showdownId) { setError('There is no active showdown to predict.'); return; }
    send('PREDICT_WINNER', { winner, showdownId });
  }, [send]);
  const retry = useCallback(() => {
    setError(null);
    pendingRef.current.clear();
    for (const timeout of pendingTimersRef.current.values()) clearTimeout(timeout);
    pendingTimersRef.current.clear();
    setPending(false);
    setVotePending(false);
    connectionRef.current?.retry();
  }, []);

  return { roomState, attendeeState, connectionStatus, error, pending, votePending, join, sendHello, sendVote, sendReaction, sendPrediction, retry };
}
