import firebase_admin
from firebase_admin import credentials, firestore

# --- INIT FIREBASE ---
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

# --- FORCE CORRECTIONS ---
TEACHER_CORRECTIONS = {
    # Existing Fixes
    "Dr.Hema Gaikwad": "Dr. Hema Gaikwad",
    "Ms. Hema Gaikwad": "Dr. Hema Gaikwad",
    "Dr.Aniket Nagane": "Dr. Aniket Nagane",
    "Dr. Aniket Nagane ": "Dr. Aniket Nagane",
    "Mr.Rohan Bhase": "Mr. Rohan Bhase",
    "Mr.Rohan Bhase": "Mr. Rohan Bhase",
    "Dr.Shashikant Nehul": "Dr. Shashikant Nehul",
    "Mr. Shashikant Nehul": "Dr. Shashikant Nehul",
    "Ms. Kirti Mehere": "Ms. Kirti Mehare",
    "Ms. Kirti Mehare": "Ms. Kirti Mehare",
    "Ms.Mrinmayi Huparikar": "Ms. Mrinmayi Huprikar",
    "Ms.Mrinmayi Huprikar": "Ms. Mrinmayi Huprikar",
    "Mr.Gopal Phadke": "Mr. Gopal Phadke",
    "Mr. Gopal Phadke": "Mr. Gopal Phadke",
    "Dr.Farhana Desai": "Dr. Farhana Desai",
    "Dr. Farhana Desai": "Dr. Farhana Desai",
    "Ms.Shatakshi Swaroop": "Ms. Shatakshi Swaroop",
    "Ms. Shatakshi Swaroop": "Ms. Shatakshi Swaroop",
    "Mr.Chaitanya Kulkarni": "Mr. Chaitanya Kulkarni",
    "Mr. Chaitanya Kulkarni": "Mr. Chaitanya Kulkarni",
    "Mr. Satyajeet Wale": "Mr. Satyajit Wale",
    "Mr. Satyajit Wale": "Mr. Satyajit Wale",
    "(BFM) - Ms. Shatakshi Swaroop": "Ms. Shatakshi Swaroop",
    "Dr. Farhana Desai ": "Dr. Farhana Desai",

    # --- NEW FIX ---
    "Database and Application Security- Dr. Farhana Desai": "Dr. Farhana Desai" 
}

def rebuild_teacher_list():
    print("🔄 Fetching all classes to rebuild teacher list...")
    
    docs = db.collection("timetables").stream()
    
    unique_teachers = set()
    
    for doc in docs:
        data = doc.to_dict()
        
        # 1. Try to get the clean name first
        teacher = data.get("teacher_clean")
        
        if teacher and teacher != "N/A":
            # 2. FORCE CLEANING: Normalize the name right here
            clean_name = teacher.strip().replace('\u00A0', ' ')
            
            # 3. Apply Correction Dictionary
            if clean_name in TEACHER_CORRECTIONS:
                clean_name = TEACHER_CORRECTIONS[clean_name]
                
            unique_teachers.add(clean_name)
            
    clean_list = sorted(list(unique_teachers))
    
    print(f"✅ Found {len(clean_list)} unique, clean teachers.")
    print("⚡ Overwriting the old dirty list in Firestore...")
    
    db.collection("meta").document("teachers").set({
        "list": clean_list
    })
    
    print("🎉 Done! The dropdown is now perfectly clean.")

if __name__ == "__main__":
    rebuild_teacher_list()