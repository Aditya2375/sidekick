'use strict';

const { app, BrowserWindow, globalShortcut, ipcMain, session, shell, desktopCapturer, safeStorage } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { SettingsStore } = require('./settings');
const { SecureKeys } = require('./secure-keys');
const { LlmRouter } = require('./llm');
const { SttRouter } = require('./stt');
const { WhisperSidecar } = require('./sidecar');
const { ExamGuard } = require('./guard');
const { TranscriptStore } = require('./transcripts');
const { isValidAccelerator } = require('./hotkey');
const { MODES, LIMITS, DEFAULT_SETTINGS } = require('../shared/constants');

const cryptoAdapter = {
  encryptString: (s) => safeStorage.encryptString(s).toString('base64'),
  decryptString: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
  isAvailable: () => safeStorage.isEncryptionAvailable()
};

let overlayWin = null;
let settings;
let keys;
let llm;
let stt;
let sidecar;
let guard;
let transcripts;
let transcriptBuffer = []; // rolling meeting transcript lines, capped
let suggestTimer = null;
let shotOut = process.env.SIDEKICK_SHOT_OUT || null; // dev-only screenshot hook

function send(channel, payload) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(channel, payload);
  }
}

function effectiveCaptureExclusion() {
  // Hard line: capture exclusion is meeting-mode-only, an explicit user
  // toggle, and NEVER while exam software is detected or detection failed.
  return settings.get('captureExclusion') === true &&
    settings.get('mode') === MODES.MEETING &&
    !guard.isExamDetected() &&
    !guard.isUncertain();
}

function applyCaptureExclusion() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setContentProtection(effectiveCaptureExclusion());
  }
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 320,
    minHeight: 240,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Sidekick',
    backgroundColor: '#14161c',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  // Normal visible window: no hiding, no stealth flags, ever.
  overlayWin.setMenu(null);
  overlayWin.setAlwaysOnTop(true, 'floating');
  applyCaptureExclusion();

  // No navigation away from the packaged UI; no new windows.
  overlayWin.webContents.on('will-navigate', (e) => e.preventDefault());
  overlayWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  overlayWin.on('closed', () => { overlayWin = null; });
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (shotOut) {
    overlayWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const view = process.env.SIDEKICK_DEMO_VIEW || 'meeting';
          if (view === 'meeting') {
            await overlayWin.webContents.executeJavaScript("setMode('meeting')");
            send('transcript:append', { speaker: 'them', text: 'So the renewal is on the table for next quarter.' });
            send('transcript:append', { speaker: 'you', text: 'Happy to walk through the numbers.' });
            send('transcript:append', { speaker: 'them', text: 'We also need sign-off from finance before Friday.' });
            send('suggestion', { text: '- Summarize the pricing tiers\n- Ask who signs off on renewal\n- Propose a follow-up call Friday' });
          } else {
            try {
              await overlayWin.webContents.executeJavaScript(
                "setMode('assist');addMsg(document.getElementById('chat-log'),'msg user','Explain Bayes theorem with a quick example');" +
                "addMsg(document.getElementById('chat-log'),'msg bot','Bayes theorem updates the probability of a hypothesis given new evidence: P(H|E) = P(E|H) * P(H) / P(E).\\n\\nExample: a disease affects 1% of people; a test is 99% accurate. A positive result still means only ~50% chance you have it, because false positives outnumber true cases.');true"
              );
            } catch (e) { console.error('demo inject failed:', e.message); }
          }
          await new Promise((r) => setTimeout(r, 800));
          const img = await overlayWin.webContents.capturePage();
          require('fs').writeFileSync(shotOut, img.toPNG());
        } finally {
          app.quit();
        }
      }, 1200);
    });
  }
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const acc = settings.get('hotkey');
  if (!isValidAccelerator(acc)) return false;
  try {
    return globalShortcut.register(acc, toggleOverlay);
  } catch {
    return false;
  }
}

function toggleOverlay() {
  if (!overlayWin) return createOverlay();
  if (overlayWin.isVisible()) overlayWin.hide();
  else { overlayWin.show(); overlayWin.focus(); }
}

function pushTranscript(speaker, text) {
  transcriptBuffer.push({ speaker, text });
  const total = () => transcriptBuffer.reduce((n, l) => n + l.text.length, 0);
  while (total() > LIMITS.MAX_TRANSCRIPT_CHARS && transcriptBuffer.length > 1) {
    transcriptBuffer.shift();
  }
  transcripts.append(speaker, text);
  send('transcript:append', { speaker, text });
}

function scheduleSuggestions() {
  if (suggestTimer) clearInterval(suggestTimer);
  const interval = Math.max(4000, Number(settings.get('suggestionIntervalMs')) || 8000);
  suggestTimer = setInterval(async () => {
    if (settings.get('mode') !== MODES.MEETING || transcriptBuffer.length === 0) return;
    const excerpt = transcriptBuffer.slice(-12).map((l) => `${l.speaker}: ${l.text}`).join('\n');
    try {
      const suggestion = await llm.chat([{ role: 'user', content: excerpt }], { mode: 'meeting' });
      send('suggestion', { text: suggestion });
    } catch (err) {
      send('suggestion:error', { message: friendlyError(err) });
    }
  }, interval);
  if (suggestTimer.unref) suggestTimer.unref();
}

function friendlyError(err) {
  if (err && err.code === 'NO_KEYS') return 'No API key set - open Settings.';
  if (err && err.code === 'NO_STT') return 'No transcription available - add a Groq key or enable the local whisper sidecar.';
  if (err && err.status === 401) return 'API key rejected - check it in Settings.';
  if (err && err.status === 429) return 'Rate limited - slowing down.';
  return 'Something failed. Try again.';
}

function manageSidecar(sttProvider) {
  // Local whisper fallback: start when it could be used, kill when it cannot.
  if (sttProvider === 'groq') {
    sidecar.stop();
  } else if (!sidecar.isReady()) {
    sidecar.start().catch(() => {});
  }
}

function setupIpc() {
  ipcMain.handle('settings:get', () => settings.getPublic());
  ipcMain.handle('settings:set', (_e, patch) => {
    if (!patch || typeof patch !== 'object') return settings.getPublic();
    if (patch.hotkey && !isValidAccelerator(patch.hotkey)) delete patch.hotkey;
    const next = settings.set(patch);
    registerHotkey();
    applyCaptureExclusion();
    scheduleSuggestions();
    transcripts.setEnabled(next.keepTranscripts);
    manageSidecar(next.sttProvider);
    send('settings:changed', next);
    return next;
  });
  ipcMain.handle('keys:status', () => keys.status());
  ipcMain.handle('keys:set', (_e, name, value) => {
    try {
      keys.set(name, String(value || '').trim());
      return { ok: true, status: keys.status() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('keys:clear', (_e, name) => {
    keys.clear(name);
    return keys.status();
  });
  ipcMain.handle('chat:send', async (_e, text) => {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty' };
    const clean = text.slice(0, LIMITS.MAX_CHAT_MESSAGE_CHARS);
    try {
      const reply = await llm.chat([{ role: 'user', content: clean }], { mode: 'assist' });
      return { ok: true, reply };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });
  ipcMain.handle('audio:chunk', async (_e, buf, mimeType) => {
    // buf arrives as a Uint8Array view over IPC.
    const size = buf && (buf.byteLength || buf.length || 0);
    if (!size || size > LIMITS.MAX_AUDIO_CHUNK_BYTES) return { ok: false, error: 'bad chunk' };
    const mime = typeof mimeType === 'string' && /^audio\/(webm|ogg|wav|mpeg|mp4)/.test(mimeType)
      ? mimeType : 'audio/webm';
    try {
      const text = await stt.transcribe(Buffer.from(buf), mime);
      if (text) pushTranscript('you', text);
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });
  ipcMain.handle('transcript:clear', () => {
    transcriptBuffer = [];
    transcripts.clearAll();
    return { ok: true };
  });
  ipcMain.handle('window:close', () => { if (overlayWin) overlayWin.hide(); });
  ipcMain.handle('window:quit', () => app.quit());
  ipcMain.handle('guard:status', () => ({
    examDetected: guard.isExamDetected(),
    captureExclusionActive: effectiveCaptureExclusion()
  }));
}

function setupDisplayMediaHandler() {
  // Let the renderer capture system audio (loopback) for meeting transcripts
  // without a picker each time. Windows: Chromium loopback; other platforms
  // fall back to mic-only in the renderer.
  const ses = session.defaultSession;
  ses.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => callback({}));
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlayWin) { overlayWin.show(); overlayWin.focus(); }
  });

  app.whenReady().then(() => {
    const userData = app.getPath('userData');
    settings = new SettingsStore(path.join(userData, 'settings.json'));
    keys = new SecureKeys(path.join(userData, 'keys'), cryptoAdapter);
    sidecar = new WhisperSidecar({ pythonCmd: process.platform === 'win32' ? 'python' : 'python3' });
    llm = new LlmRouter({ settings, keys });
    stt = new SttRouter({ settings, keys, sidecar });
    guard = new ExamGuard();
    transcripts = new TranscriptStore(path.join(userData, 'transcripts'), cryptoAdapter);
    transcripts.setEnabled(settings.get('keepTranscripts'));
    transcripts.startSession(crypto.randomUUID());

    guard.onChange(() => {
      applyCaptureExclusion();
      send('guard:changed', { examDetected: guard.isExamDetected() });
    });
    guard.start();

    setupDisplayMediaHandler();
    setupIpc();
    createOverlay();
    registerHotkey();
    scheduleSuggestions();
    manageSidecar(settings.get('sttProvider'));
  });

  // Quit truly quits: no background leftovers, no autostart, no tray.
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (suggestTimer) clearInterval(suggestTimer);
    guard.stop();
    sidecar.stop();
  });

  app.on('window-all-closed', () => {
    // Overlay hides instead of closing; reaching here means quit.
    app.quit();
  });
}
