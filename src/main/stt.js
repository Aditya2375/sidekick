'use strict';

// Speech-to-text routing: Groq whisper-large-v3-turbo (free tier) primary;
// local faster-whisper sidecar as offline fallback. If neither is available
// the caller gets a typed error the UI can show.
const groq = require('./providers/groq');
const { LIMITS } = require('../shared/constants');

class SttRouter {
  constructor({ settings, keys, sidecar, fetchImpl }) {
    this.settings = settings;
    this.keys = keys;
    this.sidecar = sidecar;
    this.fetchImpl = fetchImpl;
  }

  order() {
    const pref = this.settings.get('sttProvider');
    const groqReady = this.keys.has('groqApiKey');
    const sidecarReady = this.sidecar && this.sidecar.isReady();
    if (pref === 'groq') return groqReady ? ['groq'] : [];
    if (pref === 'sidecar') return sidecarReady ? ['sidecar'] : [];
    const list = [];
    if (groqReady) list.push('groq');
    if (sidecarReady) list.push('sidecar');
    return list;
  }

  async transcribe(audioBuffer, mimeType) {
    const order = this.order();
    if (order.length === 0) {
      const err = new Error('No transcription available: add a Groq API key or start the local whisper sidecar.');
      err.code = 'NO_STT';
      throw err;
    }
    let lastError = null;
    for (const provider of order) {
      try {
        if (provider === 'groq') {
          return await groq.transcribe({
            apiKey: this.keys.get('groqApiKey'),
            model: this.settings.get('groqSttModel'),
            audioBuffer,
            mimeType,
            timeoutMs: LIMITS.STT_TIMEOUT_MS,
            fetchImpl: this.fetchImpl
          });
        }
        return await this.sidecar.transcribe(audioBuffer, mimeType);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('all stt providers failed');
  }
}

module.exports = { SttRouter };
