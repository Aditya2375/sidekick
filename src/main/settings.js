'use strict';

// Settings store: plain JSON in userData. API keys never live here - they go
// through secure-keys.js (safeStorage / DPAPI). Unknown keys are dropped on
// load so a hand-edited file cannot smuggle in new behaviour.
const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('../shared/constants');

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          const val = parsed[key];
          if (typeof val === typeof DEFAULT_SETTINGS[key]) {
            this.data[key] = val;
          }
        }
      }
    } catch {
      // Missing or corrupt file -> defaults.
    }
  }

  get(key) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return undefined;
    return this.data[key];
  }

  getPublic() {
    // Everything the renderer may see. No secrets are stored here by design.
    return { ...this.data };
  }

  set(patch) {
    const clean = {};
    for (const [key, val] of Object.entries(patch || {})) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
      if (typeof val !== typeof DEFAULT_SETTINGS[key]) continue;
      clean[key] = val;
    }
    Object.assign(this.data, clean);
    this.save();
    return this.getPublic();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }
}

module.exports = { SettingsStore };
