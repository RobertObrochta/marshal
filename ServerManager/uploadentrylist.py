import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel, QGridLayout, QComboBox
)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from servermanagerhome import ServerManagerHome
    
from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def get_driver(headless=True):
    """
    Tries to create a Selenium WebDriver, falling back through
    browsers in order of preference. Returns the first one that
    successfully launches.
    """
    chrome_opts = ChromeOptions()
    edge_opts = EdgeOptions()
    firefox_opts = FirefoxOptions()
    chrome_opts.add_argument("--window-size=1920,1080")
    edge_opts.add_argument("--window-size=1920,1080")
    firefox_opts.add_argument("--width=1920")
    firefox_opts.add_argument("--height=1080")

    if headless:
        chrome_opts.add_argument("--headless=new")
        edge_opts.add_argument("--headless=new")
        firefox_opts.add_argument("--headless")

    browser_attempts = [
        ("Firefox", lambda: webdriver.Firefox(options=firefox_opts)),
        ("Chrome", lambda: webdriver.Chrome(options=chrome_opts)),
        ("Edge", lambda: webdriver.Edge(options=edge_opts)),
    ]

    for name, create_driver in browser_attempts:
        try:
            driver = create_driver()
            print(f"Using {name} (headless={headless}) for automation.")
            return driver
        except WebDriverException as e:
            print(f"{name} unavailable, trying next browser... ({e.__class__.__name__})")
        except FileNotFoundError:
            print(f"{name} not found on this system, trying next browser...")

    raise RuntimeError("No supported browser (Chrome, Edge, Firefox) is available on this machine.")

def wait_until_element_appears(driver, text, timeout=300):
    """
    Blocks until the given element appears on the page — regardless of
    how many redirects happen in between. Useful for manual-login flows
    where the site bounces through several URLs before landing on the
    final logged-in page.
    """
    print(f"Waiting for '{text}' to appear (up to {timeout}s)...")
    xpath = f"//*[contains(text(), '{text}')]"
    element = WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.XPATH, xpath))
    )
    print("Element found — continuing.")
    return element

def get_simgrid_championships():
    driver = get_driver()
    url = "https://www.thesimgrid.com/communities/odysseyracingleague/championships?host_id=176&type=active"
    driver.get(url)
    
    post_signin_detected = wait_until_element_appears(driver, "Championships & Events")
    if post_signin_detected is None:
        print("User timed out on sign in")
        return []
    
    table = driver.find_element(By.TAG_NAME, "table")

    # Get headers from <thead> (or first row if no thead)
    header_cells = table.find_elements(By.CLASS_NAME, "text-start")
    if not header_cells:
        header_cells = table.find_elements(By.CSS_SELECTOR, "tr:first-child th, tr:first-child td")
    headers = [cell.text.strip() for cell in header_cells]

    # Get all data rows from <tbody>
    rows = table.find_elements(By.CSS_SELECTOR, "tbody tr")
    if not rows:
        rows = table.find_elements(By.CSS_SELECTOR, "tr")[1:]  # skip header row if no tbody

    data = []
    for row in rows:
        cells = row.find_elements(By.CSS_SELECTOR, "td")
        values = [cell.text.strip() for cell in cells]
        if not values:
            continue
        row_dict = dict(zip(headers, values))
        data.append(row_dict)

    #print(f"SimGrid scraper results = {data}")
    return data

def get_value_case_insensitive(row, key):
    key = key.lower()
    for k, v in row.items():
        if k.lower() == key:
            return v
    return None

def filter_acc_championships(all_championships, key="game"):
    matches = []
    for row in all_championships:
        game = get_value_case_insensitive(row, key)
        status = get_value_case_insensitive(row, "status")
        if status.upper() == "ACC" :
            matches.append(row)
    return matches

def get_championship_names(data, key="GAME"):
    return [row.get(key, "") for row in data if row.get(key)]

def get_acc_servers():
    result = ["vagina"]
    return result

class UploadEntryList(QWidget):        
    SimGridChampionships = []
    ACCChampionships = []
    ACCServers = []
    ParentWindow = None
    SelectedChampionship = None
    
    def __init__(self, Parent:ServerManagerHome):
        super().__init__()
        self.ParentWindow = Parent
        self.setWindowTitle("Entry List Manager")
        self.setGeometry(100, 100, 300, 200)

        self.stack = QStackedWidget()

        self.create_pages()
        
        self.SimGridChampionships = get_simgrid_championships()
        self.ACCChampionships = filter_acc_championships(self.SimGridChampionships, "game")
        self.ACCServers = get_acc_servers()
        self.populate_championship_dropdown()

        self.stack.addWidget(self.page1)  # index 0

        layout = QVBoxLayout()
        layout.addWidget(self.stack, alignment=Qt.AlignmentFlag.AlignCenter)
        self.setLayout(layout)
        
    def create_pages(self):
        self.page1 = self.create_upload_entry_list_menu()
        
    def print_breadcrumb(self, pageToNav:str):
        print(f"Navigating to: {pageToNav}")

    def create_upload_entry_list_menu(self):
        page = QWidget()
        grid = QGridLayout()

        self.top_button = QPushButton("Back to Server Manager Home")
        self.top_button.clicked.connect(self.return_to_server_manager_home)

        self.from_label = QLabel("SimGrid Championship")
        self.to_label = QLabel("Target Server")

        self.from_dropdown = QComboBox()
        self.from_dropdown.currentIndexChanged.connect(self.championship_selection_changed)

        self.arrow_label = QLabel("→")
        self.arrow_label.setStyleSheet("font-size: 24px;")
        self.arrow_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.to_dropdown = QComboBox()
        self.to_dropdown.addItems(self.ACCServers)

        self.bottom_button = QPushButton("Upload Entry List")
        self.bottom_button.clicked.connect(self.btn_upload_entry_list)

        grid.addWidget(self.top_button, 0, 0, 1, 3)  # spans columns 0-2
        grid.setRowMinimumHeight(1, 20)  # empty spacer row, 20px tall

        grid.addWidget(self.from_label, 2, 0, alignment=Qt.AlignmentFlag.AlignCenter)
        grid.addWidget(self.to_label, 2, 2, alignment=Qt.AlignmentFlag.AlignCenter)

        grid.addWidget(self.from_dropdown, 3, 0)
        grid.addWidget(self.arrow_label, 3, 1)
        grid.addWidget(self.to_dropdown, 3, 2)

        grid.addWidget(self.bottom_button, 4, 0, 1, 3)  # spans columns 0-2
        page.setLayout(grid)
        
        return page
    
    def championship_selection_changed(self):
        self.SelectedChampionship = self.from_dropdown.currentData()
        print(self.SelectedChampionship)
    
    def populate_championship_dropdown(self):
        self.from_dropdown.clear()
        for row in self.ACCChampionships:
            status = row.get("STATUS", "")
            game = row.get("GAME", "")
            if status == "ACC":
                print(f"adding row to dropdown: {row}")
                self.from_dropdown.addItem(game, userData=row)  # full dict travels with the item
    
    def btn_upload_entry_list(self):
       # TODO process to pull, download, and push up to server
       print("Uploading from __ to __")
       pass
        
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

        label = QLabel("Upload Entrylist To Server")

        back_button = QPushButton("Back to Main Menu")
        back_button.clicked.connect(self.return_to_main_menu)

        layout.addWidget(label)
        layout.addWidget(back_button)
        page.setLayout(layout)
        return page
        
    # children pages of server manager will use this function
    def return_to_server_manager_home(self):
        self.ParentWindow.return_to_server_manager_home()