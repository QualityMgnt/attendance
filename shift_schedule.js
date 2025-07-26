// shift_schedule.js

// Import necessary variables from main.js
// Ensure main.js exports db, activeAgents, usersData, and showPage
import { db, activeAgents, usersData, showPage } from './main.js';

// Predefined shift times and their corresponding break/lunch values
const predefinedShifts = [
    { shift: "8:00 am - 4:30 pm", break: "8:50-9:05AM", lunch: "12:30-1:30PM" },
    { shift: "8:30am - 5:00pm", break: "9:50-10:05AM", lunch: "1:30-2:30PM" },
    { shift: "7:00 am - 3:30 pm", break: "8:20-8:35AM", lunch: "12:30-1:30PM" },
    { shift: "9:30 am - 6:00 pm", break: "10:45-11:45AM", lunch: "2:30-3:30PM" },
    { shift: "8:00 am - 4:30 pm - Inbound", break: "8:50-9:05AM", lunch: "1:30-2:30PM" },
    { shift: "DO", break: "-", lunch: "-" } // Day Off option
];

// Predefined roles for dropdowns
const predefinedRoles = [
    "Inbound/Email",
    "Level 1 Escalations",
    "Live chat /Social media/SMS/Inbound",
    "Sales",
    "Email",
    "LiveChat",
    "Onboarding",
    "N/A" // Option for no secondary role
];

// Global variable for the current month being viewed in the schedule
let currentScheduleMonth = new Date();

/**
 * Initializes the shift schedule module.
 * Sets up event listeners and renders the initial table.
 */
export function initializeShiftSchedule() {
    // Ensure DOM elements are available before adding listeners
    if (window.DOM.exportSchedulePdfBtn) {
        window.DOM.exportSchedulePdfBtn.addEventListener('click', exportScheduleToPdf);
    }
    if (window.DOM.prevMonthScheduleBtn) {
        window.DOM.prevMonthScheduleBtn.addEventListener('click', () => changeScheduleMonth(-1));
    }
    if (window.DOM.nextMonthScheduleBtn) {
        window.DOM.nextMonthScheduleBtn.addEventListener('click', () => changeScheduleMonth(1));
    }

    // Call render table immediately when the page is initialized
    renderShiftScheduleTable();
    updateShiftScheduleDashboard();
    updateCurrentScheduleMonthDisplay(); // Update month display on init
}

/**
 * Changes the month displayed in the shift schedule.
 * @param {number} direction - -1 for previous month, 1 for next month.
 */
async function changeScheduleMonth(direction) {
    currentScheduleMonth.setMonth(currentScheduleMonth.getMonth() + direction);
    updateCurrentScheduleMonthDisplay();
    await fetchMonthlyScheduleData(currentScheduleMonth); // Fetch new month's data
    renderShiftScheduleTable(); // Re-render table with new data
    renderSummaryTable(); // Re-render summary table
}

/**
 * Updates the display for the current month in the shift schedule.
 */
function updateCurrentScheduleMonthDisplay() {
    if (window.DOM.currentScheduleMonthYear) {
        window.DOM.currentScheduleMonthYear.textContent = currentScheduleMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
}

// Cache for monthly schedule data fetched from Firestore
let monthlySchedulesCache = {};

/**
 * Fetches the schedule data for a specific month from Firestore.
 * @param {Date} monthDate - A Date object representing the month to fetch.
 * @returns {Promise<Object>} A promise that resolves to the schedule data for the month.
 */
async function fetchMonthlyScheduleData(monthDate) {
    const year = monthDate.getFullYear();
    const month = (monthDate.getMonth() + 1).toString().padStart(2, '0');
    const monthYearKey = `${year}-${month}`;

    // If data is already in cache, return it
    if (monthlySchedulesCache[monthYearKey]) {
        return monthlySchedulesCache[monthYearKey];
    }

    try {
        // Assuming appId is available globally or passed from main.js
        const appId = db.app.options.projectId; // Get projectId as appId from Firebase app instance
        const scheduleDocRef = db.collection(`artifacts/${appId}/public/data/monthlySchedules`).doc(monthYearKey);
        const docSnap = await scheduleDocRef.get();

        if (docSnap.exists) {
            monthlySchedulesCache[monthYearKey] = docSnap.data();
            console.log(`Schedule for ${monthYearKey} fetched from Firestore.`);
            return monthlySchedulesCache[monthYearKey];
        } else {
            monthlySchedulesCache[monthYearKey] = {}; // No schedule for this month yet
            console.log(`No schedule found for ${monthYearKey}.`);
            return {};
        }
    } catch (error) {
        console.error(`Error fetching schedule for ${monthYearKey}:`, error);
        return {};
    }
}

/**
 * Saves an agent's schedule details to Firestore for the current month.
 * @param {string} agentName - The full name of the agent.
 * @param {string} field - The field to update ('shift', 'role', 'secondaryRole').
 * @param {string} value - The new value for the field.
 */
async function saveAgentScheduleToFirestore(agentName, field, value) {
    const year = currentScheduleMonth.getFullYear();
    const month = (currentScheduleMonth.getMonth() + 1).toString().padStart(2, '0');
    const monthYearKey = `${year}-${month}`;

    const appId = db.app.options.projectId; // Get projectId as appId from Firebase app instance
    const scheduleDocRef = db.collection(`artifacts/${appId}/public/data/monthlySchedules`).doc(monthYearKey);

    // Get current month's schedule from cache (or fetch if not there)
    let currentMonthSchedule = monthlySchedulesCache[monthYearKey] || {};
    let agentSchedule = currentMonthSchedule[agentName] || {};

    // Update the specific field
    let updatedAgentSchedule = { ...agentSchedule, [field]: value };

    // If it's a shift change, also update break and lunch based on predefined shifts
    if (field === 'shift') {
        const shiftDetails = predefinedShifts.find(s => s.shift === value);
        if (shiftDetails) {
            updatedAgentSchedule.break = shiftDetails.break;
            updatedAgentSchedule.lunch = shiftDetails.lunch;
        }
    }

    // Update the local cache immediately for responsiveness
    monthlySchedulesCache = {
        ...monthlySchedulesCache,
        [monthYearKey]: {
            ...currentMonthSchedule,
            [agentName]: updatedAgentSchedule
        }
    };

    // Persist to Firestore
    try {
        await scheduleDocRef.set({
            [agentName]: updatedAgentSchedule
        }, { merge: true }); // Merge to update only the agent's data
        console.log(`Updated ${agentName}'s ${field} for ${monthYearKey} in Firestore.`);
        // Re-render the table and summary to reflect changes
        renderShiftScheduleTable();
        renderSummaryTable();
    } catch (error) {
        console.error(`Error updating ${agentName}'s ${field} in Firestore:`, error);
        // Optionally, revert local changes or show an error message to the user
    }
}


/**
 * Renders the shift schedule table with dynamic dropdowns.
 */
export async function renderShiftScheduleTable() {
    const tableBody = window.DOM.shiftScheduleTableBody;
    const tableHead = window.DOM.shiftScheduleTableHead;
    const currentMonthSchedule = await fetchMonthlyScheduleData(currentScheduleMonth); // Fetch current month's data

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
        const userProfile = usersData[agentName]; // Access userProfile directly from usersData
        if (!userProfile) {
            console.warn(`User profile not found for agent: ${agentName}`);
            return;
        }

        const agentCurrentSchedule = currentMonthSchedule[agentName] || {};

        const newRow = document.createElement('tr');
        newRow.dataset.agentName = agentName; // Store agent name for easy lookup

        // --- Role Select ---
        const roleSelect = document.createElement('select');
        roleSelect.classList.add('shift-role-select', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'focus:ring-blue-500', 'focus:border-blue-500');
        predefinedRoles.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            roleSelect.appendChild(option);
        });
        // Set initial value from current month's schedule or user profile default
        roleSelect.value = agentCurrentSchedule.role || userProfile.role || predefinedRoles[0];
        roleSelect.addEventListener('change', (e) => {
            saveAgentScheduleToFirestore(agentName, 'role', e.target.value);
        });

        // --- Secondary Role Select ---
        const secondaryRoleSelect = document.createElement('select');
        secondaryRoleSelect.classList.add('shift-secondary-role-select', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'focus:ring-blue-500', 'focus:border-blue-500');
        predefinedRoles.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            secondaryRoleSelect.appendChild(option);
        });
        // Set initial value from current month's schedule or user profile default
        secondaryRoleSelect.value = agentCurrentSchedule.secondaryRole || userProfile.secondaryRole || predefinedRoles[predefinedRoles.length - 1]; // Default to "N/A"
        secondaryRoleSelect.addEventListener('change', (e) => {
            saveAgentScheduleToFirestore(agentName, 'secondaryRole', e.target.value);
        });

        // --- Shift Time Select ---
        const shiftSelect = document.createElement('select');
        shiftSelect.classList.add('shift-time-select', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'focus:ring-blue-500', 'focus:border-blue-500');
        predefinedShifts.forEach(shift => {
            const option = document.createElement('option');
            option.value = shift.shift;
            option.textContent = shift.shift;
            shiftSelect.appendChild(option);
        });
        // Set initial value from current month's schedule
        shiftSelect.value = agentCurrentSchedule.shift || predefinedShifts[0].shift;

        // Create cells for break and lunch
        const breakCell = document.createElement('td');
        const lunchCell = document.createElement('td');
        breakCell.classList.add('break-cell', 'px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
        lunchCell.classList.add('lunch-cell', 'px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');

        // Function to update break and lunch cells based on selected shift
        const updateBreakLunchCells = (selectedShiftValue) => {
            const shiftDetails = predefinedShifts.find(s => s.shift === selectedShiftValue);
            if (shiftDetails) {
                breakCell.textContent = shiftDetails.break;
                lunchCell.textContent = shiftDetails.lunch;
            }
        };

        // Add event listener to the shift dropdown
        shiftSelect.addEventListener('change', (e) => {
            const selectedShift = e.target.value;
            updateBreakLunchCells(selectedShift); // Update display
            saveAgentScheduleToFirestore(agentName, 'shift', selectedShift); // Persist to Firestore
        });

        // Trigger initial update for break and lunch cells based on default/saved shift
        updateBreakLunchCells(shiftSelect.value);

        // Construct the row HTML
        newRow.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${userProfile.fullName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td> <!-- Role dropdown will go here -->
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td> <!-- Secondary Role dropdown will go here -->
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td> <!-- Shift dropdown will go here -->
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td> <!-- Break will go here -->
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td> <!-- Lunch will go here -->
        `;

        // Append dropdowns and break/lunch cells to their respective <td> elements
        newRow.children[2].appendChild(roleSelect);
        newRow.children[3].appendChild(secondaryRoleSelect);
        newRow.children[4].appendChild(shiftSelect);
        newRow.children[5].appendChild(breakCell); // Append the actual td element
        newRow.children[6].appendChild(lunchCell); // Append the actual td element

        tableBody.appendChild(newRow);
    });

    renderSummaryTable(); // Render the summary table after the main table
}

/**
 * Renders the summary table for shifts, breaks, and lunches.
 */
async function renderSummaryTable() {
    const summaryTableContainer = window.DOM.shiftScheduleSummaryTableContainer;
    if (!summaryTableContainer) {
        console.error("Summary table container not found.");
        return;
    }

    summaryTableContainer.innerHTML = ''; // Clear previous content

    const currentMonthSchedule = await fetchMonthlyScheduleData(currentScheduleMonth);

    const shiftCounts = {};
    const breakCounts = {};
    const lunchCounts = {};

    // Initialize counts for all predefined shifts, breaks, and lunches
    predefinedShifts.forEach(shift => {
        shiftCounts[shift.shift] = 0;
        if (shift.break && shift.break !== '-') breakCounts[shift.break] = 0;
        if (shift.lunch && shift.lunch !== '-') lunchCounts[shift.lunch] = 0;
    });

    // Populate counts based on current month's schedule
    Object.values(currentMonthSchedule).forEach(agentSchedule => {
        if (agentSchedule.shift && shiftCounts.hasOwnProperty(agentSchedule.shift)) {
            shiftCounts[agentSchedule.shift]++;
        }
        if (agentSchedule.break && agentSchedule.break !== '-' && breakCounts.hasOwnProperty(agentSchedule.break)) {
            breakCounts[agentSchedule.break]++;
        }
        if (agentSchedule.lunch && agentSchedule.lunch !== '-' && lunchCounts.hasOwnProperty(agentSchedule.lunch)) {
            lunchCounts[agentSchedule.lunch]++;
        }
    });

    // Sort breaks and lunches for consistent display
    const sortedBreaks = Object.keys(breakCounts).sort();
    const sortedLunches = Object.keys(lunchCounts).sort();

    // Create the table HTML
    let tableHtml = `
        <h2 class="text-xl font-semibold text-gray-800 p-4 bg-gray-50 border-b rounded-t-lg">Schedule Summary</h2>
        <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th rowspan="2" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider align-bottom">Schedule Count</th>
                    <th colspan="2" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Break</th>
                    <th colspan="2" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Lunch</th>
                </tr>
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
    `;

    // Combine all unique break and lunch times for rows
    const allUniqueTimes = Array.from(new Set([...sortedBreaks, ...sortedLunches])).sort();

    if (allUniqueTimes.length === 0) {
        tableHtml += `
            <tr>
                <td colspan="5" class="px-6 py-4 whitespace-nowrap text-center text-gray-500">No schedule data available for summary.</td>
            </tr>
        `;
    } else {
        allUniqueTimes.forEach((time, index) => {
            tableHtml += `
                <tr class="hover:bg-gray-50">
                    ${index === 0 ? `<td rowspan="${allUniqueTimes.length}" class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 align-top">
                        <div class="flex items-center justify-center h-full">
                            <span class="transform -rotate-90 origin-center text-lg font-bold">Schedule Count</span>
                        </div>
                    </td>` : ''}
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${time}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${breakCounts[time] || 0}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${time}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${lunchCounts[time] || 0}</td>
                </tr>
            `;
        });
    }

    // Add total row
    const totalBreaks = Object.values(breakCounts).reduce((sum, count) => sum + count, 0);
    const totalLunches = Object.values(lunchCounts).reduce((sum, count) => sum + count, 0);

    tableHtml += `
            <tr class="bg-gray-100 font-bold">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td>
                <td colspan="2" class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">Total Breaks: ${totalBreaks}</td>
                <td colspan="2" class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">Total Lunches: ${totalLunches}</td>
            </tr>
            </tbody>
        </table>
        </div>
    `;

    summaryTableContainer.innerHTML = tableHtml;
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
        window.DOM.staticRosterTotalShifts.textContent = 'N/A'; // Or calculate based on assigned shifts if needed
    }
}

/**
 * Exports the shift schedule table and summary table to a PDF.
 */
async function exportScheduleToPdf() {
    const scheduleContent = document.getElementById('shiftSchedulePage'); // Capture the entire page or a specific section
    if (!scheduleContent) {
        alert("Error: Schedule content not found for PDF export.");
        return;
    }

    const exportButton = window.DOM.exportSchedulePdfBtn;
    const originalButtonText = exportButton.textContent;
    exportButton.textContent = 'Generating PDF...';
    exportButton.disabled = true;

    try {
        const canvas = await html2canvas(scheduleContent, { scale: 2 }); // Scale for better quality
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait, millimeters, A4 size

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`shift_schedule_${currentScheduleMonth.getFullYear()}-${(currentScheduleMonth.getMonth() + 1).toString().padStart(2, '0')}.pdf`);
        alert('PDF generated successfully!');
    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Failed to generate PDF. Please check the console for details.");
    } finally {
        exportButton.textContent = originalButtonText;
        exportButton.disabled = false;
    }
}
