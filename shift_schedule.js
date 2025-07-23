// shift_schedule.js

import { db, activeAgents, usersData, showPage } from './main.js';

// Predefined shift times and their corresponding break/lunch values from your image
const predefinedShifts = [
    { shift: "8:00 am - 4:30 pm", break: "8:50-9:05AM", lunch: "12:30-1:30PM" },
    { shift: "8:30am - 5:00pm", break: "9:50-10:05AM", lunch: "1:30-2:30PM" },
    { shift: "7:00 am - 3:30 pm", break: "8:20-8:35AM", lunch: "12:30-1:30PM" },
    { shift: "9:30 am - 6:00 pm", break: "10:45-11:45AM", lunch: "2:30-3:30PM" },
    { shift: "8:00 am - 4:30 pm - Inbound", break: "8:50-9:05AM", lunch: "1:30-2:30PM" }, // Added a new shift based on image
    { shift: "DO", break: "-", lunch: "-" } // Day Off option
];

// No need for a global shiftScheduleData array as we'll use activeAgents
// This module now focuses on rendering the interactive table based on activeAgents

export function initializeShiftSchedule() {
    // Event listeners are still useful, but now we'll handle the dynamic table rendering
    if (window.DOM.exportSchedulePdfBtn) {
        window.DOM.exportSchedulePdfBtn.addEventListener('click', () => {
            alert("Export to PDF functionality is coming soon!");
        });
    }

    // Call render table immediately when the page is initialized
    renderShiftScheduleTable();
    updateShiftScheduleDashboard();
}

/**
 * Renders the shift schedule table with dynamic dropdowns.
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

    if (activeAgents.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No active staff members to display.</td></tr>';
        return;
    }

    activeAgents.forEach((agentName, index) => {
        const userProfile = Object.values(usersData).find(user => user.fullName === agentName);
        if (!userProfile) return;

        const newRow = document.createElement('tr');
        newRow.dataset.agentName = agentName; // Store agent name for easy lookup

        // Create dropdown for Shift Time
        const shiftSelect = document.createElement('select');
        shiftSelect.classList.add('shift-time-select');
        predefinedShifts.forEach(shift => {
            const option = document.createElement('option');
            option.value = shift.shift;
            option.textContent = shift.shift;
            shiftSelect.appendChild(option);
        });

        // Create cells for break and lunch
        const breakCell = document.createElement('td');
        const lunchCell = document.createElement('td');
        breakCell.classList.add('break-cell');
        lunchCell.classList.add('lunch-cell');

        // Add event listener to the dropdown
        shiftSelect.addEventListener('change', (e) => {
            const selectedShift = e.target.value;
            const shiftDetails = predefinedShifts.find(s => s.shift === selectedShift);
            if (shiftDetails) {
                // Update the corresponding break and lunch cells
                breakCell.textContent = shiftDetails.break;
                lunchCell.textContent = shiftDetails.lunch;
            }
        });

        // Trigger change event to set initial values
        shiftSelect.value = predefinedShifts[0].shift; // Set a default value
        shiftSelect.dispatchEvent(new Event('change'));

        newRow.innerHTML = `
            <td>${index + 1}</td>
            <td>${userProfile.fullName}</td>
            <td>${userProfile.role}</td>
            <td>${userProfile.secondaryRole || 'N/A'}</td>
            <td></td>
            <td></td>
            <td></td>
        `;

        newRow.children[4].appendChild(shiftSelect);
        newRow.children[5].appendChild(breakCell);
        newRow.children[6].appendChild(lunchCell);

        tableBody.appendChild(newRow);
    });
}

/**
 * Updates the dashboard with shift-related statistics.
 */
export function updateShiftScheduleDashboard() {
    if (window.DOM.staticRosterTotalStaff) {
        window.DOM.staticRosterTotalStaff.textContent = activeAgents.length;
    }
    // Shift data is now dynamic, so total shifts calculation is not meaningful here.
    if (window.DOM.staticRosterTotalShifts) {
        window.DOM.staticRosterTotalShifts.textContent = 'N/A';
    }
}
