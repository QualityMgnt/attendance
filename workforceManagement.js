// workforceManagement.js

// --- Global Variables / Caches for Workforce Management ---
let shiftScheduleData = []; // This will hold the roster for the current month
const leavePlannerData = {}; // Local cache for leave records from Firestore ({ 'Month YYYY': [{...}, {...}] })
let currentShiftScheduleDate = new Date(); // Tracks the month/year for shift schedule
let currentLeaveTrackerDate = new Date(); // Tracks the month/year for leave tracker

// --- Constants and Utility Data ---
const SHIFT_DETAILS_MAP = [
    { shift: "8:00 am - 4:30 pm", break: "8:50-9:05AM", lunch: "12:30-1:30PM" },
    { shift: "8:30am - 5:00pm", break: "9:50 -10:05AM", lunch: "1:30 -2:30PM" },
    { shift: "7:00 am - 3:30 pm", break: "8:20 - 8:35AM", lunch: "12:30-1:-30PM" },
    { shift: "8:00 am - 4:30 pm - B", break: "8:50-9:05AM", lunch: "1:30-2:30PM" },
    { shift: "9:30 am - 6:00 pm", break: "10:45-11:45AM", lunch: "2:30-3:30PM" },
    { shift: "Day Off", break: "", lunch: "" },
    { shift: "Public Holiday", break: "", lunch: "" },
    { shift: "Leave", break: "", lunch: "" },
    { shift: "Sick Off", break: "", lunch: "" }
];

const ALL_SECONDARY_ROLES = ['Inbound', 'Inbound / Email', 'Social Media', 'LiveChat', 'Sales', 'Onboarding', 'Level 1 Escalations', 'Email', 'None'];

// --- Functions for Leave Tracker ---

/**
 * Fetches leave data for a specific month and year from Firestore.
 * @param {number} year
 * @param {number} month (0-indexed)
 * @returns {Promise<void>}
 */
async function fetchLeaveData(year, month) {
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

/**
 * Renders the leave planner table for the current month.
 */
function renderLeavePlannerTable() {
    DOM.leaveTrackerTableContainer.innerHTML = '';
    DOM.currentLeaveMonthYear.textContent = currentLeaveTrackerDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    if (activeAgents.length === 0) {
        DOM.leaveTrackerTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No active staff members to display in the leave tracker. Please add active staff via the Admin page.</p>';
        return;
    }

    // ... (unchanged table rendering logic for leave tracker)
}

/**
 * Updates the leave status for a specific agent on a specific date in Firestore.
 * Handles creation of new leave entries if none exist for the agent in that month.
 * @param {string} agentName - The full name of the agent.
 * @param {string} fullDateKey - The date in YYYY-MM-DD format.
 * @param {string} newStatus - The new status ('L' for pending, 'AP' for approved, 'D' for declined, etc.).
 */
async function updateLeaveStatus(agentName, fullDateKey, newStatus) {
    // ... (unchanged logic)
}

// --- Functions for Shift Schedule ---

/**
 * Fetches shift schedule data for a specific month and year from Firestore.
 * If no data exists, it initializes a basic structure for active agents.
 * @param {number} year
 * @param {number} month (0-indexed)
 * @returns {Promise<void>}
 */
async function fetchShiftScheduleData(year, month) {
    const monthYearDocId = `${year}-${(month + 1).toString().padStart(2, '0')}`;
    try {
        const docRef = db.collection('shiftRosters').doc(monthYearDocId);
        const doc = await docRef.get();

        if (doc.exists) {
            shiftScheduleData = doc.data().roster || [];
            console.log(`Shift roster for ${monthYearDocId} loaded from Firestore.`);
        } else {
            shiftScheduleData = activeAgents.map(agent => {
                return {
                    agentName: agent.fullName,
                    role: agent.role,
                    secondaryRole: agent.secondaryRole,
                    assignedMonthlyShift: { shiftTime: "", breakTime: "", lunchTime: "" }
                };
            });
            await docRef.set({ roster: shiftScheduleData });
            console.log(`Initialized and saved new shift roster for ${monthYearDocId} to Firestore.`);
        }
        renderShiftScheduleTable();
        updateShiftCountTable();
    } catch (error) {
        console.error("Error fetching/initializing shift schedule data:", error);
        alert("Critical: Could not load shift schedule data. Check console and Firebase rules.");
    }
}

/**
 * Saves the updated monthly shift data for a specific agent to Firestore.
 * @param {string} agentName - The full name of the agent.
 * @param {string} field - The field to update ('shiftTime', 'breakTime', 'lunchTime').
 * @param {string} value - The new value.
 */
async function updateAgentShiftData(agentName, field, value) {
    const monthYearDocId = `${currentShiftScheduleDate.getFullYear()}-${(currentShiftScheduleDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const docRef = db.collection('shiftRosters').doc(monthYearDocId);

    const agentEntryIndex = shiftScheduleData.findIndex(entry => entry.agentName === agentName);

    if (agentEntryIndex === -1) {
        console.error("Agent not found in current shift schedule data:", agentName);
        return;
    }

    const updatedAgentEntry = { ...shiftScheduleData[agentEntryIndex] };
    updatedAgentEntry.assignedMonthlyShift[field] = value;
    shiftScheduleData[agentEntryIndex] = updatedAgentEntry;

    try {
        await docRef.update({ roster: shiftScheduleData });
        console.log(`Monthly shift data for ${agentName} (${field}) updated successfully in Firestore.`);
        renderShiftScheduleTable();
        updateShiftCountTable();
    } catch (error) {
        console.error("Error updating agent monthly shift data in Firestore:", error);
        alert(`Failed to update shift for ${agentName}: ${error.message}`);
        await fetchShiftScheduleData(currentShiftScheduleDate.getFullYear(), currentShiftScheduleDate.getMonth());
    }
}

/**
 * Renders the shift schedule table for the currently selected month.
 * Now displays a single monthly shift per agent.
 */
async function renderShiftScheduleTable() {
    // ... (unchanged table rendering logic for shift schedule)
}

/**
 * Updates the metrics in the Shift Schedule Dashboard section
 * (now primarily focusing on counts from the current month's roster).
 */
function updateShiftCountTable() {
    // ... (unchanged table rendering logic for shift counts)
}

/**
 * Initializes all event listeners for the workforce management pages.
 */
function initializeWorkforceEventListeners() {
    // Leave Tracker
    DOM.prevMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() - 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });
    DOM.nextMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() + 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });

    // Shift Schedule Page - Monthly Navigation and Filters
    DOM.prevMonthShiftScheduleBtn.addEventListener('click', () => {
        currentShiftScheduleDate.setMonth(currentShiftScheduleDate.getMonth() - 1);
        fetchShiftScheduleData(currentShiftScheduleDate.getFullYear(), currentShiftScheduleDate.getMonth());
    });
    DOM.nextMonthShiftScheduleBtn.addEventListener('click', () => {
        currentShiftScheduleDate.setMonth(currentShiftScheduleDate.getMonth() + 1);
        fetchShiftScheduleData(currentShiftScheduleDate.getFullYear(), currentShiftScheduleDate.getMonth());
    });
    DOM.scheduleRoleFilter.addEventListener('change', () => {
        fetchShiftScheduleData(currentShiftScheduleDate.getFullYear(), currentShiftScheduleDate.getMonth());
    });
}
