import datetime
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs
import firebase_admin
from firebase_admin import credentials, firestore
import re
import time

# --- CONFIGURATION ---
BASE_URL = "http://time-table.sicsr.ac.in"
AREA_ID = "1"

# --- TEACHER NAME NORMALIZATION ---
# Merges duplicates and fixes typos
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
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

def parse_description(desc, batch_name):
    """
    Parses description to separate Subject and Teacher.
    Aggressively strips metadata prefixes like 'BBA Sem IV - Div A - ...'
    """
    if not desc: return "Subject Not Listed", ""
    
    d = desc.replace('&amp;', '&').strip()
    
    # Deep Clean Loop: Keep cleaning until the string stops changing.
    # Peels off layers like "BBA...", then "IV...", then "A - ..."
    previous_d = ""
    while d != previous_d:
        previous_d = d
        # 1. Remove standard Course/Sem/Div metadata prefix
        d = re.sub(r'^(BBA|BCA|MBA|MSc|IT|Sem|Semester|Div|Division|Batch|Class|Group)(\([^\)]*\))?\s*([0-9]+|[IVX]+|[A-Z])?\b\s*[-:]*\s*', '', d, flags=re.IGNORECASE)
        # 2. Remove Roman Numerals at start
        d = re.sub(r'^([IVX]+)(\s*[-:]+\s*|\s+)', '', d)
        # 3. Remove Single Letters followed by Dash (e.g. "A -")
        d = re.sub(r'^[A-Z]\s*[-:]+\s*', '', d)
        # 4. Remove generic leading separators
        d = re.sub(r'^[-:\s]+', '', d)

    # Split by Dash to separate Subject and Teacher
    parts = d.split(' - ') if ' - ' in d else d.split('-')
    parts = [p.strip() for p in parts if p.strip()]

    final_subject = ""
    final_teacher = ""

    # Teacher Detector: Looks for honorifics at the start of a string
    def is_teacher(text):
        return bool(re.match(r'^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.|Ar\.|Er\.)', text, re.IGNORECASE))

    # If the last part is identified as a teacher, extract it
    if parts and is_teacher(parts[-1]):
        final_teacher = parts.pop()
        
        # --- NORMALIZE TEACHER NAME ---
        # Cleans whitespace and non-breaking spaces before checking correction list
        clean_name = final_teacher.strip().replace('\u00A0', ' ')
        if clean_name in TEACHER_CORRECTIONS:
            final_teacher = TEACHER_CORRECTIONS[clean_name]

    # Re-assemble whatever is left as the Subject
    if parts:
        final_subject = ' - '.join(parts)
    elif final_teacher:
        final_subject = "Class / Session"
    else:
        # Fallback to a slightly cleaned version of original desc if everything was stripped
        final_subject = re.sub(r'^[-:\s]+', '', desc.replace(batch_name or "", "")) or "Subject Not Listed"
        
    return final_subject.strip().rstrip('-').strip(), final_teacher

def update_meta_lists(batch_name, teacher_name):
    """Adds the batch name and normalized teacher name to the master dropdown lists in Firebase."""
    if batch_name:
        db.collection("meta").document("courses").set({
            "list": firestore.ArrayUnion([batch_name])
        }, merge=True)
    
    if teacher_name:
        db.collection("meta").document("teachers").set({
            "list": firestore.ArrayUnion([teacher_name])
        }, merge=True)

def delete_old_entries_for_date(target_date_str):
    """
    CRITICAL: Deletes all existing classes for a specific date before scraping.
    This prevents 'Ghost Classes' (classes removed from website but staying in DB).
    """
    print(f"🧹 Cleaning up old entries for {target_date_str}...")
    
    # Fetch all docs for this date
    docs = db.collection("timetables").where("date", "==", target_date_str).stream()
    
    batch = db.batch()
    count = 0
    
    for doc in docs:
        batch.delete(doc.reference)
        count += 1
        # Batches allow up to 500 operations
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
            
    if count > 0:
        batch.commit()
        print(f"   🗑️  Deleted {count} old classes to prepare for fresh data.")
    else:
        print("   ✨ No old data found. Fresh scrape.")

def scrape_entry(entry_id, target_date):
    """Fetches details for a single class and saves it to Firestore."""
    url = f"{BASE_URL}/view_entry.php?id={entry_id}"
    
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        def get_val(label):
            row = soup.find('td', string=label)
            return row.find_next_sibling('td').text.strip() if row else ""

        description = get_val("Description:")
        room = get_val("Room:")
        batch = get_val("Type:")
        
        # Time format cleaning (e.g., "13:30:00" -> "13:30")
        start_time = get_val("Start time:")[:5]
        end_time = get_val("End time:")[:5]

        # Extract normalized data
        subject_clean, teacher_clean = parse_description(description, batch)

        # Update Master Lists (for dropdown menus)
        update_meta_lists(batch, teacher_clean)

        # Save Entry to Firestore
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
    """Finds all class IDs for a specific date and triggers detail scraping."""
    date_str = target_date.strftime('%Y-%m-%d')
    print(f"\n--- Scraping {date_str} ---")
    
    # 1. DELETE OLD DATA FIRST
    delete_old_entries_for_date(date_str)
    
    # 2. FETCH NEW DATA
    url = f"{BASE_URL}/day.php?year={target_date.year}&month={target_date.month}&day={target_date.day}&area={AREA_ID}"
    
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        links = soup.find_all('a', href=lambda x: x and 'view_entry.php?id=' in x)
        unique_ids = set()
        for link in links:
            qs = parse_qs(urlparse(link['href']).query)
            if 'id' in qs:
                unique_ids.add(qs['id'][0])
            
        print(f"Found {len(unique_ids)} classes. Fetching details...")
        for entry_id in unique_ids:
            scrape_entry(entry_id, target_date)
            
    except Exception as e:
        print(f"Error fetching day grid: {e}")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    # Define Date Range for Scraping
    start_date = datetime.date(2026, 1, 4)  
    end_date = datetime.date(2026, 5, 1)    
    
    current_date = start_date
    while current_date <= end_date:
        scrape_day(current_date)
        current_date += datetime.timedelta(days=1)
        
    print("\n🎉 Scraping and Synchronization Completed!")