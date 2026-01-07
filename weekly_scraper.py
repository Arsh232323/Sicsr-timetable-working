import datetime
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs
import firebase_admin
from firebase_admin import credentials, firestore
import re
import time
import os
import json
import pytz # <--- Added for Indian Time

# --- CONFIGURATION ---
BASE_URL = "http://time-table.sicsr.ac.in"
AREA_ID = "1"

# --- TEACHER NAME NORMALIZATION ---
TEACHER_CORRECTIONS = {
    "Dr.Hema Gaikwad": "Dr. Hema Gaikwad",
    "Ms. Hema Gaikwad": "Dr. Hema Gaikwad",
    "Dr.Aniket Nagane": "Dr. Aniket Nagane",
    "Dr. Aniket Nagane ": "Dr. Aniket Nagane",
    "Mr.Rohan Bhase": "Mr. Rohan Bhase",
    "Mr. Rohan Bhase": "Mr. Rohan Bhase",
    "Dr.Shashikant Nehul": "Dr. Shashikant Nehul",
    "Mr. Shashikant Nehul": "Dr. Shashikant Nehul",
    "Ms. Kirti Mehere": "Ms. Kirti Mehare",
    "Ms. Kirti Mehare": "Ms. Kirti Mehare",
    "Ms.Mrinmayi Huparikar": "Ms. Mrinmayi Huprikar",
    "Ms.Mrinmayi Huprikar": "Ms. Mrinmayi Huprikar",
    "Mr.Gopal Phadke": "Mr. Gopal Phadke",
    "Mr. Gopal Phadke": "Mr. Gopal Phadke",
    "Dr.Farhana Desai": "Dr. Farhana Desai",
    "Dr. Farhana Desai ": "Dr. Farhana Desai",
    "Dr. Farhana Desai": "Dr. Farhana Desai",
    "Database and Application Security- Dr. Farhana Desai": "Dr. Farhana Desai",
    "Ms.Shatakshi Swaroop": "Ms. Shatakshi Swaroop",
    "Ms. Shatakshi Swaroop": "Ms. Shatakshi Swaroop",
    "(BFM) - Ms. Shatakshi Swaroop": "Ms. Shatakshi Swaroop",
    "Mr.Chaitanya Kulkarni": "Mr. Chaitanya Kulkarni",
    "Mr. Chaitanya Kulkarni": "Mr. Chaitanya Kulkarni",
    "Mr. Satyajeet Wale": "Mr. Satyajit Wale",
    "Mr. Satyajit Wale": "Mr. Satyajit Wale"
}

# --- FIREBASE CONNECTION ---
# Updated to work on GitHub Actions (Env Var) OR Local (File)
if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
else:
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
    else:
        # Fallback if neither exists
        cred = None

if cred and not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

def parse_description(desc, batch_name):
    """
    Parses description to separate Subject and Teacher.
    Aggressively strips metadata prefixes like 'BBA Sem IV - Div A - ...'
    """
    if not desc: return "Subject Not Listed", ""
    
    d = desc.replace('&amp;', '&').strip()
    
    # Deep Clean Loop
    previous_d = ""
    while d != previous_d:
        previous_d = d
        d = re.sub(r'^(BBA|BCA|MBA|MSc|IT|Sem|Semester|Div|Division|Batch|Class|Group)(\([^\)]*\))?\s*([0-9]+|[IVX]+|[A-Z])?\b\s*[-:]*\s*', '', d, flags=re.IGNORECASE)
        d = re.sub(r'^([IVX]+)(\s*[-:]+\s*|\s+)', '', d)
        d = re.sub(r'^[A-Z]\s*[-:]+\s*', '', d)
        d = re.sub(r'^[-:\s]+', '', d)

    parts = d.split(' - ') if ' - ' in d else d.split('-')
    parts = [p.strip() for p in parts if p.strip()]

    final_subject = ""
    final_teacher = ""

    def is_teacher(text):
        return bool(re.match(r'^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.|Ar\.|Er\.)', text, re.IGNORECASE))

    if parts and is_teacher(parts[-1]):
        final_teacher = parts.pop()
        clean_name = final_teacher.strip().replace('\u00A0', ' ')
        if clean_name in TEACHER_CORRECTIONS:
            final_teacher = TEACHER_CORRECTIONS[clean_name]

    if parts:
        final_subject = ' - '.join(parts)
    elif final_teacher:
        final_subject = "Class / Session"
    else:
        final_subject = re.sub(r'^[-:\s]+', '', desc.replace(batch_name or "", "")) or "Subject Not Listed"
        
    return final_subject.strip().rstrip('-').strip(), final_teacher

def update_meta_lists(batch_name, teacher_name):
    if batch_name:
        db.collection("meta").document("courses").set({
            "list": firestore.ArrayUnion([batch_name])
        }, merge=True)
    
    if teacher_name:
        db.collection("meta").document("teachers").set({
            "list": firestore.ArrayUnion([teacher_name])
        }, merge=True)

def delete_old_entries_for_date(target_date_str):
    print(f"🧹 Cleaning up old entries for {target_date_str}...")
    docs = db.collection("timetables").where("date", "==", target_date_str).stream()
    
    batch = db.batch()
    count = 0
    
    for doc in docs:
        batch.delete(doc.reference)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
            
    if count > 0:
        batch.commit()
        print(f"   🗑️  Deleted {count} old classes.")
    else:
        print("   ✨ No old data found.")

def scrape_entry(entry_id, target_date):
    url = f"{BASE_URL}/view_entry.php?id={entry_id}"
    try:
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        def get_val(label):
            row = soup.find('td', string=label)
            return row.find_next_sibling('td').text.strip() if row else ""

        description = get_val("Description:")
        room = get_val("Room:")
        batch = get_val("Type:")
        start_time = get_val("Start time:")[:5]
        end_time = get_val("End time:")[:5]

        subject_clean, teacher_clean = parse_description(description, batch)
        update_meta_lists(batch, teacher_clean)

        data = {
            "id": entry_id,
            "date": target_date.strftime("%Y-%m-%d"),
            "batch": batch,
            "description": description,
            "subject_clean": subject_clean,
            "teacher_clean": teacher_clean,
            "room": room,
            "start_time": start_time,
            "end_time": end_time
        }
        
        db.collection("timetables").document(entry_id).set(data, merge=True)
        print(f"   ✅ Saved: {subject_clean} | Teacher: {teacher_clean or 'N/A'}")

    except Exception as e:
        print(f"   ❌ Error scraping ID {entry_id}: {e}")

def scrape_day(target_date):
    date_str = target_date.strftime('%Y-%m-%d')
    print(f"\n--- Scraping {date_str} ---")
    
    # 1. Fetch First (To ensure site is up)
    url = f"{BASE_URL}/day.php?year={target_date.year}&month={target_date.month}&day={target_date.day}&area={AREA_ID}"
    
    try:
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        links = soup.find_all('a', href=lambda x: x and 'view_entry.php?id=' in x)
        unique_ids = set()
        for link in links:
            qs = parse_qs(urlparse(link['href']).query)
            if 'id' in qs:
                unique_ids.add(qs['id'][0])
            
        if not unique_ids:
            print(f"⚠️ No classes found for {date_str}. Skipping delete.")
            return

        # 2. Delete Old Data (Only if classes found)
        delete_old_entries_for_date(date_str)
        
        # 3. Save New Data
        print(f"Found {len(unique_ids)} classes. Fetching details...")
        for entry_id in unique_ids:
            scrape_entry(entry_id, target_date)
            
    except Exception as e:
        print(f"Error fetching day grid: {e}")

# --- MAIN EXECUTION (UPDATED: Today + 7 Days) ---
if __name__ == "__main__":
    # Force Indian Timezone
    ist = pytz.timezone('Asia/Kolkata')
    
    # Get Today in India
    start_date = datetime.datetime.now(ist).date()
    
    print(f"🚀 Starting Daily Automation...")
    print(f"📅 Detected India Date: {start_date}")
    
    # Run for Today + Next 6 Days (7 days total)
    for i in range(7):
        current_day = start_date + datetime.timedelta(days=i)
        scrape_day(current_day)
        
    print("\n🎉 Weekly Sync Completed!")