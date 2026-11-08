'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { postJson } = require('../src/main/providers/http');

test('retries 429 then succeeds', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n++;
    if (n === 1) return { ok: false, status: 429, json: async () => ({}), text: async () => 'rate' };
    return { ok: true, status: 200, json: async () => ({ done: true }), text: async () => '' };
  };
  const res = await postJson({ url: 'https://x', headers: {}, body: {}, timeoutMs: 5000, fetchImpl, retries: 2 });
  assert.strictEqual(res.done, true);
  assert.strictEqual(n, 2);
});

test('does not retry 401', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n++;
    return { ok: false, status: 401, json: async () => ({}), text: async () => 'bad key' };
  };
  await assert.rejects(
    postJson({ url: 'https://x', headers: {}, body: {}, timeoutMs: 5000, fetchImpl, retries: 3 }),
    /401/
  );
  assert.strictEqual(n, 1);
});
