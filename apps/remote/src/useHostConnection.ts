import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isControlResult,
  isKeyboardResult,
  isKeyboardStatus,
  isPointerStatus,
} from '@electremote/protocol';
import type {
  ControlCommand,
  ControlRequest,
  KeyboardAction,
  KeyboardRequest,
  KeyboardResult,
  KeyboardStatus,
  PointerRequest,
} from '@electremote/protocol';

export type HostConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

const RECONNECT_DELAY_MS = 2_000;
const UNAVAILABLE_AFTER_ATTEMPTS = 3;
const ACKNOWLEDGEMENT_TIMEOUT_MS = 3_000;
const MAX_INPUT_BUFFER_BYTES = 1_024;

interface PendingRequest {
  command: ControlCommand;
  timeout: number;
}

interface PendingKeyboardRequest {
  id: string;
  timeout: number;
  resolve(result: KeyboardResult): void;
  reject(error: Error): void;
}

function cancelKeyboardRequest(request: PendingKeyboardRequest | null): void {
  if (request) {
    window.clearTimeout(request.timeout);
    request.reject(new Error('Connection lost. The last keyboard action may have been sent.'));
  }
}

export interface HostConnection {
  state: HostConnectionState;
  pendingCommands: ReadonlySet<ControlCommand>;
  pointerEnabled: boolean;
  pointerHolding: boolean;
  keyboard: KeyboardStatus | null;
  sendControl(command: ControlCommand): void;
  sendPointer(request: PointerRequest): void;
  sendKeyboard(action: KeyboardAction): Promise<KeyboardResult>;
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
  const [keyboard, setKeyboard] = useState<KeyboardStatus | null>(null);
  const keyboardEnabledRef = useRef(false);
  const pendingKeyboardRef = useRef<PendingKeyboardRequest | null>(null);
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
        keyboardEnabledRef.current = false;
        setKeyboard(null);
        cancelKeyboardRequest(pendingKeyboardRef.current);
        pendingKeyboardRef.current = null;

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

        if (isKeyboardStatus(value)) {
          keyboardEnabledRef.current = value.enabled;
          setKeyboard(value);
          return;
        }

        if (isKeyboardResult(value)) {
          const pending = pendingKeyboardRef.current;
          if (pending?.id === value.id) {
            window.clearTimeout(pending.timeout);
            pendingKeyboardRef.current = null;
            pending.resolve(value);
          }
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
      keyboardEnabledRef.current = false;
      cancelKeyboardRequest(pendingKeyboardRef.current);
      pendingKeyboardRef.current = null;
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
    if (!isRelease && socket.bufferedAmount > MAX_INPUT_BUFFER_BYTES) {
      return;
    }

    socket.send(JSON.stringify(request));
  }, []);

  function sendKeyboard(action: KeyboardAction): Promise<KeyboardResult> {
    const socket = socketRef.current;
    if (!keyboardEnabledRef.current || !socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('The phone keyboard is unavailable.'));
    }
    if (pendingKeyboardRef.current) {
      return Promise.reject(new Error('Wait for the current keyboard action to finish.'));
    }
    if (socket.bufferedAmount > MAX_INPUT_BUFFER_BYTES) {
      return Promise.reject(new Error('The connection is busy. Try again.'));
    }

    const id = `keyboard-${++requestSequenceRef.current}`;
    const request: KeyboardRequest = { ...action, id };
    return new Promise((resolve, reject) => {
      socket.send(JSON.stringify(request));
      const timeout = window.setTimeout(() => {
        pendingKeyboardRef.current = null;
        reject(new Error('No response from the desktop. Check before sending again.'));
      }, ACKNOWLEDGEMENT_TIMEOUT_MS);
      pendingKeyboardRef.current = { id, timeout, resolve, reject };
    });
  }

  return {
    state,
    pendingCommands,
    pointerEnabled,
    pointerHolding,
    keyboard,
    sendControl,
    sendPointer,
    sendKeyboard,
  };
}
