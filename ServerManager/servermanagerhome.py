import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel
)
from typing import TYPE_CHECKING
from ServerManager.uploadentrylist import UploadEntryList
if TYPE_CHECKING:
    from main import MainWindow

class ServerManagerHome(QWidget):    
    
    ParentWindow = None
    def __init__(self, Parent:MainWindow):
        super().__init__()
        self.ParentWindow = Parent
        self.setWindowTitle("Basic PyQt6 Window with Navigation")
        self.setGeometry(100, 100, 300, 200)

        self.stack = QStackedWidget()

        self.create_pages()

        self.stack.addWidget(self.page1)  # index 0
        self.stack.addWidget(self.page2)  # index 1

        layout = QVBoxLayout()
        layout.addWidget(self.stack, alignment=Qt.AlignmentFlag.AlignCenter)
        self.setLayout(layout)
        
    def create_pages(self):
        self.page1 = self.create_server_manager_menu()
        self.page2 = self.create_upload_entrylist_page()
        #self.page3 = self.create_incident_manager_home()
        
    def print_breadcrumb(self, pageToNav:str):
        print(f"Navigating to: {pageToNav}")

    def create_server_manager_menu(self):
        page = QWidget()
        layout = QVBoxLayout()

        label = QLabel("Server Manager - Menu")
        button1 = QPushButton("Main Menu")
        button1.clicked.connect(self.return_to_main_menu)
        
        button2 = QPushButton("Upload Entry List")
        button2.clicked.connect(self.btn_upload_entry_list)
        
        button3 = QPushButton("Manage Championships")
        button3.clicked.connect(self.btn_manage_championships)

        layout.addWidget(label)
        layout.addWidget(button1)
        layout.addWidget(button2)
        layout.addWidget(button3)
        
        page.setLayout(layout)
        
        return page
    
    def btn_upload_entry_list(self):
        self.print_breadcrumb("Server Manager - Home")
        self.stack.setCurrentIndex(1)
        
    def btn_manage_championships(self):
        # new page that will bring back all championships in a dropdown list. you select one, and it will let you
        # 1. download the entry list for that championship
        # 2. it will automatically upload it to entry list
        # AND/OR 
        # Points stuff
        # in general, more championship management stuff here
        
        # but for now it's gonna be dumb, so just redirect to the championships page so that you manually do it
            url = "https://www.thesimgrid.com/communities/odysseyracingleague/championships"
            webbrowser.open_new_tab(url)
    
    def create_server_manager_home(self):
        page = QWidget()
        layout = QVBoxLayout()

        label = QLabel("Server Manager - Home")

        back_button = QPushButton("Back to Main Menu")
        back_button.clicked.connect(self.return_to_main_menu)

        layout.addWidget(label)
        layout.addWidget(back_button)
        page.setLayout(layout)
        return page
    
    def create_upload_entrylist_page(self):
        page = UploadEntryList(self)
        return page

    def return_to_main_menu(self):
        self.ParentWindow.return_to_main_menu()
        
    # children pages of server manager will use this function
    def return_to_server_manager_home(self):
        self.stack.setCurrentIndex(0)