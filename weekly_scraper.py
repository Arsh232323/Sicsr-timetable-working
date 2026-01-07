import firebase_admin
from firebase_admin import credentials, firestore
import requests
from bs4 import BeautifulSoup
import datetime
import os
import json
import pytz

# 1. Initialize Firebase
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
    
    params = {
        'year': target_date.year,
        'month': target_date.month,
        'day': target_date.day,
        'area': 1
    }
    
    # STEP 1: SCRAPE FIRST (Don't touch DB yet)
    try:
        response = requests.get(f"{BASE_URL}/day.php", params=params, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        links = soup.find_all('a', href=True)
        unique_ids = set()
        
        for link in links:
            if 'view_entry.php?id=' in link['href']:
                class_id = link['href'].split('id=')[1]
                unique_ids.add(class_id)
        
        # SAFETY CHECK: If no classes found, STOP. Don't wipe the DB.
        if not unique_ids:
            print(f"⚠️ No classes found for {date_str}. Keeping existing data safe.")
            return 

        print(f"✅ Website is up! Found {len(unique_ids)} classes. Now updating DB...")

    except Exception as e:
        print(f"❌ Scrape failed for {date_str}: {e}")
        print("⚠️ Database was NOT touched. Old data is safe.")
        return

    # STEP 2: WIPE OLD DATA (Only runs if Step 1 succeeded)
    try:
        old_docs = db.collection("timetables").where("date", "==", date_str).stream()
        deleted_count = 0
        batch = db.batch()
        
        for doc in old_docs:
            batch.delete(doc.reference)
            deleted_count += 1
            if deleted_count % 400 == 0:
                batch.commit()
                batch = db.batch()
        
        batch.commit()
        print(f"🗑️ Wiped {deleted_count} old entries.")
        
    except Exception as e:
        print(f"⚠️ Error deleting old data: {e}")

    # STEP 3: WRITE NEW DATA (With Teacher Info)
    try:
        for class_id in unique_ids:
            details_url = f"{BASE_URL}/view_entry.php?id={class_id}"
            details_resp = requests.get(details_url, timeout=15)
            details_soup = BeautifulSoup(details_resp.text, 'html.parser')
            
            def get_val(label):
                tag = details_soup.find('td', string=label)
                if tag:
                    return tag.find_next_sibling('td').text.strip()
                return ""

            batch_name = get_val("Type:")
            
            # --- TEACHER EXTRACTION LOGIC ---
            # Tries "Staff:" first, falls back to "Faculty:" if needed
            teacher_name = get_val("Staff:") 
            if not teacher_name:
                teacher_name = get_val("Faculty:")
            # --------------------------------

            if batch_name:
                data = {
                    "id": class_id,
                    "date": date_str,
                    "batch": batch_name,
                    "subject": get_val("Description:"), # Using description as subject
                    "teacher": teacher_name,            # <--- ADDED THIS
                    "room": get_val("Room:"),
                    "start_time": get_val("Start time:")[:5],
                    "end_time": get_val("End time:")[:5]
                }
                
                # Save to Firestore
                db.collection("timetables").document(class_id).set(data)
                
                # Update Course List Metadata
                db.collection("meta").document("courses").set({
                    "list": firestore.ArrayUnion([batch_name])
                }, merge=True)
                
    except Exception as e:
        print(f"❌ Error uploading {date_str}: {e}")

if __name__ == "__main__":
    ist = pytz.timezone('Asia/Kolkata')
    start_date = datetime.datetime.now(ist).date()
    
    print(f"Starting Safer Weekly Update (With Teachers)...")
    print(f"India Date: {start_date}")

    for i in range(7):
        current_day = start_date + datetime.timedelta(days=i)
        scrape_date(current_day)
    print("✅ Complete.")