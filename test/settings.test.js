'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../src/main/settings');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-')), 'settings.json');
}

test('defaults and roundtrip', () => {
  const f = tmpFile();
  const s = new SettingsStore(f);
  assert.strictEqual(s.get('hotkey'), 'Control+Shift+Space');
  assert.strictEqual(s.get('captureExclusion'), false);
  s.set({ mode: 'meeting', opacity: 0.8 });
  const s2 = new SettingsStore(f);
  assert.strictEqual(s2.get('mode'), 'meeting');
  assert.strictEqual(s2.get('opacity'), 0.8);
});

test('rejects unknown keys and wrong types', () => {
  const s = new SettingsStore(tmpFile());
  s.set({ evil: true, hotkey: 42, mode: 'assist' });
  assert.strictEqual(s.get('evil'), undefined);
  assert.strictEqual(s.get('hotkey'), 'Control+Shift+Space');
});

test('corrupt file falls back to defaults', () => {
  const f = tmpFile();
  fs.writeFileSync(f, '{not json');
  const s = new SettingsStore(f);
  assert.strictEqual(s.get('mode'), 'assist');
});
