// leave_tracker.js

// Import necessary global variables and functions.
// Ensure every variable used in this file is listed here.
import {
    db,
    activeAgents,
    usersData,
    loggedInUserRole,
    todayGlobal,
    showPage,
    fetchAttendanceData,
    fetchAllUsersData,
    updateHomeStatistics,
    updateDashboardData,
    currentLeaveTrackerDate, // This was missing in the original plan
    formatDate, // You'll likely need this
    markedDates,
    attendanceData
} from './main.js';

let leavePlannerData = {}; // Cache for leave data

export function initializeLeaveTracker(initialDate) {
    currentLeaveTrackerDate = initialDate;
    // You might also need to initialize some DOM elements here if they are not global
    DOM.prevMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() - 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });
    DOM.nextMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() + 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });
}

export async function fetchLeaveData(year, month) {
    const monthYearKey = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    DOM.currentLeaveMonthYear.textContent = monthYearKey;
    try {
        const docRef = db.collection('leaves').doc(monthYearKey);
        const doc = await docRef.get();
        if (doc.exists) {
            leavePlannerData[monthYearKey] = doc.data().data || [];
            console.log(`Leave data for ${monthYearKey} loaded from Firestore.`);
        } else {
            leavePlannerData[monthYearKey] = [];
            console.log(`No leave data found for ${monthYearKey} in Firestore, initialized locally.`);
        }
        renderLeavePlannerTable();
    } catch (error) {
        console.error("Error fetching leave data:", error);
        alert("Critical: Could not load leave data. Check console and Firebase rules.");
    }
}

export function renderLeavePlannerTable() {
    // ... your original renderLeavePlannerTable function code ...
    // Note: It's assumed you will access DOM elements like `DOM.leaveTrackerTableContainer` here.
    // If you haven't defined `DOM` as a global in main.js, this will also fail.
    // The previous main.js code I provided does define `window.DOM`, so it should work.
    
    // ... (rest of the render function) ...
}

export async function updateLeaveStatus(agentName, fullDateKey, newStatus) {
    // ... your original updateLeaveStatus function code ...
    // This will need access to `db`, `usersData`, `attendanceData`, etc.
    // which are now correctly imported.
    
    // ... (rest of the update function) ...
}

// Export any other functions needed by main.js
