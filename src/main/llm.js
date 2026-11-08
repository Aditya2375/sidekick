'use strict';

// LLM routing: pick a provider based on settings + which keys exist, with
// automatic failover in 'auto' mode. Keys are resolved lazily so they sit in
// memory only while a request is in flight.
const groq = require('./providers/groq');
const gemini = require('./providers/gemini');
const { LIMITS } = require('../shared/constants');

const MEETING_SYSTEM = [
  'You are a live meeting assistant. You receive rolling transcript excerpts.',
  'Reply with at most 3 short bullet points: suggested things to say, questions to ask, or facts to mention.',
  'Be concrete and brief. No preamble, no disclaimers.'
].join(' ');

const ASSIST_SYSTEM = [
  'You are a study assistant. Answer clearly and concisely.',
  'Prefer short explanations with an example when useful.',
  'If a question is ambiguous, state your assumption and answer.'
].join(' ');

class LlmRouter {
  constructor({ settings, keys, fetchImpl }) {
    this.settings = settings;
    this.keys = keys;
    this.fetchImpl = fetchImpl;
  }

  providerOrder() {
    const pref = this.settings.get('llmProvider');
    const has = {
      gemini: this.keys.has('geminiApiKey'),
      groq: this.keys.has('groqApiKey')
    };
    if (pref === 'gemini') return has.gemini ? ['gemini'] : [];
    if (pref === 'groq') return has.groq ? ['groq'] : [];
    // auto: prefer gemini, fall back to groq
    return ['gemini', 'groq'].filter((p) => has[p]);
  }

  async chat(messages, { mode } = {}) {
    const order = this.providerOrder();
    if (order.length === 0) {
      const err = new Error('No API key configured. Open Settings in the overlay.');
      err.code = 'NO_KEYS';
      throw err;
    }
    const system = mode === 'meeting' ? MEETING_SYSTEM : ASSIST_SYSTEM;
    const full = [{ role: 'system', content: system }, ...messages];
    let lastError = null;
    for (const provider of order) {
      try {
        if (provider === 'gemini') {
          return await gemini.chat({
            apiKey: this.keys.get('geminiApiKey'),
            model: this.settings.get('geminiModel'),
            messages: full,
            timeoutMs: LIMITS.LLM_TIMEOUT_MS,
            fetchImpl: this.fetchImpl
          });
        }
        return await groq.chat({
          apiKey: this.keys.get('groqApiKey'),
          model: this.settings.get('groqChatModel'),
          messages: full,
          timeoutMs: LIMITS.LLM_TIMEOUT_MS,
          fetchImpl: this.fetchImpl
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('all providers failed');
  }
}

module.exports = { LlmRouter, MEETING_SYSTEM, ASSIST_SYSTEM };
