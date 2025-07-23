// leave_tracker.js

import {
    db,
    activeAgents,
    usersData,
    loggedInUserRole,
    todayGlobal,
    showPage,
    fetchAttendanceData,
    fetchAllUsersData,
    updateHomeStatistics,
    updateDashboardData,
    currentLeaveTrackerDate,
    formatDate,
    markedDates,
    attendanceData
} from './main.js';

let leavePlannerData = {};

export function initializeLeaveTracker(initialDate) {
    currentLeaveTrackerDate = initialDate;
}

export async function fetchLeaveData(year, month) {
    const monthYearKey = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    window.DOM.currentLeaveMonthYear.textContent = monthYearKey;
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

export function renderLeavePlannerTable() {
    console.log("Rendering leave planner table...");
    window.DOM.leaveTrackerTableContainer.innerHTML = '';
    window.DOM.currentLeaveMonthYear.textContent = currentLeaveTrackerDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
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
    activeAgents.forEach((agentName, index) => {
        const tr = document.createElement('tr');
        const agentLeaveData = currentMonthLeaveData.find(row => row.Name === agentName);
        const userProfile = Object.values(usersData).find(user => user.fullName === agentName);
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
            <td>${agentName}</td>
            <td>${openingBalance}</td>
            <td class="current-leave-balance" data-agent="${agentName}">${leaveBalance}</td>
        `;
        monthlyDateKeys.forEach((fullDateKey, dayIndex) => {
            const dateObj = new Date(fullDateKey);
            const dayOnly = dateObj.getDate().toString().padStart(2, '0');
            let cellStatus = agentLeaveData ? agentLeaveData[dayOnly] : '';
            const td = document.createElement('td');
            td.textContent = cellStatus;
            td.dataset.date = fullDateKey;
            td.dataset.agent = agentName;
            if (cellStatus === 'L') {
                td.classList.add('pending-leave');
                td.title = "Pending Annual Leave Request";
                if (loggedInUserRole === 'Admin' || loggedInUserRole === 'Supervisor') {
                    td.innerHTML = `<span style="display:none;" class="leave-approval-overlay">
                        <button class="approve-btn" data-agent="${agentName}" data-date="${fullDateKey}" data-status="Approved">Approve</button>
                        <button class="decline-btn" data-agent="${agentName}" data-date="${fullDateKey}" data-status="Declined">Decline</button>
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
                        await updateLeaveStatus(agentName, fullDateKey, 'L');
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
        window.DOM.leaveTrackerTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No leave data found for this month. Click on a day to request leave.</p>';
    } else if (activeAgents.length > 0) {
        window.DOM.leaveTrackerTableContainer.appendChild(table);
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

export async function updateLeaveStatus(agentName, fullDateKey, newStatus) {
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
        updateDashboardData(window.DOM.employeeSelect.value);
        alert(`Leave for ${agentName} on ${fullDateKey} updated to ${newStatus === 'AP' ? 'Approved' : (newStatus === 'D' ? 'Declined' : 'Pending')}.`);
    } catch (error) {
        console.error("Error updating leave status:", error);
        alert(`Failed to update leave status: ${error.message}`);
    }
}
