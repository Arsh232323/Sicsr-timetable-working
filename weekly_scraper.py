import firebase_admin
from firebase_admin import credentials, firestore
import requests
from bs4 import BeautifulSoup
import datetime
import os
import json
import pytz  # <--- FIX: This handles the Indian Timezone

# 1. Initialize Firebase securely
# Checks if running on GitHub (Env Var) or Laptop (File)
if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
else:
    # Fallback for your laptop testing
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
    else:
        print("⚠️ Error: serviceAccountKey.json not found!")
        exit(1)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# 2. Configuration
BASE_URL = "http://time-table.sicsr.ac.in"

def scrape_date(target_date):
    date_str = target_date.strftime('%Y-%m-%d')
    print(f"--- Scraping {date_str} ---")
    
    params = {
        'year': target_date.year,
        'month': target_date.month,
        'day': target_date.day,
        'area': 1
    }
    
    try:
        response = requests.get(f"{BASE_URL}/day.php", params=params)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        links = soup.find_all('a', href=True)
        unique_ids = set()
        for link in links:
            if 'view_entry.php?id=' in link['href']:
                class_id = link['href'].split('id=')[1]
                unique_ids.add(class_id)
        
        print(f"Found {len(unique_ids)} classes.")

        for class_id in unique_ids:
            details_url = f"{BASE_URL}/view_entry.php?id={class_id}"
            details_resp = requests.get(details_url)
            details_soup = BeautifulSoup(details_resp.text, 'html.parser')
            
            def get_val(label):
                tag = details_soup.find('td', string=label)
                return tag.find_next_sibling('td').text.strip() if tag else ""

            batch = get_val("Type:")
            if batch:
                data = {
                    "id": class_id,
                    "date": date_str,
                    "batch": batch,
                    "description": get_val("Description:"),
                    "room": get_val("Room:"),
                    "start_time": get_val("Start time:")[:5],
                    "end_time": get_val("End time:")[:5]
                }
                # Upload to Firebase
                db.collection("timetables").document(class_id).set(data, merge=True)
                
                # Update Course List
                db.collection("meta").document("courses").set({
                    "list": firestore.ArrayUnion([batch])
                }, merge=True)

    except Exception as e:
        print(f"Error scraping {date_str}: {e}")

# 3. Main Loop: FORCE INDIAN TIME (IST)
if __name__ == "__main__":
    # Define Indian Timezone
    ist = pytz.timezone('Asia/Kolkata')
    
    # Get "Today" in India, even if server is in London
    start_date = datetime.datetime.now(ist).date()
    
    print(f"Server Date (UTC): {datetime.date.today()}") 
    print(f"India Date (IST):  {start_date}")          

    # Scrape Today + Next 6 Days
    for i in range(7):
        current_day = start_date + datetime.timedelta(days=i)
        scrape_date(current_day)
    print("✅ Weekly scrape complete.")