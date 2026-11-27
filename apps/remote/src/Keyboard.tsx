import { useState } from 'react';
import {
  KEYBOARD_FUNCTION_KEYS,
  KEYBOARD_MODIFIERS,
  KEYBOARD_NAVIGATION_KEYS,
  MAX_KEYBOARD_TEXT_LENGTH,
  isKeyboardTextSupported,
} from '@electremote/protocol';
import type {
  KeyboardAction,
  KeyboardError,
  KeyboardModifier,
  KeyboardResult,
  KeyboardStatus,
} from '@electremote/protocol';

const KEY_LABELS = {
  escape: 'Esc',
  tab: 'Tab',
  enter: 'Enter',
  backspace: 'Backspace',
  up: 'Up',
  left: 'Left',
  down: 'Down',
  right: 'Right',
} satisfies Record<(typeof KEYBOARD_NAVIGATION_KEYS)[number], string>;

const MODIFIER_LABELS: Record<KeyboardModifier, string> = {
  control: 'Ctrl',
  alt: 'Alt / Option',
  shift: 'Shift',
  command: 'Cmd / Super',
};

const EDIT_SHORTCUTS = [
  { key: 'c', label: 'Copy' },
  { key: 'v', label: 'Paste' },
  { key: 'a', label: 'Select all' },
];

const SHORTCUT_ERRORS: Record<KeyboardError, string> = {
  disabled: 'The phone keyboard is off on the desktop.',
  'permission-required': 'Keyboard input is unavailable. Check Electremote on the desktop.',
  'execution-failed': 'The desktop could not send the keyboard action.',
  'unsupported-text': 'This desktop does not support one or more characters in the text.',
  busy: 'Wait a moment or release the held mouse button, then try again.',
};

export function Keyboard({
  status,
  sendKeyboard,
}: {
  status: KeyboardStatus;
  sendKeyboard(action: KeyboardAction): Promise<KeyboardResult>;
}) {
  const [text, setText] = useState('');
  const [key, setKey] = useState('');
  const [modifiers, setModifiers] = useState<KeyboardModifier[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  const textValid = isKeyboardTextSupported(text, status.textSupport);
  const textError =
    text.length > MAX_KEYBOARD_TEXT_LENGTH
      ? `Send up to ${MAX_KEYBOARD_TEXT_LENGTH} characters at a time.`
      : text && !textValid
        ? status.textSupport === 'ascii'
          ? 'Use plain ASCII text on Linux, without line breaks.'
          : 'Remove emoji outside the basic Unicode range, line breaks, or control characters.'
        : '';

  async function send(action: KeyboardAction): Promise<void> {
    setSending(true);
    setFeedback(null);
    try {
      const result = await sendKeyboard(action);
      if (!result.ok) {
        setFeedback({ text: SHORTCUT_ERRORS[result.error], error: true });
        return;
      }

      if (action.type === 'keyboard-text') {
        setText((current) => (current === action.text ? '' : current));
      }
      setFeedback({
        text: action.type === 'keyboard-text' ? 'Text sent.' : 'Shortcut sent.',
        error: false,
      });
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : 'Could not send the keyboard action.',
        error: true,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="phone-keyboard" aria-label="Phone keyboard">
      <form
        className="keyboard-text"
        onSubmit={(event) => {
          event.preventDefault();
          if (textValid && !sending) {
            void send({ type: 'keyboard-text', text });
          }
        }}
      >
        <label htmlFor="phone-keyboard-text">Type on the desktop</label>
        <p>Focus the field on your computer, then type here and send the text.</p>
        <textarea
          id="phone-keyboard-text"
          rows={3}
          value={text}
          aria-describedby="keyboard-text-hint"
          aria-invalid={Boolean(textError)}
          onChange={(event) => {
            setText(event.target.value);
            setFeedback(null);
          }}
        />
        <p id="keyboard-text-hint">
          {textError || `${text.length} / ${MAX_KEYBOARD_TEXT_LENGTH} characters`}
        </p>
        <button className="view-button" type="submit" disabled={!textValid || sending}>
          Send text
        </button>
      </form>

      <div className="keyboard-keys" aria-label="Common shortcuts" role="group">
        {KEYBOARD_NAVIGATION_KEYS.map((key) => (
          <button
            className="view-button"
            type="button"
            key={key}
            disabled={sending}
            onClick={() => void send({ type: 'keyboard-shortcut', key, modifiers: [] })}
          >
            {KEY_LABELS[key]}
          </button>
        ))}
        {EDIT_SHORTCUTS.map(({ key, label }) => (
          <button
            className="view-button"
            type="button"
            key={key}
            disabled={sending}
            onClick={() =>
              void send({ type: 'keyboard-shortcut', key, modifiers: [status.primaryModifier] })
            }
          >
            {label}
          </button>
        ))}
      </div>

      <details className="keyboard-composer">
        <summary>Compose shortcut</summary>
        <fieldset>
          <legend>Modifiers</legend>
          <div className="keyboard-modifiers">
            {KEYBOARD_MODIFIERS.map((modifier) => (
              <label key={modifier}>
                <input
                  type="checkbox"
                  checked={modifiers.includes(modifier)}
                  onChange={(event) => {
                    setModifiers(
                      event.target.checked
                        ? [...modifiers, modifier]
                        : modifiers.filter((value) => value !== modifier),
                    );
                  }}
                />
                {MODIFIER_LABELS[modifier]}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Key
          <select value={key} onChange={(event) => setKey(event.target.value)}>
            <option value="">Modifiers only</option>
            {[...'abcdefghijklmnopqrstuvwxyz0123456789'].map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
            {KEYBOARD_NAVIGATION_KEYS.map((value) => (
              <option key={value} value={value}>
                {KEY_LABELS[value]}
              </option>
            ))}
            <option value="space">Space</option>
            <option value="delete">Delete</option>
            <optgroup label="Function keys">
              {KEYBOARD_FUNCTION_KEYS.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          className="view-button"
          type="button"
          disabled={sending || (!key && modifiers.length < 2)}
          onClick={() => void send({ type: 'keyboard-shortcut', key: key || null, modifiers })}
        >
          Send shortcut
        </button>
      </details>

      <p className="keyboard-feedback" role="status" data-error={feedback?.error}>
        {sending ? 'Sending…' : feedback?.text}
      </p>
    </section>
  );
}
