import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { MAX_POINTER_DELTA, MAX_POINTER_SCROLL_STEPS } from '@electremote/protocol';
import type { PointerRequest } from '@electremote/protocol';

const TAP_DISTANCE = 6;
const MOVE_SCALE = 2;
const SCROLL_STEP_DISTANCE = 24;
const SEND_INTERVAL_MS = 32;
const HOLD_KEEPALIVE_INTERVAL_MS = 1_000;

interface Gesture {
  id: number;
  action: 'move' | 'scroll';
  x: number;
  y: number;
  pendingX: number;
  pendingY: number;
  moved: boolean;
}

function boundedSteps(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, Math.trunc(value)));
}

export function Touchpad({
  holding,
  sendPointer,
}: {
  holding: boolean;
  sendPointer(request: PointerRequest): void;
}) {
  const gestureRef = useRef<Gesture | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const release = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = null;
      gestureRef.current = null;
      sendPointer({ type: 'pointer-hold', action: 'release' });
    };
    const releaseWhenHidden = () => {
      if (document.hidden) {
        release();
      }
    };
    document.addEventListener('visibilitychange', releaseWhenHidden);
    window.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', releaseWhenHidden);
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [sendPointer]);

  useEffect(() => {
    if (!holding) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        sendPointer({ type: 'pointer-hold', action: 'keepalive' });
      }
    }, HOLD_KEEPALIVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [holding, sendPointer]);

  function start(event: PointerEvent<HTMLDivElement>, action: Gesture['action']): void {
    if (!event.isPrimary || event.button !== 0 || gestureRef.current) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      id: event.pointerId,
      action,
      x: event.clientX,
      y: event.clientY,
      pendingX: 0,
      pendingY: 0,
      moved: false,
    };
  }

  function sendPending(gesture: Gesture): void {
    if (gesture.action === 'scroll') {
      const rawSteps = Math.trunc(gesture.pendingY / SCROLL_STEP_DISTANCE);
      if (rawSteps !== 0) {
        sendPointer({
          type: 'pointer-scroll',
          steps: boundedSteps(rawSteps, MAX_POINTER_SCROLL_STEPS),
        });
        gesture.pendingY -= rawSteps * SCROLL_STEP_DISTANCE;
      }
      return;
    }

    const x = boundedSteps(gesture.pendingX, MAX_POINTER_DELTA);
    const y = boundedSteps(gesture.pendingY, MAX_POINTER_DELTA);
    if (x !== 0 || y !== 0) {
      sendPointer({ type: 'pointer-move', x, y });
      gesture.pendingX %= 1;
      gesture.pendingY %= 1;
    }
  }

  function move(event: PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) {
      return;
    }

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < TAP_DISTANCE) {
      return;
    }

    gesture.moved = true;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (gesture.action === 'scroll') {
      gesture.pendingY += dy;
    } else {
      gesture.pendingX += dx * MOVE_SCALE;
      gesture.pendingY += dy * MOVE_SCALE;
    }
    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        sendPending(gesture);
      }, SEND_INTERVAL_MS);
    }
  }

  function finish(event: PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) {
      return;
    }

    gestureRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (event.type !== 'pointerup') {
      return;
    }

    if (
      gesture.action === 'move' &&
      !holding &&
      !gesture.moved &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < TAP_DISTANCE
    ) {
      sendPointer({ type: 'pointer-click', button: 'left' });
    } else {
      sendPending(gesture);
    }
  }

  return (
    <section className="touchpad" aria-label="Phone touchpad">
      <p>
        {holding
          ? 'Slide to drag. Tap Release left when you are done.'
          : 'Slide to move, tap to click, or use the side strip to scroll.'}
      </p>
      <div className="touchpad-surfaces">
        <div
          className="touchpad-surface"
          onPointerDown={(event) => start(event, 'move')}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        >
          {holding ? 'Drag' : 'Move / tap'}
        </div>
        <div
          className="touchpad-surface touchpad-scroll"
          onPointerDown={(event) => start(event, 'scroll')}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        >
          Scroll
        </div>
      </div>
      <div className="touchpad-actions">
        <button
          className="view-button"
          type="button"
          aria-pressed={holding}
          aria-label="Hold left mouse button"
          onClick={() =>
            sendPointer({ type: 'pointer-hold', action: holding ? 'release' : 'start' })
          }
        >
          {holding ? 'Release left' : 'Hold left'}
        </button>
        <button
          className="view-button"
          type="button"
          disabled={holding}
          onClick={() => sendPointer({ type: 'pointer-click', button: 'right' })}
        >
          Right click
        </button>
        <button
          className="view-button"
          type="button"
          disabled={holding}
          onClick={() => sendPointer({ type: 'pointer-click', button: 'middle' })}
        >
          Middle click
        </button>
      </div>
    </section>
  );
}
