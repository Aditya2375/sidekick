'use strict';

// Shared between main and renderer (loaded through preload expose).
const MODES = Object.freeze({ MEETING: 'meeting', ASSIST: 'assist' });

const DEFAULT_SETTINGS = Object.freeze({
  hotkey: 'Control+Shift+Space',
  mode: MODES.ASSIST,
  llmProvider: 'auto', // auto | gemini | groq
  geminiModel: 'gemini-flash-latest',
  groqChatModel: 'llama-3.3-70b-versatile',
  groqSttModel: 'whisper-large-v3-turbo',
  sttProvider: 'auto', // auto | groq | sidecar
  captureSystemAudio: true,
  captureMic: true,
  // Meeting-mode only. Explicit user toggle, default OFF, never active while
  // exam software (SEB / Mettl) is detected - the guard forces it off.
  captureExclusion: false,
  opacity: 0.96,
  suggestionIntervalMs: 8000,
  keepTranscripts: true
});

const LIMITS = Object.freeze({
  MAX_CHAT_MESSAGE_CHARS: 4000,
  MAX_TRANSCRIPT_CHARS: 12000,
  MAX_AUDIO_CHUNK_BYTES: 24 * 1024 * 1024,
  MAX_HOTKEY_LEN: 64,
  LLM_TIMEOUT_MS: 25000,
  STT_TIMEOUT_MS: 30000
});

// Process-name fragments (lowercase) that mean exam/proctoring software is on
// screen. Used only to DISABLE capture-exclusion and show a banner - we never
// touch, hide from, or interfere with these processes.
const EXAM_PROCESS_FRAGMENTS = Object.freeze([
  'safeexambrowser',
  'sebservice',
  'sebclient',
  'mettl',
  'mercer'
]);

module.exports = { MODES, DEFAULT_SETTINGS, LIMITS, EXAM_PROCESS_FRAGMENTS };
