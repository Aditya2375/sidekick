'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { LlmRouter } = require('../src/main/llm');

function makeRouter({ hasGemini, hasGroq, pref = 'auto', fetchImpl }) {
  const settings = { get: (k) => ({ llmProvider: pref, geminiModel: 'g-model', groqChatModel: 'q-model' })[k] };
  const keys = {
    has: (n) => (n === 'geminiApiKey' ? hasGemini : hasGroq),
    get: (n) => (n === 'geminiApiKey' ? 'gk' : 'qk')
  };
  return new LlmRouter({ settings, keys, fetchImpl });
}

const okFetch = (body) => async (url) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => ''
});

test('gemini happy path', async () => {
  const r = makeRouter({
    hasGemini: true, hasGroq: false,
    fetchImpl: okFetch({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] })
  });
  assert.strictEqual(await r.chat([{ role: 'user', content: 'hi' }]), 'hello');
});

test('falls back to groq when gemini fails', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('googleapis')) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' };
    }
    return {
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'from groq' } }] }),
      text: async () => ''
    };
  };
  const r = makeRouter({ hasGemini: true, hasGroq: true, fetchImpl });
  assert.strictEqual(await r.chat([{ role: 'user', content: 'hi' }]), 'from groq');
  assert.ok(calls >= 2);
});

test('NO_KEYS when nothing configured', async () => {
  const r = makeRouter({ hasGemini: false, hasGroq: false });
  await assert.rejects(() => r.chat([{ role: 'user', content: 'hi' }]), /No API key/);
});

test('explicit provider without key fails', async () => {
  const r = makeRouter({ hasGemini: false, hasGroq: true, pref: 'gemini' });
  await assert.rejects(() => r.chat([{ role: 'user', content: 'hi' }]), /No API key/);
});
