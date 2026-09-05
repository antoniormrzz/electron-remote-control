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
