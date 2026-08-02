import webbrowser
import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QStackedWidget, QLabel, QGridLayout, QComboBox, QLineEdit
)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from servermanagerhome import ServerManagerHome
    
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import (WebDriverWait, Select)
from selenium.webdriver.support import expected_conditions as EC
import json
from pathlib import Path
import requests


def download_json_via_session(driver, url, save_path):
    session = requests.Session()
    for cookie in driver.get_cookies():
        session.cookies.set(cookie["name"], cookie["value"])

    resp = session.get(url)
    resp.raise_for_status()

    # Try utf-16 first (BOM starting with 0xFF or 0xFE), fall back to utf-8-sig
    raw = resp.content
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig")

    data = json.loads(text)

    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    return save_path

def select_option_by_value_js(driver, select_id, value):
    driver.execute_script(f"""
        var select = document.getElementById('{select_id}');
        select.value = '{value}';
        select.dispatchEvent(new Event('change', {{ bubbles: true }}));
    """)

def upload_entry_list(driver, upload_page_url, file_path, entry_list_name, server_selection_value, submit_selector=None):
    driver.get(upload_page_url)

    # fill out name field
    name_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "name"))
    )
    name_input.clear()
    name_input.send_keys(entry_list_name)
    
    # select from dropdown
    select_option_by_value_js(driver, "ServerID", server_selection_value)
    
    # if we didn't select the right option, take no action
    dropdown_element = driver.find_element(By.ID, "ServerID")
    current_value = dropdown_element.get_attribute("value")
    is_correct_selection = current_value == server_selection_value
    if not is_correct_selection:
        print("Incorrect selection chosen, returning to prevent errors")
        return

    # input file
    file_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "entryListFile"))
    )

    absolute_path = str(Path(file_path).resolve())
    file_input.send_keys(absolute_path)

    if submit_selector:
        submit_button = driver.find_element(By.CSS_SELECTOR, submit_selector)
        submit_button.click()

COOKIE_FILE = Path("site_cookies.json")

def save_cookies(driver):
    cookies = driver.get_cookies()
    with open(COOKIE_FILE, "w") as f:
        json.dump(cookies, f)


def load_cookies(driver, base_url):
    if not COOKIE_FILE.exists():
        return False

    driver.get(base_url)  # must be on the site's domain before adding cookies
    with open(COOKIE_FILE) as f:
        cookies = json.load(f)

    for cookie in cookies:
        cookie.pop("sameSite", None)  # sometimes causes errors if malformed
        try:
            driver.add_cookie(cookie)
        except Exception:
            pass  # skip any cookie Selenium rejects (e.g. expired/invalid domain)

    return True


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

SIMGRID_DRIVER = get_driver()
SERVER_DRIVER = get_driver(False)

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

def get_acc_servers():
    base_url = "https://orl-us.circuitcore.net"
    entry_list_url = "https://orl-us.circuitcore.net/entry-lists/upload"
    
    logged_in = load_cookies(SERVER_DRIVER, base_url)
    SERVER_DRIVER.get(entry_list_url)
    
    # Confirm we're actually logged in (cookies might be expired)
    try:
        wait_until_element_appears(SERVER_DRIVER, "Upload Entry List", 10)
    except TimeoutException:
        logged_in = False
    
    # manual login workflow needed
    if not logged_in:
        # login
        SERVER_DRIVER.get(f"{base_url}/login")
        print("Please log in manually...")
        
        # login success, we will be on homepage
        WebDriverWait(SERVER_DRIVER, 20).until(
            lambda d: d.current_url.rstrip("/") == base_url.rstrip("/")
        )
        save_cookies(SERVER_DRIVER)
        
        # proceed to entry list upload page
        SERVER_DRIVER.get(entry_list_url)
    
    SERVER_DRIVER.minimize_window()
    # by not we should be logged in, so scrape
    post_signin_detected = wait_until_element_appears(SERVER_DRIVER, "Upload Entry List")
    if post_signin_detected is None:
        print("User timed out on sign in")
        return []
    
    return get_select_options(SERVER_DRIVER)

def get_select_options(driver):
    """
    Returns a list of dicts with 'text' and 'value' for each <option>
    in a <select> element.
    """
    select_element = driver.find_element(By.ID, "ServerID")
    option_elements = select_element.find_elements(By.TAG_NAME, "option")
    select = Select(select_element)

    options = []
    for option in option_elements:
        print(f"Option: {option.text!r}")
        options.append({
            "text": option.text.strip(),
            "value": option.get_attribute("value"),
        })
    return options

def get_simgrid_championships():
    # TODO add cookie workflow?
    url = "https://www.thesimgrid.com/communities/odysseyracingleague/championships?host_id=176&type=active"
    SIMGRID_DRIVER.get(url)
    
    post_signin_detected = wait_until_element_appears(SIMGRID_DRIVER, "Championships & Events")
    if post_signin_detected is None:
        print("User timed out on sign in")
        return []
    
    table = SIMGRID_DRIVER.find_element(By.TAG_NAME, "table")

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

def get_server_side_championships():
        url = "https://orl-us.circuitcore.net/championships"
        SERVER_DRIVER.get(url)
        table = SERVER_DRIVER.find_element(By.TAG_NAME, "table")
    
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
            
            # Find the link in this row (adjust selector if it's only in a specific column)
            link_elements = row.find_elements(By.TAG_NAME, "a")
            link = link_elements[0].get_attribute("href") if link_elements else None
            
            row_dict = dict(zip(headers, values))
            row_dict["link"] = link
            data.append(row_dict)
    
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

def pull_championship_entry_list(championship_id):
    url = f"https://www.thesimgrid.com/admin/championships/{championship_id}/entrylist.json"
    file_path = download_json_via_session(SIMGRID_DRIVER, url, "downloads/entrylist.json")
    return file_path

class UploadEntryList(QWidget):        
    SimGridChampionships = []
    ACCChampionships = []
    ACCServerChampionships = []
    ACCServers = []
    ParentWindow = None
    SelectedChampionship = None
    SelectedServer = None
    SelectedServerChampionship = None
    
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
        self.ACCServerChampionships = get_server_side_championships()
        self.populate_championship_dropdown()
        self.populate_server_dropdown()
        self.populate_server_championships_dropdown()

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
        self.server_championship_dropdown = QLabel("Target Server")

        self.from_dropdown = QComboBox()
        self.from_dropdown.currentIndexChanged.connect(self.championship_selection_changed)
        
        self.server_championship_dropdown = QComboBox()
        self.server_championship_dropdown.currentIndexChanged.connect(self.server_championship_selection_changed)
        
        self.textbox = QLineEdit()
        self.name_label = QLabel("Entry List Name:")
        self.textbox.setPlaceholderText("Enter entry list name...")

        self.arrow_label = QLabel("→")
        self.arrow_label.setStyleSheet("font-size: 24px;")
        self.arrow_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.to_dropdown = QComboBox()
        self.to_dropdown.currentIndexChanged.connect(self.server_selection_changed)

        self.bottom_button = QPushButton("Upload Entry List")
        self.bottom_button.clicked.connect(self.btn_upload_entry_list)

        grid.addWidget(self.top_button, 0, 0, 1, 3)  # spans columns 0-2
        grid.setRowMinimumHeight(1, 20)  # empty spacer row, 20px tall

        grid.addWidget(self.from_label, 2, 0, alignment=Qt.AlignmentFlag.AlignCenter)
        grid.addWidget(self.to_label, 2, 2, alignment=Qt.AlignmentFlag.AlignCenter)
        grid.addWidget(self.to_label, 4, 0, alignment=Qt.AlignmentFlag.AlignCenter)

        grid.addWidget(self.from_dropdown, 3, 0)
        grid.addWidget(self.arrow_label, 3, 1)
        grid.addWidget(self.to_dropdown, 3, 2)
        
        grid.addWidget(self.server_championship_dropdown, 5, 0)
        
        grid.addWidget(self.name_label, 6, 0, 1, 3)
        grid.addWidget(self.textbox, 7, 0, 1, 3)

        grid.addWidget(self.bottom_button, 8, 0, 1, 3)
        page.setLayout(grid)
        
        return page
    
    def server_championship_selection_changed(self):
        self.SelectedServerChampionship = self.from_dropdown.currentData()
        print(self.SelectedServerChampionship)
            
    def championship_selection_changed(self):
        self.SelectedChampionship = self.from_dropdown.currentData()
        print(self.SelectedChampionship)
        
    def server_selection_changed(self):
        self.SelectedServer = self.to_dropdown.currentData()
        print(self.SelectedServer)
    
    def populate_championship_dropdown(self):
        self.from_dropdown.clear()
        for row in self.ACCChampionships:
            status = row.get("STATUS", "")
            game = row.get("GAME", "")
            if status == "ACC":
                self.from_dropdown.addItem(game, userData=row)
    
    def populate_server_dropdown(self):
        self.to_dropdown.clear()
        for row in self.ACCServers:
            server_name = row.get("text", "")
            self.to_dropdown.addItem(server_name, userData=row)
                
    def populate_server_championships_dropdown(self):
        self.server_championship_dropdown.clear()
        for row in self.ACCServerChampionships:
            champ_name = row.get("Name", "")
            self.server_championship_dropdown.addItem(champ_name, userData=row) 
                
    def btn_upload_entry_list(self):
       championship_data = self.from_dropdown.currentData()
       server_data = self.to_dropdown.currentData()
       entry_list_name = self.textbox.text()
       server_championship_data = self.server_championship_dropdown.currentData()
       server_championship_edit_url = f"{server_championship_data["link"]}/edit#entry-list"
       
       print(f"Uploading from {championship_data} to {server_data} with Entry List Name {entry_list_name}")
       
       # pull entry list
       file_path = pull_championship_entry_list(championship_data["NAME"])
       
       # parse server dropdown and name, pass in the entry list file
       upload_entry_list(
            SERVER_DRIVER,
            upload_page_url="https://orl-us.circuitcore.net/entry-lists/upload",
            file_path=file_path,
            entry_list_name=entry_list_name,
            server_selection_value=server_data["value"],
            submit_selector="button[type='submit']",  # adjust to match the actual submit button on that page
        )
       
       # navigate to the championships page so that the user can tag that entry list to a championship
       # manual process for the time being, but it's better than nothing
       # hopefully it will be automated soon
       SERVER_DRIVER.maximize_window()
       
       SERVER_DRIVER.get(server_championship_edit_url)
       print(f"navigating to: {server_championship_edit_url} and selecting button")
       import_button = WebDriverWait(SERVER_DRIVER, 10).until(
            EC.element_to_be_clickable((By.ID, "entrylist-selector"))
            )
       import_button.click()
       
       # rest of the process is up to the user
    
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