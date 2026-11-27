export const MAX_CLIPBOARD_TEXT_BYTES = 1024 * 1024;
export const CLIPBOARD_TEXT_PATH = '/api/clipboard/text';
export const CLIPBOARD_REQUEST_HEADER = 'X-Electremote-Clipboard';
export const CLIPBOARD_FOCUS_REQUIRED_STATUS = 409;

export interface ClipboardStatus {
  type: 'clipboard-status';
  enabled: boolean;
}

export function isClipboardStatus(value: unknown): value is ClipboardStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'clipboard-status' &&
    'enabled' in value &&
    typeof value.enabled === 'boolean'
  );
}
