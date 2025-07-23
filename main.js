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
export let loggedInUser = null;
export let loggedInUserRole = 'Agent';
export let usersData = {};
export const attendanceData = {};
export const markedDates = new Set();
export let activeAgents = [];
export let currentLeaveTrackerDate = new Date();
export const todayGlobal = new Date();
export let selectedMarkingDate = null;

// Helper to format date for Firestore document IDs
export const formatDate = (date) => date.toISOString().split('T')[0];

// --- Import functions from other modules ---
import { initializeLeaveTracker, fetchLeaveData, updateLeaveStatus, renderLeavePlannerTable } from './leave_tracker.js';
import { initializeShiftSchedule, renderShiftScheduleTable, updateShiftScheduleDashboard } from './shift_schedule.js';

// --- Core Helper Functions ---
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

export function updateDashboardData() {
    // Placeholder function, assuming implementation exists.
    console.log("Updating dashboard data...");
}

export function setLoggedInState(isLoggedIn) {
    if (isLoggedIn) {
        window.DOM.loginPage.style.display = 'none';
        window.DOM.appContainer.style.display = 'flex';
    } else {
        window.DOM.loginPage.style.display = 'flex';
        window.DOM.appContainer.style.display = 'none';
    }
}

export function showPage(pageId) {
    document.querySelectorAll('.content-module').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    window.DOM.navLinks.forEach(link => {
        if (link.dataset.page + 'Page' === pageId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    switch (pageId) {
        case 'homePage':
            updateHomeStatistics();
            break;
        case 'attendancePage':
            generateAttendanceOverviewTable();
            window.DOM.attendanceDateInput.value = '';
            window.DOM.openAttendanceCalendarBtn.disabled = false;
            selectedMarkingDate = null;
            break;
        case 'leaveTrackerPage':
            fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
            break;
        case 'shiftSchedulePage':
            renderShiftScheduleTable();
            updateShiftScheduleDashboard();
            break;
        case 'individualSummaryPage':
            populateIndividualSummarySelect();
            break;
        case 'dashboardPage':
            updateDashboardData();
            break;
        case 'reportsPage':
            // ... reports logic ...
            break;
        case 'adminPage':
            renderStaffListTable();
            break;
    }
}

// ... other core functions that need to be globally accessible
export function updateHomeStatistics() {
    // Placeholder function, assuming implementation exists.
    console.log("Updating home page statistics...");
}

export function populateIndividualSummarySelect() {
    // Placeholder function, assuming implementation exists.
    console.log("Populating individual summary select dropdown...");
}

export function renderStaffListTable() {
    // Placeholder function, assuming implementation exists.
    console.log("Rendering staff list table...");
}

export function generateAttendanceOverviewTable() {
    // Placeholder function, assuming implementation exists.
    console.log("Generating attendance overview table...");
}


// --- DOMContentLoaded and Initial Setup ---
document.addEventListener('DOMContentLoaded', async () => {
    // Assign DOM elements to the DOM object
    window.DOM = {
        // ... (all your DOM element assignments) ...
        loginPage: document.getElementById('loginPage'),
        loginForm: document.getElementById('loginForm'),
        loginEmail: document.getElementById('loginEmail'),
        loginPassword: document.getElementById('loginPassword'),
        loginError: document.getElementById('loginError'),
        appContainer: document.getElementById('appContainer'),
        loggedInUserName: document.getElementById('loggedInUserName'),
        loggedInUserRole: document.getElementById('loggedInUserRole'),
        logoutBtn: document.getElementById('logoutBtn'),
        navLinks: document.querySelectorAll('.main-nav a'),
        adminNavLink: document.getElementById('adminNavLink'),
        homePage: document.getElementById('homePage'),
        statTotalPresent: document.getElementById('statTotalPresent'),
        statTotalStaff: document.getElementById('statTotalStaff'),
        statAgentsOnLeaveWeek: document.getElementById('statAgentsOnLeaveWeek'),
        statAgentsOnSickOffWeek: document.getElementById('statAgentsOnSickOffWeek'),
        staffOnLeaveNames: document.getElementById('staffOnLeaveNames'),
        agentsOnSickOffNames: document.getElementById('agentsOnSickOffNames'),
        attendancePage: document.getElementById('attendancePage'),
        openAttendanceCalendarBtn: document.getElementById('openAttendanceCalendarBtn'),
        attendanceDateInput: document.getElementById('attendanceDateInput'),
        attendanceMarkingMessage: document.getElementById('attendanceMarkingMessage'),
        deleteAttendanceDataBtn: document.getElementById('deleteAttendanceDataBtn'),
        exportAttendanceDataBtn: document.getElementById('exportAttendanceDataBtn'),
        attendanceOverviewTableContainer: document.getElementById('attendanceOverviewTableContainer'),
        leaveTrackerPage: document.getElementById('leaveTrackerPage'),
        prevMonthLeaveBtn: document.getElementById('prevMonthLeaveBtn'),
        nextMonthLeaveBtn: document.getElementById('nextMonthLeaveBtn'),
        currentLeaveMonthYear: document.getElementById('currentLeaveMonthYear'),
        leaveTrackerTableContainer: document.getElementById('leaveTrackerTableContainer'),
        shiftSchedulePage: document.getElementById('shiftSchedulePage'),
        exportSchedulePdfBtn: document.getElementById('exportSchedulePdfBtn'),
        shiftScheduleTableHead: document.getElementById('shiftScheduleTableHead'),
        shiftScheduleTableBody: document.getElementById('shiftScheduleTableBody'),
        staticRosterTotalStaff: document.getElementById('staticRosterTotalStaff'),
        staticRosterTotalShifts: document.getElementById('staticRosterTotalShifts'),
        individualSummaryPage: document.getElementById('individualSummaryPage'),
        individualSelectSummary: document.getElementById('individualSelectSummary'),
        summaryWFO: document.getElementById('summaryWFO'),
        summaryWFH: document.getElementById('summaryWFH'),
        summaryLeave: document.getElementById('summaryLeave'),
        summarySickOff: document.getElementById('summarySickOff'),
        summarySignedOff: document.getElementById('summarySignedOff'),
        summaryDayOff: document.getElementById('summaryDayOff'),
        summaryUnpaidLeave: document.getElementById('summaryUnpaidLeave'),
        summaryNCNS: document.getElementById('summaryNCNS'),
        summaryCompassionateLeave: document.getElementById('summaryCompassionateLeave'),
        monthlyWFHWFOChart: document.getElementById('monthlyWFHWFOChart'),
        dashboardPage: document.getElementById('dashboardPage'),
        dashboardStartDate: document.getElementById('dashboardStartDate'),
        employeeSelect: document.getElementById('employeeSelect'),
        dashboardTotalEmployees: document.getElementById('dashboardTotalEmployees'),
        dashboardAbsenceDays: document.getElementById('dashboardAbsenceDays'),
        dashboardUnapprovedLeave: document.getElementById('dashboardUnapprovedLeave'),
        attendanceStatsChart: document.getElementById('attendanceStatsChart'),
        overallAttendanceGaugeFill: document.getElementById('overallAttendanceGaugeFill'),
        overallAttendanceGaugeLabel: document.getElementById('overallAttendanceGaugeLabel'),
        leaveTakenSick: document.getElementById('leaveTakenSick'),
        leaveTakenCasual: document.getElementById('leaveTakenCasual'),
        leaveTakenAnnual: document.getElementById('leaveTakenAnnual'),
        leaveTakenUnpaid: document.getElementById('leaveTakenUnpaid'),
        workingLocationDonutChart: document.getElementById('workingLocationDonutChart'),
        workingLocationDonutLabel: document.getElementById('workingLocationDonutLabel'),
        topEmployeesChart: document.getElementById('topEmployeesChart'),
        reportsPage: document.getElementById('reportsPage'),
        reportType: document.getElementById('reportType'),
        startDate: document.getElementById('startDate'),
        endDate: document.getElementById('endDate'),
        generateReportBtn: document.getElementById('generateReportBtn'),
        exportReportCsvBtn: document.getElementById('exportReportCsvBtn'),
        reportsTableBody: document.getElementById('reportsTableBody'),
        adminPage: document.getElementById('adminPage'),
        addMemberForm: document.getElementById('addMemberForm'),
        fullName: document.getElementById('fullName'),
        newEmail: document.getElementById('newEmail'),
        newPassword: document.getElementById('newPassword'),
        memberRole: document.getElementById('memberRole'),
        addMemberMessage: document.getElementById('addMemberMessage'),
        staffListTableBody: document.getElementById('staffListTableBody'),
        attendanceMarkingModal: document.getElementById('attendanceMarkingModal'),
        closeAttendanceModal: document.getElementById('closeAttendanceModal'),
        modalDateDisplay: document.getElementById('modalDateDisplay'),
        modalAttendanceTableBody: document.getElementById('modalAttendanceTableBody'),
        saveAttendanceBtn: document.getElementById('saveAttendanceBtn'),
        cancelAttendanceBtn: document.getElementById('cancelAttendanceBtn'),
        modalErrorMessage: document.getElementById('modalErrorMessage'),
        calendarModal: document.getElementById('calendarModal'),
        closeCalendarModal: document.getElementById('closeCalendarModal'),
        prevMonthBtn: document.getElementById('prevMonthBtn'),
        nextMonthBtn: document.getElementById('nextMonthBtn'),
        currentMonthYear: document.getElementById('currentMonthYear'),
        calendarDaysGrid: document.getElementById('calendarDaysGrid'),
        selectDateFromCalendarBtn: document.getElementById('selectDateFromCalendarBtn'),
        cancelCalendarSelection: document.getElementById('cancelCalendarSelection')
    };
    initializeEventListeners();

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("User is logged in:", user.email);
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                loggedInUser = userData.email;
                loggedInUserRole = userData.role;
                window.DOM.loggedInUserName.textContent = userData.fullName;
                window.DOM.loggedInUserRole.textContent = userData.role;

                if (userData.role === 'Admin' || userData.role === 'Team Leader') {
                    window.DOM.adminNavLink.style.display = 'list-item';
                } else {
                    window.DOM.adminNavLink.style.display = 'none';
                }
                
                // Fetch ALL user data ONLY for roles with permission.
                if (loggedInUserRole === 'Admin' || loggedInUserRole === 'Team Leader' || loggedInUserRole === 'Supervisor') {
                    await fetchAllUsersData();
                } else {
                    // For Agent role, just store their own data.
                    usersData[loggedInUser] = {
                        uid: userDoc.id,
                        fullName: userData.fullName,
                        role: userData.role,
                        isActive: userData.isActive,
                        email: userData.email,
                        openingLeaveBalance: userData.openingLeaveBalance || 20,
                        secondaryRole: userData.secondaryRole || '',
                        period: userData.period || ''
                    };
                    updateActiveAgentsList();
                }

                await fetchAttendanceData();
                setLoggedInState(true);
                showPage('homePage');
            } else {
                console.error("User document not found for:", user.uid);
                auth.signOut();
            }
        } else {
            console.log("No user is logged in.");
            setLoggedInState(false);
            window.DOM.loginError.textContent = '';
            window.DOM.loginForm.reset();
        }
    });
});

function initializeEventListeners() {
    window.DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await auth.signInWithEmailAndPassword(window.DOM.loginEmail.value, window.DOM.loginPassword.value);
            window.DOM.loginError.textContent = '';
        } catch (error) {
            console.error("Login failed:", error.code, error.message);
            window.DOM.loginError.textContent = 'Invalid email or password.';
        }
    });
    window.DOM.logoutBtn.addEventListener('click', async () => {
        await auth.signOut();
    });

    window.DOM.navLinks.forEach(link => {
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

    // Leave Tracker event listeners (initialization moved here)
    window.DOM.prevMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() - 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });
    window.DOM.nextMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() + 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });
}
