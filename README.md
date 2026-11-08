# Sidekick

A hotkey AI overlay for Windows. Press one key and a small always-on-top
window appears over whatever you are doing. Two modes:

- **Assist** - ask questions, get short answers. Coursework, quick lookups,
  anything you would normally alt-tab to a browser for.
- **Meeting** - live transcription of your mic and system audio, with
  rolling suggestions (things to say, questions to ask) while you talk.

## What it costs

Nothing. It runs on free tiers:

- **Groq** (`whisper-large-v3-turbo`) for transcription, Llama for chat
- **Gemini Flash** (AI Studio free key) for chat
- Optional local fallback: `faster-whisper` on your own machine, no key
  needed, fully offline

No card, no paid plan, no telemetry. Transcripts stay on your laptop,
encrypted at rest.

## Setup

1. Grab the installer from Releases (`Sidekick-Setup-x.x.x.exe`) or the
   portable zip.
2. Run Sidekick, open Settings (gear icon), paste your keys:
   - Gemini: https://aistudio.google.com/apikey (free)
   - Groq: https://console.groq.com/keys (free)
   Keys are stored encrypted with Windows DPAPI, never in plain text.
3. Press `Ctrl+Shift+Space` (changeable) to show or hide the overlay.

## Meeting mode

- **Start mic** - transcribes what you say.
- **Start system audio** - transcribes what others say (Windows loopback).
- Suggestions refresh every few seconds from the recent transcript.
- **exclude from screen share** - off by default. When on, the overlay is
  hidden from screen capture in meeting apps. It turns itself off and
  refuses to enable whenever exam software (SEB / Mettl) is running, and
  while process detection itself fails.

## Local whisper fallback (optional)

```
pip install -r sidecar/requirements.txt
```

Enable it in Settings. The app starts a tiny local server on 127.0.0.1
with a random per-launch token and kills it when you quit.

## What Sidekick never does

- It is a normal visible window. No stealth, no hidden processes.
- No capture exclusion during exams. Ever.
- It never touches SEB or Mettl: no patching, no killing, no hiding them
  or from them.
- Nothing runs in the background. Quit kills everything - no tray, no
  autostart, no leftover processes. Uninstalling removes it fully.
- API keys never leave your machine except to their own APIs, and never
  touch the page you see (renderer cannot read them).

## Development

```
npm install
npm start
npm test
```

Windows builds run in CI (`.github/workflows/build-windows.yml`) and
attach the installer and zip as artifacts.
