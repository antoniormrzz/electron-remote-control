import { useEffect, useState } from 'react';

export type HostConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

const RECONNECT_DELAY_MS = 2_000;
const UNAVAILABLE_AFTER_ATTEMPTS = 3;

function getWebSocketUrl(): string {
  const url = new URL('/ws', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function useHostConnection(): HostConnectionState {
  const [state, setState] = useState<HostConnectionState>('connecting');

  useEffect(() => {
    let active = true;
    let attempts = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = (): void => {
      if (!active) {
        return;
      }

      socket = new WebSocket(getWebSocketUrl());

      socket.addEventListener('open', () => {
        attempts = 0;
        setState('connected');
      });

      socket.addEventListener('close', () => {
        if (!active) {
          return;
        }

        attempts += 1;
        setState(attempts >= UNAVAILABLE_AFTER_ATTEMPTS ? 'unavailable' : 'reconnecting');
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, []);

  return state;
}
