import type { GameState } from '../store/game-store';
import { projectAttendeeState, projectGameState, type GameNetworkProjection } from './game-projection';
import type { ClientEnvelope, ConnectionStatus } from './protocol';
import { validateClientEnvelope } from './guards';
import type { RoomConnection, RoomSocketOptions } from './room-socket';
import { cuePresenterKeyboardAction } from '../engine/audio-cues';
import { isSetupPhase } from '../engine/state-machine';
import { useAudioStore } from '../engine/audio-store';
import { isRemotePairNickname, parseRemoteCommand, REMOTE_PAIR_PREFIX, type RemoteCommand } from './presenter-remote';
import { ROOM_STATE_REFUSED, roomLookKeys, type RoomLookSource } from './room-look';
import { hostLookStore } from '../looks/host-look';

interface RelayMessage { kind?: string; deviceId?: string; message?: unknown; snapshotRevision?: unknown; relayRevision?: unknown }
interface HostLinkStore { getState(): GameState; subscribe(listener: () => void): () => void }
export interface HostLiveLink { close(): void; retry(): void }

/**
 * The host's own show look and topic pattern switch, which every room state it publishes carries (VOF-93, VOF-94). A test hands
 * startHostLiveLink a source of its own.
 */
const hostRoomLook: RoomLookSource = {
  keys: () => roomLookKeys(hostLookStore.getState()),
  subscribe: (listener) => hostLookStore.subscribe(listener),
};

function applyRemoteCommand(store: HostLinkStore, command: RemoteCommand): void {
  const state = store.getState();
  if (command === 'MUTE') {
    useAudioStore.getState().toggleMute();
    return;
  }
  if (command === 'END') {
    cuePresenterKeyboardAction('REQUEST_RESTART_RUN');
    state.dispatch({ type: 'CLOSE_OUT' });
    return;
  }
  if (command === 'PAUSE') {
    // Reuses the exact action the P key dispatches (FAC-01). TOGGLE_PAUSE is already a no-op
    // once votes are locked, the timer is disabled, or the clock has already run out, so this
    // is safe to send from anywhere.
    state.dispatch({ type: 'TOGGLE_PAUSE' });
    return;
  }
  if (command === 'AWARD_A' || command === 'AWARD_B') {
    // FAC-04: mirrors ScoreCard's own +1 button on stage. ADJUST_SHOWDOWN_POINTS already no-ops
    // off the duel stage or an unknown ticket, so a stale or off-stage tap is safe.
    const ticket = state.showdown?.finalists[command === 'AWARD_A' ? 0 : 1]?.ticket;
    if (ticket) state.dispatch({ type: 'ADJUST_SHOWDOWN_POINTS', ticket, delta: 1 });
    return;
  }
  const extras = {
    phase: state.phase,
    votesLocked: Boolean(state.votesLocked),
    offlineMode: Boolean(state.offlineMode),
    run: state.run,
    slideIndex: state.slideIndex,
  };
  if (command === 'ADVANCE') {
    // Setup ADVANCE is a store no-op (VOF-46). The pocket remote's yellow Next is the
    // Curated room launch path: leave Preflight for the lobby so the next tap opens the stage.
    if (isSetupPhase(state.phase)) {
      cuePresenterKeyboardAction('ADVANCE', extras);
      state.dispatch({ type: 'ENTER_LOBBY' });
      return;
    }
    cuePresenterKeyboardAction('ADVANCE', extras);
    state.dispatch({ type: 'ADVANCE' });
    return;
  }
  if (command === 'BACK') {
    cuePresenterKeyboardAction('BACK', extras);
    state.dispatch({ type: 'BACK' });
    return;
  }
  if (command === 'LOCK') {
    state.dispatch({ type: 'LOCK_VOTES' });
    return;
  }
  state.dispatch({ type: 'REVEAL' });
}

/** Owns the host transport; Offline never creates or retains relay work. */
export function startHostLiveLink({ roomId, credential, enabled, store, connect, onStatus, onError, remoteKey, onRemotePaired, roomLook = hostRoomLook }: {
  roomId: string; credential: string; enabled: boolean; store: HostLinkStore;
  connect(options: RoomSocketOptions): RoomConnection;
  onStatus(status: ConnectionStatus): void; onError(error: string | null): void;
  remoteKey?: string;
  onRemotePaired?: (paired: boolean) => void;
  roomLook?: RoomLookSource;
}): HostLiveLink {
  if (!enabled || store.getState().offlineMode) return { close() {}, retry() {} };
  let connection: RoomConnection | null = null;
  let unsubscribe = () => {};
  let stopLook = () => {};
  let active = true;
  let ready = false;
  const deliveredPersonal = new Map<string, string>();
  const connectedDevices = new Set<string>();
  let pairedRemoteDeviceId: string | null = null;
  let projection: GameNetworkProjection | null = null;
  let revision = 0;
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  // The room state carries the look keys until a relay refuses a state that carried them (see onError below).
  let sendLook = true;
  let carriedLook = false;
  // The last revision this host published with the current question's vote open, for votes the relay took before a lock.
  let openVotes: { occurrence: string; revision: number } | null = null;
  const sendChecked = (message: unknown): boolean => {
    if (!active || store.getState().offlineMode || !ready || !connection) return false;
    const accepted = connection.send(message);
    if (!accepted) onError('The live room is busy. Pause the presentation and reconnect before continuing.');
    return accepted;
  };
  const sendDirectState = (deviceId: string, force = false) => {
    const projected = projection ?? projectGameState(store.getState(), roomId, revision);
    const state = projectAttendeeState(store.getState(), deviceId, projected.questionProjection);
    const fingerprint = JSON.stringify(state);
    if (!force && deliveredPersonal.get(deviceId) === fingerprint) return;
    if (sendChecked({kind:'DIRECT', deviceId, message:{kind:'ATTENDEE_STATE', state}})) deliveredPersonal.set(deviceId, fingerprint);
  };
  const publish = () => {
    if (!active || store.getState().offlineMode || !ready || !connection) return;
    revision += 1;
    const projected = projectGameState(store.getState(), roomId, revision);
    projection = projected;
    const asked = projected.roomState.questionData;
    if (asked && !projected.roomState.votesLocked) openVotes = { occurrence: asked.questionInstanceId, revision };
    const look = sendLook ? roomLook.keys() : {};
    if (Object.keys(look).length > 0) carriedLook = true;
    sendChecked({ kind: 'ROOM_STATE', state: { ...projected.roomState, ...look } });
    for (const deviceId of connectedDevices) sendDirectState(deviceId);
  };
  const schedulePublish = () => {
    if (!active || store.getState().offlineMode || !ready) return;
    if (publishTimer != null) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      publish();
    }, 16);
  };
  const acknowledge = (deviceId: string, messageId: string, accepted: boolean, reason?: string) => {
    sendChecked({ kind: 'DIRECT', deviceId, message: { kind: 'ACK', messageId, accepted, ...(reason ? { reason } : {}) } });
  };
  const handleClientMessage = (deviceId: string, raw: unknown, relayRevision?: unknown) => {
    const state = store.getState();
    const projected = projectGameState(state, roomId, revision);
    const showdown = projected.roomState.showdown;
    // Over the production relay this host hears of a phone's vote only on its next exchange, about a second apart, so a vote the
    // relay took before this host locked can reach it after the lock. The 2026-10-05 live walk lost whole rooms of votes that way.
    // relayRevision is the newest room state the relay could have held when it took the vote (production-room.ts), so a vote it
    // took while the last state this host published still had this question open counts. The relay's view decides: until the
    // relay holds the lock the phones still see the vote open, so a vote it takes in that time counts, up to the reveal. The dev
    // relay hands a vote over at once and sends no relayRevision, so nothing changes there.
    const occurrence = projected.roomState.questionData?.questionInstanceId;
    const takenWhileOpen = typeof relayRevision === 'number' && openVotes !== null && occurrence !== undefined
      && openVotes.occurrence === occurrence && relayRevision <= openVotes.revision;
    const result = validateClientEnvelope(raw, {
      roomId,
      sessionId: state.sessionId,
      deviceId,
      phase: state.phase,
      votesLocked: Boolean(state.votesLocked),
      interactionMode: state.interactionMode,
      offlineMode: state.offlineMode,
      question: projected.roomState.questionData,
      decodeChoice: projected.questionProjection?.decodeChoice ?? (() => null),
      showdownId: showdown?.id,
      finalistTickets: showdown?.finalists.map((finalist) => finalist.ticket),
      takenWhileOpen,
    });
    const messageId = raw && typeof raw === 'object' && 'messageId' in raw && typeof raw.messageId === 'string' ? raw.messageId : 'invalid';
    if (!result.ok || !result.message) { acknowledge(deviceId, messageId, false, result.reason ?? 'Rejected message'); return; }
    const message: ClientEnvelope = result.message;
    const nickname = message.nickname ?? '';
    if (message.type === 'HELLO' && (nickname.startsWith(REMOTE_PAIR_PREFIX) || parseRemoteCommand(nickname))) {
      if (remoteKey && isRemotePairNickname(nickname, remoteKey)) {
        pairedRemoteDeviceId = deviceId;
        onRemotePaired?.(true);
        acknowledge(deviceId, message.messageId, true);
        return;
      }
      const command = parseRemoteCommand(nickname);
      if (command && pairedRemoteDeviceId === deviceId) {
        applyRemoteCommand(store, command);
        acknowledge(deviceId, message.messageId, true);
        return;
      }
      acknowledge(
        deviceId,
        message.messageId,
        false,
        command ? 'Pair this phone from the presenter QR first' : 'This presenter code does not match the laptop.',
      );
      return;
    }
    if (message.type !== 'HELLO' && !state.seenDevices[deviceId]) { acknowledge(deviceId, message.messageId, false, 'Join the room before submitting'); return; }

    if (message.type === 'HELLO') {
      state.dispatch({ type: 'RECORD_HELLO', deviceId, nickname: message.nickname, team: message.team ?? undefined });
    } else if (message.type === 'VOTE') {
      state.dispatch({ type: 'RECORD_VOTE', deviceId, choice: result.decodedChoice, conviction: message.conviction, team: state.seenDevices[deviceId]?.team ?? undefined, questionId: projected.roomState.questionData?.id, takenWhileOpen });
    } else if (message.type === 'REACTION') {
      state.dispatch({ type: 'RECORD_REACTION', deviceId, reaction: message.reaction, questionId: projected.roomState.questionData?.id, questionInstanceId: message.questionInstanceId ?? projected.roomState.questionData?.questionInstanceId });
    } else if (message.type === 'PREDICT_WINNER') {
      state.dispatch({ type: 'PREDICT_WINNER', deviceId, winner: message.winner, showdownId: message.showdownId });
    }

    const next = store.getState();
    const accepted = message.type === 'HELLO'
      ? Boolean(next.seenDevices[deviceId])
      : message.type === 'VOTE'
        ? next.pollVoters[projected.roomState.questionData?.id ?? '']?.[deviceId]?.choice === result.decodedChoice
        : message.type === 'PREDICT_WINNER'
          ? next.showdown?.predictions[deviceId] === message.winner
          : true;
    acknowledge(deviceId, message.messageId, accepted, accepted ? undefined : "The room didn't take that. Try once more.");
    sendDirectState(deviceId);
  };

  connection = connect({
    roomId,
    role: 'host',
    credential,
    onStatus: (status) => { if (status !== 'connected') { ready = false; deliveredPersonal.clear(); } if (active) onStatus(status); },
    onError: (reason) => {
      if (!active) return;
      // A relay that does not list the look keys (the production relay before its room look migration, or one rolled back) refuses the first
      // state that carries them. The reason it gives is also the one for a stale revision or any other invalid state, so the first refusal of a
      // state with the keys on a connection takes them off, whatever the cause. The worst case is phones showing Today with patterns on until the
      // next reconnect, which tries the keys again (so a relay that has been migrated since starts carrying them), and a refusal of the plain state
      // as well, or one before any state carried the keys, is a real error and shows.
      if (reason === ROOM_STATE_REFUSED && sendLook && carriedLook) {
        sendLook = false;
        carriedLook = false;
        // At once, and not on the timer: the refusal arrives inside the production client's own request, which keeps one replaceable slot for the
        // room state (production-room.ts), so the plain state replaces any state with the keys that is still waiting and nothing with the keys is
        // refused a second time. The dev socket client keeps no such slot, and its relay never gives this reason.
        if (publishTimer != null) {
          clearTimeout(publishTimer);
          publishTimer = null;
        }
        publish();
        return;
      }
      onError(reason);
    },
    onMessage: (raw) => {
      if (!active || store.getState().offlineMode || !raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const message = raw as RelayMessage;
      if (message.kind === 'READY') {
        ready = true;
        sendLook = true;
        carriedLook = false;
        deliveredPersonal.clear();
        if (typeof message.snapshotRevision === 'number' && Number.isInteger(message.snapshotRevision)) {
          revision = Math.max(revision, message.snapshotRevision);
        }
        onError(null);
        publish();
        return;
      }
      if (message.kind === 'ATTENDEE_CONNECTED' && typeof message.deviceId === 'string') {
        connectedDevices.add(message.deviceId);
        sendDirectState(message.deviceId, true);
        return;
      }
      if (message.kind === 'CLIENT_MESSAGE' && message.message && typeof (message.message as { deviceId?: unknown }).deviceId === 'string') {
        handleClientMessage((message.message as { deviceId: string }).deviceId, message.message, message.relayRevision);
      }
    },
  });
  unsubscribe = store.subscribe(() => {
    if (store.getState().offlineMode) close();
    else schedulePublish();
  });
  // A look or switch picked in setup reaches the phones at once.
  stopLook = roomLook.subscribe(schedulePublish);
  function close() {
    if (!active) return;
    active = false;
    if (publishTimer != null) {
      clearTimeout(publishTimer);
      publishTimer = null;
    }
    unsubscribe();
    stopLook();
    connection?.close();
    connection = null;
    connectedDevices.clear();
    projection = null;
    openVotes = null;
    revision = 0;
  }
  return { close, retry: () => { if (active) connection?.retry(); } };
}
