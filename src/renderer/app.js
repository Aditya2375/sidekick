'use strict';

/* global sidekick */

const $ = (id) => document.getElementById(id);
const api = window.sidekick;

const state = {
  mode: 'assist',
  micStream: null,
  sysStream: null,
  micRecorder: null,
  sysRecorder: null,
  settings: null
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function addMsg(log, cls, text) {
  const node = el('div', cls, text);
  log.appendChild(node);
  log.scrollTop = log.scrollHeight;
  return node;
}

function setMode(mode) {
  state.mode = mode;
  $('tab-assist').classList.toggle('active', mode === 'assist');
  $('tab-meeting').classList.toggle('active', mode === 'meeting');
  $('view-assist').classList.toggle('hidden', mode !== 'assist');
  $('view-meeting').classList.toggle('hidden', mode !== 'meeting');
  if (state.settings) api.invoke('settings:set', { mode });
}

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMsg($('chat-log'), 'msg user', text);
  const pending = addMsg($('chat-log'), 'msg bot', '...');
  const res = await api.invoke('chat:send', text);
  pending.textContent = res.ok ? res.reply : res.error || 'failed';
  if (!res.ok) pending.classList.add('error');
}

function updateSttStatus() {
  const mic = !!state.micRecorder;
  const sys = !!state.sysRecorder;
  $('stt-status').textContent = `mic ${mic ? 'on' : 'off'} - system audio ${sys ? 'on' : 'off'}`;
  $('btn-mic').textContent = mic ? 'Stop mic' : 'Start mic';
  $('btn-system').textContent = sys ? 'Stop system audio' : 'Start system audio';
}

let lastSttErrorAt = 0;

function makeRecorder(stream, speakerLabel) {
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime });
  rec.ondataavailable = async (e) => {
    if (!e.data || e.data.size === 0) return;
    const buf = new Uint8Array(await e.data.arrayBuffer());
    const res = await api.invoke('audio:chunk', buf, e.data.type || 'audio/webm');
    if (res && !res.ok && Date.now() - lastSttErrorAt > 15000) {
      lastSttErrorAt = Date.now();
      addMsg($('suggestions-log'), 'msg error', res.error || 'Transcription failed.');
    }
  };
  rec.onerror = () => {
    addMsg($('suggestions-log'), 'msg error', 'Recorder error.');
    stopCapture(speakerLabel);
  };
  rec.start(4000);
  return rec;
}

async function startMic() {
  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    state.micRecorder = makeRecorder(state.micStream, 'mic');
  } catch {
    addMsg($('suggestions-log'), 'msg error', 'Mic access denied.');
  }
  updateSttStatus();
}

async function startSystem() {
  try {
    state.sysStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    const videoTrack = state.sysStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.stop(); // audio loopback only, discard frames
    if (state.sysStream.getAudioTracks().length === 0) {
      throw new Error('no loopback audio');
    }
    state.sysRecorder = makeRecorder(state.sysStream, 'sys');
  } catch {
    addMsg($('suggestions-log'), 'msg error', 'System audio capture not available on this device.');
    state.sysStream = null;
  }
  updateSttStatus();
}

function stopCapture(which) {
  if (which === 'mic' && state.micRecorder) {
    state.micRecorder.stop();
    state.micStream.getTracks().forEach((t) => t.stop());
    state.micRecorder = null; state.micStream = null;
  }
  if (which === 'sys' && state.sysRecorder) {
    state.sysRecorder.stop();
    state.sysStream.getTracks().forEach((t) => t.stop());
    state.sysRecorder = null; state.sysStream = null;
  }
  updateSttStatus();
}

async function refreshKeyStatus() {
  const s = await api.invoke('keys:status');
  $('key-status').textContent =
    `gemini ${s.geminiApiKey ? 'saved' : '-'} | groq ${s.groqApiKey ? 'saved' : '-'}` +
    (s.secureStorageAvailable ? '' : ' (secure storage unavailable!)');
}

async function loadSettings() {
  state.settings = await api.invoke('settings:get');
  $('set-hotkey').value = state.settings.hotkey;
  $('set-keep-transcripts').checked = state.settings.keepTranscripts;
  $('set-sidecar').checked = state.settings.sttProvider === 'sidecar' || state.settings.sttProvider === 'auto';
  $('chk-exclusion').checked = false; // capture exclusion never persists on
  setMode(state.settings.mode || 'assist');
  const g = await api.invoke('guard:status');
  $('exam-banner').classList.toggle('hidden', !g.examDetected);
}

function wire() {
  $('tab-assist').addEventListener('click', () => setMode('assist'));
  $('tab-meeting').addEventListener('click', () => setMode('meeting'));
  $('btn-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  $('btn-close').addEventListener('click', () => api.invoke('window:close'));
  $('btn-quit').addEventListener('click', () => api.invoke('window:quit'));
  $('btn-settings').addEventListener('click', () => {
    $('settings-modal').classList.remove('hidden');
    refreshKeyStatus();
  });
  $('btn-close-settings').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
  $('btn-mic').addEventListener('click', () => (state.micRecorder ? stopCapture('mic') : startMic()));
  $('btn-system').addEventListener('click', () => (state.sysRecorder ? stopCapture('sys') : startSystem()));
  $('btn-clear-transcript').addEventListener('click', async () => {
    await api.invoke('transcript:clear');
    $('transcript-log').innerHTML = '';
  });
  $('btn-save-keys').addEventListener('click', async () => {
    const g = $('set-gemini').value.trim();
    const q = $('set-groq').value.trim();
    if (g) await api.invoke('keys:set', 'geminiApiKey', g);
    if (q) await api.invoke('keys:set', 'groqApiKey', q);
    $('set-gemini').value = '';
    $('set-groq').value = '';
    refreshKeyStatus();
  });
  $('btn-save-settings').addEventListener('click', async () => {
    await api.invoke('settings:set', {
      hotkey: $('set-hotkey').value.trim(),
      keepTranscripts: $('set-keep-transcripts').checked,
      sttProvider: $('set-sidecar').checked ? 'auto' : 'groq'
    });
    $('settings-modal').classList.add('hidden');
  });
  $('chk-exclusion').addEventListener('change', async (e) => {
    const next = await api.invoke('settings:set', { captureExclusion: e.target.checked });
    const g = await api.invoke('guard:status');
    if (next.captureExclusion && g.examDetected) {
      e.target.checked = false;
      addMsg($('suggestions-log'), 'msg error', 'Capture exclusion is disabled while exam software is running.');
    }
  });

  api.on('transcript:append', ({ speaker, text }) => {
    const line = el('div', 'line');
    line.appendChild(el('span', 'who', speaker + ':'));
    line.appendChild(document.createTextNode(text));
    const log = $('transcript-log');
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  });
  api.on('suggestion', ({ text }) => addMsg($('suggestions-log'), 'suggestion', text));
  api.on('suggestion:error', ({ message }) => addMsg($('suggestions-log'), 'msg error', message));
  api.on('settings:changed', (s) => { state.settings = s; });
  api.on('guard:changed', ({ examDetected }) => {
    $('exam-banner').classList.toggle('hidden', !examDetected);
    if (examDetected) $('chk-exclusion').checked = false;
  });
}

wire();
loadSettings();
