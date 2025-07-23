// workforceManagement.js

// --- Global Variables / Caches for Workforce Management ---
// These variables are used to store data and state for the leave and shift pages.
// They are initialized here but are populated by data fetched from Firestore.
let shiftScheduleData = []; // This will hold the roster for the current month
const leavePlannerData = {}; // Local cache for leave records from Firestore ({ 'Month YYYY': [{...}, {...}] })
let currentShiftScheduleDate = new Date(); // Tracks the month/year for shift schedule
let currentLeaveTrackerDate = new Date(); // Tracks the month/year for leave tracker

// --- Constants and Utility Data ---
// These constants define the shift times and roles used in the workforce management pages.
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

    const table = document.createElement('table');
    table.classList.add('leave-planner-table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const tfoot = document.createElement('tfoot');

    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>No.</th><th>Name</th><th>Opening Balance</th><th>Leave Balance</th>';

    const numDaysInMonth = new Date(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth() + 1, 0).getDate();
    const monthlyDateKeys = [];
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

    const monthYearKey = currentLeaveTrackerDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const currentMonthLeaveData = leavePlannerData[monthYearKey] || [];

    const totalMonthlyLeave = Array(numDaysInMonth).fill(0);

    let hasDataForTable = false;

    activeAgents.forEach((agent, index) => {
        const tr = document.createElement('tr');
        const agentLeaveData = currentMonthLeaveData.find(row => row.Name === agent.fullName);

        const userProfile = Object.values(usersData).find(user => user.fullName === agent.fullName);
        const openingBalance = (userProfile && userProfile.openingLeaveBalance !== undefined) ? userProfile.openingLeaveBalance : 20;

        let approvedAnnualLeavesInMonth = 0;
        if (agentLeaveData) {
            for (let i = 1; i <= numDaysInMonth; i++) {
                const dayKey = i.toString().padStart(2, '0');
                if (agentLeaveData[dayKey] === 'AP') {
                    approvedAnnualLeavesInMonth++;
                }
            }
        }
        const leaveBalance = Math.max(0, openingBalance - approvedAnnualLeavesInMonth);

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${agent.fullName}</td>
            <td>${openingBalance}</td>
            <td class="current-leave-balance" data-agent="${agent.fullName}">${leaveBalance}</td>
        `;

        monthlyDateKeys.forEach((fullDateKey, dayIndex) => {
            const dateObj = new Date(fullDateKey);
            const dayOnly = dateObj.getDate().toString().padStart(2, '0');

            let cellStatus = agentLeaveData ? agentLeaveData[dayOnly] : '';

            const td = document.createElement('td');
            td.textContent = cellStatus;
            td.dataset.date = fullDateKey;
            td.dataset.agent = agent.fullName;

            if (cellStatus === 'L') {
                td.classList.add('pending-leave');
                td.title = "Pending Annual Leave Request";
                if (loggedInUserRole === 'Admin' || loggedInUserRole === 'Supervisor') {
                    td.innerHTML = `<span style="display:none;" class="leave-approval-overlay">
                        <button class="approve-btn" data-agent="${agent.fullName}" data-date="${fullDateKey}" data-status="Approved">Approve</button>
                        <button class="decline-btn" data-agent="${agent.fullName}" data-date="${fullDateKey}" data-status="Declined">Decline</button>
                    </span>L`;
                    td.addEventListener('click', (event) => {
                        document.querySelectorAll('.leave-approval-overlay').forEach(overlay => {
                            if (overlay !== event.currentTarget.querySelector('.leave-approval-overlay')) {
                                overlay.style.display = 'none';
                            }
                        });
                        const overlay = event.currentTarget.querySelector('.leave-approval-overlay');
                        if (overlay) {
                            overlay.style.display = (overlay.style.display === 'flex') ? 'none' : 'flex';
                            event.stopPropagation();
                        }
                    });
                }
                hasDataForTable = true;
            } else if (cellStatus === 'AP') {
                td.classList.add('approved-leave');
                td.title = "Approved Annual Leave";
                hasDataForTable = true;
            } else if (cellStatus === 'D') {
                td.classList.add('declined-leave');
                td.title = "Declined Annual Leave";
                hasDataForTable = true;
            } else {
                const statusObj = ATTENDANCE_STATUSES.find(s => s.value === cellStatus);
                if (statusObj && statusObj.colorClass) {
                    td.classList.add(statusObj.colorClass);
                    td.title = statusObj.text;
                    hasDataForTable = true;
                }

                if (!cellStatus && (loggedInUserRole === 'Agent' || loggedInUserRole === 'QA' || loggedInUserRole === 'Supervisor' || loggedInUserRole === 'Team Leader')) {
                    td.addEventListener('click', async (event) => {
                        await updateLeaveStatus(agent.fullName, fullDateKey, 'L');
                    });
                }
            }

            if (cellStatus === 'L' || cellStatus === 'AP') {
                totalMonthlyLeave[dayIndex]++;
            }
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const tfootRow = document.createElement('tr');
    tfootRow.innerHTML = `<td colspan="4" style="text-align: right;">Total Leaves (Annual/Pending):</td>`;
    totalMonthlyLeave.forEach(count => {
        const td = document.createElement('td');
        td.textContent = count > 0 ? count : '';
        tfootRow.appendChild(td);
    });
    tfoot.appendChild(tfootRow);
    table.appendChild(tfoot);

    if (activeAgents.length > 0 && !hasDataForTable && currentMonthLeaveData.length === 0) {
        DOM.leaveTrackerTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No leave data found for this month. Click on a day to request leave.</p>';
    } else if (activeAgents.length > 0) {
        DOM.leaveTrackerTableContainer.appendChild(table);
    }

    document.querySelectorAll('.leave-approval-overlay button').forEach(button => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation();
            const agent = event.target.dataset.agent;
            const date = event.target.dataset.date;
            const status = event.target.dataset.status === 'Approved' ? 'AP' : 'D';

            await updateLeaveStatus(agent, date, status);
        });
    });
}

/**
 * Updates the leave status for a specific agent on a specific date in Firestore.
 * @param {string} agentName - The full name of the agent.
 * @param {string} fullDateKey - The date in YYYY-MM-DD format.
 * @param {string} newStatus - The new status ('L' for pending, 'AP' for approved, 'D' for declined, etc.).
 */
async function updateLeaveStatus(agentName, fullDateKey, newStatus) {
    const dateParts = fullDateKey.split('-');
    const year = parseInt(dateParts[0]);
    const monthIndex = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[2]);

    const monthYearKey = new Date(year, monthIndex).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const dayOnly = day.toString().padStart(2, '0');

    try {
        const docRef = db.collection('leaves').doc(monthYearKey);
        const doc = await docRef.get();
        let currentData = doc.exists ? (doc.data().data || []) : [];
        let agentRowIndex = currentData.findIndex(row => row.Name === agentName);
        let agentRow = agentRowIndex !== -1 ? { ...currentData[agentRowIndex] } : null;

        const userProfile = Object.values(usersData).find(user => user.fullName === agentName);
        const defaultOpeningBalance = (userProfile && userProfile.openingLeaveBalance !== undefined) ? userProfile.openingLeaveBalance : 20;

        if (!agentRow) {
            agentRow = {
                "Name": agentName,
                "Opening Balance": defaultOpeningBalance,
                "Leave Balance": defaultOpeningBalance
            };
            agentRow[dayOnly] = newStatus;
            currentData.push(agentRow);
            console.log("Created new leave entry for agent:", agentName);
        } else {
            const oldStatus = agentRow[dayOnly];

            agentRow[dayOnly] = newStatus;

            if (['L', 'AP'].includes(oldStatus) && newStatus === 'AP' && oldStatus === 'L') {
                agentRow['Leave Balance'] = Math.max(0, (agentRow['Leave Balance'] || agentRow['Opening Balance'] || defaultOpeningBalance) - 1);
            } else if (oldStatus === 'AP' && newStatus === 'L') {
                agentRow['Leave Balance'] = (agentRow['Leave Balance'] || agentRow['Opening Balance'] || defaultOpeningBalance) + 1;
            } else if (oldStatus === 'AP' && newStatus === 'D') {
                agentRow['Leave Balance'] = (agentRow['Leave Balance'] || agentRow['Opening Balance'] || defaultOpeningBalance) + 1;
            }

            currentData[agentRowIndex] = agentRow;
        }

        await docRef.set({ data: currentData }, { merge: true });
        leavePlannerData[monthYearKey] = currentData;

        renderLeavePlannerTable();

        if (attendanceData[fullDateKey]) {
            let attendanceStatusToSet = attendanceData[fullDateKey][agentName] || '';

            if (newStatus === 'AP' || newStatus === 'L') {
                attendanceStatusToSet = 'L';
            } else if (newStatus === 'D') {
                attendanceStatusToSet = 'UL';
            }

            if (attendanceStatusToSet) {
                await db.collection('attendance').doc(fullDateKey).update({
                    [agentName]: attendanceStatusToSet
                });
                attendanceData[fullDateKey][agentName] = attendanceStatusToSet;
            }
        }
        updateHomeStatistics();
        updateDashboardData(DOM.employeeSelect.value);

        alert(`Leave for ${agentName} on ${fullDateKey} updated to ${newStatus === 'AP' ? 'Approved' : (newStatus === 'D' ? 'Declined' : 'Pending')}.`);

    } catch (error) {
        console.error("Error updating leave status:", error);
        alert(`Failed to update leave status: ${error.message}`);
    }
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
    DOM.shiftScheduleTableHead.innerHTML = '';
    DOM.shiftScheduleTableBody.innerHTML = '';
    DOM.currentShiftScheduleMonthYear.textContent = currentShiftScheduleDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const selectedMonthYear = `${currentShiftScheduleDate.getFullYear()}-${(currentShiftScheduleDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const selectedRoleFilter = DOM.scheduleRoleFilter.value;

    const filteredAgents = activeAgents.filter(agent =>
        selectedRoleFilter === '' || agent.role === selectedRoleFilter
    );

    if (filteredAgents.length === 0) {
        DOM.shiftScheduleTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">No active staff found for the selected criteria.</td></tr>`;
        updateShiftCountTable();
        return;
    }

    const headers = ["No", "Name", "Role", "Secondary Role", "Shift Time", "Break Time", "Lunch Time"];
    const headerRow = document.createElement('tr');
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    DOM.shiftScheduleTableHead.appendChild(headerRow);

    filteredAgents.forEach((agent, index) => {
        const tr = document.createElement('tr');
        const agentRosterEntry = shiftScheduleData.find(entry => entry.agentName === agent.fullName) || {};
        const assignedMonthlyShift = agentRosterEntry.assignedMonthlyShift || { shiftTime: "", breakTime: "", lunchTime: "" };

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${agent.fullName}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        const roleTd = tr.children[2];
        const roleSelect = document.createElement('select');
        roleSelect.dataset.agentName = agent.fullName;
        ALL_ROLES.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            if (agent.role === role) {
                option.selected = true;
            }
            roleSelect.appendChild(option);
        });
        roleSelect.addEventListener('change', async (e) => {
            const staffName = e.target.dataset.agentName;
            const newRole = e.target.value;
            const staffToUpdate = Object.values(staffData).find(s => s.fullName === staffName);
            if (staffToUpdate) {
                try {
                    await db.collection('staff').doc(staffToUpdate.staffId).update({ role: newRole });
                    staffData[staffToUpdate.staffId].role = newRole;
                    updateActiveAgentsList();
                    renderShiftScheduleTable();
                    alert(`Role for ${staffToUpdate.fullName} updated to ${newRole}.`);
                } catch (error) {
                    console.error("Error updating role:", error);
                    alert(`Failed to update role for ${staffToUpdate.fullName}: ${error.message}`);
                }
            }
        });
        roleTd.appendChild(roleSelect);

        const secondaryRoleTd = tr.children[3];
        const secondaryRoleSelect = document.createElement('select');
        secondaryRoleSelect.dataset.agentName = agent.fullName;
        secondaryRoleSelect.innerHTML = '<option value="">None</option>';
        ALL_SECONDARY_ROLES.forEach(secRole => {
            const option = document.createElement('option');
            option.value = secRole;
            option.textContent = secRole;
            if (agent.secondaryRole === secRole) {
                option.selected = true;
            }
            secondaryRoleSelect.appendChild(option);
        });
        secondaryRoleSelect.addEventListener('change', async (e) => {
            const staffName = e.target.dataset.agentName;
            const newSecondaryRole = e.target.value;
            const staffToUpdate = Object.values(staffData).find(s => s.fullName === staffName);
            if (staffToUpdate) {
                try {
                    await db.collection('staff').doc(staffToUpdate.staffId).update({ secondaryRole: newSecondaryRole });
                    staffData[staffToUpdate.staffId].secondaryRole = newSecondaryRole;
                    renderShiftScheduleTable();
                    alert(`Secondary Role for ${staffToUpdate.fullName} updated to ${newSecondaryRole}.`);
                } catch (error) {
                    console.error("Error updating secondary role:", error);
                    alert(`Failed to update secondary role for ${staffToUpdate.fullName}: ${error.message}`);
                }
            }
        });
        secondaryRoleTd.appendChild(secondaryRoleSelect);

        const shiftTimeTd = tr.children[4];
        const shiftTimeSelect = document.createElement('select');
        shiftTimeSelect.dataset.agent = agent.fullName;
        shiftTimeSelect.dataset.field = 'shiftTime';
        shiftTimeSelect.innerHTML = '<option value="">- Select Shift -</option>';
        SHIFT_DETAILS_MAP.forEach(shiftOption => {
            const option = document.createElement('option');
            option.value = shiftOption.shift;
            option.textContent = shiftOption.shift;
            if (assignedMonthlyShift.shiftTime === shiftOption.shift) {
                option.selected = true;
            }
            shiftTimeSelect.appendChild(option);
        });

        shiftTimeSelect.addEventListener('change', async (e) => {
            const selectedShiftValue = e.target.value;
            const agentName = e.target.dataset.agent;
            const shiftDetail = SHIFT_DETAILS_MAP.find(s => s.shift === selectedShiftValue);

            const newBreakTime = shiftDetail ? shiftDetail.break : '';
            const newLunchTime = shiftDetail ? shiftDetail.lunch : '';

            const currentAgentEntry = shiftScheduleData.find(entry => entry.agentName === agentName);
            if (currentAgentEntry) {
                currentAgentEntry.assignedMonthlyShift = {
                    shiftTime: selectedShiftValue,
                    breakTime: newBreakTime,
                    lunchTime: newLunchTime
                };
            }

            await updateAgentShiftData(agentName, 'shiftTime', selectedShiftValue);
            await updateAgentShiftData(agentName, 'breakTime', newBreakTime);
            await updateAgentShiftData(agentName, 'lunchTime', newLunchTime);

            renderShiftScheduleTable();
            updateShiftCountTable();
        });
        shiftTimeTd.appendChild(shiftTimeSelect);

        const breakTimeTd = tr.children[5];
        const breakTimeSpan = document.createElement('span');
        breakTimeSpan.classList.add('break-display');
        breakTimeSpan.textContent = assignedMonthlyShift.breakTime || '';
        breakTimeTd.appendChild(breakTimeSpan);

        const lunchTimeTd = tr.children[6];
        const lunchTimeSpan = document.createElement('span');
        lunchTimeSpan.classList.add('lunch-display');
        lunchTimeSpan.textContent = assignedMonthlyShift.lunchTime || '';
        lunchTimeTd.appendChild(lunchTimeSpan);

        DOM.shiftScheduleTableBody.appendChild(tr);
    });
    updateShiftCountTable();
}


/**
 * Updates the metrics in the Shift Schedule Dashboard section
 * (now primarily focusing on counts from the current month's roster).
 */
function updateShiftCountTable() {
    DOM.shiftCountsTableBody.innerHTML = '';

    const shiftTimeCounts = {};
    const breakTimeCounts = {};
    const lunchTimeCounts = {};

    shiftScheduleData.forEach(agentEntry => {
        const shift = agentEntry.assignedMonthlyShift;
        if (shift) {
            if (shift.shiftTime) {
                shiftTimeCounts[shift.shiftTime] = (shiftTimeCounts[shift.shiftTime] || 0) + 1;
            }
            if (shift.breakTime) {
                breakTimeCounts[shift.breakTime] = (breakTimeCounts[shift.breakTime] || 0) + 1;
            }
            if (shift.lunchTime) {
                lunchTimeCounts[shift.lunchTime] = (lunchTimeCounts[shift.lunchTime] || 0) + 1;
            }
        }
    });

    const appendRow = (category, item, count) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${category}</td><td>${item}</td><td>${count}</td>`;
        DOM.shiftCountsTableBody.appendChild(tr);
    };

    const hasData = Object.keys(shiftTimeCounts).length > 0 || Object.keys(breakTimeCounts).length > 0 || Object.keys(lunchTimeCounts).length > 0;

    if (!hasData) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3" style="text-align: center; padding: 20px;">No shift data available for this month to count.</td>`;
        DOM.shiftCountsTableBody.appendChild(tr);
        return;
    }

    Object.keys(shiftTimeCounts).sort().forEach(shiftTime => {
        appendRow('Shift Time', shiftTime, shiftTimeCounts[shiftTime]);
    });
    Object.keys(breakTimeCounts).sort().forEach(breakTime => {
        appendRow('Break Time', breakTime, breakTimeCounts[breakTime]);
    });
    Object.keys(lunchTimeCounts).sort().forEach(lunchTime => {
        appendRow('Lunch Time', lunchTime, lunchTimeCounts[lunchTime]);
    });
}


/**
 * Initializes all event listeners for the workforce management pages.
 * This function should be called from the main script after DOM is loaded.
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
