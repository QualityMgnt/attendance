// leave_tracker.js

// Import necessary global variables and functions
import { db, activeAgents, usersData, loggedInUserRole, todayGlobal, showPage, fetchAttendanceData, fetchAllUsersData, updateHomeStatistics, updateDashboardData } from './main.js';

let currentLeaveTrackerDate; // This will be managed by main.js
let leavePlannerData = {}; // Cache for leave data

export function initializeLeaveTracker(initialDate) {
    currentLeaveTrackerDate = initialDate;
    // You might also need to initialize some DOM elements here if they are not global
    // DOM.prevMonthLeaveBtn.addEventListener(...)
}

export async function fetchLeaveData(year, month) {
    const monthYearKey = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });
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
    // ... same code as your original `renderLeavePlannerTable` function ...
    // Note: You will need to access global variables like `DOM` and `activeAgents` here.
    // Make sure these are exported from `main.js` and imported here.
}

export async function updateLeaveStatus(agentName, fullDateKey, newStatus) {
    // ... same code as your original `updateLeaveStatus` function ...
    // Make sure you have access to `db`, `usersData`, `attendanceData`, etc.
}

// Export any other functions needed by main.js
