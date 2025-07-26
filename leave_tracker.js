// leave_tracker.js

import {
    db, // Still imported for other potential uses, but not for leave data directly
    activeAgents,
    usersData,
    loggedInUserRole,
    todayGlobal,
    showPage,
    fetchAttendanceData, // Not used directly in this version, but kept for consistency
    fetchAllUsersData, // Not used directly in this version, but kept for consistency
    updateHomeStatistics, // Not used directly in this version, but kept for consistency
    updateDashboardData, // Not used directly in this version, but kept for consistency
    currentLeaveTrackerDate,
    formatDate, // Not used directly in this version, but kept for consistency
    markedDates, // Not used directly in this version, but kept for consistency
    attendanceData // Not used directly in this version, but kept for consistency
} from './main.js';

// --- Google Sheets Configuration ---
const GOOGLE_SHEET_ID = '1JeegsczWoerBT4VggHY7Kcb-F13wsdnh_iZfQX0sh5Y'; // Your spreadsheet ID
// IMPORTANT: This is your actual Google API key.
// Ensure Google Sheets API is enabled in your Google Cloud Console for this key.
const GOOGLE_API_KEY = 'AIzaSyA7OCKMGchDQPCbwEkAZS-cU-aii_s8oWI'; // <<< YOUR API KEY IS HERE

// Define ATTENDANCE_STATUSES directly in this module for robustness
// This avoids potential ReferenceError if main.js is not fully loaded/exported yet
const ATTENDANCE_STATUSES = [
    { value: '', text: 'Select Status', colorClass: '' },
    { value: 'WFO', text: 'Work From Office', colorClass: 'status-WFO' },
    { value: 'WFH', text: 'Work From Home', colorClass: 'status-WFH' },
    { value: 'SO', text: 'Signed Off', colorClass: 'status-SO' },
    { value: 'L', text: 'Leave (Annual)', colorClass: 'status-L' },
    { value: 'DO', text: 'Day Off', colorClass: 'status-DO' },
    { value: 'UL', text: 'Unpaid Leave', colorClass: 'status-UL' },
    { value: 'NCNS', text: 'No Call No Show', colorClass: 'status-NCNS' },
    { value: 'CL', text: 'Compassionate Leave', colorClass: 'status-CL' },
    { value: 'SOF', text: 'Sick Off', colorClass: 'status-SOF' }
];


// Cache for leave planner data fetched from Google Sheets
let leavePlannerData = {};

/**
 * Initializes the leave tracker module.
 * @param {Date} initialDate - The initial date to display the leave tracker for.
 */
export function initializeLeaveTracker(initialDate) {
    currentLeaveTrackerDate = initialDate;
    // Initial fetch and render when the page is first loaded or navigated to
    fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
}

/**
 * Fetches leave data for a specific month from Google Sheets.
 * @param {number} year - The year to fetch data for.
 * @param {number} month - The month (0-indexed) to fetch data for.
 */
export async function fetchLeaveData(year, month) {
    const dateForMonth = new Date(year, month);
    const monthName = dateForMonth.toLocaleString('en-US', { month: 'long' }); // e.g., "January"
    const monthYearKey = `${monthName} ${year}`; // e.g., "January 2024"

    window.DOM.currentLeaveMonthYear.textContent = monthYearKey; // Update UI display

    // Check if data is already in cache
    if (leavePlannerData[monthYearKey]) {
        console.log(`Leave data for ${monthYearKey} found in cache.`);
        renderLeavePlannerTable();
        return;
    }

    try {
        const sheetName = monthName; // Sheet name is the full month name
        const range = 'A:AZ'; // Assuming data is within this range, adjust if needed

        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${sheetName}!${range}?key=${GOOGLE_API_KEY}`;

        console.log(`Fetching leave data for ${sheetName} from Google Sheets...`);
        const response = await fetch(apiUrl);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Sheets API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const values = data.values;

        if (!values || values.length === 0) {
            leavePlannerData[monthYearKey] = [];
            console.log(`No data found for sheet: ${sheetName}.`);
            renderLeavePlannerTable();
            return;
        }

        // Parse the data into an array of objects
        const headers = values[0];
        const parsedData = values.slice(1).map(row => {
            const rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = row[index] || ''; // Use empty string for missing values
            });
            return rowObject;
        });

        leavePlannerData[monthYearKey] = parsedData;
        console.log(`Leave data for ${monthYearKey} loaded from Google Sheets.`);
        renderLeavePlannerTable();

    } catch (error) {
        console.error("Error fetching leave data from Google Sheets:", error);
        alert(`Critical: Could not load leave data from Google Sheets. Please check your API key, sheet permissions, and console for details: ${error.message}`);
        leavePlannerData[monthYearKey] = []; // Clear data on error
        renderLeavePlannerTable(); // Render empty table
    }
}

/**
 * Renders the leave planner table based on fetched data.
 */
export function renderLeavePlannerTable() {
    console.log("Rendering leave planner table...");
    window.DOM.leaveTrackerTableContainer.innerHTML = '';

    const monthYearKey = currentLeaveTrackerDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const currentMonthLeaveData = leavePlannerData[monthYearKey] || [];

    if (activeAgents.length === 0) {
        window.DOM.leaveTrackerTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No active staff members to display in the leave tracker. Please add active staff via the Admin page.</p>';
        return;
    }

    const table = document.createElement('table');
    table.classList.add('leave-planner-table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const tfoot = document.createElement('tfoot');

    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>No.</th><th>Name</th><th>Opening Balance</th><th>Leave Balance</th>';

    const numDaysInMonth = new Date(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth() + 1, 0).getDate();
    const monthlyDateKeys = []; // Stores YYYY-MM-DD format for each day in the month

    for (let i = 1; i <= numDaysInMonth; i++) {
        const date = new Date(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth(), i);
        const dayOfMonth = date.getDate().toString();
        const dayOfWeek = date.toLocaleString('en-US', { weekday: 'short' }).substring(0, 1);
        const fullDateKey = `${currentLeaveTrackerDate.getFullYear()}-${(currentLeaveTrackerDate.getMonth() + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        monthlyDateKeys.push(fullDateKey);

        const th = document.createElement('th');
        th.innerHTML = `${dayOfMonth}<br>${dayOfWeek}`;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const totalMonthlyLeave = Array(numDaysInMonth).fill(0);
    let hasDataForTable = false; // Flag to check if any relevant data exists for the current month

    activeAgents.forEach((agentName, index) => {
        const tr = document.createElement('tr');
        const agentLeaveData = currentMonthLeaveData.find(row => row.Name === agentName);
        const userProfile = usersData[agentName]; // Access userProfile directly by fullName

        const openingBalance = (userProfile && userProfile.openingLeaveBalance !== undefined) ? userProfile.openingLeaveBalance : 20;

        let approvedAnnualLeavesInMonth = 0;
        if (agentLeaveData) {
            for (let i = 1; i <= numDaysInMonth; i++) {
                const dayKey = i.toString(); // Google Sheet headers might be just '1', '2', etc.
                if (agentLeaveData[dayKey] === 'AP') {
                    approvedAnnualLeavesInMonth++;
                }
            }
        }
        const leaveBalance = Math.max(0, openingBalance - approvedAnnualLeavesInMonth);

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${agentName}</td>
            <td>${openingBalance}</td>
            <td class="current-leave-balance" data-agent="${agentName}">${leaveBalance}</td>
        `;

        monthlyDateKeys.forEach((fullDateKey, dayIndex) => {
            const dateObj = new Date(fullDateKey);
            const dayOnly = dateObj.getDate().toString(); // Use day as string for Google Sheet column lookup
            let cellStatus = agentLeaveData ? agentLeaveData[dayOnly] : ''; // Get status from Google Sheet data

            const td = document.createElement('td');
            td.textContent = cellStatus; // Display the status from Google Sheet

            td.dataset.date = fullDateKey;
            td.dataset.agent = agentName;

            // Apply styling based on status
            if (cellStatus === 'L') {
                td.classList.add('pending-leave');
                td.title = "Pending Annual Leave Request";
                hasDataForTable = true; // Mark that there's data

                // Add approval overlay if user has permission
                if (loggedInUserRole === 'Admin' || loggedInUserRole === 'Supervisor') {
                    td.innerHTML = `<span style="display:none;" class="leave-approval-overlay">
                        <button class="approve-btn" data-agent="${agentName}" data-date="${fullDateKey}" data-status="Approved">Approve</button>
                        <button class="decline-btn" data-agent="${agentName}" data-date="${fullDateKey}" data-status="Declined">Decline</button>
                    </span>L`; // Keep 'L' visible
                    td.addEventListener('click', (event) => {
                        // Hide other overlays
                        document.querySelectorAll('.leave-approval-overlay').forEach(overlay => {
                            if (overlay !== event.currentTarget.querySelector('.leave-approval-overlay')) {
                                overlay.style.display = 'none';
                            }
                        });
                        const overlay = event.currentTarget.querySelector('.leave-approval-overlay');
                        if (overlay) {
                            overlay.style.display = (overlay.style.display === 'flex') ? 'none' : 'flex';
                            event.stopPropagation(); // Prevent event from bubbling up to document click
                        }
                    });
                }
            } else if (cellStatus === 'AP') {
                td.classList.add('approved-leave');
                td.title = "Approved Annual Leave";
                hasDataForTable = true;
            } else if (cellStatus === 'D') {
                td.classList.add('declined-leave');
                td.title = "Declined Annual Leave";
                hasDataForTable = true;
            } else {
                // Apply general attendance status colors if it's not a leave status
                const statusObj = ATTENDANCE_STATUSES.find(s => s.value === cellStatus);
                if (statusObj && statusObj.colorClass) {
                    td.classList.add(statusObj.colorClass);
                    td.title = statusObj.text;
                    hasDataForTable = true;
                }
                // Allow agents/QAs/Supervisors/Team Leaders to request leave by clicking empty cells
                if (!cellStatus && (loggedInUserRole === 'Agent' || loggedInUserRole === 'QA' || loggedInUserRole === 'Supervisor' || loggedInUserRole === 'Team Leader')) {
                    td.addEventListener('click', async (event) => {
                        // This will only update the local UI and show an alert, NOT Google Sheets
                        alert("Leave requests are currently read-only from Google Sheets. Please contact your administrator to update leave statuses.");
                        // Optionally, you could still update local UI for immediate feedback, but it won't persist
                        // event.target.textContent = 'L';
                        // event.target.classList.add('pending-leave');
                    });
                }
            }

            // Increment total monthly leave for 'L' or 'AP' statuses
            if (cellStatus === 'L' || cellStatus === 'AP') {
                totalMonthlyLeave[dayIndex]++;
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Footer row for total leaves
    const tfootRow = document.createElement('tr');
    tfootRow.innerHTML = `<td colspan="4" style="text-align: right;">Total Leaves (Annual/Pending):</td>`;
    totalMonthlyLeave.forEach(count => {
        const td = document.createElement('td');
        td.textContent = count > 0 ? count : '';
        tfootRow.appendChild(td);
    });
    tfoot.appendChild(tfootRow);
    table.appendChild(tfoot);

    // Display appropriate message or table
    if (activeAgents.length > 0 && !hasDataForTable && currentMonthLeaveData.length === 0) {
        window.DOM.leaveTrackerTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No leave data found for this month in the Google Sheet. Please ensure the sheet exists and contains data.</p>';
    } else if (activeAgents.length > 0) {
        window.DOM.leaveTrackerTableContainer.appendChild(table);
    }

    // Add event listeners for the approve/decline buttons (these will now show an alert)
    document.querySelectorAll('.leave-approval-overlay button').forEach(button => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevent bubbling to the cell click listener
            const agent = event.target.dataset.agent;
            const date = event.target.dataset.date;
            const status = event.target.dataset.status; // 'Approved' or 'Declined'
            alert(`Leave status changes are currently read-only from Google Sheets. Cannot ${status} leave for ${agent} on ${date}. Please contact your administrator to update leave statuses directly in the Google Sheet.`);
            // You might want to visually hide the overlay after the alert
            event.target.closest('.leave-approval-overlay').style.display = 'none';
        });
    });

    // Close overlay if clicking anywhere else on the document
    document.addEventListener('click', (event) => {
        document.querySelectorAll('.leave-approval-overlay').forEach(overlay => {
            if (!overlay.contains(event.target)) { // If click is outside the overlay
                overlay.style.display = 'none';
            }
        });
    });
}

/**
 * IMPORTANT: This function is now read-only. It will NOT write back to Google Sheets.
 * It will only show an alert indicating that direct updates are not supported from the client.
 * For writing back to Google Sheets, a backend server or OAuth 2.0 client-side flow is required.
 */
export async function updateLeaveStatus(agentName, fullDateKey, newStatus) {
    alert(`Leave status updates are currently read-only from Google Sheets. Cannot update leave for ${agentName} on ${fullDateKey} to ${newStatus}. Please contact your administrator to update leave statuses directly in the Google Sheet.`);
    console.warn(`Attempted to update leave status for ${agentName} on ${fullDateKey} to ${newStatus}. This functionality is read-only when using Google Sheets directly from the client.`);

    // Optionally, you could update the local cache and re-render for immediate visual feedback,
    // but this change would not persist across page loads or for other users.
    // For now, we'll just alert.
}
