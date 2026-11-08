'use strict';

// Local faster-whisper fallback. Runs a small Python HTTP server (see
// sidecar/faster_whisper_server.py) bound to 127.0.0.1 with a per-launch auth
// token, only when the user enables it and Python + faster-whisper are
// installed. The child is killed on quit - nothing outlives the app.
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

class WhisperSidecar {
  constructor({ pythonCmd = 'python3', port = 0 } = {}) {
    this.pythonCmd = pythonCmd;
    this.port = port; // 0 = pick a free port at start
    this.child = null;
    this.token = null;
    this.actualPort = null;
    this.enabled = false;
  }

  isReady() {
    return !!(this.child && this.actualPort);
  }

  async start() {
    if (this.child) return this.isReady();
    this.token = crypto.randomBytes(24).toString('hex');
    const script = path.join(__dirname, '..', '..', 'sidecar', 'faster_whisper_server.py');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (!settled) { settled = true; resolve(ok); }
      };
      try {
        this.child = spawn(this.pythonCmd, [script, '--token', this.token, '--port', String(this.port)], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch {
        this.child = null;
        return finish(false);
      }
      const killer = setTimeout(() => { this.stop(); finish(false); }, 60000);
      let buffer = '';
      this.child.stdout.on('data', (d) => {
        buffer += d.toString();
        const m = buffer.match(/READY port=(\d+)/);
        if (m) {
          this.actualPort = Number(m[1]);
          clearTimeout(killer);
          finish(true);
        }
      });
      this.child.on('error', () => { clearTimeout(killer); finish(false); });
      this.child.on('exit', () => {
        clearTimeout(killer);
        this.child = null;
        this.actualPort = null;
        finish(false);
      });
    });
  }

  async transcribe(audioBuffer, mimeType) {
    if (!this.isReady()) throw new Error('sidecar not running');
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mimeType }), 'chunk.webm');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`http://127.0.0.1:${this.actualPort}/transcribe`, {
        method: 'POST',
        headers: { 'X-Sidekick-Token': this.token },
        body: form,
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`sidecar HTTP ${res.status}`);
      const data = await res.json();
      if (!data || typeof data.text !== 'string') throw new Error('bad sidecar response');
      return data.text.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  stop() {
    if (this.child) {
      try { this.child.kill(); } catch { /* already gone */ }
      this.child = null;
      this.actualPort = null;
    }
  }
}

module.exports = { WhisperSidecar };
