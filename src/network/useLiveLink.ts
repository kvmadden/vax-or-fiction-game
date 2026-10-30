import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/game-store';
import { connectConfiguredRoom } from './configured-room';
import type { ConnectionStatus } from './protocol';
import { storedIdentity } from './room';
import { startHostLiveLink, type HostLiveLink } from './host-live-link';

const validCredential = (value: string | undefined): value is string => Boolean(value && /^[A-Za-z0-9_-]{24,128}$/.test(value));

export function useLiveLink(
  roomId: string | null,
  suppliedCredential?: string,
  enabled = true,
  remote?: { key?: string; onPaired?: (paired: boolean) => void },
) {
  const offlineMode = useGameStore((state) => state.offlineMode);
  const liveEnabled = enabled && !offlineMode && Boolean(roomId);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(liveEnabled ? 'connecting' : 'offline');
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<HostLiveLink | null>(null);
  const onPairedRef = useRef(remote?.onPaired);
  onPairedRef.current = remote?.onPaired;
  const participants = useGameStore((state) => Object.keys(state.seenDevices).length);
  const currentQuestionId = useGameStore((state) => state.run[state.slideIndex]?.id ?? null);
  const currentVotes = useGameStore((state) => currentQuestionId ? Object.keys(state.pollVoters[currentQuestionId] ?? {}).length : 0);
  const credential = useMemo(() => roomId && liveEnabled
    ? (validCredential(suppliedCredential) ? suppliedCredential : storedIdentity(`vof-host-credential:${roomId}`))
    : '', [roomId, suppliedCredential, liveEnabled]);

  useEffect(() => {
    if (!roomId || !credential || !liveEnabled) return;
    const link = startHostLiveLink({
      roomId,
      credential,
      enabled: liveEnabled,
      store: useGameStore,
      connect: connectConfiguredRoom,
      onStatus: setConnectionStatus,
      onError: setError,
      remoteKey: remote?.key,
      onRemotePaired: (paired) => onPairedRef.current?.(paired),
    });
    linkRef.current = link;
    return () => { link.close(); linkRef.current = null; };
  }, [credential, liveEnabled, remote?.key, roomId]);

  return { connectionStatus: liveEnabled ? connectionStatus : 'offline' as ConnectionStatus,
    error: liveEnabled ? error : null, participants, votes: currentVotes, retry: () => linkRef.current?.retry() };
}
