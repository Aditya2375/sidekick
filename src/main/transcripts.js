'use strict';

// Local-only transcript store. Sessions are JSONL files under
// userData/transcripts. Text is encrypted with safeStorage before it touches
// disk. Nothing leaves the machine: no telemetry, no sync.
const fs = require('fs');
const path = require('path');

class TranscriptStore {
  constructor(dir, crypto) {
    this.dir = dir;
    this.crypto = crypto; // same injectable shape as SecureKeys
    this.sessionId = null;
    this.enabled = true;
  }

  setEnabled(flag) {
    this.enabled = !!flag;
  }

  startSession(id) {
    this.sessionId = id || new Date().toISOString().replace(/[:.]/g, '-');
    if (this.enabled) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    return this.sessionId;
  }

  fileFor(id) {
    const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
    return path.join(this.dir, safe + '.jsonl');
  }

  append(speaker, text) {
    if (!this.enabled || !this.sessionId || !this.crypto) return;
    if (typeof text !== 'string' || !text.trim()) return;
    const record = { t: Date.now(), speaker: String(speaker).slice(0, 32), text: text.slice(0, 4000) };
    let line;
    try {
      line = this.crypto.encryptString(JSON.stringify(record));
    } catch {
      return; // never write plaintext on crypto failure
    }
    fs.appendFileSync(this.fileFor(this.sessionId), line + '\n', { mode: 0o600 });
  }

  clearAll() {
    try {
      for (const f of fs.readdirSync(this.dir)) {
        if (f.endsWith('.jsonl')) fs.unlinkSync(path.join(this.dir, f));
      }
    } catch { /* empty dir */ }
  }
}

module.exports = { TranscriptStore };
