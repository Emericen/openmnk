#!/usr/bin/env python3
"""Minimal HTTP server that executes shell commands and returns output."""

import json
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

MAX_OUTPUT = 50_000  # truncate stdout/stderr beyond this


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/exec":
            self._respond(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            self._respond(400, {"error": "invalid json"})
            return

        cmd = body.get("cmd")
        if not cmd or not isinstance(cmd, str):
            self._respond(400, {"error": "missing cmd"})
            return

        try:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=120,
                cwd="/home/user",
            )
            self._respond(200, {
                "stdout": result.stdout[:MAX_OUTPUT],
                "stderr": result.stderr[:MAX_OUTPUT],
                "exit_code": result.returncode,
            })
        except subprocess.TimeoutExpired:
            self._respond(200, {
                "stdout": "",
                "stderr": "Command timed out after 120 seconds",
                "exit_code": 124,
            })
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        else:
            self._respond(404, {"error": "not found"})

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # silence request logs


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8080), Handler)
    print("Sandbox server listening on :8080")
    server.serve_forever()
