'use strict';

// API key storage. Keys are encrypted with Electron safeStorage, which on
// Windows is backed by DPAPI / Credential Manager, then written to disk as
// opaque blobs. Keys never enter the renderer process and never appear in
// logs. The crypto function is injectable so tests run without Electron.
const fs = require('fs');
const path = require('path');

const KEY_NAMES = ['geminiApiKey', 'groqApiKey'];

class SecureKeys {
  constructor(dir, crypto) {
    // crypto: { encryptString(plain)->base64, decryptString(b64)->plain, isAvailable()->bool }
    this.dir = dir;
    this.crypto = crypto;
  }

  fileFor(name) {
    return path.join(this.dir, name + '.key');
  }

  isValidName(name) {
    return KEY_NAMES.includes(name);
  }

  available() {
    try {
      return !!this.crypto && this.crypto.isAvailable();
    } catch {
      return false;
    }
  }

  set(name, value) {
    if (!this.isValidName(name)) throw new Error('unknown key name');
    if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
      throw new Error('invalid key value');
    }
    if (!this.available()) throw new Error('secure storage unavailable');
    fs.mkdirSync(this.dir, { recursive: true });
    const enc = this.crypto.encryptString(value);
    fs.writeFileSync(this.fileFor(name), enc, { mode: 0o600 });
  }

  get(name) {
    if (!this.isValidName(name)) return null;
    try {
      const enc = fs.readFileSync(this.fileFor(name), 'utf8');
      return this.crypto.decryptString(enc);
    } catch {
      return null;
    }
  }

  has(name) {
    if (!this.isValidName(name)) return false;
    try {
      return fs.statSync(this.fileFor(name)).size > 0;
    } catch {
      return false;
    }
  }

  clear(name) {
    if (!this.isValidName(name)) return;
    try { fs.unlinkSync(this.fileFor(name)); } catch { /* absent */ }
  }

  status() {
    return {
      secureStorageAvailable: this.available(),
      geminiApiKey: this.has('geminiApiKey'),
      groqApiKey: this.has('groqApiKey')
    };
  }
}

module.exports = { SecureKeys, KEY_NAMES };
