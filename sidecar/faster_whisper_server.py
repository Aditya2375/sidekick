#!/usr/bin/env python3
"""Local faster-whisper sidecar for Sidekick.

Binds to 127.0.0.1 only, requires a per-launch bearer token, transcribes
POSTed audio chunks with faster-whisper. Started and killed by the app;
never runs on its own.

Install: pip install faster-whisper
"""
import argparse
import io
import json
import sys
import tempfile
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

MODEL = None


def get_model():
    global MODEL
    if MODEL is None:
        from faster_whisper import WhisperModel
        MODEL = WhisperModel("base", device="cpu", compute_type="int8")
    return MODEL


class Handler(BaseHTTPRequestHandler):
    token = ""

    def log_message(self, *args):  # silence request logs
        pass

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_error(404)
            return
        if self.headers.get("X-Sidekick-Token") != self.token:
            self.send_error(403)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 25 * 1024 * 1024:
            self.send_error(400)
            return
        body = self.rfile.read(length)
        # body is multipart; crude but safe extraction of the file bytes
        boundary = self.headers.get("Content-Type", "").split("boundary=")[-1].encode()
        if not boundary:
            self.send_error(400)
            return
        part = body.split(b"--" + boundary)[1]
        payload = part.split(b"\r\n\r\n", 1)[1].rstrip(b"\r\n")
        tmp = None
        try:
            fd, tmp = tempfile.mkstemp(suffix=".webm")
            with os.fdopen(fd, "wb") as f:
                f.write(payload)
            segments, _ = get_model().transcribe(tmp, beam_size=1)
            text = " ".join(s.text for s in segments).strip()
            out = json.dumps({"text": text}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)
        except Exception:
            self.send_error(500)
        finally:
            if tmp:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True)
    ap.add_argument("--port", type=int, default=0)
    args = ap.parse_args()
    Handler.token = args.token
    server = HTTPServer(("127.0.0.1", args.port), Handler)
    print(f"READY port={server.server_address[1]}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
