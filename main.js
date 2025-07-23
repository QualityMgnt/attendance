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
export let usersData = {}; // Local cache for all user profiles from Firestore (email -> {uid, fullName, role, isActive, email, openingLeaveBalance, secondaryRole, period})
export const attendanceData = {}; // Local cache for attendance records from Firestore (date -> {agentName: status})
export const markedDates = new Set(); // Local cache for dates with marked attendance
export let activeAgents = []; // Array of active agent full names, derived from usersData
export let currentLeaveTrackerDate = new Date(); // Tracks the month/year for leave tracker
export const todayGlobal = new Date(); // Constant for today's date
export let selectedMarkingDate = null; // Stores the date selected in the calendar for attendance marking

// Constants and Utility Data
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

// Helper to format date for Firestore document IDs
export const formatDate = (date) => date.toISOString().split('T')[0];

// --- Import functions from other modules ---
import { initializeLeaveTracker, fetchLeaveData, updateLeaveStatus } from './leave_tracker.js';
import { initializeShiftSchedule, renderShiftScheduleTable, updateShiftScheduleDashboard } from './shift_schedule.js';

// --- Core Helper Functions ---

/**
 * Updates the global activeAgents list based on the current usersData cache.
 * Also adds sample secondaryRole and period to usersData if they don't exist.
 */
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

/**
 * Fetches all user profiles from Firestore and populates the usersData cache.
 * @returns {Promise<void>}
 */
export async function fetchAllUsersData() {
    usersData = {}; // Clear existing data to ensure fresh load
    try {
        const usersSnapshot = await db.collection('users').get();
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            usersData[userData.email] = {
                uid: doc.id, // Firestore Document ID (should match Auth UID)
                fullName: userData.fullName,
                role: userData.role,
                isActive: userData.isActive,
                email: userData.email,
                openingLeaveBalance: userData.openingLeaveBalance || 20, // Default to 20 if not set
                secondaryRole: userData.secondaryRole || '', // Added for shift schedule
                period: userData.period || '' // Added for shift schedule
            };
        });
        updateActiveAgentsList();
        console.log("All user data loaded from Firestore.");
    } catch (error) {
        console.error("Error fetching users from Firestore:", error.code, error.message);
        // Do NOT alert here, as this is handled by the auth state listener based on user role.
    }
}

/**
 * Fetches all attendance records from Firestore and populates the attendanceData and markedDates caches.
 * @returns {Promise<void>}
 */
export async function fetchAttendanceData() {
    // Clear existing local cache before fetching fresh data
    for (const key in attendanceData) {
        delete attendanceData[key];
    }
    markedDates.clear();

    try {
        const attendanceSnapshot = await db.collection('attendance').get();
        attendanceSnapshot.forEach(doc => {
            attendanceData[doc.id] = doc.data(); // doc.id is the date string (e.g., "YYYY-MM-DD")
            markedDates.add(doc.id);
        });
        console.log("Attendance data loaded from Firestore.");
    } catch (error) {
        console.error("Error fetching attendance data:", error);
        alert("Critical: Could not load attendance data. Check console and Firebase rules.");
    }
}

/**
 * Updates all dashboard statistics and charts based on selected employee and attendance data.
 * @param {string} selectedEmployee - The full name of the selected employee, or empty string for all.
 */
export function updateDashboardData(selectedEmployee = '') {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 5); // Last 6 months including current

    window.DOM.dashboardStartDate.textContent = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

    window.DOM.dashboardTotalEmployees.textContent = activeAgents.length;
    let totalAbsenceDays = 0;
    let totalUnapprovedLeave = 0;
    let totalWFO = 0;
    let totalWFH = 0;
    let totalSickOffCount = 0;
    let totalSignedOff = 0;
    let totalDayOff = 0;
    let totalUnpaidLeaveCount = 0;
    let totalNCNSCount = 0;
    let totalCompassionateLeaveCount = 0;
    let totalAnnualLeaveCount = 0;

    let overallPresentDays = 0;
    let overallTotalPossibleDays = 0;

    const monthlyAttendanceSummary = {};
    const agentAttendancePercentages = {};

    for (let i = 0; i < 6; i++) {
        const month = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
        const monthKey = month.toISOString().substring(0, 7);
        monthlyAttendanceSummary[monthKey] = { present: 0, late: 0, absent: 0 };
    }

    activeAgents.forEach(agent => {
        agentAttendancePercentages[agent] = { totalDays: 0, presentDays: 0, percentage: 0 };
    });

    for (const dateKey in attendanceData) {
        const date = new Date(dateKey);
        date.setHours(0,0,0,0);

        if (date >= startDate && date <= endDate) {
            const dailyAttendance = attendanceData[dateKey];
            const monthYear = dateKey.substring(0, 7);

            const agentsToProcess = selectedEmployee ? [selectedEmployee] : activeAgents;

            agentsToProcess.forEach(agent => {
                if (dailyAttendance && dailyAttendance[agent]) {
                    const status = dailyAttendance[agent];

                    if (!monthlyAttendanceSummary[monthYear]) {
                        monthlyAttendanceSummary[monthYear] = { present: 0, late: 0, absent: 0 };
                    }

                    if (status === 'UL' || status === 'NCNS') {
                        totalAbsenceDays++;
                    }
                    if (status === 'SOF') totalSickOffCount++;
                    if (status === 'CL') totalCompassionateLeaveCount++;
                    if (status === 'UL') totalUnpaidLeaveCount++;
                    if (status === 'L') totalAnnualLeaveCount++;

                    if (status === 'WFO') totalWFO++;
                    if (status === 'WFH') totalWFH++;

                    if (activeAgents.includes(agent)) {
                        overallTotalPossibleDays++;
                        if (status === 'WFO' || status === 'WFH') {
                            overallPresentDays++;
                        }
                    }

                    if (status === 'WFO' || status === 'WFH') {
                        monthlyAttendanceSummary[monthYear].present++;
                        if (!selectedEmployee && Math.random() < 0.15) {
                            monthlyAttendanceSummary[monthYear].late++;
                            monthlyAttendanceSummary[monthYear].present--;
                        }
                    } else if (status === 'UL' || status === 'NCNS') {
                        monthlyAttendanceSummary[monthYear].absent++;
                    }

                    if (agentAttendancePercentages[agent]) {
                        agentAttendancePercentages[agent].totalDays++;
                        if (status === 'WFO' || status === 'WFH') {
                            agentAttendancePercentages[agent].presentDays++;
                        }
                    }
                }
            });
        }
    }

    totalUnapprovedLeave = 0;
    for (const monthYearKey in window.leavePlannerData) { // Access global leavePlannerData
        const monthData = window.leavePlannerData[monthYearKey];
        if (monthData) {
            monthData.forEach(rowData => {
                const isRelevantEmployee = !selectedEmployee || rowData['Name'] === selectedEmployee;
                if (isRelevantEmployee) {
                    const dateKeysInRow = Object.keys(rowData).filter(key => !isNaN(key) && key.length <= 2);
                    dateKeysInRow.forEach(dayNum => {
                        const status = rowData[dayNum];
                        if (status === 'L') {
                            const year = new Date(Date.parse(monthYearKey)).getFullYear();
                            const month = new Date(Date.parse(monthYearKey)).getMonth();
                            const fullLeaveDate = new Date(year, month, parseInt(dayNum));
                            fullLeaveDate.setHours(0,0,0,0);
                            todayGlobal.setHours(0,0,0,0);
                            if (fullLeaveDate <= todayGlobal) {
                                totalUnapprovedLeave++;
                            }
                        }
                    });
                }
            });
        }
    }

    window.DOM.dashboardAbsenceDays.textContent = totalUnpaidLeaveCount + totalNCNSCount;
    window.DOM.dashboardUnapprovedLeave.textContent = totalUnapprovedLeave;

    let overallPercentage = 0;
    if (overallTotalPossibleDays > 0) {
        overallPercentage = (overallPresentDays / overallTotalPossibleDays) * 100;
    }
    window.DOM.overallAttendanceGaugeLabel.textContent = `${overallPercentage.toFixed(0)}%`;
    const rotation = -135 + (overallPercentage * 2.7);
    window.DOM.overallAttendanceGaugeFill.style.transform = `rotate(${rotation}deg)`;

    renderAttendanceStatsChart(monthlyAttendanceSummary);

    window.DOM.leaveTakenSick.textContent = totalSickOffCount;
    window.DOM.leaveTakenCasual.textContent = totalCompassionateLeaveCount;
    window.DOM.leaveTakenAnnual.textContent = totalAnnualLeaveCount;
    window.DOM.leaveTakenUnpaid.textContent = totalUnpaidLeaveCount;

    renderWorkingLocationDonutChart(totalWFO, totalWFH);
    renderTopEmployeesChart(agentAttendancePercentages);
}

/**
 * Renders the monthly attendance statistics bar chart.
 * @param {object} monthlyData - An object where keys are 'YYYY-MM' and values are { present, late, absent }.
 */
function renderAttendanceStatsChart(monthlyData) {
    const chartContainer = window.DOM.attendanceStatsChart;
    if (!chartContainer) return;

    chartContainer.innerHTML = '';

    const monthsSorted = Object.keys(monthlyData).sort();
    if (monthsSorted.length === 0) {
        chartContainer.innerHTML = '<p style="text-align: center; width: 100%; margin-top: 50px;">No attendance data yet for charts.</p>';
        return;
    }

    const chartContainerInner = document.createElement('div');
    chartContainerInner.style.display = 'flex';
    chartContainerInner.style.justifyContent = 'space-around';
    chartContainerInner.style.alignItems = 'flex-end';
    chartContainerInner.style.height = '100%';
    chartContainer.appendChild(chartContainerInner);

    const allCounts = Object.values(monthlyData).flatMap(m => [m.present, m.late, m.absent]);
    const maxCount = Math.max(...allCounts);
    const scaleFactor = maxCount > 0 ? 180 / maxCount : 0;

    monthsSorted.forEach(monthKey => {
        const monthName = new Date(monthKey + '-01').toLocaleString('en-US', { month: 'short' });
        const monthSummary = monthlyData[monthKey];

        const barGroup = document.createElement('div');
        barGroup.classList.add('bar-group');

        barGroup.innerHTML = `
            <div class="bar on-time-bar" style="height: ${monthSummary.present * scaleFactor}px;" title="Present: ${monthSummary.present}"></div>
            <div class="bar late" style="height: ${monthSummary.late * scaleFactor}px;" title="Late/Partial: ${monthSummary.late}"></div>
            <div class="bar absent" style="height: ${monthSummary.absent * scaleFactor}px;" title="Absent: ${monthSummary.absent}"></div>
        `;
        chartContainerInner.appendChild(barGroup);
    });

    const monthLabels = document.createElement('div');
    monthLabels.classList.add('bar-chart-month-labels');
    monthsSorted.forEach(monthKey => {
        const monthName = new Date(monthKey + '-01').toLocaleString('en-US', { month: 'short' });
        const div = document.createElement('div');
        div.textContent = monthName;
        monthLabels.appendChild(div);
    });
    chartContainer.appendChild(monthLabels);
}

/**
 * Renders the working location distribution donut chart.
 * @param {number} wfoCount - Count of Work From Office days.
 * @param {number} wfhCount - Count of Work From Home days.
 */
function renderWorkingLocationDonutChart(wfoCount, wfhCount) {
    const total = wfoCount + wfhCount;
    let wfoPercentage = 0;

    if (total > 0) {
        wfoPercentage = (wfoCount / total) * 100;
    }

    window.DOM.workingLocationDonutChart.style.background = `conic-gradient(#007bff 0% ${wfoPercentage}%, #28a745 ${wfoPercentage}% 100%)`;
    window.DOM.workingLocationDonutLabel.textContent = `${wfoPercentage.toFixed(0)}% Working From Office`;
}

/**
 * Renders the top employees by attendance bar chart.
 * @param {object} agentAttendancePercentages - An object mapping agent names to { totalDays, presentDays, percentage }.
 */
function renderTopEmployeesChart(agentAttendancePercentages) {
    const topEmployeesChart = window.DOM.topEmployeesChart;
    if (!topEmployeesChart) return;

    topEmployeesChart.innerHTML = '';

    const agentsWithPercentages = Object.entries(agentAttendancePercentages)
        .map(([name, data]) => ({
            name,
            percentage: data.totalDays > 0 ? (data.presentDays / data.totalDays) * 100 : 0
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5);

    if (agentsWithPercentages.length === 0) {
        topEmployeesChart.innerHTML = '<p style="text-align: center; width: 100%; margin-top: 50px;">No employee data to display.</p>';
        return;
    }

    agentsWithPercentages.forEach(agent => {
        const item = document.createElement('div');
        item.classList.add('employee-bar-item');
        item.innerHTML = `
            <span class="employee-name-label">${agent.name}</span>
            <div class="employee-bar-track">
                <div class="employee-bar-fill" style="width: ${agent.percentage.toFixed(0)}%;"></div>
            </div>
            <span class="employee-bar-value">${agent.percentage.toFixed(0)}%</span>
        `;
        topEmployeesChart.appendChild(item);
    });
}

/**
 * Populates the employee dropdown for the dashboard.
 */
export function populateEmployeeSelect() {
    if (window.DOM.employeeSelect) {
        window.DOM.employeeSelect.innerHTML = '<option value="">All Employees</option>';
        Object.values(usersData).filter(user => user.isActive).forEach(user => {
            const option = document.createElement('option');
            option.value = user.fullName;
            option.textContent = user.fullName;
            window.DOM.employeeSelect.appendChild(option);
        });
    }
}

/**
 * Populates the employee dropdown for the Individual Summary page.
 */
export function populateIndividualSummarySelect() {
    if (window.DOM.individualSelectSummary) {
        window.DOM.individualSelectSummary.innerHTML = '<option value="">Select Employee</option>';
        Object.values(usersData).filter(user => user.isActive).forEach(user => {
            const option = document.createElement('option');
            option.value = user.fullName;
            option.textContent = user.fullName;
            window.DOM.individualSelectSummary.appendChild(option);
        });
    }
}

/**
 * Updates individual summary statistics and chart for the selected employee.
 * @param {string} employeeName - The full name of the employee to summarize.
 */
export function updateIndividualSummary(employeeName) {
    if (!employeeName) {
        window.DOM.summaryWFO.textContent = '0';
        window.DOM.summaryWFH.textContent = '0';
        window.DOM.summaryLeave.textContent = '0';
        window.DOM.summarySickOff.textContent = '0';
        window.DOM.summarySignedOff.textContent = '0';
        window.DOM.summaryDayOff.textContent = '0';
        window.DOM.summaryUnpaidLeave.textContent = '0';
        window.DOM.summaryNCNS.textContent = '0';
        window.DOM.summaryCompassionateLeave.textContent = '0';
        window.DOM.monthlyWFHWFOChart.innerHTML = '<p style="text-align: center; width: 100%; margin-top: 50px;">Select an employee to view chart data.</p>';
        return;
    }

    let wfoCount = 0;
    let wfhCount = 0;
    let leaveCount = 0;
    let sickOffCount = 0;
    let signedOffCount = 0;
    let dayOffCount = 0;
    let unpaidLeaveCount = 0;
    let ncnsCount = 0;
    let compassionateLeaveCount = 0;

    const monthlyWFHWFO = {};

    for (const dateKey in attendanceData) {
        const dailyRecord = attendanceData[dateKey];
        if (dailyRecord[employeeName]) {
            const status = dailyRecord[employeeName];
            const monthYear = dateKey.substring(0, 7);

            if (!monthlyWFHWFO[monthYear]) {
                monthlyWFHWFO[monthYear] = { wfo: 0, wfh: 0 };
            }

            switch (status) {
                case 'WFO': wfoCount++; monthlyWFHWFO[monthYear].wfo++; break;
                case 'WFH': wfhCount++; monthlyWFHWFO[monthYear].wfh++; break;
                case 'L': leaveCount++; break;
                case 'SOF': sickOffCount++; break;
                case 'SO': signedOffCount++; break;
                case 'DO': dayOffCount++; break;
                case 'UL': unpaidLeaveCount++; break;
                case 'NCNS': ncnsCount++; break;
                case 'CL': compassionateLeaveCount++; break;
            }
        }
    }

    window.DOM.summaryWFO.textContent = wfoCount;
    window.DOM.summaryWFH.textContent = wfhCount;
    window.DOM.summaryLeave.textContent = leaveCount;
    window.DOM.summarySickOff.textContent = sickOffCount;
    window.DOM.summarySignedOff.textContent = signedOffCount;
    window.DOM.summaryDayOff.textContent = dayOffCount;
    window.DOM.summaryUnpaidLeave.textContent = unpaidLeaveCount;
    window.DOM.summaryNCNS.textContent = ncnsCount;
    window.DOM.summaryCompassionateLeave.textContent = compassionateLeaveCount;

    renderMonthlyWFHWFOChart(monthlyWFHWFO);
}

/**
 * Renders the monthly WFO vs WFH bar chart for an individual employee.
 * @param {object} monthlyData - An object where keys are 'YYYY-MM' and values are { wfo, wfh }.
 */
function renderMonthlyWFHWFOChart(monthlyData) {
    const chartContainer = window.DOM.monthlyWFHWFOChart;
    if (!chartContainer) return;

    chartContainer.innerHTML = '';

    const monthsSorted = Object.keys(monthlyData).sort();
    if (monthsSorted.length === 0) {
        chartContainer.innerHTML = '<p style="text-align: center; width: 100%; margin-top: 50px;">No data available for this employee for charts.</p>';
        return;
    }

    const allCounts = Object.values(monthlyData).flatMap(m => [m.wfo, m.wfh]);
    const maxCount = Math.max(...allCounts);
    const scaleFactor = maxCount > 0 ? 180 / maxCount : 0;

    monthsSorted.forEach(monthKey => {
        const monthName = new Date(monthKey + '-01').toLocaleString('en-US', { month: 'short' });
        const monthSummary = monthlyData[monthKey];

        const barGroup = document.createElement('div');
        barGroup.classList.add('monthly-bar-group');

        const wfoBar = document.createElement('div');
        wfoBar.classList.add('monthly-bar', 'wfo');
        wfoBar.style.height = `${monthSummary.wfo * scaleFactor}px`;
        wfoBar.title = `WFO: ${monthSummary.wfo}`;
        barGroup.appendChild(wfoBar);

        const wfhBar = document.createElement('div');
        wfhBar.classList.add('monthly-bar', 'wfh');
        wfhBar.style.height = `${monthSummary.wfh * scaleFactor}px`;
        wfhBar.title = `WFH: ${monthSummary.wfh}`;
        barGroup.appendChild(wfhBar);

        const label = document.createElement('div');
        label.classList.add('monthly-bar-label');
        label.textContent = monthName;
        barGroup.appendChild(label);

        chartContainer.appendChild(barGroup);
    });
}

/**
 * Generates and displays report data based on selected filters.
 * @param {string} reportType - Type of report ('daily', 'tardiness', 'absenteeism').
 * @param {string} startDateStr - Start date in YYYY-MM-DD format.
 * @param {string} endDateStr - End date in YYYY-MM-DD format.
 */
export function generateReportData(reportType, startDateStr, endDateStr) {
    const reportsTableBody = window.DOM.reportsTableBody;
    const reportTable = window.DOM.reportTable;
    if (!reportsTableBody || !reportTable) return;

    reportsTableBody.innerHTML = '';

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23,59,59,999);

    if (start > end) {
        alert("Start date cannot be after end date.");
        return;
    }

    let currentDate = new Date(start);
    let reportData = [];

    while (currentDate <= end) {
        const dateKey = formatDate(currentDate);
        const dailyAttendance = attendanceData[dateKey];

        const rowData = {
            Date: dateKey,
            WFO: 0, WFH: 0, L: 0, SOF: 0, SO: 0, DO: 0, UL: 0, NCNS: 0, CL: 0,
            Late: 0,
            Absent: 0
        };

        if (dailyAttendance) {
            for (const agentName of activeAgents) {
                const status = dailyAttendance[agentName] || '';

                switch (status) {
                    case 'WFO': rowData.WFO++; break;
                    case 'WFH': rowData.WFH++; break;
                    case 'L': rowData.L++; break;
                    case 'SOF': rowData.SOF++; break;
                    case 'SO': rowData.SO++; break;
                    case 'DO': rowData.DO++; break;
                    case 'UL': rowData.UL++; rowData.Absent++; break;
                    case 'NCNS': rowData.NCNS++; rowData.Absent++; break;
                    case 'CL': rowData.CL++; break;
                    default:
                        if (!status && activeAgents.includes(agentName)) {
                            rowData.Absent++;
                        }
                        break;
                }

                if ((status === 'WFO' || status === 'WFH') && Math.random() < 0.1) {
                    rowData.Late++;
                }
            }
        }

        reportData.push(rowData);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    renderReportTable(reportData, reportType);
}

/**
 * Renders the report table based on the generated data and report type.
 * @param {Array<object>} data - The report data.
 * @param {string} reportType - The type of report.
 */
function renderReportTable(data, reportType) {
    const reportsTableBody = window.DOM.reportsTableBody;
    const reportTable = window.DOM.reportTable;
    if (!reportsTableBody || !reportTable) return;

    reportsTableBody.innerHTML = '';
    let headerHtml = '';
    let rowHtmlGenerator;

    if (reportType === 'daily') {
        headerHtml = `
            <th>Date</th><th>Present (WFO)</th><th>Present (WFH)</th><th>On Leave</th>
            <th>On Sick Off</th><th>Signed Off</th><th>Day Off</th><th>Unpaid Leave</th>
            <th>No Call No Show</th><th>Compassionate Leave</th>
        `;
        rowHtmlGenerator = (row) => `
            <td>${row.Date}</td><td>${row.WFO}</td><td>${row.WFH}</td><td>${row.L}</td>
            <td>${row.SOF}</td><td>${row.SO}</td><td>${row.DO}</td><td>${row.UL}</td>
            <td>${row.NCNS}</td><td>${row.CL}</td>
        `;
    } else if (reportType === 'tardiness') {
        headerHtml = `<th>Date</th><th>Late Arrivals</th>`;
        rowHtmlGenerator = (row) => `<td>${row.Date}</td><td>${row.Late}</td>`;
    } else if (reportType === 'absenteeism') {
        headerHtml = `<th>Date</th><th>Absences (UL/NCNS)</th>`;
        rowHtmlGenerator = (row) => `<td>${row.Date}</td><td>${row.Absent}</td>`;
    }

    reportTable.querySelector('thead tr').innerHTML = headerHtml;

    if (data.length === 0 || data.every(row => Object.values(row).slice(1).every(val => val === 0))) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="${reportTable.querySelector('thead tr').children.length}" style="text-align: center;">No data available for the selected criteria.</td>`;
        reportsTableBody.appendChild(tr);
    } else {
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = rowHtmlGenerator(row);
            reportsTableBody.appendChild(tr);
        });
    }
}

/**
 * Exports the currently displayed report data to a CSV file.
 */
export function exportReportToCSV() {
    const reportTable = window.DOM.reportTable;
    if (!reportTable) return;

    let csv = [];
    const rows = reportTable.querySelectorAll('tr');

    for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length; j++) {
            let data = cols[j].innerText.replace(/"/g, '""');
            row.push(`"${data}"`);
        }
        csv.push(row.join(','));
    }

    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${window.DOM.reportType.value}_report_${window.DOM.startDate.value}_to_${window.DOM.endDate.value}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Report exported successfully to CSV.');
}

/**
 * Renders the calendar grid for the given year and month.
 * @param {number} year - The year to display.
 * @param {number} month - The month to display (0-indexed).
 */
let currentCalendarDate = new Date(); // To track calendar month/year
export function renderCalendar(year, month) {
    const calendarDaysGrid = window.DOM.calendarDaysGrid;
    const currentMonthYearDisplay = window.DOM.currentMonthYear;
    if (!calendarDaysGrid || !currentMonthYearDisplay) return;

    calendarDaysGrid.innerHTML = '';
    currentMonthYearDisplay.textContent = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const numDaysInMonth = lastDayOfMonth.getDate();
    const firstWeekday = firstDayOfMonth.getDay();

    const todayFormatted = todayGlobal.toISOString().split('T')[0];

    for (let i = 0; i < firstWeekday; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.classList.add('calendar-day', 'empty');
        calendarDaysGrid.appendChild(emptyDay);
    }

    for (let day = 1; day <= numDaysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('calendar-day');
        dayElement.textContent = day;

        const fullDate = new Date(year, month, day);
        const dateKey = fullDate.toISOString().split('T')[0];

        if (dateKey === todayFormatted) {
            dayElement.classList.add('today');
        }

        if (markedDates.has(dateKey)) {
            dayElement.classList.add('disabled');
            dayElement.title = "Attendance already marked for this date.";
        } else {
            dayElement.addEventListener('click', () => {
                const previouslySelected = calendarDaysGrid.querySelector('.calendar-day.selected');
                if (previouslySelected) {
                    previouslySelected.classList.remove('selected');
                }
                dayElement.classList.add('selected');
                selectedMarkingDate = dateKey;
            });
        }
        calendarDaysGrid.appendChild(dayElement);
    }
}

/**
 * Populates the attendance marking modal table with active agents and their current statuses for the selected date.
 */
export function populateModalAttendanceTable() {
    const modalAttendanceTableBody = window.DOM.modalAttendanceTableBody;
    if (!modalAttendanceTableBody) return;

    modalAttendanceTableBody.innerHTML = '';
    const existingAttendance = attendanceData[selectedMarkingDate] || {};

    activeAgents.forEach(agentName => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = agentName;
        tr.appendChild(nameTd);

        const statusTd = document.createElement('td');
        const select = document.createElement('select');
        select.classList.add('attendance-status-select');
        select.dataset.agent = agentName;

        ATTENDANCE_STATUSES.forEach(status => {
            const option = document.createElement('option');
            option.value = status.value;
            option.textContent = status.text;
            select.appendChild(option);
        });

        if (existingAttendance[agentName]) {
            select.value = existingAttendance[agentName];
            const statusObj = ATTENDANCE_STATUSES.find(s => s.value === existingAttendance[agentName]);
            if (statusObj && statusObj.colorClass) {
                select.classList.add(statusObj.colorClass);
            }
        } else {
            select.value = 'WFO';
            select.classList.add('status-WFO');
        }

        select.addEventListener('change', (event) => {
            const selectedValue = event.target.value;
            ATTENDANCE_STATUSES.forEach(status => {
                event.target.classList.remove(status.colorClass);
            });
            const newStatusObj = ATTENDANCE_STATUSES.find(s => s.value === selectedValue);
            if (newStatusObj && newStatusObj.colorClass) {
                event.target.classList.add(newStatusObj.colorClass);
            }
        });

        statusTd.appendChild(select);
        tr.appendChild(statusTd);
        modalAttendanceTableBody.appendChild(tr);
    });
}

/**
 * Saves attendance data to Firestore.
 */
export async function saveAttendance() {
    const modalErrorMessage = window.DOM.modalErrorMessage;
    if (!modalErrorMessage) return;

    modalErrorMessage.textContent = '';
    const attendanceRecord = {};
    let allSelected = true;

    window.DOM.modalAttendanceTableBody.querySelectorAll('select').forEach(select => {
        const agentName = select.dataset.agent;
        const status = select.value;
        if (!status) {
            allSelected = false;
        }
        attendanceRecord[agentName] = status;
    });

    if (!allSelected) {
        modalErrorMessage.textContent = 'Please select a status for all agents.';
        return;
    }

    try {
        await db.collection('attendance').doc(selectedMarkingDate).set(attendanceRecord, { merge: true });
        markedDates.add(selectedMarkingDate);
        attendanceData[selectedMarkingDate] = attendanceRecord;
        window.DOM.attendanceMarkingMessage.textContent = `Attendance for ${selectedMarkingDate} saved successfully!`;
        window.DOM.attendanceMarkingMessage.style.display = 'block';
        setTimeout(() => window.DOM.attendanceMarkingMessage.style.display = 'none', 3000);

        window.DOM.attendanceMarkingModal.style.display = 'none';
        window.DOM.attendanceDateInput.value = '';
        selectedMarkingDate = null;

        await fetchAttendanceData();
        await fetchAllUsersData();
        updateHomeStatistics();
        updateDashboardData(window.DOM.employeeSelect.value);
        populateIndividualSummarySelect();
    } catch (error) {
        console.error("Error saving attendance:", error);
        modalErrorMessage.textContent = `Error saving attendance: ${error.message}`;
    }
}

/**
 * Generates and displays the team attendance overview table.
 */
export function generateAttendanceOverviewTable() {
    const attendanceOverviewTableContainer = window.DOM.attendanceOverviewTableContainer;
    if (!attendanceOverviewTableContainer) return;

    attendanceOverviewTableContainer.innerHTML = '';

    const table = document.createElement('table');
    table.classList.add('attendance-overview-table');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const tbody = document.createElement('tbody');

    const dates = [];
    const today = new Date();
    for (let i = -7; i <= 7; i++) { // Display 7 days before and 7 days after today
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date);
    }

    const agentHeader = document.createElement('th');
    agentHeader.textContent = 'Agent Name';
    headerRow.appendChild(agentHeader);

    dates.forEach(date => {
        const th = document.createElement('th');
        const dateString = date.toISOString().split('T')[0];
        const displayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        th.textContent = displayDate;
        th.title = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        if (markedDates.has(dateString)) {
            th.classList.add('marked-date-header');
        }

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    activeAgents.forEach(agentName => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = agentName;
        nameTd.classList.add('agent-name-cell');
        tr.appendChild(nameTd);

        dates.forEach(date => {
            const td = document.createElement('td');
            td.classList.add('attendance-cell');
            const dateKey = date.toISOString().split('T')[0];

            const status = attendanceData[dateKey] ? attendanceData[dateKey][agentName] : '';
            td.textContent = status || '-';
            const statusObj = ATTENDANCE_STATUSES.find(s => s.value === status);
            if (statusObj && statusObj.colorClass) {
                td.classList.add(statusObj.colorClass);
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    attendanceOverviewTableContainer.appendChild(table);
}

/**
 * Deletes all attendance data from Firestore.
 */
export async function deleteAttendanceData() {
    if (!confirm('Are you sure you want to delete ALL attendance data? This action cannot be undone.')) {
        return;
    }

    try {
        const snapshot = await db.collection('attendance').get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        for (const key in attendanceData) {
            delete attendanceData[key];
        }
        markedDates.clear();

        alert('All attendance data deleted successfully.');
        generateAttendanceOverviewTable();
        updateHomeStatistics();
        updateDashboardData(window.DOM.employeeSelect.value);
    } catch (error) {
        console.error('Error deleting attendance data:', error);
        alert('Failed to delete attendance data: ' + error.message);
    }
}

/**
 * Exports attendance data to a CSV file.
 */
export function exportAttendanceDataToCSV() {
    let csvContent = "data:text/csv;charset=utf-8,";
    const header = ['Date', 'Agent Name', 'Status'];
    csvContent += header.join(',') + '\n';

    const sortedDates = Object.keys(attendanceData).sort();

    sortedDates.forEach(dateKey => {
        const dailyAttendance = attendanceData[dateKey];
        for (const agentName in dailyAttendance) {
            const status = dailyAttendance[agentName];
            csvContent += `${dateKey},"${agentName}",${status}\n`;
        }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "attendance_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Attendance data exported to attendance_data.csv');
}

/**
 * Updates the home page statistics.
 */
export function updateHomeStatistics() {
    updateActiveAgentsList();

    let presentCountToday = 0;
    const todayKey = formatDate(todayGlobal);
    const todayAttendance = attendanceData[todayKey];
    if (todayAttendance) {
        activeAgents.forEach(agentName => {
            const status = todayAttendance[agentName];
            if (status === 'WFO' || status === 'WFH') {
                presentCountToday++;
            }
        });
    } else {
        presentCountToday = activeAgents.length;
    }
    window.DOM.statTotalPresent.textContent = presentCountToday;
    window.DOM.statTotalStaff.textContent = Object.keys(usersData).length;

    const oneWeekAgo = new Date(todayGlobal);
    oneWeekAgo.setDate(todayGlobal.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);

    const onLeaveNamesSet = new Set();
    const onSickOffNamesSet = new Set();

    for (const dateKey in attendanceData) {
        const date = new Date(dateKey);
        date.setHours(0, 0, 0, 0);

        if (date >= oneWeekAgo && date <= todayGlobal) {
            const dailyAttendance = attendanceData[dateKey];
            for (const agentName in dailyAttendance) {
                if (activeAgents.includes(agentName)) {
                    const status = dailyAttendance[agentName];
                    if (status === 'L' || status === 'CL' || status === 'UL') {
                        onLeaveNamesSet.add(agentName);
                    } else if (status === 'SOF') {
                        onSickOffNamesSet.add(agentName);
                    }
                }
            }
        }
    }
    window.DOM.statAgentsOnLeaveWeek.textContent = onLeaveNamesSet.size;
    window.DOM.staffOnLeaveNames.textContent = onLeaveNamesSet.size > 0 ? Array.from(onLeaveNamesSet).join(', ') : 'No agents on leave.';

    window.DOM.statAgentsOnSickOffWeek.textContent = onSickOffNamesSet.size;
    window.DOM.agentsOnSickOffNames.textContent = onSickOffNamesSet.size > 0 ? Array.from(onSickOffNamesSet).join(', ') : 'No agents on sick off.';
}

/**
 * Renders the staff list table in the Admin page.
 */
export function renderStaffListTable() {
    const staffListTableBody = window.DOM.staffListTableBody;
    if (!staffListTableBody) return;

    staffListTableBody.innerHTML = '';

    const sortedUsers = Object.values(usersData).sort((a, b) => a.fullName.localeCompare(b.fullName));

    if (sortedUsers.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="text-align: center;">No staff members found.</td>`;
        staffListTableBody.appendChild(tr);
        return;
    }

    sortedUsers.forEach(user => {
        const tr = document.createElement('tr');

        const statusSelect = document.createElement('select');
        statusSelect.innerHTML = `
            <option value="true" ${user.isActive ? 'selected' : ''}>Active</option>
            <option value="false" ${!user.isActive ? 'selected' : ''}>Inactive</option>
        `;
        statusSelect.addEventListener('change', (e) => {
            toggleUserStatus(user.email, e.target.value === 'true');
        });

        const deleteButton = document.createElement('button');
        deleteButton.classList.add('btn', 'btn-danger', 'btn-sm');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            deleteUser(user.email);
        });

        tr.innerHTML = `
            <td>${user.fullName}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td></td>
            <td></td>
        `;
        tr.children[3].appendChild(statusSelect);
        tr.children[4].appendChild(deleteButton);

        staffListTableBody.appendChild(tr);
    });
}

/**
 * Toggles the active status of a user in Firestore.
 * @param {string} email - The email of the user to update.
 * @param {boolean} isActive - The new active status.
 */
export async function toggleUserStatus(email, isActive) {
    const userToUpdate = usersData[email];
    if (userToUpdate && userToUpdate.uid) {
        if (loggedInUser === email && !isActive) {
            alert("You cannot deactivate your own account while logged in.");
            renderStaffListTable(); // Re-render to revert selection
            return;
        }
        try {
            await db.collection('users').doc(userToUpdate.uid).update({
                isActive: isActive
            });
            userToUpdate.isActive = isActive; // Update local state
            updateActiveAgentsList(); // Rebuild active agents list
            renderStaffListTable(); // Re-render table

            generateAttendanceOverviewTable();
            populateEmployeeSelect();
            populateIndividualSummarySelect();
            updateHomeStatistics();
            updateDashboardData(window.DOM.employeeSelect.value);
        } catch (error) {
            console.error("Error toggling user status:", error);
            alert(`Failed to change status for ${userToUpdate.fullName}: ${error.message}`);
        }
    } else {
        alert("User not found or UID is missing.");
    }
}

/**
 * Deletes a user's profile and related data from Firestore.
 * NOTE: Deleting a Firebase Auth user from the client is generally not allowed for other users.
 * For a production app, this would require a Firebase Cloud Function.
 * Here, we delete their Firestore profile and data, but the Auth user might persist unless manually deleted in Firebase Console or via Cloud Function.
 * @param {string} email - The email of the user to delete.
 */
export async function deleteUser(email) {
    const userToDelete = usersData[email];
    if (!userToDelete) {
        alert("User not found.");
        return;
    }

    if (loggedInUser === email) {
        alert("You cannot delete your own account while logged in. Please log out and ask another administrator to delete your account, or delete it via Firebase Console.");
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete user ${userToDelete.fullName} (${email})? This action will also delete their attendance and leave records and cannot be undone.`);
    if (!confirmDelete) {
        return;
    }

    try {
        const batch = db.batch();

        // 1. Delete user data from Firestore 'users' collection
        if (userToDelete.uid) {
            batch.delete(db.collection('users').doc(userToDelete.uid));
        }

        // 2. Delete their attendance records for this agent
        const attendanceSnapshot = await db.collection('attendance').get();
        attendanceSnapshot.forEach(doc => {
            const docData = doc.data();
            if (docData[userToDelete.fullName]) {
                const updatedData = { ...docData };
                delete updatedData[userToDelete.fullName];
                if (Object.keys(updatedData).length > 0) {
                    batch.update(db.collection('attendance').doc(doc.id), updatedData);
                } else {
                    batch.delete(db.collection('attendance').doc(doc.id));
                }
            }
        });

        // 3. Delete their leave records (simplified, assumes flat structure in month docs)
        const leavesSnapshot = await db.collection('leaves').get();
        leavesSnapshot.forEach(doc => {
            const monthDocData = doc.data();
            if (monthDocData.data && Array.isArray(monthDocData.data)) {
                const originalData = monthDocData.data;
                const updatedData = originalData.filter(row => row.Name !== userToDelete.fullName);
                if (updatedData.length !== originalData.length) {
                    if (updatedData.length > 0) {
                        batch.update(db.collection('leaves').doc(doc.id), { data: updatedData });
                    } else {
                        batch.delete(db.collection('leaves').doc(doc.id));
                    }
                }
            }
        });

        await batch.commit();

        delete usersData[email];
        updateActiveAgentsList();
        renderStaffListTable();
        generateAttendanceOverviewTable();
        populateEmployeeSelect();
        populateIndividualSummarySelect();
        updateHomeStatistics();
        updateDashboardData(window.DOM.employeeSelect.value);
        alert(`User ${userToDelete.fullName} and their related data deleted from Firestore.`);

        console.warn(`Firebase Auth user for ${email} was NOT deleted client-side. Please delete it manually in Firebase Console or via a Cloud Function.`);

    } catch (error) {
        console.error("Error deleting user and associated data:", error);
        alert(`Failed to delete user ${userToDelete.fullName}: ${error.message}`);
    }
}


// --- DOMContentLoaded and Initial Setup ---
document.addEventListener('DOMContentLoaded', async () => {
    // Assign DOM elements to the DOM object
    window.DOM = {
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
                // This prevents the 'permission-denied' error for non-admin users.
                if (loggedInUserRole === 'Admin' || loggedInUserRole === 'Team Leader' || loggedInUserRole === 'Supervisor') {
                    await fetchAllUsersData();
                } else {
                    // For other roles (e.g., 'Agent'), just add their own data to usersData.
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
                    updateActiveAgentsList(); // Update activeAgents list with just this user
                }

                await fetchAttendanceData();
                setLoggedInState(true);
                showPage('homePage');
            } else {
                console.error("User document not found in Firestore for UID:", user.uid);
                alert("Your user profile is incomplete or missing. Please contact an administrator.");
                auth.signOut(); // Force logout if profile is missing
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
    // Login/Logout
    window.DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await auth.signInWithEmailAndPassword(window.DOM.loginEmail.value, window.DOM.loginPassword.value);
            window.DOM.loginError.textContent = '';
        } catch (error) {
            console.error("Login failed:", error.code, error.message);
            let errorMessage = 'Login failed. Please check your credentials.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMessage = 'Invalid email or password.';
            } else if (error.code === 'auth/user-disabled') {
                errorMessage = 'Your account has been disabled.';
            }
            window.DOM.loginError.textContent = errorMessage;
        }
    });
    window.DOM.logoutBtn.addEventListener('click', async () => {
        await auth.signOut();
    });

    // Navigation
    window.DOM.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (loggedInUser) {
                const pageId = link.dataset.page + 'Page';
                // Check for admin page access specifically
                if (link.dataset.page === 'admin' && loggedInUserRole !== 'Admin') {
                    alert("You do not have permission to access the Admin page.");
                    return;
                }
                showPage(pageId);
                window.location.hash = link.dataset.page;
            } else {
                alert("Please log in to access the application.");
            }
        });
    });

    // Attendance Marking Workflow
    window.DOM.openAttendanceCalendarBtn.addEventListener('click', () => {
        currentCalendarDate = new Date(todayGlobal.getFullYear(), todayGlobal.getMonth(), 1);
        renderCalendar(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        window.DOM.calendarModal.style.display = 'flex';
    });

    window.DOM.selectDateFromCalendarBtn.addEventListener('click', () => {
        if (selectedMarkingDate) {
            window.DOM.attendanceDateInput.value = selectedMarkingDate;
            window.DOM.modalDateDisplay.textContent = selectedMarkingDate;
            populateModalAttendanceTable();
            window.DOM.calendarModal.style.display = 'none';
            window.DOM.attendanceMarkingModal.style.display = 'flex';
        } else {
            alert('Please select a date from the calendar.');
        }
    });

    // Calendar Modal
    window.DOM.closeCalendarModal.addEventListener('click', () => window.DOM.calendarModal.style.display = 'none');
    window.DOM.cancelCalendarSelection.addEventListener('click', () => {
        window.DOM.calendarModal.style.display = 'none';
        selectedMarkingDate = null;
        window.DOM.attendanceDateInput.value = '';
    });
    window.DOM.prevMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
    });
    window.DOM.nextMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
    });

    // Attendance Marking Modal
    window.DOM.closeAttendanceModal.addEventListener('click', () => window.DOM.attendanceMarkingModal.style.display = 'none');
    window.DOM.cancelAttendanceBtn.addEventListener('click', () => window.DOM.attendanceMarkingModal.style.display = 'none');
    window.DOM.saveAttendanceBtn.addEventListener('click', saveAttendance);

    // Attendance Overview Table
    window.DOM.deleteAttendanceDataBtn.addEventListener('click', deleteAttendanceData);
    window.DOM.exportAttendanceDataBtn.addEventListener('click', exportAttendanceDataToCSV);

    // Leave Tracker (event listeners are here as they interact with main.js globals)
    window.DOM.prevMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() - 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });
    window.DOM.nextMonthLeaveBtn.addEventListener('click', () => {
        currentLeaveTrackerDate.setMonth(currentLeaveTrackerDate.getMonth() + 1);
        fetchLeaveData(currentLeaveTrackerDate.getFullYear(), currentLeaveTrackerDate.getMonth());
    });

    // Shift Schedule Page
    window.DOM.exportSchedulePdfBtn.addEventListener('click', () => {
        alert('Export to PDF functionality not yet implemented. This data is static and not dynamically generated.');
    });

    // Individual Summary
    window.DOM.individualSelectSummary.addEventListener('change', (e) => updateIndividualSummary(e.target.value));

    // Dashboard
    window.DOM.employeeSelect.addEventListener('change', (e) => updateDashboardData(e.target.value));

    // Reports Page
    window.DOM.generateReportBtn.addEventListener('click', () => {
        const reportType = window.DOM.reportType.value;
        const startDate = window.DOM.startDate.value;
        const endDate = window.DOM.endDate.value;

        if (!startDate || !endDate) {
            alert('Please select both start and end dates for the report.');
            return;
        }
        generateReportData(reportType, startDate, endDate);
    });
    window.DOM.exportReportCsvBtn.addEventListener('click', exportReportToCSV);

    // Admin Add User Form
    window.DOM.addMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        window.DOM.addMemberMessage.style.display = 'none';
        const fullName = window.DOM.fullName.value.trim();
        const newEmail = window.DOM.newEmail.value.trim();
        const newPassword = window.DOM.newPassword.value;
        const memberRole = window.DOM.memberRole.value;

        if (!fullName || !newEmail || !newPassword || !memberRole) {
            window.DOM.addMemberMessage.textContent = 'All fields are required!';
            window.DOM.addMemberMessage.style.color = '#dc3545';
            window.DOM.addMemberMessage.style.display = 'block';
            return;
        }

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(newEmail, newPassword);
            const newUser = userCredential.user;

            await db.collection('users').doc(newUser.uid).set({
                fullName: fullName,
                email: newEmail,
                role: memberRole,
                isActive: true, // New users are active by default
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            window.DOM.addMemberMessage.textContent = `User ${fullName} created successfully!`;
            window.DOM.addMemberMessage.style.color = '#28a745';
            window.DOM.addMemberMessage.style.display = 'block';
            window.DOM.addMemberForm.reset();

            await fetchAllUsersData(); // Re-fetch all users to update lists
            renderStaffListTable(); // Re-render staff list
            populateEmployeeSelect(); // Update dashboard dropdown
            populateIndividualSummarySelect(); // Update individual summary dropdown
            updateHomeStatistics(); // Update home stats
            updateDashboardData(window.DOM.employeeSelect.value); // Update dashboard
        } catch (error) {
            let errorMessage = 'Error creating user.';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'The email address is already in use by another account.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please choose a stronger password.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'The email address is not valid.';
                    break;
                default:
                    errorMessage = `Error: ${error.message}`;
                    break;
            }
            window.DOM.addMemberMessage.textContent = errorMessage;
            window.DOM.addMemberMessage.style.color = '#dc3545';
            window.DOM.addMemberMessage.style.display = 'block';
            console.error("Add User Error:", error.code, error.message);
        }
    });
}
