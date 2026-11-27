import { useEffect, useRef, useState } from 'react';
import {
  CLIPBOARD_REQUEST_HEADER,
  CLIPBOARD_TEXT_PATH,
  MAX_CLIPBOARD_TEXT_BYTES,
} from '@electremote/protocol';

const TOO_LARGE = 'Text is too large to transfer (1 MiB maximum).';

export function Clipboard() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const transferRef = useRef<AbortController | null>(null);
  const tooLarge =
    text.length > MAX_CLIPBOARD_TEXT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CLIPBOARD_TEXT_BYTES;

  useEffect(() => () => transferRef.current?.abort(), []);

  async function transfer(method: 'GET' | 'POST'): Promise<void> {
    if (transferRef.current) {
      return;
    }

    const controller = new AbortController();
    transferRef.current = controller;
    setBusy(true);
    setFeedback(null);
    try {
      const headers = { [CLIPBOARD_REQUEST_HEADER]: '1' };
      const response = await fetch(CLIPBOARD_TEXT_PATH, {
        method,
        headers:
          method === 'POST' ? { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } : headers,
        body: method === 'POST' ? text : null,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 413
            ? TOO_LARGE
            : response.status === 403
              ? 'Clipboard sharing is unavailable. Check Electremote on the desktop.'
              : 'The desktop could not transfer clipboard text.',
        );
      }

      if (method === 'POST') {
        setFeedback({ text: 'Desktop clipboard updated.', error: false });
      } else if (response.status === 204) {
        setFeedback({ text: 'No text in desktop clipboard.', error: false });
      } else {
        const bytes = await response.arrayBuffer();
        const received = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        setText(received);
        setFeedback({ text: 'Text received. Select it to copy on your phone.', error: false });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFeedback({
          text: error instanceof Error ? error.message : 'Clipboard transfer failed.',
          error: true,
        });
      }
    } finally {
      transferRef.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  return (
    <section className="clipboard-transfer" aria-label="Clipboard sharing">
      <label htmlFor="clipboard-text">Clipboard text</label>
      <p>Use your phone’s Copy or Paste menu in the box below.</p>
      <textarea
        id="clipboard-text"
        rows={8}
        value={text}
        readOnly={busy}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby="clipboard-feedback"
        aria-invalid={tooLarge}
        onChange={(event) => {
          setText(event.target.value);
          setFeedback(null);
        }}
        onPaste={(event) => {
          const field = event.currentTarget;
          if (!busy && field.selectionStart === 0 && field.selectionEnd === field.value.length) {
            const pasted = event.clipboardData.getData('text/plain');
            if (pasted) {
              event.preventDefault();
              setText(pasted);
              setFeedback(null);
            }
          }
        }}
      />
      <div className="keyboard-keys">
        <button
          className="view-button"
          type="button"
          disabled={busy}
          onClick={() => void transfer('GET')}
        >
          Get desktop clipboard
        </button>
        <button
          className="view-button"
          type="button"
          disabled={busy || text.length === 0 || tooLarge}
          onClick={() => void transfer('POST')}
        >
          Set desktop clipboard
        </button>
      </div>
      <p
        id="clipboard-feedback"
        className="keyboard-feedback"
        role="status"
        data-error={feedback?.error || tooLarge}
      >
        {busy
          ? 'Transferring...'
          : feedback?.text || (tooLarge ? TOO_LARGE : 'Plain text only. Maximum 1 MiB.')}
      </p>
    </section>
  );
}
