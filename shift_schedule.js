// shift_schedule.js

import { db, activeAgents, usersData, showPage } from './main.js';

const staticShiftScheduleData = [
    { agent: "Aaliyah B", role: "Agent", secondaryRole: "Inbound / Email", period: "July - December", monday: "8am - 5pm", tuesday: "8am - 5pm", wednesday: "8am - 5pm", thursday: "8am - 5pm", friday: "8am - 5pm", saturday: "DO", sunday: "DO" },
    { agent: "Brenda K", role: "Agent", secondaryRole: "Social Media", period: "Jan - June", monday: "9am - 6pm", tuesday: "9am - 6pm", wednesday: "9am - 6pm", thursday: "9am - 6pm", friday: "9am - 6pm", saturday: "DO", sunday: "DO" },
    { agent: "Charles M", role: "Agent", secondaryRole: "LiveChat", period: "Annual", monday: "8:30am - 5:30pm", tuesday: "8:30am - 5:30pm", wednesday: "8:30am - 5:30pm", thursday: "8:30am - 5:30pm", friday: "8:30am - 5:30pm", saturday: "DO", sunday: "DO" },
    { agent: "Diana W", role: "Agent", secondaryRole: "Sales", period: "July - December", monday: "10am - 7pm", tuesday: "10am - 7pm", wednesday: "10am - 7pm", thursday: "10am - 7pm", friday: "10am - 7pm", saturday: "DO", sunday: "DO" },
    { agent: "Edward K", role: "Agent", secondaryRole: "Onboarding", period: "Jan - June", monday: "8am - 5pm", tuesday: "8am - 5pm", wednesday: "8am - 5pm", thursday: "8am - 5pm", friday: "8am - 5pm", saturday: "DO", sunday: "DO" },
    { agent: "Faith A", role: "Agent", secondaryRole: "Level 1 Escalations", period: "Annual", monday: "9:30am - 6:30pm", tuesday: "9:30am - 6:30pm", wednesday: "9:30am - 6:30pm", thursday: "9:30am - 6:30pm", friday: "9:30am - 6:30pm", saturday: "DO", sunday: "DO" },
];

export function initializeShiftSchedule() {
    if (window.DOM.exportSchedulePdfBtn) {
        window.DOM.exportSchedulePdfBtn.addEventListener('click', () => {
            alert("Export to PDF functionality is coming soon!");
        });
    }
}

export function renderShiftScheduleTable() {
    const tableBody = window.DOM.shiftScheduleTableBody;
    const tableHead = window.DOM.shiftScheduleTableHead;
    if (!tableBody || !tableHead) return;
    tableBody.innerHTML = '';
    tableHead.innerHTML = '';
    const headers = ["No.", "Agent Name", "Role", "Secondary Role", "Period", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const headerRow = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    tableHead.innerHTML = headerRow;
    staticShiftScheduleData.forEach((row, index) => {
        const newRow = document.createElement('tr');
        const rowData = [
            index + 1,
            row.agent,
            row.role,
            row.secondaryRole,
            row.period,
            row.monday,
            row.tuesday,
            row.wednesday,
            row.thursday,
            row.friday,
            row.saturday,
            row.sunday
        ];
        newRow.innerHTML = rowData.map((data, cellIndex) => {
            if (cellIndex > 4) {
                let shiftDetails = '';
                if (data.toUpperCase() === 'DO') {
                    shiftDetails = `<span>Day Off</span>`;
                } else {
                    const [start, end] = data.split(' - ');
                    shiftDetails = `<strong>${data}</strong>`;
                }
                return `<td class="shift-cell">${shiftDetails}</td>`;
            }
            return `<td>${data}</td>`;
        }).join('');
        tableBody.appendChild(newRow);
    });
}

export function updateShiftScheduleDashboard() {
    if (window.DOM.staticRosterTotalStaff && window.DOM.staticRosterTotalShifts) {
        window.DOM.staticRosterTotalStaff.textContent = staticShiftScheduleData.length;
        window.DOM.staticRosterTotalShifts.textContent = staticShiftScheduleData.length * 7;
    }
}
