'use strict';

const { postJson, postForm } = require('./http');

const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function chat({ apiKey, model, messages, timeoutMs, fetchImpl, maxTokens = 600 }) {
  const data = await postJson({
    url: CHAT_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4
    },
    timeoutMs,
    fetchImpl
  });
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  if (!text) throw new Error('empty response from model');
  return text.trim();
}

async function transcribe({ apiKey, model, audioBuffer, mimeType, timeoutMs, fetchImpl }) {
  const form = new FormData();
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'wav';
  form.append('file', new Blob([audioBuffer], { type: mimeType }), `chunk.${ext}`);
  form.append('model', model);
  form.append('response_format', 'json');
  const data = await postForm({
    url: STT_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
    formData: form,
    timeoutMs,
    fetchImpl
  });
  if (!data || typeof data.text !== 'string') throw new Error('empty transcription');
  return data.text.trim();
}

module.exports = { chat, transcribe, CHAT_URL, STT_URL };
