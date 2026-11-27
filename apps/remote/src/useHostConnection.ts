import { useCallback, useEffect, useRef, useState } from 'react';
import { isControlResult, isPointerStatus } from '@electremote/protocol';
import type { ControlCommand, ControlRequest, PointerRequest } from '@electremote/protocol';

export type HostConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

const RECONNECT_DELAY_MS = 2_000;
const UNAVAILABLE_AFTER_ATTEMPTS = 3;
const ACKNOWLEDGEMENT_TIMEOUT_MS = 3_000;
const MAX_POINTER_BUFFER_BYTES = 1_024;

interface PendingRequest {
  command: ControlCommand;
  timeout: number;
}

export interface HostConnection {
  state: HostConnectionState;
  pendingCommands: ReadonlySet<ControlCommand>;
  pointerEnabled: boolean;
  pointerHolding: boolean;
  sendControl(command: ControlCommand): void;
  sendPointer(request: PointerRequest): void;
}

function getWebSocketUrl(): string {
  const url = new URL('/ws', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function useHostConnection(): HostConnection {
  const [state, setState] = useState<HostConnectionState>('connecting');
  const [pendingCommands, setPendingCommands] = useState<ReadonlySet<ControlCommand>>(
    () => new Set(),
  );
  const socketRef = useRef<WebSocket | null>(null);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [pointerHolding, setPointerHolding] = useState(false);
  const pointerEnabledRef = useRef(false);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    const pendingRequests = pendingRequestsRef.current;

    const connect = (): void => {
      if (!active) {
        return;
      }

      socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        attempts = 0;
        setState('connected');
      });

      socket.addEventListener('close', () => {
        if (!active) {
          return;
        }

        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        for (const request of pendingRequests.values()) {
          window.clearTimeout(request.timeout);
        }
        pendingRequests.clear();
        setPendingCommands(new Set());
        pointerEnabledRef.current = false;
        setPointerEnabled(false);
        setPointerHolding(false);

        attempts += 1;
        setState(attempts >= UNAVAILABLE_AFTER_ATTEMPTS ? 'unavailable' : 'reconnecting');
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });

      socket.addEventListener('message', (event) => {
        if (!active || typeof event.data !== 'string') {
          return;
        }

        let value: unknown;
        try {
          value = JSON.parse(event.data);
        } catch {
          return;
        }

        if (isPointerStatus(value)) {
          pointerEnabledRef.current = value.enabled;
          setPointerEnabled(value.enabled);
          setPointerHolding(value.holding);
          return;
        }

        if (!isControlResult(value)) {
          return;
        }

        const pendingRequest = pendingRequests.get(value.id);
        if (!pendingRequest) {
          return;
        }

        window.clearTimeout(pendingRequest.timeout);
        pendingRequests.delete(value.id);
        setPendingCommands((current) => {
          const next = new Set(current);
          next.delete(pendingRequest.command);
          return next;
        });

        if (!value.ok) {
          console.warn(`Control failed: ${value.error}`);
        }
      });
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      for (const request of pendingRequests.values()) {
        window.clearTimeout(request.timeout);
      }
      pendingRequests.clear();
      pointerEnabledRef.current = false;
      socket?.close();
      socketRef.current = null;
    };
  }, []);

  function sendControl(command: ControlCommand): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (
      [...pendingRequestsRef.current.values()].some(
        (pendingRequest) => pendingRequest.command === command,
      )
    ) {
      return;
    }

    requestSequenceRef.current += 1;
    const id = `${Date.now().toString(36)}-${requestSequenceRef.current.toString(36)}`;
    const request: ControlRequest = { type: 'control', id, command };
    const timeout = window.setTimeout(() => {
      const pendingRequest = pendingRequestsRef.current.get(id);
      if (!pendingRequest) {
        return;
      }

      pendingRequestsRef.current.delete(id);
      setPendingCommands((current) => {
        const next = new Set(current);
        next.delete(pendingRequest.command);
        return next;
      });
      console.warn(`Control acknowledgement timed out: ${command}`);
    }, ACKNOWLEDGEMENT_TIMEOUT_MS);

    pendingRequestsRef.current.set(id, { command, timeout });
    setPendingCommands((current) => new Set(current).add(command));
    socket.send(JSON.stringify(request));
  }

  const sendPointer = useCallback((request: PointerRequest): void => {
    const socket = socketRef.current;
    if (!pointerEnabledRef.current || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const isRelease = request.type === 'pointer-hold' && request.action === 'release';
    if (!isRelease && socket.bufferedAmount > MAX_POINTER_BUFFER_BYTES) {
      return;
    }

    socket.send(JSON.stringify(request));
  }, []);

  return { state, pendingCommands, pointerEnabled, pointerHolding, sendControl, sendPointer };
}
