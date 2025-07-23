// shift_schedule.js

// Import necessary global variables and functions
import { db, activeAgents, usersData, showPage } from './main.js';

let currentShiftScheduleDate = new Date(); // To track the month/year for the schedule
let shiftScheduleData = [];

export function initializeShiftSchedule() {
    // Add event listeners for month navigation
    if (window.DOM.prevShiftMonthBtn) {
        window.DOM.prevShiftMonthBtn.addEventListener('click', () => {
            currentShiftScheduleDate.setMonth(currentShiftScheduleDate.getMonth() - 1);
            fetchShiftScheduleData(currentShiftScheduleDate);
        });
    }
    if (window.DOM.nextShiftMonthBtn) {
        window.DOM.nextShiftMonthBtn.addEventListener('click', () => {
            currentShiftScheduleDate.setMonth(currentShiftScheduleDate.getMonth() + 1);
            fetchShiftScheduleData(currentShiftScheduleDate);
        });
    }

    if (window.DOM.exportSchedulePdfBtn) {
        window.DOM.exportSchedulePdfBtn.addEventListener('click', () => {
            alert("Export to PDF functionality is coming soon!");
        });
    }

    // Call fetch data for the current month when the page is loaded.
    fetchShiftScheduleData(currentShiftScheduleDate);
}

/**
 * Fetches shift schedule data for a given month and year from Firestore.
 * @param {Date} date - The date to determine the month and year.
 */
export async function fetchShiftScheduleData(date) {
    const monthYearKey = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    window.DOM.currentShiftMonthYear.textContent = monthYearKey;

    try {
        const docRef = db.collection('shift_schedules').doc(monthYearKey);
        const doc = await docRef.get();

        if (doc.exists) {
            shiftScheduleData = doc.data().roster || [];
            console.log(`Shift schedule for ${monthYearKey} loaded from Firestore.`);
        } else {
            // If no data exists, generate a dummy schedule based on active agents.
            shiftScheduleData = generateDummySchedule(activeAgents, usersData);
            console.log(`No shift schedule found for ${monthYearKey}, generating dummy data.`);
            // You might want to save this dummy data to Firestore in a real application.
            // await docRef.set({ roster: shiftScheduleData });
        }
        renderShiftScheduleTable();
        updateShiftScheduleDashboard();
    } catch (error) {
        console.error("Error fetching shift schedule data:", error);
        alert("Critical: Could not load shift schedule data. Check console and Firebase rules.");
    }
}

/**
 * Generates a dummy shift schedule based on the active agents list.
 * In a real application, this would be replaced with a proper schedule generation tool.
 * @param {Array<string>} agents - List of agent full names.
 * @param {object} usersData - The global users data cache.
 * @returns {Array<object>} - The generated schedule data.
 */
function generateDummySchedule(agents, usersData) {
    const dummyShifts = [
        { shift: "8:00am - 4:30pm", break: "8:50-9:05AM", lunch: "12:30-1:30PM" },
        { shift: "9:00am - 6:00pm", break: "9:50-10:05AM", lunch: "1:30-2:30PM" },
        { shift: "8:30am - 5:30pm", break: "9:50-10:05AM", lunch: "1:30-2:30PM" },
        { shift: "7:00am - 3:30pm", break: "8:20-8:35AM", lunch: "12:30-1:30PM" },
        { shift: "9:30am - 6:00pm", break: "10:45-11:45AM", lunch: "2:30-3:30PM" },
    ];

    return agents.map((agentName, index) => {
        const userProfile = Object.values(usersData).find(user => user.fullName === agentName);
        const shift = dummyShifts[index % dummyShifts.length];

        return {
            name: userProfile.fullName,
            role: userProfile.role,
            secondaryRole: userProfile.secondaryRole || 'Unassigned',
            shiftTime: shift.shift,
            break: shift.break,
            lunch: shift.lunch,
        };
    });
}

/**
 * Renders the shift schedule table using the fetched data.
 */
export function renderShiftScheduleTable() {
    const tableBody = window.DOM.shiftScheduleTableBody;
    const tableHead = window.DOM.shiftScheduleTableHead;

    if (!tableBody || !tableHead) return;

    tableBody.innerHTML = '';
    tableHead.innerHTML = '';

    const headers = ["No.", "Name", "Role", "Secondary Role", "Shift Time", "Break", "Lunch"];
    const headerRow = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    tableHead.innerHTML = headerRow;

    if (shiftScheduleData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No shift schedule data available.</td></tr>';
        return;
    }

    shiftScheduleData.forEach((row, index) => {
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>${index + 1}</td>
            <td>${row.name}</td>
            <td>${row.role}</td>
            <td>${row.secondaryRole}</td>
            <td>${row.shiftTime}</td>
            <td>${row.break}</td>
            <td>${row.lunch}</td>
        `;
        tableBody.appendChild(newRow);
    });
}

/**
 * Updates the dashboard with shift-related statistics.
 */
export function updateShiftScheduleDashboard() {
    if (window.DOM.staticRosterTotalStaff && window.DOM.staticRosterTotalShifts) {
        window.DOM.staticRosterTotalStaff.textContent = shiftScheduleData.length;
        // Assuming 5 working days for a simple example
        window.DOM.staticRosterTotalShifts.textContent = shiftScheduleData.length * 5;
    }
}
