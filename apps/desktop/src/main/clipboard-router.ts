import {
  CLIPBOARD_REQUEST_HEADER,
  CLIPBOARD_TEXT_PATH,
  MAX_CLIPBOARD_TEXT_BYTES,
} from '@electremote/protocol';
import express from 'express';
import type { ErrorRequestHandler } from 'express';

export interface TextClipboard {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export function createClipboardRouter(
  clipboard: TextClipboard,
  getAccessVersion: () => number | null,
): express.Router {
  const router = express.Router();
  const parseText = express.raw({
    type: 'text/plain',
    limit: MAX_CLIPBOARD_TEXT_BYTES,
    inflate: false,
  });
  const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (typeof error === 'object' && error && 'status' in error) {
      if (error.status === 413 || error.status === 415 || error.status === 400) {
        response.sendStatus(error.status);
        return;
      }
    }
    // Clipboard content must never appear in logs.
    console.error('Desktop clipboard request failed.');
    response.sendStatus(500);
  };

  router.use(CLIPBOARD_TEXT_PATH, (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const accessVersion = getAccessVersion();
    // Require a header that cross-origin browser requests cannot send without CORS approval.
    if (accessVersion === null || request.get(CLIPBOARD_REQUEST_HEADER) !== '1') {
      response.sendStatus(403);
      return;
    }
    response.locals.accessVersion = accessVersion;
    next();
  });

  router.get(CLIPBOARD_TEXT_PATH, async (_request, response) => {
    const text = await clipboard.readText();
    if (response.locals.accessVersion !== getAccessVersion()) {
      response.sendStatus(403);
    } else if (text.length === 0) {
      response.status(204).end();
    } else if (Buffer.byteLength(text, 'utf8') > MAX_CLIPBOARD_TEXT_BYTES) {
      response.sendStatus(413);
    } else {
      response.type('text/plain; charset=utf-8').end(text, 'utf8');
    }
  });

  router.post(CLIPBOARD_TEXT_PATH, parseText, async (request, response) => {
    if (response.locals.accessVersion !== getAccessVersion()) {
      response.sendStatus(403);
      return;
    }
    if (!request.is('text/plain')) {
      response.sendStatus(415);
      return;
    }
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      response.sendStatus(400);
      return;
    }

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(request.body);
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
      response.sendStatus(400);
      return;
    }

    await clipboard.writeText(text);
    response.status(204).end();
  });

  router.use(CLIPBOARD_TEXT_PATH, handleError);
  return router;
}
