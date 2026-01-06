import firebase_admin
from firebase_admin import credentials, firestore
import requests
from bs4 import BeautifulSoup
import datetime
import os
import json

# 1. Initialize Firebase securely from GitHub Secrets
# We check if the environment variable exists (for Cloud) or look for local file (for Laptop)
if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
else:
    # Fallback for your laptop testing
    cred = credentials.Certificate("serviceAccountKey.json")

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# 2. Configuration
BASE_URL = "http://time-table.sicsr.ac.in"

def scrape_date(target_date):
    date_str = target_date.strftime('%Y-%m-%d')
    print(f"--- Scraping {date_str} ---")
    
    # URL parameters
    params = {
        'year': target_date.year,
        'month': target_date.month,
        'day': target_date.day,
        'area': 1
    }
    
    try:
        response = requests.get(f"{BASE_URL}/day.php", params=params)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all class IDs for this day
        links = soup.find_all('a', href=True)
        unique_ids = set()
        for link in links:
            if 'view_entry.php?id=' in link['href']:
                class_id = link['href'].split('id=')[1]
                unique_ids.add(class_id)
        
        print(f"Found {len(unique_ids)} classes.")

        # Scrape each class
        for class_id in unique_ids:
            details_url = f"{BASE_URL}/view_entry.php?id={class_id}"
            details_resp = requests.get(details_url)
            details_soup = BeautifulSoup(details_resp.text, 'html.parser')
            
            def get_val(label):
                tag = details_soup.find('td', string=label)
                return tag.find_next_sibling('td').text.strip() if tag else ""

            batch = get_val("Type:")
            if batch:
                # Save to Firestore
                data = {
                    "id": class_id,
                    "date": date_str,
                    "batch": batch,
                    "description": get_val("Description:"),
                    "room": get_val("Room:"),
                    "start_time": get_val("Start time:")[:5],
                    "end_time": get_val("End time:")[:5]
                }
                db.collection("timetables").document(class_id).set(data, merge=True)
                
                # Update meta lists (simplified for brevity)
                db.collection("meta").document("courses").set({
                    "list": firestore.ArrayUnion([batch])
                }, merge=True)

    except Exception as e:
        print(f"Error scraping {date_str}: {e}")

# 3. Main Loop: Run for Today + Next 6 Days (1 Week)
if __name__ == "__main__":
    start_date = datetime.date.today()
    for i in range(7):
        current_day = start_date + datetime.timedelta(days=i)
        scrape_date(current_day)
    print("✅ Weekly scrape complete.")