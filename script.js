import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc as firestoreDoc, getDoc, collection, query, where, getDocs, orderBy, setDoc, deleteDoc, arrayUnion, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// FIX: Swapped signInWithPopup to signInWithRedirect here
import { getAuth, GoogleAuthProvider, signInWithRedirect, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyA_Zvqlc_t9wUW1PWUImjaJ7rtThP6OsYw",
    authDomain: "symbi-timetable.firebaseapp.com",
    projectId: "symbi-timetable",
    storageBucket: "symbi-timetable.firebasestorage.app",
    messagingSenderId: "720173048500",
    appId: "1:720173048500:web:aea9b7f626afed0abfede1"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- 2. CONFIG & CORRECTIONS ---
const TEACHER_CORRECTIONS = {
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
};

// --- 3. ELEMENTS ---
const viewModeBtn = document.getElementById('viewModeBtn');
const menuTrigger = document.getElementById('menuTrigger');
const menuLabel = document.getElementById('menuLabel');
const dropdownList = document.getElementById('dropdownList');
const searchContainer = document.getElementById('searchContainer');
const teacherSearch = document.getElementById('teacherSearch');
const menuHeader = document.getElementById('menuHeader');
const backBtn = document.getElementById('backBtn');
const stepTitle = document.getElementById('stepTitle');
const menuOptions = document.getElementById('menuOptions');
const divisionBar = document.getElementById('divisionBar');
const divisionWrapper = document.getElementById('divisionWrapper');
const scrollLeftBtn = document.getElementById('scrollLeftBtn');
const scrollRightBtn = document.getElementById('scrollRightBtn');
const dateInput = document.getElementById('datePicker');
const timetableDiv = document.getElementById('timetable');
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');
const todayBtn = document.getElementById('todayBtn');
const dayIndicator = document.getElementById('dayIndicator');
const setDefaultBtn = document.getElementById('setDefaultBtn');
const themePickerBtn = document.getElementById('themePickerBtn');
const themeDropdown = document.getElementById('themeDropdown');
const toastBox = document.getElementById('toastBox');

const counterDiv = document.createElement('div');
counterDiv.id = 'classCounter';
counterDiv.style.cssText = 'font-size: 0.85rem; font-weight: 700; color: var(--text-light); margin: 5px 0 10px 5px; display: none;';
timetableDiv.parentNode.insertBefore(counterDiv, timetableDiv);

const PROXIES = [
    { url: "https://api.allorigins.win/get?url=", type: "json" },
    { url: "https://corsproxy.io/?", type: "text" }
];
const BASE_URL = "http://time-table.sicsr.ac.in";

// --- 4. STATE ---
let viewMode = 'STUDENT';
let courseTree = {};
let teacherList = [];
let selection = { course: null, semester: null, division: null, teacher: null };
let currentStep = 'COURSE';
let currentUser = null;
let currentUsername = "Anonymous";

dateInput.valueAsDate = new Date();
updateDayDisplay();

// --- 5. INIT ---
async function init() {
    const savedTheme = localStorage.getItem('sicsr_theme') || 'dark';
    applyTheme(savedTheme);
    setupUpdateBanner();

    try {
        const courseDoc = await getDoc(firestoreDoc(db, "meta", "courses"));
        if (courseDoc.exists()) parseCourses(courseDoc.data().list || []);

        const teacherDoc = await getDoc(firestoreDoc(db, "meta", "teachers"));
        if (teacherDoc.exists()) {
            teacherList = (teacherDoc.data().list || []);
        }

        const defaultBatch = localStorage.getItem('sicsr_default_batch');
        const savedBatch = localStorage.getItem('sicsr_batch');

        if (defaultBatch && viewMode === 'STUDENT') {
            restoreSelection(defaultBatch);
        } else if (savedBatch && viewMode === 'STUDENT') {
            restoreSelection(savedBatch);
        }

    } catch (e) {
        console.error(e);
        menuLabel.textContent = "Error";
    }
}

function restoreSelection(rawBatch) {
    if (viewMode === 'TEACHER') return;

    for (const course in courseTree) {
        for (const sem in courseTree[course]) {
            const divs = courseTree[course][sem];
            const match = divs.find(d => d.value === rawBatch);
            if (match) {
                selection.course = course;
                selection.semester = sem;
                selection.division = rawBatch;
                updateHeaderLabel();
                menuTrigger.classList.add('active');
                renderDivisionBar();
                loadTimetable();
                updateDefaultButtonState();
                return;
            }
        }
    }
}

// --- 6. PARSERS ---
function parseCourses(rawList) {
    courseTree = {};
    rawList.forEach(item => {
        if (!item || typeof item !== 'string') return;
        if (item.toLowerCase().includes("common") || item.toLowerCase().includes("meetup")) return;
        if (item.toUpperCase().includes("EXAM")) return;

        let tempItem = item;
        let sem = "General / Other";
        let divLabel = item;

        let semMatch = item.match(/\(([IVX]+)\)/i);
        if (semMatch) {
            sem = `Sem ${semMatch[1].toUpperCase()}`;
            tempItem = tempItem.replace(semMatch[0], '');
        } else {
            let semMatchNum = item.match(/Sem(?:ester)?\.?\s*(\d+|[IVX]+)/i);
            if (semMatchNum) {
                sem = `Sem ${semMatchNum[1].toUpperCase()}`;
                tempItem = tempItem.replace(semMatchNum[0], '');
            }
        }

        let courseBase = tempItem.split('-')[0].replace(/Group|Elective|Electe|Batch/gi, '').replace(/\(\)/g, '').trim();
        if (courseBase.length < 2) courseBase = "Other";

        if (sem !== "General / Other" && item.includes('-')) {
            let parts = item.split('-');
            if (parts.length > 1) {
                let rawDiv = parts.slice(1).join('-').trim();
                rawDiv = rawDiv.replace(/^(Div\.?|Division)\s*/i, '');
                divLabel = (rawDiv.length === 1 && rawDiv.match(/[A-Z]/i)) ? `Div ${rawDiv}` : rawDiv;
            }
        }

        if (!courseTree[courseBase]) courseTree[courseBase] = {};
        if (!courseTree[courseBase][sem]) courseTree[courseBase][sem] = [];
        if (!courseTree[courseBase][sem].find(d => d.value === item)) {
            courseTree[courseBase][sem].push({ label: divLabel, value: item });
        }
    });
}

function parseDescription(desc, batchName) {
    if (!desc) return { subject: "Subject Not Listed", teacher: "" };
    let d = desc.replace(/&amp;/g, '&').trim();

    let previousD = "";
    while (d !== previousD) {
        previousD = d;
        d = d.replace(/^(BBA|BCA|MBA|MSc|Sem|Semester|Div|Division|Batch|Class|Group)(\([^)]*\))?\s*([0-9]+|[IVX]+|[A-Z])?\b\s*[-:]*\s*/i, "");
        d = d.replace(/^([IVX]+)(\s*[-:]+\s*|\s+)/, "");
        d = d.replace(/^[A-Z]\s*[-:]+\s*/, "");
        d = d.replace(/^[-:\s]+/, "");
    }

    let parts = d.includes(' - ') ? d.split(' - ') : d.split('-');
    parts = parts.map(p => p.trim()).filter(p => p.length > 0);

    let finalSubject = "", finalTeacher = "";
    const isTeacher = (text) => /^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.|Ar\.|Er\.)/i.test(text);

    if (parts.length > 0 && isTeacher(parts[parts.length - 1])) finalTeacher = parts.pop();

    if (finalTeacher) {
        let cleanName = finalTeacher.trim().replace(/\u00A0/g, ' ');
        if (TEACHER_CORRECTIONS[cleanName]) {
            finalTeacher = TEACHER_CORRECTIONS[cleanName];
        }
    }

    if (parts.length > 0) finalSubject = parts.join(' - ');
    else if (finalTeacher) finalSubject = "Class / Session";
    else finalSubject = desc.replace(batchName || "", "").trim().replace(/^[-:\s]+/, "");

    return { subject: finalSubject.replace(/ - $/, "").trim(), teacher: finalTeacher };
}

// --- 7. MENU RENDERING ---
function renderMenu() {
    menuOptions.innerHTML = '';

    if (viewMode === 'TEACHER') {
        menuHeader.classList.add('hidden');

        let displayList = [...teacherList];
        const searchTerm = teacherSearch.value.toLowerCase().trim();

        if (searchTerm) {
            displayList = displayList.filter(t => t.toLowerCase().includes(searchTerm));
        }

        if (displayList.length === 0) {
            menuOptions.innerHTML = '<div style="padding:15px; color:#999; text-align:center;">No teachers found.</div>';
            return;
        }

        displayList.sort((a, b) => {
            const cleanA = a.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Ar\.|Er\.)\s*/i, '').trim();
            const cleanB = b.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Ar\.|Er\.)\s*/i, '').trim();
            return cleanA.localeCompare(cleanB);
        });

        displayList.forEach((teacher, index) => {
            const label = `${index + 1}. ${teacher}`;
            addOption(label, () => {
                selection.teacher = teacher;
                menuLabel.textContent = teacher;
                finishMenuSelection();
                loadTimetable();
            }, false);
        });
        return;
    }

    if (currentStep === 'COURSE') {
        menuHeader.classList.add('hidden');
        Object.keys(courseTree).sort().forEach(course => {
            addOption(course, () => {
                selection.course = course;
                currentStep = 'SEM';
                renderMenu();
            }, true);
        });
    }
    else if (currentStep === 'SEM') {
        menuHeader.classList.remove('hidden');
        stepTitle.textContent = selection.course;
        Object.keys(courseTree[selection.course]).sort().forEach(sem => {
            addOption(sem, () => {
                selection.semester = sem;
                currentStep = 'DIV';
                renderMenu();
            }, true);
        });
    }
    else if (currentStep === 'DIV') {
        menuHeader.classList.remove('hidden');
        stepTitle.textContent = `${selection.semester}`;
        const divs = courseTree[selection.course][selection.semester];
        divs.sort((a,b) => a.label.localeCompare(b.label));
        divs.forEach(divObj => {
            addOption(divObj.label, () => {
                selection.division = divObj.value;
                localStorage.setItem('sicsr_batch', divObj.value);
                finishMenuSelection();
                loadTimetable();
            }, false);
        });
    }
}

function addOption(text, onClick, hasArrow) {
    const div = document.createElement('div');
    div.className = 'option-item';
    div.innerHTML = `<span>${text}</span> ${hasArrow ? '<span class="option-arrow">›</span>' : ''}`;
    div.onclick = (e) => { e.stopPropagation(); onClick(); };
    menuOptions.appendChild(div);
}

function updateHeaderLabel() {
    if (viewMode === 'TEACHER') {
        menuLabel.textContent = selection.teacher || "Select Teacher...";
        return;
    }
    if (selection.course && selection.semester && selection.division) {
        const divList = courseTree[selection.course][selection.semester];
        const selectedDivObj = divList.find(d => d.value === selection.division);
        const labelSuffix = selectedDivObj ? ` - ${selectedDivObj.label}` : '';
        menuLabel.textContent = `${selection.course} ${selection.semester}${labelSuffix}`;
    }
}

function finishMenuSelection() {
    dropdownList.classList.remove('show');
    updateHeaderLabel();
    menuTrigger.classList.add('active');
    if (viewMode === 'STUDENT') {
        renderDivisionBar();
        updateDefaultButtonState();
    }
}

function renderDivisionBar() {
    divisionBar.innerHTML = '';

    if (viewMode === 'TEACHER' || !selection.course) {
        divisionWrapper.classList.add('hidden');
        return;
    }
    divisionWrapper.classList.remove('hidden');

    const divs = courseTree[selection.course][selection.semester];
    divs.sort((a,b) => a.label.localeCompare(b.label));

    divs.forEach(divObj => {
        const btn = document.createElement('button');
        btn.className = `div-btn ${selection.division === divObj.value ? 'selected' : ''}`;
        btn.textContent = divObj.label;

        btn.onclick = () => {
            selection.division = divObj.value;
            localStorage.setItem('sicsr_batch', divObj.value);

            const allBtns = divisionBar.querySelectorAll('.div-btn');
            allBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            updateHeaderLabel();
            loadTimetable();
            updateDefaultButtonState();
        };
        divisionBar.appendChild(btn);
    });
}

// --- 8. LOAD TIMETABLE ---
async function loadTimetable() {
    const date = dateInput.value;
    if (!date) return;

    let q;
    if (viewMode === 'TEACHER') {
        if (!selection.teacher) {
            timetableDiv.innerHTML = '<div class="empty-state"><div class="icon">👨‍🏫</div><p>Select a teacher</p></div>';
            return;
        }
        q = query(collection(db, "timetables"), where("teacher_clean", "==", selection.teacher), where("date", "==", date), orderBy("start_time"));
    } else {
        if (!selection.division) return;
        q = query(collection(db, "timetables"), where("batch", "==", selection.division), where("date", "==", date), orderBy("start_time"));
    }

    timetableDiv.innerHTML = '<div class="spinner">Loading...</div>';
    counterDiv.style.display = 'none';

    try {
        let snap = await getDocs(q);

        if (snap.empty && viewMode === 'STUDENT') {
            const dayCheck = query(collection(db, "timetables"), where("date", "==", date), limit(1));
            const daySnap = await getDocs(dayCheck);
            if (daySnap.empty) {
                timetableDiv.innerHTML = '<div class="spinner">Loading...</div>';
                const count = await scrapeDayClientSide(date);
                if (count > 0) {
                    snap = await getDocs(q);
                    init();
                } else {
                    renderEmptyState();
                    return;
                }
            }
        }

        const reportsQ = query(collection(db, "reports"), where("date", "==", date));
        const reportsSnap = await getDocs(reportsQ);
        const dailyReports = [];
        reportsSnap.forEach(r => dailyReports.push(r.data()));

        if (snap.empty) {
            renderEmptyState();
        } else {
            renderCards(snap, dailyReports);
        }
    } catch (error) {
        timetableDiv.innerHTML = `<div class="empty-state" style="color:red">${error.message}</div>`;
    }
}

function renderEmptyState() {
    counterDiv.style.display = 'none';
    timetableDiv.innerHTML = `
        <div class="empty-state">
            <p>No classes found.</p>
            <button id="refreshDataBtn" class="refresh-btn">↻ Refresh</button>
        </div>`;

    document.getElementById('refreshDataBtn').addEventListener('click', manualRefresh);
}

async function manualRefresh() {
    const date = dateInput.value;
    if (!date) return;

    timetableDiv.innerHTML = '<div class="spinner">Refreshing...</div>';

    let q;
    if (viewMode === 'TEACHER') {
        q = query(collection(db, "timetables"), where("teacher_clean", "==", selection.teacher), where("date", "==", date), orderBy("start_time"));
    } else {
        q = query(collection(db, "timetables"), where("batch", "==", selection.division), where("date", "==", date), orderBy("start_time"));
    }

    try {
        let snap = await getDocs(q);
        if (!snap.empty) {
            const reportsQ = query(collection(db, "reports"), where("date", "==", date));
            const reportsSnap = await getDocs(reportsQ);
            const dailyReports = [];
            reportsSnap.forEach(r => dailyReports.push(r.data()));

            renderCards(snap, dailyReports);
        } else {
            await scrapeDayClientSide(date);
            loadTimetable();
        }
    } catch (e) {
        console.error(e);
        timetableDiv.innerHTML = `<div class="empty-state" style="color:red">Error refreshing</div>`;
    }
}

function renderCards(snap, dailyReports = []) {
    timetableDiv.innerHTML = '';
    let classes = [];

    snap.forEach(d => {
        let item = d.data();
        item.docId = d.id;
        classes.push(item);
    });

    classes = classes.filter(data => {
        const desc = data.description || "";
        return desc.trim().length > 0 && desc.toLowerCase() !== "subject not listed";
    });

    if (classes.length > 0) {
        counterDiv.textContent = `Total Classes: ${classes.length}`;
        counterDiv.style.display = 'block';
    } else {
        renderEmptyState();
        return;
    }

    classes.forEach(data => {
        const parsed = parseDescription(data.description, data.batch);
        let subject = parsed.subject;
        let teacher = parsed.teacher;

        let roomRaw = data.room || "";
        let roomNum = roomRaw.replace(/SICSR\s*-\s*/gi, "").trim();
        let roomHtml = roomNum ? `Room <b style="color:var(--text-dark)">${roomNum}</b>` : roomRaw;

        let metaRowContent = "";
        if (viewMode === 'TEACHER') {
            metaRowContent = `<span>🎓 ${data.batch}</span>`;
        } else {
            metaRowContent = teacher ? `<span>👨‍🏫 ${teacher}</span>` : '';
        }

        const classId = data.docId;

        // Fetch reports for this specific class
        const classReports = dailyReports.filter(r => r.classId === classId);
        const cancelReports = classReports.filter(r => r.type === 'CANCELLED');
        const roomReports = classReports.filter(r => r.type === 'ROOM_CHANGE');

        const myReport = currentUser ? classReports.find(r => r.uid === currentUser.uid) : null;

        // Group all room reports by the room number they reported
        const roomGroups = {};
        roomReports.forEach(r => {
            if (!roomGroups[r.newRoom]) roomGroups[r.newRoom] = [];
            roomGroups[r.newRoom].push(r);
        });
        const uniqueRooms = Object.keys(roomGroups);

        // Determine if there is ANY type of conflict
        const hasCancel = cancelReports.length > 0;
        const hasRoom = roomReports.length > 0;
        const isMixedConflict = hasCancel && hasRoom;
        const isRoomConflict = uniqueRooms.length > 1;
        const isAnyConflict = isMixedConflict || isRoomConflict;

        let cardClass = 'card';
        let alertBanner = '';
        let drawerStatus = '🟢 No active reports';

        if (classReports.length > 0) {

            // --- SCENARIO 1: CONFLICT (Mixed reports OR multiple different rooms) ---
            if (isAnyConflict) {
                cardClass = 'card shifted-card'; // Use shifted style but with warning banner
                drawerStatus = `🟠 Conflicting Reports`;

                // Build a master list showing exactly who reported what
                let listItems = '';
                cancelReports.forEach(r => {
                    listItems += `<li>🚨 <b>${r.username}</b> said Cancelled</li>`;
                });
                roomReports.forEach(r => {
                    listItems += `<li>📍 <b>${r.username}</b> said Room <b>${r.newRoom}</b></li>`;
                });

                let reporterText = `
                    <span class="reporters-toggle" onclick="event.stopPropagation(); const list = this.nextElementSibling; list.style.display = list.style.display === 'none' ? 'block' : 'none';">(See ${classReports.length} conflicting reports ▾)</span>
                    <ul class="reporters-list" style="display: none; margin-top: 8px;" onclick="event.stopPropagation();">
                        ${listItems}
                    </ul>
                `;

                alertBanner = `
                    <div class="report-alert alert-warning" style="background: rgba(255, 165, 0, 0.15); border: 1px solid rgba(255, 165, 0, 0.4);">
                        <div>⚠️ <b>CONFLICTING REPORTS</b> ${reporterText}</div>
                        <div class="report-disclaimer">Students have reported different updates. Tap the text above to see who said what.</div>
                    </div>`;

            // --- SCENARIO 2: EVERYONE AGREES IT IS CANCELLED ---
            } else if (hasCancel) {
                cardClass = 'card cancelled-card';
                drawerStatus = '🔴 Reported Cancelled';

                let reporterText = '';
                if (cancelReports.length === 1) {
                    reporterText = `<span style="font-weight:normal;opacity:0.8">(Reported by ${cancelReports[0].username})</span>`;
                } else {
                    let listItems = cancelReports.map(r => `<li>✅ ${r.username}</li>`).join('');
                    reporterText = `
                        <span class="reporters-toggle" onclick="event.stopPropagation(); const list = this.nextElementSibling; list.style.display = list.style.display === 'none' ? 'block' : 'none';">(Reported by ${cancelReports.length} people ▾)</span>
                        <ul class="reporters-list" style="display: none; margin-top: 8px;" onclick="event.stopPropagation();">
                            ${listItems}
                        </ul>
                    `;
                }

                alertBanner = `
                    <div class="report-alert alert-danger">
                        <div>🚨 <b>CLASS CANCELLED</b> ${reporterText}</div>
                        <div class="report-disclaimer">⚠️ Note: This is an unverified student report. Confirm with your teacher.</div>
                    </div>`;

            // --- SCENARIO 3: EVERYONE AGREES ON ONE SPECIFIC ROOM ---
            } else if (hasRoom) {
                cardClass = 'card shifted-card';
                const reportedRoom = uniqueRooms[0];
                drawerStatus = `🟠 Shifted to ${reportedRoom}`;

                let reporterText = '';
                if (roomReports.length === 1) {
                    reporterText = `<span style="font-weight:normal;opacity:0.8">(Reported by ${roomReports[0].username})</span>`;
                } else {
                    let listItems = roomReports.map(r => `<li>✅ ${r.username}</li>`).join('');
                    reporterText = `
                        <span class="reporters-toggle" onclick="event.stopPropagation(); const list = this.nextElementSibling; list.style.display = list.style.display === 'none' ? 'block' : 'none';">(Reported by ${roomReports.length} people ▾)</span>
                        <ul class="reporters-list" style="display: none; margin-top: 8px;" onclick="event.stopPropagation();">
                            ${listItems}
                        </ul>
                    `;
                }

                alertBanner = `
                    <div class="report-alert alert-warning">
                        <div>📍 <b>SHIFTED TO ROOM ${reportedRoom}</b> ${reporterText}</div>
                        <div class="report-disclaimer">⚠️ Note: This is an unverified student report. Confirm with your teacher.</div>
                    </div>`;
            }
        }

        let actionsHtml = '';
        if (myReport) {
            actionsHtml = `<button class="report-btn" style="border-color:var(--text-light); color:var(--text-light)" onclick="undoReport('${classId}', event)">↩ Undo My Report</button>`;
        } else {
            actionsHtml = `
                <button class="report-btn" onclick="submitReport('${classId}', 'room', event)">📍 Shifted</button>
                <button class="report-btn cancel-btn" onclick="submitReport('${classId}', 'cancel', event)">🚨 Cancelled</button>
            `;
        }

        const card = document.createElement('div');
        card.className = cardClass;
        card.innerHTML = `
            ${alertBanner}

            <div class="card-header-row">
                <span class="time-pill">${formatTime(data.start_time)} - ${formatTime(data.end_time)}</span>
                <span class="click-hint">👆 Tap to report</span>
            </div>

            <div class="subject">${subject}</div>
            <div class="meta-row">${metaRowContent}</div>
            <div class="meta-row"><span>📍 ${roomHtml}</span></div>

            <div class="card-drawer">
                <div class="report-status">${drawerStatus}</div>
                <div class="report-actions">
                    ${actionsHtml}
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            const wasExpanded = card.classList.contains('expanded');
            document.querySelectorAll('.card').forEach(c => c.classList.remove('expanded'));
            if (!wasExpanded) card.classList.add('expanded');
        });

        timetableDiv.appendChild(card);
    });
}

// --- 9. CLIENT SCRAPER ---
async function fetchWithProxy(targetUrl) {
    for (const proxy of PROXIES) {
        try {
            const res = await fetch(proxy.url + encodeURIComponent(targetUrl));
            if (res.ok) return proxy.type === "json" ? (await res.json()).contents : await res.text();
        } catch (e) { }
    }
    throw new Error("Proxies busy");
}

async function scrapeDayClientSide(dateStr) {
    try {
        const [y, m, d] = dateStr.split('-');
        const html = await fetchWithProxy(`${BASE_URL}/day.php?year=${y}&month=${m}&day=${d}&area=1`);
        const doc = new DOMParser().parseFromString(html, "text/html");

        const uniqueIds = new Set();
        doc.querySelectorAll("a[href*='view_entry.php?id=']").forEach(a => uniqueIds.add(a.href.match(/id=(\d+)/)[1]));

        if (uniqueIds.size === 0) return 0;
        let savedCount = 0;
        const promises = Array.from(uniqueIds).map(async (id) => {
            try {
                const dHtml = await fetchWithProxy(`${BASE_URL}/view_entry.php?id=${id}`);
                const dDoc = new DOMParser().parseFromString(dHtml, "text/html");
                const getVal = (l) => {
                    const c = Array.from(dDoc.querySelectorAll('td')).find(td => td.textContent.includes(l));
                    return c ? c.nextElementSibling.textContent.trim() : "";
                };

                const batch = getVal("Type:");
                if (!batch) return;
                const desc = getVal("Description:") || "";
                const parsed = parseDescription(desc, batch);

                await setDoc(firestoreDoc(db, "timetables", id), {
                    id: id, date: dateStr, batch: batch,
                    description: desc, subject_clean: parsed.subject, teacher_clean: parsed.teacher,
                    room: getVal("Room:"),
                    start_time: (getVal("Start time:") || "").substring(0, 5),
                    end_time: (getVal("End time:") || "").substring(0, 5)
                }, { merge: true });

                await setDoc(firestoreDoc(db, "meta", "courses"), { list: arrayUnion(batch) }, { merge: true });
                if (parsed.teacher) {
                    await setDoc(firestoreDoc(db, "meta", "teachers"), { list: arrayUnion(parsed.teacher) }, { merge: true });
                }
                savedCount++;
            } catch(e) {}
        });

        await Promise.all(promises);
        return savedCount;
    } catch (e) { return 0; }
}

function formatTime(t) {
    if (!t) return "";
    const [h, m] = t.split(':');
    return `${parseInt(h) % 12 || 12}:${m} ${parseInt(h) >= 12 ? 'PM' : 'AM'}`;
}

// --- 10. EVENTS ---
function updateDefaultButtonState() {
    if (viewMode === 'TEACHER' || !selection.division) {
        setDefaultBtn.style.display = 'none';
        return;
    }
    setDefaultBtn.style.display = 'flex';

    const savedDefault = localStorage.getItem('sicsr_default_batch');
    if (savedDefault === selection.division) {
        setDefaultBtn.classList.add('active');
    } else {
        setDefaultBtn.classList.remove('active');
    }
}

setDefaultBtn.addEventListener('click', () => {
    if (!selection.division) return;
    const currentDefault = localStorage.getItem('sicsr_default_batch');

    if (currentDefault === selection.division) {
        localStorage.removeItem('sicsr_default_batch');
        showToast(`❌ Unpinned default class`);
    } else {
        localStorage.setItem('sicsr_default_batch', selection.division);
        showToast(`📌 Pinned: ${selection.division} as default`);
    }
    updateDefaultButtonState();
});

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastBox.appendChild(t);

    setTimeout(() => {
        t.style.animation = 'toastOut 0.3s ease-in forwards';
        t.addEventListener('animationend', () => t.remove());
    }, 3000);
}

function applyTheme(theme) {
const validThemes = ['light', 'pink', 'yellow', 'antihero', 'bluedolphin', 'desertoasis', 'matrix', 'passionfruit', 'tiramisu'];
    if (validThemes.includes(theme)) {
        document.body.setAttribute('data-theme', theme);
    } else {
        document.body.removeAttribute('data-theme');
    }
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });
}

themePickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.toggle('show');
});

themeDropdown.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = option.dataset.theme;
        applyTheme(theme);
        localStorage.setItem('sicsr_theme', theme);
        themeDropdown.classList.remove('show');
        showToast(`Theme changed`);
    });
});

viewModeBtn.addEventListener('click', () => {
    if (viewMode === 'STUDENT') {
        viewMode = 'TEACHER';
        viewModeBtn.innerHTML = "<span>Click here</span><span>for Students Schedule 🎓</span>";
        viewModeBtn.classList.add('teacher-mode');
        menuLabel.textContent = "Select Teacher...";
        divisionWrapper.classList.add('hidden');
        setDefaultBtn.style.display = 'none';
        searchContainer.classList.remove('hidden');
        teacherSearch.value = '';
        teacherSearch.focus();
        selection.teacher = null;
    } else {
        viewMode = 'STUDENT';
        viewModeBtn.innerHTML = "<span>Click here</span><span>for Teachers Schedule 👨‍🏫</span>";
        viewModeBtn.classList.remove('teacher-mode');
        searchContainer.classList.add('hidden');

        const savedBatch = localStorage.getItem('sicsr_batch');
        if (savedBatch) restoreSelection(savedBatch);
        else menuLabel.textContent = "Select Course...";
    }
    dropdownList.classList.remove('show');
    currentStep = viewMode === 'STUDENT' ? 'COURSE' : 'TEACHER_LIST';
    loadTimetable();
});

teacherSearch.addEventListener('input', () => {
    renderMenu();
});

function updateDayDisplay() {
    if (!dateInput.value) return;
    const d = new Date(dateInput.value);
    dayIndicator.textContent = d.toLocaleDateString('en-US', { weekday: 'short' });
}

function changeDate(days) {
    const c = new Date(dateInput.value);
    c.setDate(c.getDate() + days);
    dateInput.valueAsDate = c;
    updateDayDisplay();
    loadTimetable();
}

prevDayBtn.addEventListener('click', () => changeDate(-1));
nextDayBtn.addEventListener('click', () => changeDate(1));
todayBtn.addEventListener('click', () => {
    dateInput.valueAsDate = new Date();
    updateDayDisplay();
    loadTimetable();
});
dateInput.addEventListener('change', () => { updateDayDisplay(); loadTimetable(); });

scrollLeftBtn.addEventListener('click', () => {
    const buttons = Array.from(divisionBar.querySelectorAll('.div-btn'));
    if (buttons.length === 0) return;

    const currentIndex = buttons.findIndex(btn => btn.classList.contains('selected'));

    if (currentIndex > 0) {
        buttons[currentIndex - 1].click();
        buttons[currentIndex - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
        buttons[buttons.length - 1].click();
        buttons[buttons.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
});

scrollRightBtn.addEventListener('click', () => {
    const buttons = Array.from(divisionBar.querySelectorAll('.div-btn'));
    if (buttons.length === 0) return;

    const currentIndex = buttons.findIndex(btn => btn.classList.contains('selected'));

    if (currentIndex !== -1 && currentIndex < buttons.length - 1) {
        buttons[currentIndex + 1].click();
        buttons[currentIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
        buttons[0].click();
        buttons[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
});

menuTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownList.classList.toggle('show');
    if(dropdownList.classList.contains('show')) renderMenu();
});
backBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if(viewMode === 'TEACHER') { }
    else if (currentStep === 'DIV') currentStep = 'SEM';
    else currentStep = 'COURSE';
    renderMenu();
});
document.addEventListener('click', (e) => {
    if (!menuTrigger.contains(e.target) && !dropdownList.contains(e.target)) dropdownList.classList.remove('show');
    if (!themePickerBtn.contains(e.target) && !themeDropdown.contains(e.target)) themeDropdown.classList.remove('show');
});

// --- UPDATE BANNER & REPORTING LOGIC ---
function setupUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (!banner) return;

    banner.classList.remove('hidden');
    
    // We completely removed the <button> and the <div id="bannerDetails"> here
    banner.innerHTML = `
        <div class="banner-header" style="justify-content: center; text-align: center;">
            <div class="banner-text" style="width: 100%;">
                <span style="color: #ff4444; font-size: 1.1rem;"><b>THE SITE IS UNDER MAINTENANCE WILL RESUME SOON</b></span>
            </div>
        </div>
    `;
    
    // The event listener for the button has also been deleted so your script doesn't crash!
}

// Undo Report Function with Error Handling
window.undoReport = async function(classId, event) {
    event.stopPropagation();
    if (!currentUser) return;

    try {
        const reportId = `${classId}_${currentUser.uid}`;
        await deleteDoc(firestoreDoc(db, 'reports', reportId));
        showToast("🗑️ Report removed.");
        loadTimetable();
    } catch (e) {
        console.error("Error removing report:", e);
        showToast(`❌ Error: ${e.message}`);
    }
};

// Submit Report Function with Validation and Error Handling
window.submitReport = async function(classId, type, event) {
    event.stopPropagation();

    if (!currentUser) {
        showToast("⚠️ You must be logged in to report a change!");
        return;
    }

    const reportId = `${classId}_${currentUser.uid}`;
    const reportRef = firestoreDoc(db, 'reports', reportId);

    if (type === 'cancel') {
        try {
            await setDoc(reportRef, {
                classId: classId,
                uid: currentUser.uid,
                username: currentUsername,
                type: 'CANCELLED',
                date: dateInput.value,
                timestamp: new Date().toISOString()
            });
            showToast("🚨 Cancellation report recorded!");
            loadTimetable();
        } catch (e) {
            console.error("Error saving report:", e);
            showToast(`❌ Database Error: ${e.message}`);
        }

    } else if (type === 'room') {
        let newRoom = prompt("What is the new room number? (Numbers only)");

        if (newRoom === null || newRoom.trim() === "") return;
        newRoom = newRoom.trim();

        // Strict Number Validation
        if (!/^\d+$/.test(newRoom)) {
            showToast("❌ Invalid Room! Please enter numbers only.");
            return;
        }

        try {
            await setDoc(reportRef, {
                classId: classId,
                uid: currentUser.uid,
                username: currentUsername,
                type: 'ROOM_CHANGE',
                newRoom: newRoom,
                date: dateInput.value,
                timestamp: new Date().toISOString()
            });
            showToast(`📍 Room change to ${newRoom} recorded!`);
            loadTimetable();
        } catch (e) {
            console.error("Error saving report:", e);
            showToast(`❌ Database Error: ${e.message}`);
        }
    }
};

// ===== AUTH LOGIC =====
const loginBtn        = document.getElementById('loginBtn');
const usernameModal   = document.getElementById('usernameModal');
const usernameInput   = document.getElementById('usernameInput');
const usernameError   = document.getElementById('usernameError');
const saveUsernameBtn = document.getElementById('saveUsernameBtn');

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        loginBtn.textContent = 'Sign Out';
        loginBtn.classList.add('logged-in');

        const userRef  = firestoreDoc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists() || !userSnap.data().username) {
            usernameModal.classList.remove('hidden');
            usernameInput.focus();
        } else {
            currentUsername = userSnap.data().username;
            loadTimetable();
        }
    } else {
        loginBtn.textContent = 'Sign In';
        loginBtn.classList.remove('logged-in');
        currentUsername = "Anonymous";
        loadTimetable();
    }
});

loginBtn.addEventListener('click', async () => {
    if (currentUser) {
        await signOut(auth);
        showToast('👋 Signed out');
    } else {
        try {
            // FIX: Uses signInWithRedirect to bypass mobile popup blockers
            await signInWithRedirect(auth, googleProvider);
        } catch (err) {
            showToast('❌ Sign-in failed: ' + err.message);
        }
    }
});

saveUsernameBtn.addEventListener('click', async () => {
    const raw     = usernameInput.value.trim();
    const isValid = /^[a-zA-Z0-9_]{3,20}$/.test(raw);

    usernameError.classList.toggle('hidden', isValid);
    if (!isValid) return;

    saveUsernameBtn.disabled    = true;
    saveUsernameBtn.textContent = 'Saving…';

    try {
        await setDoc(firestoreDoc(db, 'users', currentUser.uid), {
            uid:        currentUser.uid,
            email:      currentUser.email,
            username:  raw,
            photoURL:  currentUser.photoURL || '',
            createdAt: new Date().toISOString(),
        }, { merge: true });

        currentUsername = raw;
        usernameModal.classList.add('hidden');
        showToast(`✅ Welcome, ${raw}!`);
        loadTimetable();
    } catch (err) {
        saveUsernameBtn.disabled    = false;
        saveUsernameBtn.textContent = 'Save & Continue →';
        showToast('❌ Could not save. Try again.');
    }
});

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveUsernameBtn.click();
});

usernameModal.addEventListener('click', (e) => {
    if (e.target === usernameModal) usernameModal.classList.add('hidden');
});

init();