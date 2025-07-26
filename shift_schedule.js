// shift_schedule.js

// Import necessary variables from main.js
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

// Cache for monthly schedule data fetched from Firestore
let monthlySchedulesCache = {};

/**
 * Initializes the shift schedule module.
 * Sets up event listeners and renders the initial table.
 */
export function initializeShiftSchedule() {
    // Ensure DOM elements are available before adding listeners
    if (window.DOM.exportSchedulePdfBtn) {
        window.DOM.exportSchedulePdfBtn.removeEventListener('click', exportScheduleToPdf); // Prevent duplicate listeners
        window.DOM.exportSchedulePdfBtn.addEventListener('click', exportScheduleToPdf);
    }
    if (window.DOM.prevMonthScheduleBtn) {
        window.DOM.prevMonthScheduleBtn.removeEventListener('click', () => changeScheduleMonth(-1)); // Prevent duplicate listeners
        window.DOM.prevMonthScheduleBtn.addEventListener('click', () => changeScheduleMonth(-1));
    }
    if (window.DOM.nextMonthScheduleBtn) {
        window.DOM.nextMonthScheduleBtn.removeEventListener('click', () => changeScheduleMonth(1)); // Prevent duplicate listeners
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
    // Re-render table with new data and implicitly fetch
    renderShiftScheduleTable();
}

/**
 * Updates the display for the current month in the shift schedule.
 */
function updateCurrentScheduleMonthDisplay() {
    if (window.DOM.currentScheduleMonthYear) {
        window.DOM.currentScheduleMonthYear.textContent = currentScheduleMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
}


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
        // Access projectId from the initialized Firebase app instance
        const appId = db.app.options.projectId;
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
 * @param {string} field - The field to update ('shift', 'role', 'secondaryRole', 'lunch').
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
    // ONLY if the field is 'shift'. If it's 'lunch', we take the direct value.
    if (field === 'shift') {
        const shiftDetails = predefinedShifts.find(s => s.shift === value);
        if (shiftDetails) {
            updatedAgentSchedule.break = shiftDetails.break;
            // Only update lunch if it was derived from the shift, not if it was manually edited
            if (!agentSchedule.manualLunchEdit) { // Assuming a flag for manual edit
                 updatedAgentSchedule.lunch = shiftDetails.lunch;
            }
        }
    } else if (field === 'lunch') {
        updatedAgentSchedule.manualLunchEdit = true; // Mark lunch as manually edited
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
        }, { merge: true }); // Merge to update only the agent's data within the document
        console.log(`Updated ${agentName}'s ${field} for ${monthYearKey} in Firestore.`);
        // Re-render the table and summary to reflect changes
        renderShiftScheduleTable(); // This will re-fetch data and re-render
    } catch (error) {
        console.error(`Error updating ${agentName}'s ${field} in Firestore:`, error);
        alert(`Failed to save schedule for ${agentName}. Please try again.`);
    }
}


/**
 * Renders the shift schedule table with dynamic dropdowns.
 */
export async function renderShiftScheduleTable() {
    const tableBody = window.DOM.shiftScheduleTableBody;
    const tableHead = window.DOM.shiftScheduleTableHead;
    const currentMonthSchedule = await fetchMonthlyScheduleData(currentScheduleMonth); // Fetch current month's data

    // Fetch previous month's schedule for consecutive shift highlighting
    const prevMonthDate = new Date(currentScheduleMonth);
    prevMonthDate.setMonth(currentScheduleMonth.getMonth() - 1);
    const prevMonthSchedule = await fetchMonthlyScheduleData(prevMonthDate);

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
        const userProfile = usersData[agentName]; // Get userProfile from usersData (keyed by fullName)
        if (!userProfile) {
            console.warn(`User profile not found in usersData for agent: ${agentName}. Skipping row.`);
            return;
        }

        const agentCurrentSchedule = currentMonthSchedule[agentName] || {};
        const agentPrevSchedule = prevMonthSchedule[agentName] || {};

        const newRow = document.createElement('tr');
        newRow.dataset.agentName = agentName; // Store agent name for easy lookup

        // Determine initial values for dropdowns
        const initialShift = agentCurrentSchedule.shift || predefinedShifts[0].shift;
        const initialRole = agentCurrentSchedule.role || userProfile.role || predefinedRoles[0];
        const initialSecondaryRole = agentCurrentSchedule.secondaryRole || userProfile.secondaryRole || predefinedRoles[predefinedRoles.length - 1]; // Default to "N/A"

        // Get break and lunch based on the selected shift (or manually entered lunch)
        const selectedShiftDetails = predefinedShifts.find(s => s.shift === initialShift);
        const displayBreak = selectedShiftDetails ? selectedShiftDetails.break : '-';
        const displayLunch = agentCurrentSchedule.lunch || (selectedShiftDetails ? selectedShiftDetails.lunch : '-'); // Use saved lunch, else derived

        // Check for consecutive shifts
        let isConsecutiveShift = false;
        if (agentCurrentSchedule.shift && agentPrevSchedule.shift && agentCurrentSchedule.shift === agentPrevSchedule.shift) {
            isConsecutiveShift = true;
        }

        // --- Role Select ---
        const roleSelect = document.createElement('select');
        roleSelect.classList.add('shift-role-select', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'focus:ring-blue-500', 'focus:border-blue-500', 'w-full');
        predefinedRoles.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            roleSelect.appendChild(option);
        });
        roleSelect.value = initialRole;
        roleSelect.addEventListener('change', (e) => {
            saveAgentScheduleToFirestore(agentName, 'role', e.target.value);
        });

        // --- Secondary Role Select ---
        const secondaryRoleSelect = document.createElement('select');
        secondaryRoleSelect.classList.add('shift-secondary-role-select', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'focus:ring-blue-500', 'focus:border-blue-500', 'w-full');
        predefinedRoles.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            secondaryRoleSelect.appendChild(option);
        });
        secondaryRoleSelect.value = initialSecondaryRole;
        secondaryRoleSelect.addEventListener('change', (e) => {
            saveAgentScheduleToFirestore(agentName, 'secondaryRole', e.target.value);
        });

        // --- Shift Time Select ---
        const shiftSelect = document.createElement('select');
        shiftSelect.classList.add('shift-time-select', 'p-2', 'border', 'rounded-md', 'shadow-sm', 'focus:ring-blue-500', 'focus:border-blue-500', 'w-full');
        predefinedShifts.forEach(shift => {
            const option = document.createElement('option');
            option.value = shift.shift;
            option.textContent = shift.shift;
            shiftSelect.appendChild(option);
        });
        shiftSelect.value = initialShift;

        // Add event listener to the shift dropdown
        shiftSelect.addEventListener('change', (e) => {
            const selectedShift = e.target.value;
            // When shift changes, reset manualLunchEdit flag and update break/lunch from predefined
            const shiftDetails = predefinedShifts.find(s => s.shift === selectedShift);
            const updatedBreak = shiftDetails ? shiftDetails.break : '-';
            const updatedLunch = shiftDetails ? shiftDetails.lunch : '-';

            // Update local cache for immediate display before saving
            const currentMonthScheduleCopy = { ...monthlySchedulesCache[currentScheduleMonth.getFullYear() + '-' + (currentScheduleMonth.getMonth() + 1).toString().padStart(2, '0')] };
            currentMonthScheduleCopy[agentName] = {
                ...currentMonthScheduleCopy[agentName],
                shift: selectedShift,
                break: updatedBreak,
                lunch: updatedLunch,
                manualLunchEdit: false // Reset manual edit flag
            };
            monthlySchedulesCache[currentScheduleMonth.getFullYear() + '-' + (currentScheduleMonth.getMonth() + 1).toString().padStart(2, '0')] = currentMonthScheduleCopy;

            // Save the shift, break, and (reset) lunch to Firestore
            saveAgentScheduleToFirestore(agentName, 'shift', selectedShift);
            saveAgentScheduleToFirestore(agentName, 'break', updatedBreak); // Ensure break is also saved
            saveAgentScheduleToFirestore(agentName, 'lunch', updatedLunch); // Ensure lunch is also saved if not manually edited
        });


        // Create cells for break and lunch
        const breakCell = document.createElement('td');
        breakCell.classList.add('break-cell', 'px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
        breakCell.textContent = displayBreak;

        const lunchCell = document.createElement('td');
        lunchCell.classList.add('lunch-cell', 'px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900', 'editable-lunch-cell');
        lunchCell.setAttribute('contenteditable', 'true'); // Make it editable
        lunchCell.textContent = displayLunch;

        // Add event listener for editable lunch cell
        lunchCell.addEventListener('blur', (e) => {
            // Save the new value when the user blurs out of the cell
            saveAgentScheduleToFirestore(agentName, 'lunch', e.target.textContent.trim());
        });
        // Optional: Listen for 'Enter' key to save and blur
        lunchCell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent new line
                e.target.blur(); // Trigger blur to save
            }
        });


        // Create the individual cells for the row
        const tdNo = document.createElement('td');
        tdNo.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'font-medium', 'text-gray-900');
        tdNo.textContent = index + 1;

        const tdName = document.createElement('td');
        tdName.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
        tdName.textContent = userProfile.fullName;

        const tdRole = document.createElement('td');
        tdRole.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
        tdRole.appendChild(roleSelect);

        const tdSecondaryRole = document.createElement('td');
        tdSecondaryRole.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
        tdSecondaryRole.appendChild(secondaryRoleSelect);

        const tdShiftTime = document.createElement('td');
        tdShiftTime.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
        tdShiftTime.appendChild(shiftSelect);

        // Apply consecutive shift highlighting class
        if (isConsecutiveShift) {
            tdShiftTime.classList.add('consecutive-shift');
        }

        // Append all created cells to the new row
        newRow.appendChild(tdNo);
        newRow.appendChild(tdName);
        newRow.appendChild(tdRole);
        newRow.appendChild(tdSecondaryRole);
        newRow.appendChild(tdShiftTime);
        newRow.appendChild(breakCell); // These are already td elements
        newRow.appendChild(lunchCell); // These are already td elements

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
        // Collect all possible lunch times, including those manually entered
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
        // Use the actual lunch time from the schedule, which might be custom
        if (agentSchedule.lunch && agentSchedule.lunch !== '-') {
            // Ensure the lunch time exists in lunchCounts, add if new
            if (!lunchCounts.hasOwnProperty(agentSchedule.lunch)) {
                lunchCounts[agentSchedule.lunch] = 0;
            }
            lunchCounts[agentSchedule.lunch]++;
        }
    });

    // Sort breaks and lunches for consistent display
    const sortedBreaks = Object.keys(breakCounts).sort();
    const sortedLunches = Object.keys(lunchCounts).sort();
    const sortedShifts = Object.keys(shiftCounts).sort(); // Sort shifts for display

    // Create the table HTML
    let tableHtml = `
        <h2 class="text-xl font-semibold text-gray-800 p-4 bg-gray-50 border-b rounded-t-lg">Schedule Summary</h2>
        <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th rowspan="2" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider align-bottom">Shift Time</th> <!-- Changed header -->
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

    // Combine all unique break and lunch times for rows, and also include shift times
    const allUniqueTimes = Array.from(new Set([...sortedBreaks, ...sortedLunches, ...sortedShifts])).sort();

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
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${time}</td> <!-- Shift Time in first column -->
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${breakCounts[time] || 0}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${lunchCounts[time] || 0}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${breakCounts[time] || 0}</td>
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
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Total</td>
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
    // Target the specific container that holds the schedule content for PDF export
    const scheduleContent = document.getElementById('shiftSchedulePageContent'); // New ID for a specific div to capture
    if (!scheduleContent) {
        alert("Error: Schedule content container (ID 'shiftSchedulePageContent') not found for PDF export. Please ensure your HTML has this element.");
        console.error("PDF Export Error: Element with ID 'shiftSchedulePageContent' not found.");
        return;
    }

    const exportButton = window.DOM.exportSchedulePdfBtn;
    const originalButtonText = exportButton.textContent;
    exportButton.textContent = 'Generating PDF...';
    exportButton.disabled = true;

    try {
        // Ensure html2canvas and jspdf are loaded globally
        if (typeof html2canvas === 'undefined' || typeof jsPDF === 'undefined') {
            alert("PDF export libraries (html2canvas, jspdf) are not loaded. Please check your HTML script imports.");
            console.error("PDF Export Error: html2canvas or jsPDF is undefined. Check script tags in HTML.");
            return;
        }

        const canvas = await html2canvas(scheduleContent, { scale: 2, useCORS: true }); // Scale for better quality, useCORS for images
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
        alert("Failed to generate PDF. Please check the console for details. Common issues: large content, external images not loaded with CORS enabled.");
    } finally {
        exportButton.textContent = originalButtonText;
        exportButton.disabled = false;
    }
}
