'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SecureKeys } = require('../src/main/secure-keys');

const fakeCrypto = () => ({
  encryptString: (s) => Buffer.from('enc:' + s).toString('base64'),
  decryptString: (b) => Buffer.from(b, 'base64').toString().replace(/^enc:/, ''),
  isAvailable: () => true
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-keys-'));
}

test('set/get/clear roundtrip', () => {
  const k = new SecureKeys(tmpDir(), fakeCrypto());
  k.set('groqApiKey', 'gsk_test_123');
  assert.strictEqual(k.get('groqApiKey'), 'gsk_test_123');
  assert.ok(k.has('groqApiKey'));
  // file on disk must not contain the raw key
  const raw = fs.readFileSync(k.fileFor('groqApiKey'), 'utf8');
  assert.ok(!raw.includes('gsk_test_123'));
  k.clear('groqApiKey');
  assert.ok(!k.has('groqApiKey'));
  assert.strictEqual(k.get('groqApiKey'), null);
});

test('rejects unknown names and bad values', () => {
  const k = new SecureKeys(tmpDir(), fakeCrypto());
  assert.throws(() => k.set('password', 'x'));
  assert.throws(() => k.set('groqApiKey', ''));
  assert.throws(() => k.set('groqApiKey', 'x'.repeat(600)));
});

test('status does not leak values', () => {
  const k = new SecureKeys(tmpDir(), fakeCrypto());
  k.set('geminiApiKey', 'secret-value');
  const s = k.status();
  assert.strictEqual(s.geminiApiKey, true);
  assert.ok(!JSON.stringify(s).includes('secret-value'));
});
