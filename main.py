import json
import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel
)

from ServerManager.servermanagerhome import ServerManagerHome
from IncidentManager.incidentmanagerhome import IncidentManagerHome
from Login.loginwindow import LoginWindow

class MainWindow(QWidget):
    IsAdmin = False
    DiscordAccessToken = None
    
    # all Pages
    Login = None
    IncidentManager = None
    ServerManager = None
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Marshal")
        self.resize(800, 450)
        self.center_on_screen()

        self.stack = QStackedWidget()

        self.create_pages()

        self.stack.addWidget(self.page1) 
        self.stack.addWidget(self.page2) 
        self.stack.addWidget(self.page3)
        self.stack.addWidget(self.page4)

        layout = QVBoxLayout()
        layout.addWidget(self.stack, alignment=Qt.AlignmentFlag.AlignCenter)
        self.setLayout(layout)
        
    def center_on_screen(self):
        window_geometry = self.frameGeometry()
        screen_center = self.screen().availableGeometry().center()
        
        window_geometry.moveCenter(screen_center)
        self.move(window_geometry.topLeft())
        
    def create_pages(self):
        self.page1 = self.create_main_menu()
        self.page2 = self.create_server_manager_home()
        self.page3 = self.create_incident_manager_home()
        self.page4 = self.create_login_page()
        
    def print_breadcrumb(self, pageToNav:str):
        print(f"Navigating to: {pageToNav}")

    def create_main_menu(self):
        page = QWidget()
        layout = QVBoxLayout()

        label = QLabel("Fuck you!")

        button1 = QPushButton("Server Manager")
        button1.clicked.connect(self.btn_server_manager_click)

        button2 = QPushButton("ACC TV")
        button2.clicked.connect(self.btn_incident_manager_click)
        
        button3 = QPushButton("Login")
        button3.clicked.connect(self.btn_login_click)

        layout.addWidget(label)
        layout.addWidget(button1)
        layout.addWidget(button2)
        layout.addWidget(button3)
        page.setLayout(layout)
        
        return page

    def create_server_manager_home(self):
        page = ServerManagerHome(self)
        self.ServerManager = page
        return page
    
    def create_incident_manager_home(self):
        page = IncidentManagerHome(self)
        self.IncidentManager = page
        return page
        
    def create_login_page(self):
        page = LoginWindow(self)
        self.Login = page
        return page

    def btn_server_manager_click(self):
        self.print_breadcrumb("Server Manager - Home")
        self.stack.setCurrentIndex(1)

    def btn_incident_manager_click(self):
        self.print_breadcrumb("ACC TV - Home")
        self.stack.setCurrentIndex(2)
        
    def btn_login_click(self):
        self.print_breadcrumb("Login")
        self.Login.btn_login()
        #self.stack.setCurrentIndex(3)

    def return_to_main_menu(self):
        self.print_breadcrumb("Main Menu")
        self.stack.setCurrentIndex(0)
        

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())