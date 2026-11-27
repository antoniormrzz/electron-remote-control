import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_KEYBOARD_TEXT_LENGTH,
  isKeyboardRequest,
  isKeyboardTextSupported,
} from '../src/commands.ts';

test('text validation rejects unsupported characters without changing the text', () => {
  assert.equal(isKeyboardTextSupported('Beyoncé – music', 'bmp'), true);
  assert.equal(isKeyboardTextSupported('cats & dogs', 'ascii'), true);
  assert.equal(isKeyboardTextSupported('Beyoncé', 'ascii'), false);
  for (const text of ['😀', '\ud800', 'text\nEnter', 'null\0byte']) {
    assert.equal(isKeyboardTextSupported(text, 'bmp'), false);
  }
});

test('keyboard requests bound text length and reject unrecognized keys and modifiers', () => {
  const text = { type: 'keyboard-text', id: 'text', text: 'a'.repeat(MAX_KEYBOARD_TEXT_LENGTH) };
  assert.equal(isKeyboardRequest(text), true);
  assert.equal(isKeyboardRequest({ ...text, text: `${text.text}a` }), false);

  const shortcut = { type: 'keyboard-shortcut', id: 'copy', key: 'c', modifiers: ['command'] };
  assert.equal(isKeyboardRequest(shortcut), true);
  assert.equal(isKeyboardRequest({ ...shortcut, key: 'audio_play' }), false);
  assert.equal(isKeyboardRequest({ ...shortcut, modifiers: ['unknown'] }), false);
  assert.equal(isKeyboardRequest({ ...shortcut, modifiers: ['shift', 'shift'] }), false);
});

test('modifier-only shortcuts require at least two distinct modifiers', () => {
  const shortcut = {
    type: 'keyboard-shortcut',
    id: 'chord',
    key: null,
    modifiers: ['shift', 'alt'],
  };
  assert.equal(isKeyboardRequest(shortcut), true);
  assert.equal(isKeyboardRequest({ ...shortcut, modifiers: ['shift'] }), false);
});

test('shortcut composer accepts Alt+F4, Shift+Delete, and Command+Space', () => {
  const shortcut = { type: 'keyboard-shortcut', id: 'shortcut' };
  assert.equal(isKeyboardRequest({ ...shortcut, key: 'f4', modifiers: ['alt'] }), true);
  assert.equal(isKeyboardRequest({ ...shortcut, key: 'delete', modifiers: ['shift'] }), true);
  assert.equal(isKeyboardRequest({ ...shortcut, key: 'space', modifiers: ['command'] }), true);
  assert.equal(isKeyboardRequest({ ...shortcut, key: 'f12', modifiers: [] }), true);
  assert.equal(isKeyboardRequest({ ...shortcut, key: 'f13', modifiers: [] }), false);
});
