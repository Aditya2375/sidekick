'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TranscriptStore } = require('../src/main/transcripts');

const fakeCrypto = {
  encryptString: (s) => Buffer.from('enc:' + s).toString('base64'),
  decryptString: (b) => Buffer.from(b, 'base64').toString().replace(/^enc:/, ''),
  isAvailable: () => true
};

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-tr-')); }

test('append and clear', () => {
  const dir = tmpDir();
  const t = new TranscriptStore(dir, fakeCrypto);
  t.startSession('s1');
  t.append('you', 'hello world');
  const file = path.join(dir, 's1.jsonl');
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(!content.includes('hello world')); // encrypted at rest
  t.clearAll();
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).length, 0);
});

test('disabled store writes nothing', () => {
  const dir = tmpDir();
  const t = new TranscriptStore(dir, fakeCrypto);
  t.setEnabled(false);
  t.startSession('s2');
  t.append('you', 'secret');
  assert.strictEqual(fs.existsSync(path.join(dir, 's2.jsonl')), false);
});

test('crypto failure never writes plaintext', () => {
  const dir = tmpDir();
  const badCrypto = { encryptString: () => { throw new Error('no'); } };
  const t = new TranscriptStore(dir, badCrypto);
  t.startSession('s3');
  t.append('you', 'plaintext must not land');
  const file = path.join(dir, 's3.jsonl');
  if (fs.existsSync(file)) {
    assert.ok(!fs.readFileSync(file, 'utf8').includes('plaintext must not land'));
  }
});
