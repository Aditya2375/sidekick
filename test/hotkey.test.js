'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isValidAccelerator } = require('../src/main/hotkey');

test('accepts normal combos', () => {
  assert.ok(isValidAccelerator('Control+Shift+Space'));
  assert.ok(isValidAccelerator('Ctrl+Alt+K'));
  assert.ok(isValidAccelerator('Shift+F9'));
});

test('rejects junk', () => {
  assert.ok(!isValidAccelerator(''));
  assert.ok(!isValidAccelerator('Space'));
  assert.ok(!isValidAccelerator('Control+'));
  assert.ok(!isValidAccelerator('Control+Shift'));
  assert.ok(!isValidAccelerator('Control+Shift+Alt+A+B'));
  assert.ok(!isValidAccelerator('Control+A'.repeat(20)));
  assert.ok(!isValidAccelerator('Evil+Key'));
  assert.ok(!isValidAccelerator(42));
  assert.ok(!isValidAccelerator('Control+Control+A'));
});
