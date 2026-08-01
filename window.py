import webbrowser
import sys
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel
)

# TODO maybe make this into a streamlined thing? idk
class Window(QWidget):  
    name = ""
      
    def __init__(self, name):
            super().__init__()
            # set attributes
            self.name = name
            
            self.setWindowTitle("Basic PyQt6 Window with Navigation")
            self.setGeometry(100, 100, 300, 200)
    
            # Stack holds all our "pages"
            self.stack = QStackedWidget()
    
            self.page1 = self.create_page1()
            self.page2 = self.create_page2()
    
            self.stack.addWidget(self.page1)  # index 0
            self.stack.addWidget(self.page2)  # index 1
    
            layout = QVBoxLayout()
            layout.addWidget(self.stack)
            self.setLayout(layout)
    
