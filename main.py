import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel
)

from ServerManager.servermanagerhome import ServerManagerHome

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Marshal")
        self.resize(800, 450)
        self.center_on_screen()

        self.stack = QStackedWidget()

        self.create_pages()

        self.stack.addWidget(self.page1)  # index 0
        self.stack.addWidget(self.page2)  # index 1
        self.stack.addWidget(self.page3)  # index 3

        layout = QVBoxLayout()
        layout.addWidget(self.stack, alignment=Qt.AlignmentFlag.AlignCenter)
        self.setLayout(layout)
        
    def center_on_screen(self):
        # 1. Get the geometry of the window (including its title bar/borders)
        window_geometry = self.frameGeometry()
        
        # 2. Get the center point of the current monitor's available geometry
        screen_center = self.screen().availableGeometry().center()
        
        # 3. Move the virtual rectangle's center to the screen's center
        window_geometry.moveCenter(screen_center)
        
        # 4. Move the actual window's top-left corner to the rectangle's top-left
        self.move(window_geometry.topLeft())
        
    def create_pages(self):
        self.page1 = self.create_main_menu()
        self.page2 = self.create_server_manager_home()
        self.page3 = self.create_incident_manager_home()
        
    def print_breadcrumb(self, pageToNav:str):
        print(f"Navigating to: {pageToNav}")

    def create_main_menu(self):
        page = QWidget()
        layout = QVBoxLayout()

        label = QLabel("Fuck you!")

        button1 = QPushButton("Server Manager")
        button1.clicked.connect(self.btn_server_manager_click)

        button2 = QPushButton("Incident Manager")
        button2.clicked.connect(self.btn_incident_manager_click)

        layout.addWidget(label)
        layout.addWidget(button1)
        layout.addWidget(button2)
        page.setLayout(layout)
        
        return page

    def create_server_manager_home(self):
        page = ServerManagerHome(self)
        return page
    
    def create_incident_manager_home(self):
            page = QWidget()
            layout = QVBoxLayout()
    
            label = QLabel("Incident Manager - Home")
    
            back_button = QPushButton("Back to Main Menu")
            back_button.clicked.connect(self.return_to_main_menu)
    
            layout.addWidget(label)
            layout.addWidget(back_button)
            page.setLayout(layout)
            return page

    def btn_server_manager_click(self):
        self.print_breadcrumb("Server Manager - Home")
        self.stack.setCurrentIndex(1)

    def btn_incident_manager_click(self):
        self.print_breadcrumb("Incident Manager - Home")
        self.stack.setCurrentIndex(2)
        # TODO spawn an incident manager page here

    def return_to_main_menu(self):
        self.print_breadcrumb("Main Menu")
        self.stack.setCurrentIndex(0)
        

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())