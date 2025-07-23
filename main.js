// main.js

// Firebase Configuration (REPLACE WITH YOUR ACTUAL CONFIG)
const firebaseConfig = {
    apiKey: "AIzaSyD9uPdQ7DfrKkOHyzcUnsJx5b2Fm51AdvY",
    authDomain: "attendance-d2f5c.firebaseapp.com",
    projectId: "attendance-d2f5c",
    storageBucket: "attendance-d2f5c.firebasestorage.app",
    messagingSenderId: "275359754293",
    appId: "1:275359754293:web:0fe5aa0f30d57c749ce97c",
    measurementId: "G-PWN5S35KTP"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
export const auth = firebase.auth();
export const db = firebase.firestore();

// --- Global Variables / Caches ---
// EXPORT these global variables so other modules can access them
export let loggedInUser = null;
export let loggedInUserRole = 'Agent';
export let usersData = {};
export const attendanceData = {};
export const markedDates = new Set();
export let activeAgents = [];
export let currentLeaveTrackerDate = new Date();
export const todayGlobal = new Date();

// Helper to format date for Firestore document IDs
export const formatDate = (date) => date.toISOString().split('T')[0];

// --- Import functions from other modules ---
// This is correct as is, assuming the functions exist in those files.
import { initializeLeaveTracker, fetchLeaveData, updateLeaveStatus } from './leave_tracker.js';
import { initializeShiftSchedule, renderShiftScheduleTable, updateShiftScheduleDashboard } from './shift_schedule.js';

// ... (Keep the rest of the functions from your previous main.js) ...

// --- Core Helper Functions (moved from index.html) ---
// EXPORT these functions so other modules can call them
export function updateActiveAgentsList() {
    const sampleSecondaryRoles = ['Inbound / Email', 'Social Media', 'LiveChat', 'Sales', 'Onboarding', 'Level 1 Escalations'];
    const samplePeriods = ['July - December', 'Jan - June', 'Annual'];
    Object.keys(usersData).forEach(email => {
        if (!usersData[email].secondaryRole) {
            usersData[email].secondaryRole = sampleSecondaryRoles[Math.floor(Math.random() * sampleSecondaryRoles.length)];
        }
        if (!usersData[email].period) {
            usersData[email].period = samplePeriods[Math.floor(Math.random() * samplePeriods.length)];
        }
    });
    activeAgents = Object.values(usersData)
        .filter(user => user.isActive)
        .map(user => user.fullName)
        .sort();
    console.log("Active agents list updated:", activeAgents.length, "active agents.");
}

export async function fetchAllUsersData() {
    usersData = {};
    try {
        const usersSnapshot = await db.collection('users').get();
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            usersData[userData.email] = {
                uid: doc.id,
                fullName: userData.fullName,
                role: userData.role,
                isActive: userData.isActive,
                email: userData.email,
                openingLeaveBalance: userData.openingLeaveBalance || 20,
                secondaryRole: userData.secondaryRole || '',
                period: userData.period || ''
            };
        });
        updateActiveAgentsList();
        console.log("All user data loaded from Firestore.");
    } catch (error) {
        console.error("Error fetching users from Firestore:", error.code, error.message);
        alert("Critical: Could not load user list from database. Check console and Firebase rules.");
    }
}

export async function fetchAttendanceData() {
    for (const key in attendanceData) {
        delete attendanceData[key];
    }
    markedDates.clear();
    try {
        const attendanceSnapshot = await db.collection('attendance').get();
        attendanceSnapshot.forEach(doc => {
            attendanceData[doc.id] = doc.data();
            markedDates.add(doc.id);
        });
        console.log("Attendance data loaded from Firestore.");
    } catch (error) {
        console.error("Error fetching attendance data:", error);
        alert("Critical: Could not load attendance data. Check console and Firebase rules.");
    }
}

// ... other core functions that need to be globally accessible ...
// (e.g., setLoggedInState, showPage, updateHomeStatistics, etc.)
// Make sure to `export` any functions needed by other modules.

// --- UI State Management (moved from index.html) ---
export function showPage(pageId) {
    document.querySelectorAll('.content-module').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    DOM.navLinks.forEach(link => {
        if (link.dataset.page === pageId.replace('Page', '')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    switch (pageId) {
        case 'homePage':
            // ...
            break;
        case 'attendancePage':
            // ...
            break;
        case 'leaveTrackerPage':
            // Call the imported function from leave_tracker.js
            fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
            break;
        case 'shiftSchedulePage':
            // Call the imported function from shift_schedule.js
            renderShiftScheduleTable();
            updateShiftScheduleDashboard();
            break;
        // ... other cases
    }
}

// ... other core functions
// (e.g., updateHomeStatistics, populateEmployeeSelect, updateDashboardData, etc.)

// --- DOMContentLoaded and Initial Setup ---
document.addEventListener('DOMContentLoaded', async () => {
    // Assign DOM elements to the DOM object
    // You'll need to define the `DOM` object here or import it
    window.DOM = {
        loginPage: document.getElementById('loginPage'),
        // ... other DOM elements
        navLinks: document.querySelectorAll('.main-nav a'),
    };

    initializeEventListeners();

    // Firebase Auth State Listener
    auth.onAuthStateChanged(async (user) => {
        // ... same logic as before ...
    });
});

function initializeEventListeners() {
    // Login/Logout
    DOM.loginForm.addEventListener('submit', async (e) => {
        // ...
    });
    DOM.logoutBtn.addEventListener('click', async () => {
        // ...
    });

    // Navigation
    DOM.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (loggedInUser) {
                const pageId = link.dataset.page + 'Page';
                showPage(pageId);
                window.location.hash = link.dataset.page;
            } else {
                alert("Please log in to access the application.");
            }
        });
    });

    // ... other event listeners from index.html that are not specific to leave or shifts ...
}
