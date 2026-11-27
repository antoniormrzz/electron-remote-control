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

export const KEYBOARD_NAVIGATION_KEYS = [
  'escape',
  'tab',
  'enter',
  'backspace',
  'up',
  'left',
  'down',
  'right',
] as const;
export const KEYBOARD_FUNCTION_KEYS = [
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
] as const;
export const KEYBOARD_MODIFIERS = ['control', 'alt', 'shift', 'command'] as const;
export const MAX_KEYBOARD_TEXT_LENGTH = 120;
export type KeyboardModifier = (typeof KEYBOARD_MODIFIERS)[number];
export type KeyboardTextSupport = 'ascii' | 'bmp';
export type KeyboardAction =
  | { type: 'keyboard-text'; text: string }
  | { type: 'keyboard-shortcut'; key: string | null; modifiers: KeyboardModifier[] };
export type KeyboardRequest = KeyboardAction & { id: string };
export interface KeyboardStatus {
  type: 'keyboard-status';
  enabled: boolean;
  primaryModifier: 'control' | 'command';
  textSupport: KeyboardTextSupport;
}
export type KeyboardError = ControlError | 'disabled' | 'unsupported-text' | 'busy';
export type KeyboardResult =
  | { type: 'keyboard-result'; id: string; ok: true }
  | { type: 'keyboard-result'; id: string; ok: false; error: KeyboardError };

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

export function isKeyboardTextSupported(text: string, support: KeyboardTextSupport): boolean {
  if (text.length === 0 || text.length > MAX_KEYBOARD_TEXT_LENGTH) {
    return false;
  }
  return support === 'ascii'
    ? !/[^\x20-\x7e]/.test(text)
    : !/[\p{C}\p{Zl}\p{Zp}\u{10000}-\u{10ffff}]/u.test(text);
}

export function isKeyboardRequest(value: unknown): value is KeyboardRequest {
  if (!isRecord(value) || !isRequestId(value.id)) {
    return false;
  }
  if (value.type === 'keyboard-text') {
    return (
      typeof value.text === 'string' &&
      value.text.length > 0 &&
      value.text.length <= MAX_KEYBOARD_TEXT_LENGTH
    );
  }
  if (value.type !== 'keyboard-shortcut' || !Array.isArray(value.modifiers)) {
    return false;
  }

  const { key, modifiers } = value;
  if (
    modifiers.length > KEYBOARD_MODIFIERS.length ||
    new Set(modifiers).size !== modifiers.length ||
    !modifiers.every((modifier: unknown) => KEYBOARD_MODIFIERS.some((name) => name === modifier))
  ) {
    return false;
  }
  return key === null
    ? modifiers.length >= 2
    : typeof key === 'string' &&
        (key === 'space' ||
          key === 'delete' ||
          KEYBOARD_NAVIGATION_KEYS.some((name) => name === key) ||
          KEYBOARD_FUNCTION_KEYS.some((name) => name === key) ||
          /^[a-z0-9]$/.test(key));
}

export function isKeyboardStatus(value: unknown): value is KeyboardStatus {
  return (
    isRecord(value) &&
    value.type === 'keyboard-status' &&
    typeof value.enabled === 'boolean' &&
    (value.primaryModifier === 'control' || value.primaryModifier === 'command') &&
    (value.textSupport === 'ascii' || value.textSupport === 'bmp')
  );
}

export function isKeyboardResult(value: unknown): value is KeyboardResult {
  return (
    isRecord(value) &&
    value.type === 'keyboard-result' &&
    isRequestId(value.id) &&
    (value.ok === true ||
      (value.ok === false &&
        (value.error === 'permission-required' ||
          value.error === 'execution-failed' ||
          value.error === 'disabled' ||
          value.error === 'unsupported-text' ||
          value.error === 'busy')))
  );
}
