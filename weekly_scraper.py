import firebase_admin
from firebase_admin import credentials, firestore
import requests
from bs4 import BeautifulSoup
import datetime
import os
import json
import pytz

# 1. Initialize Firebase securely
if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
else:
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
    else:
        print("⚠️ Error: serviceAccountKey.json not found!")
        exit(1)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

BASE_URL = "http://time-table.sicsr.ac.in"

def scrape_date(target_date):
    date_str = target_date.strftime('%Y-%m-%d')
    print(f"--- Processing {date_str} ---")
    
    # STEP 1: WIPE (Delete all old entries for this specific date)
    # We do this first so we start with a clean slate. No duplicates possible.
    try:
        old_docs = db.collection("timetables").where("date", "==", date_str).stream()
        deleted_count = 0
        batch = db.batch() # Use batch for faster deleting
        
        for doc in old_docs:
            batch.delete(doc.reference)
            deleted_count += 1
            # Firestore batches can only hold 500 ops, commit if we hit limit (rare for daily classes)
            if deleted_count % 400 == 0:
                batch.commit()
                batch = db.batch()
        
        batch.commit() # Commit any remaining deletes
        print(f"🗑️ Wiped {deleted_count} old entries for {date_str}.")
        
    except Exception as e:
        print(f"⚠️ Error deleting old data: {e}")

    # STEP 2: WRITE (Scrape and add new entries)
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
        
        print(f"Found {len(unique_ids)} new classes for {date_str}.")

        # Upload new classes
        for class_id in unique_ids:
            details_url = f"{BASE_URL}/view_entry.php?id={class_id}"
            details_resp = requests.get(details_url)
            details_soup = BeautifulSoup(details_resp.text, 'html.parser')
            
            def get_val(label):
                tag = details_soup.find('td', string=label)
                return tag.find_next_sibling('td').text.strip() if tag else ""

            batch_name = get_val("Type:")
            if batch_name:
                data = {
                    "id": class_id,
                    "date": date_str, # Start date
                    "batch": batch_name,
                    "description": get_val("Description:"),
                    "room": get_val("Room:"),
                    "start_time": get_val("Start time:")[:5],
                    "end_time": get_val("End time:")[:5]
                }
                
                # Save to Firestore
                db.collection("timetables").document(class_id).set(data)
                
                # Update Course List (Meta)
                db.collection("meta").document("courses").set({
                    "list": firestore.ArrayUnion([batch_name])
                }, merge=True)
                
    except Exception as e:
        print(f"❌ Error scraping {date_str}: {e}")

# 3. Main Loop (Indian Time)
if __name__ == "__main__":
    ist = pytz.timezone('Asia/Kolkata')
    start_date = datetime.datetime.now(ist).date()
    
    print(f"Starting Weekly Update...")
    print(f"India Date: {start_date}")

    for i in range(7):
        current_day = start_date + datetime.timedelta(days=i)
        scrape_date(current_day)
    print("✅ Update Complete.")