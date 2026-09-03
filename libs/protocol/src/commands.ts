export const CONTROL_COMMANDS = [
  'play-pause',
  'volume-up',
  'volume-down',
  'rewind',
  'fast-forward',
] as const;

export type ControlCommand = (typeof CONTROL_COMMANDS)[number];

export function isControlCommand(value: unknown): value is ControlCommand {
  return CONTROL_COMMANDS.some((command) => command === value);
}
