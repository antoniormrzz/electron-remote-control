export const CONTROL_COMMANDS = [
  'play-pause',
  'volume-up',
  'volume-down',
  'rewind',
  'fast-forward',
] as const;

export type ControlCommand = (typeof CONTROL_COMMANDS)[number];

export interface ControlRequest {
  type: 'control';
  id: string;
  command: ControlCommand;
}

export type ControlError = 'permission-required' | 'execution-failed';

export type ControlResult =
  | {
      type: 'control-result';
      id: string;
      ok: true;
    }
  | {
      type: 'control-result';
      id: string;
      ok: false;
      error: ControlError;
    };

export type PointerRequest =
  | { type: 'pointer-move'; x: number; y: number }
  | { type: 'pointer-scroll'; steps: number }
  | { type: 'pointer-click'; button: 'left' | 'middle' | 'right' }
  | { type: 'pointer-hold'; action: 'start' | 'keepalive' | 'release' };

export interface PointerStatus {
  type: 'pointer-status';
  enabled: boolean;
  holding: boolean;
}

export const MAX_POINTER_DELTA = 96;
export const MAX_POINTER_SCROLL_STEPS = 4;

const MAX_REQUEST_ID_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_REQUEST_ID_LENGTH;
}

export function isControlCommand(value: unknown): value is ControlCommand {
  return CONTROL_COMMANDS.some((command) => command === value);
}

export function isControlRequest(value: unknown): value is ControlRequest {
  return (
    isRecord(value) &&
    value.type === 'control' &&
    isRequestId(value.id) &&
    isControlCommand(value.command)
  );
}

export function isControlResult(value: unknown): value is ControlResult {
  if (!isRecord(value) || value.type !== 'control-result' || !isRequestId(value.id)) {
    return false;
  }

  return (
    value.ok === true ||
    (value.ok === false &&
      (value.error === 'permission-required' || value.error === 'execution-failed'))
  );
}

function isBoundedInteger(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= limit;
}

export function isPointerRequest(value: unknown): value is PointerRequest {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case 'pointer-move':
      return (
        isBoundedInteger(value.x, MAX_POINTER_DELTA) &&
        isBoundedInteger(value.y, MAX_POINTER_DELTA) &&
        (value.x !== 0 || value.y !== 0)
      );
    case 'pointer-scroll':
      return isBoundedInteger(value.steps, MAX_POINTER_SCROLL_STEPS) && value.steps !== 0;
    case 'pointer-click':
      return value.button === 'left' || value.button === 'middle' || value.button === 'right';
    case 'pointer-hold':
      return value.action === 'start' || value.action === 'keepalive' || value.action === 'release';
    default:
      return false;
  }
}

export function isPointerStatus(value: unknown): value is PointerStatus {
  return (
    isRecord(value) &&
    value.type === 'pointer-status' &&
    typeof value.enabled === 'boolean' &&
    typeof value.holding === 'boolean'
  );
}
