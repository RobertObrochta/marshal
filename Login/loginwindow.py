from http.server import HTTPServer
import json
import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel
)
import requests
from IncidentManager.incidentmanagerhome import IncidentManagerHome
from typing import TYPE_CHECKING
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
if TYPE_CHECKING:
    from main import MainWindow
    
import base64
import hashlib
import secrets


BACKEND_URL = "https://config.yourdomain.com"
WIN_BACKEND_URL = "http://localhost:8000"
BACKEND_URL = WIN_BACKEND_URL

CLIENT_ID = "1533151819977592882"
REDIRECT_URI = "http://localhost:8000/callback"
ADMIN_FILE = "C:\\Users\\robobrochta\\Documents\\ORLstuff\\marshalConfig\\admins.json" # TODO this will have a workflow to it from GIST

auth_result = {}

def generate_pkce_pair():
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return code_verifier, code_challenge

code_verifier, code_challenge = generate_pkce_pair()

auth_url = (
    f"https://discord.com/api/oauth2/authorize"
    f"?client_id={CLIENT_ID}"
    f"&redirect_uri={REDIRECT_URI}"
    f"&response_type=code"
    f"&scope=identify"
    f"&code_challenge={code_challenge}"
    f"&code_challenge_method=S256"
)

def fetch_admin_list():
    resp = requests.get(f"{BACKEND_URL}/admins", timeout=30)
    resp.raise_for_status()
    return resp.json()


def load_admin_data(path=ADMIN_FILE):
    try:
        data = fetch_admin_list()
    except requests.RequestException:
        print("Could not reach backend — falling back to no admins")
        return set(), set()
        
    admin_ids = set(data.get("admin_ids", []))
    admin_usernames = {u.lower() for u in data.get("admin_usernames", [])}
    return admin_ids, admin_usernames

def exchange_code_for_token(code, code_verifier):
    resp = requests.post(
        "https://discord.com/api/oauth2/token",
        data={
            "client_id": CLIENT_ID,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]

def get_discord_user(access_token):
    resp = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    resp.raise_for_status()
    return resp.json()

def login_with_discord():
    code_verifier, code_challenge = generate_pkce_pair()
    CallbackHandler.code_verifier = code_verifier

    auth_url = (
        f"https://discord.com/api/oauth2/authorize"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=identify"
        f"&code_challenge={code_challenge}"
        f"&code_challenge_method=S256"
    )
    webbrowser.open(auth_url)

    server = HTTPServer(("localhost", 8000), CallbackHandler)
    server.handle_request()  # blocks until the callback comes in
    return auth_result

def check_admin_login():
    admin_ids, admin_usernames = load_admin_data()
    result = login_with_discord()

    if not result:
        print("Login failed or was cancelled.")
        return False

    is_admin = result["user_id"] in admin_ids or result["username"].lower() in admin_usernames
    print(f"Logged in as {result['username']} ({result['user_id']}) — admin: {is_admin}")
    return is_admin


class CallbackHandler(BaseHTTPRequestHandler):
    code_verifier = None  # set externally before the server handles a request

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = query.get("code", [None])[0]

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<html><body>Login succesful! You can now return to Marshal.</body></html>")

        if code:
            access_token = exchange_code_for_token(code, CallbackHandler.code_verifier)
            user = get_discord_user(access_token)
            auth_result["user_id"] = user["id"]
            auth_result["username"] = user["username"]

    def log_message(self, format, *args):
        pass  # silence default request logging
    

class LoginWindow(QWidget): 
    ParentWindow = None
    
    def __init__(self, Parent:MainWindow):
        super().__init__()
        self.ParentWindow = Parent
        self.setWindowTitle("Basic PyQt6 Window with Navigation")
        self.setGeometry(100, 100, 300, 200)

        self.stack = QStackedWidget()

        self.create_pages()

        self.stack.addWidget(self.page1)  # index 0
        #self.stack.addWidget(self.page2)  # index 1
        #self.stack.addWidget(self.page3)  # index 3

        layout = QVBoxLayout()
        layout.addWidget(self.stack, alignment=Qt.AlignmentFlag.AlignCenter)
        self.setLayout(layout)
        
    def create_pages(self):
        self.page1 = self.create_login_window()
        
    def print_breadcrumb(self, pageToNav:str):
        print(f"Navigating to: {pageToNav}")

    def create_login_window(self):
        page = QWidget()
        layout = QVBoxLayout()

        label = QLabel("Login")
        button1 = QPushButton("Main Menu")
        button1.clicked.connect(self.return_to_main_menu)
        
        button2 = QPushButton("Login")
        button2.clicked.connect(self.btn_login)
        
        layout.addWidget(label)
        layout.addWidget(button1)
        layout.addWidget(button2)
        
        page.setLayout(layout)
        
        return page
    
    def btn_login(self):
        # login and see if the user is admin at the same time
        self.ParentWindow.IsAdmin = check_admin_login()
        
        # any window that depends on IsAdmin should be notified down here
        self.ParentWindow.IncidentManager.admin_status_changed()
        pass
        
    def return_to_main_menu(self):
        self.ParentWindow.return_to_main_menu()
        
    # children pages of server manager will use this function
    def return_to_incident_manager_home(self):
            self.ParentWindow.btn_incident_manager_click()