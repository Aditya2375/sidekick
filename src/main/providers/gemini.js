'use strict';

const { postJson } = require('./http');

function urlFor(model) {
  const safe = encodeURIComponent(model);
  return `https://generativelanguage.googleapis.com/v1beta/models/${safe}:generateContent`;
}

async function chat({ apiKey, model, messages, timeoutMs, fetchImpl, maxTokens = 600 }) {
  // Convert OpenAI-style messages to Gemini contents.
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 }
  };
  if (systemParts) {
    body.systemInstruction = { parts: [{ text: systemParts }] };
  }
  const data = await postJson({
    url: urlFor(model),
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body,
    timeoutMs,
    fetchImpl
  });
  const candidates = data && data.candidates;
  const parts = candidates && candidates[0] && candidates[0].content && candidates[0].content.parts;
  const text = parts && parts.map((p) => p.text || '').join('');
  if (!text) throw new Error('empty response from model');
  return text.trim();
}

module.exports = { chat, urlFor };
