import json
import os
from pathlib import Path
import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel
)
from typing import TYPE_CHECKING

import requests
if TYPE_CHECKING:
    from main import MainWindow

BACKEND_URL = "https://config.yourdomain.com"
WIN_BACKEND_URL = "http://localhost:8000"
BACKEND_URL = WIN_BACKEND_URL

ACCTV_CONFIG_PATH_FOLDER = os.path.expandvars(r"%localappdata%\ACC_TV")
TEST_ACCTV_CONFIG_PATH_FOLDER = os.path.expandvars(r"%USERPROFILE%\Documents\ACC_TV")
ACCTV_CONFIG_PATH_FILE_NAME = os.path.expandvars(r"acctv.conf")

if BACKEND_URL == WIN_BACKEND_URL:
    ACCTV_CONFIG_PATH_FOLDER = TEST_ACCTV_CONFIG_PATH_FOLDER

def download_config() -> Path:
    resp = requests.get(f"{BACKEND_URL}/config", timeout=30)
    resp.raise_for_status()

    save_path = Path(ACCTV_CONFIG_PATH_FOLDER)
    save_path.mkdir(parents=True, exist_ok=True)

    file_path = save_path / ACCTV_CONFIG_PATH_FILE_NAME
    with open(file_path, "wb") as f:
        f.write(resp.content)

    return file_path


def upload_config(discord_access_token: str) -> dict:
    """
    Reads a local JSON file and uploads it to overwrite the server's config.
    Returns the backend's response (or raises on failure).
    """
    path = Path(f"{ACCTV_CONFIG_PATH_FOLDER}\{ACCTV_CONFIG_PATH_FILE_NAME}")
    with open(path) as f:
        local_data = json.load(f)  # validates it's actually valid JSON before sending

    resp = requests.post(
        f"{BACKEND_URL}/config",
        json={"discord_token": discord_access_token, "data": local_data},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()

class IncidentManagerHome(QWidget):    
    
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

        self.layout = QVBoxLayout()
        self.layout.addWidget(self.stack, alignment=Qt.AlignmentFlag.AlignCenter)
        self.setLayout(self.layout)
        
    def create_pages(self):
        self.page1 = self.create_incident_manager_menu()
        #self.page2 = self.create_server_manager_home()
        #self.page3 = self.create_incident_manager_home()
        
    def print_breadcrumb(self, pageToNav:str):
        print(f"Navigating to: {pageToNav}")

    def create_incident_manager_menu(self):
        page = QWidget()
        layout = QVBoxLayout()

        label = QLabel("Incident Manager - Menu")
        button1 = QPushButton("Main Menu")
        button1.clicked.connect(self.return_to_main_menu)
        
        button2 = QPushButton("Download Incident Manager")
        button2.clicked.connect(self.btn_download_incident_manager)
        
        button3 = QPushButton("Configure Incident Manager")
        button3.clicked.connect(self.btn_configure_incident_manager)
        
        # dynamic button population for that allows the user to upload to some shared thing
        self.admin_status_changed()
        
        layout.addWidget(label)
        layout.addWidget(button1)
        layout.addWidget(button2)
        layout.addWidget(button3)
        
        page.setLayout(layout)
        
        return page
    
    def btn_download_incident_manager(self):
        url = "https://acctv.de/acctvapp/ACCTV.application"
        webbrowser.open_new_tab(url)
        
    def btn_configure_incident_manager(self):
        # this will setup the incident manager with the configuration we have for this season
        # applies it to %localappdata%\ACC_TV\acctv.conf
        
        # this will pull from some centralized thing that only a certain number of people can write to
        # these people can upload to this centralized place
        
        download_config()


    def btn_upload_incident_manager_config(self):
        if not self.ParentWindow.IsAdmin:
            print("Not authorized to upload config.")
            return

        print(f"uploading current config...\nDiscord token = {self.ParentWindow.DiscordAccessToken}")
        try:
            result = upload_config(discord_access_token=self.ParentWindow.DiscordAccessToken)
            print("Upload succeeded:", result)
        except FileNotFoundError:
            print("No local config file found to upload.")
        except json.JSONDecodeError:
            print("Local config file is not valid JSON.")
        except requests.HTTPError as e:
            # Backend rejected it — could be 401 (bad token), 403 (not admin), 500 (server error)
            print(f"Upload rejected: {e.response.status_code} — {e.response.json()}")
        except requests.RequestException as e:
            print(f"Upload failed: {e}")
            
    def return_to_main_menu(self):
        self.ParentWindow.return_to_main_menu()
        
    # children pages of server manager will use this function
    def return_to_incident_manager_home(self):
            self.ParentWindow.btn_incident_manager_click()
    
    def admin_status_changed(self):
        print("Admin Status Check")
        if self.ParentWindow.IsAdmin:
            button4 = QPushButton("Upload Incident Manager Settings")
            button4.clicked.connect(self.btn_upload_incident_manager_config)
            self.layout.addWidget(button4)