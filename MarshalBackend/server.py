import json
import requests
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os

CONFIG_PATH = "/home/debian/marshal/config.json"
ADMIN_PATH = "/home/debian/marshal/admins.json"
WIN_CONFIG_PATH = os.path.expandvars(r"%localappdata%\ACC_TV\acctv.conf")
WIN_ADMIN_PATH = os.path.expandvars(r"C:\Users\robobrochta\Documents\ORLstuff\marshalConfig\admins.json")

# uncomment below for local testing
# comment back prior to shipping
CONFIG_PATH = WIN_CONFIG_PATH
ADMIN_PATH = WIN_ADMIN_PATH

def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def get_discord_user(access_token):
    resp = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()


class Handler(BaseHTTPRequestHandler):
    # --- Reads: no auth required, anyone can call these ---
    def do_GET(self):
        if self.path == "/config":
            self._respond(200, load_json(CONFIG_PATH))
        elif self.path == "/admins":
            self._respond(200, load_json(ADMIN_PATH))
        else:
            self._respond(404, {"error": "not found"})

    # --- Writes: require a verified Discord admin ---
    def do_POST(self):
        if self.path not in ("/config", "/admins"):
            self._respond(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self._respond(400, {"error": "empty request body"})
            return

        raw_body = self.rfile.read(length)
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "malformed JSON body"})
            return

        discord_token = body.get("discord_token")
        new_data = body.get("data")

        if not discord_token or new_data is None:
            self._respond(400, {"error": "missing discord_token or data"})
            return

        try:
            user = get_discord_user(discord_token)
        except requests.RequestException:
            self._respond(401, {"error": "invalid or expired discord token"})
            return

        try:
            admins = load_json(ADMIN_PATH)
        except (FileNotFoundError, json.JSONDecodeError):
            self._respond(500, {"error": "admin list unreadable on server"})
            return

        if user.get("id") not in admins.get("admin_ids", []):
            self._respond(403, {"error": "not an admin"})
            return

        path = CONFIG_PATH if self.path == "/config" else ADMIN_PATH
        try:
            save_json(path, new_data)
        except OSError:
            self._respond(500, {"error": "failed to write file on server"})
            return

        self._respond(200, {"status": "updated"})

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # silence default request logging


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print("Serving on port 8000...")
    server.serve_forever()