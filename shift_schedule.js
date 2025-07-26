import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, getDocs } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Tailwind CSS is assumed to be available

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

// Firebase configuration and app ID (provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase outside the component to avoid re-initialization
let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
}

const App = () => {
    const [activeAgents, setActiveAgents] = useState([]);
    const [usersData, setUsersData] = useState({});
    const [monthlySchedules, setMonthlySchedules] = useState({}); // Stores schedules for all months
    const [currentMonth, setCurrentMonth] = useState(new Date()); // Current month for display and data fetching
    const [currentUser, setCurrentUser] = useState(null); // Firebase user object
    const [isAuthReady, setIsAuthReady] = useState(false); // Flag to ensure auth is ready
    const [loading, setLoading] = useState(true); // Loading state for initial data fetch

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        if (!app) {
            console.error("Firebase is not initialized. Check __firebase_config.");
            setLoading(false);
            return;
        }

        const setupFirebase = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase authentication error:", error);
            }
        };

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setIsAuthReady(true);
            console.log("Auth state changed. User:", user ? user.uid : "None");
            if (!user) {
                // If user becomes null (e.g., sign out), attempt anonymous sign-in
                signInAnonymously(auth).catch(e => console.error("Anonymous sign-in failed:", e));
            }
        });

        setupFirebase();

        return () => unsubscribeAuth(); // Cleanup auth listener
    }, []); // Run once on component mount

    // --- Fetch Active Agents and Users Data ---
    useEffect(() => {
        if (!isAuthReady || !db || !currentUser) return;

        const userId = currentUser.uid || crypto.randomUUID(); // Use UID if authenticated, else random

        // Listener for activeAgents
        const activeAgentsRef = collection(db, `artifacts/${appId}/public/data/agents`);
        const unsubscribeAgents = onSnapshot(activeAgentsRef, (snapshot) => {
            const agentsList = snapshot.docs.map(doc => doc.id); // Assuming agent names are doc IDs
            setActiveAgents(agentsList);
            console.log("Active Agents fetched:", agentsList);
        }, (error) => {
            console.error("Error fetching active agents:", error);
        });

        // Listener for usersData
        const usersDataRef = collection(db, `artifacts/${appId}/public/data/usersData`);
        const unsubscribeUsers = onSnapshot(usersDataRef, (snapshot) => {
            const data = {};
            snapshot.docs.forEach(doc => {
                data[doc.id] = doc.data(); // Assuming user ID is doc ID
            });
            setUsersData(data);
            console.log("Users Data fetched:", data);
        }, (error) => {
            console.error("Error fetching users data:", error);
        });

        // Initial check for usersData and activeAgents to populate if empty
        const populateInitialData = async () => {
            const usersSnapshot = await getDocs(usersDataRef);
            if (usersSnapshot.empty) {
                console.log("Populating initial usersData...");
                // Example initial users, replace with actual data if available
                const initialUsers = [
                    { fullName: "Alice Smith", role: "Inbound/Email", secondaryRole: "N/A" },
                    { fullName: "Bob Johnson", role: "Sales", secondaryRole: "Email" },
                    { fullName: "Charlie Brown", role: "Onboarding", secondaryRole: "N/A" },
                    { fullName: "Diana Prince", role: "Live chat /Social media/SMS/Inbound", secondaryRole: "LiveChat" },
                ];
                for (const user of initialUsers) {
                    const userDocRef = doc(db, `artifacts/${appId}/public/data/usersData`, user.fullName); // Use fullName as doc ID for simplicity
                    await setDoc(userDocRef, user);
                }
            }

            const agentsSnapshot = await getDocs(activeAgentsRef);
            if (agentsSnapshot.empty) {
                console.log("Populating initial activeAgents...");
                // Add some initial active agents
                const initialAgents = ["Alice Smith", "Bob Johnson", "Charlie Brown", "Diana Prince"];
                for (const agentName of initialAgents) {
                    const agentDocRef = doc(db, `artifacts/${appId}/public/data/agents`, agentName);
                    await setDoc(agentDocRef, {}); // Empty doc, just the ID matters
                }
            }
            setLoading(false);
        };

        populateInitialData();

        return () => {
            unsubscribeAgents();
            unsubscribeUsers();
        };
    }, [isAuthReady, db, currentUser, appId]);


    // --- Fetch Monthly Schedule Data ---
    useEffect(() => {
        if (!isAuthReady || !db || !currentUser) return;

        const monthYearKey = currentMonth.getFullYear() + '-' + (currentMonth.getMonth() + 1).toString().padStart(2, '0');
        const scheduleDocRef = doc(db, `artifacts/${appId}/public/data/monthlySchedules`, monthYearKey);

        const unsubscribeSchedule = onSnapshot(scheduleDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setMonthlySchedules(prev => ({
                    ...prev,
                    [monthYearKey]: docSnap.data()
                }));
                console.log(`Schedule for ${monthYearKey} fetched:`, docSnap.data());
            } else {
                setMonthlySchedules(prev => ({
                    ...prev,
                    [monthYearKey]: {} // No schedule for this month yet
                }));
                console.log(`No schedule found for ${monthYearKey}.`);
            }
        }, (error) => {
            console.error(`Error fetching schedule for ${monthYearKey}:`, error);
        });

        return () => unsubscribeSchedule();
    }, [isAuthReady, db, currentUser, currentMonth, appId]);


    // --- Handlers for Schedule Changes ---
    const updateScheduleInFirestore = useCallback(async (agentName, field, value) => {
        if (!db || !currentUser) {
            console.warn("Firestore not ready or user not authenticated.");
            return;
        }

        const monthYearKey = currentMonth.getFullYear() + '-' + (currentMonth.getMonth() + 1).toString().padStart(2, '0');
        const scheduleDocRef = doc(db, `artifacts/${appId}/public/data/monthlySchedules`, monthYearKey);

        // Get current schedule for this month
        const currentMonthSchedule = monthlySchedules[monthYearKey] || {};
        const agentSchedule = currentMonthSchedule[agentName] || {};

        // Update the specific field
        const updatedAgentSchedule = { ...agentSchedule, [field]: value };

        // If it's a shift change, also update break and lunch
        if (field === 'shift') {
            const shiftDetails = predefinedShifts.find(s => s.shift === value);
            if (shiftDetails) {
                updatedAgentSchedule.break = shiftDetails.break;
                updatedAgentSchedule.lunch = shiftDetails.lunch;
            }
        }

        // Update the local state immediately for responsiveness
        setMonthlySchedules(prev => ({
            ...prev,
            [monthYearKey]: {
                ...prev[monthYearKey],
                [agentName]: updatedAgentSchedule
            }
        }));

        // Persist to Firestore
        try {
            await setDoc(scheduleDocRef, {
                [agentName]: updatedAgentSchedule
            }, { merge: true }); // Merge to update only the agent's data
            console.log(`Updated ${agentName}'s ${field} for ${monthYearKey} in Firestore.`);
        } catch (error) {
            console.error(`Error updating ${agentName}'s ${field} in Firestore:`, error);
        }
    }, [db, currentUser, currentMonth, monthlySchedules, appId]);


    const handleShiftChange = (agentName, shiftValue) => {
        updateScheduleInFirestore(agentName, 'shift', shiftValue);
    };

    const handleRoleChange = (agentName, roleValue) => {
        updateScheduleInFirestore(agentName, 'role', roleValue);
    };

    const handleSecondaryRoleChange = (agentName, secondaryRoleValue) => {
        updateScheduleInFirestore(agentName, 'secondaryRole', secondaryRoleValue);
    };

    // --- Month Navigation ---
    const handleMonthChange = (direction) => {
        setCurrentMonth(prevMonth => {
            const newMonth = new Date(prevMonth);
            newMonth.setMonth(prevMonth.getMonth() + direction);
            return newMonth;
        });
    };

    // --- PDF Export Functionality ---
    const exportToPdf = async () => {
        const input = document.getElementById('schedule-content'); // ID of the container to capture
        if (!input) {
            console.error("Element with ID 'schedule-content' not found for PDF export.");
            return;
        }

        // Show a loading message
        const exportButton = document.getElementById('exportSchedulePdfBtn');
        const originalButtonText = exportButton.textContent;
        exportButton.textContent = 'Generating PDF...';
        exportButton.disabled = true;

        try {
            const canvas = await html2canvas(input, { scale: 2 }); // Increase scale for better quality
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

            pdf.save('shift_schedule.pdf');
        } catch (error) {
            console.error("Error generating PDF:", error);
            // Display a user-friendly message
            alert("Failed to generate PDF. Please try again.");
        } finally {
            exportButton.textContent = originalButtonText;
            exportButton.disabled = false;
        }
    };

    // --- Loading State ---
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Loading schedule data...</div>
            </div>
        );
    }

    // Get current month's schedule data
    const monthYearKey = currentMonth.getFullYear() + '-' + (currentMonth.getMonth() + 1).toString().padStart(2, '0');
    const currentMonthSchedule = monthlySchedules[monthYearKey] || {};

    return (
        <div className="min-h-screen bg-gray-100 p-4 font-inter">
            <div className="max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-md">
                <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">Staff Shift Schedule</h1>

                {/* Dashboard Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-100 p-4 rounded-lg shadow-sm">
                        <h2 className="text-lg font-semibold text-blue-800">Total Active Staff</h2>
                        <p id="staticRosterTotalStaff" className="text-3xl font-bold text-blue-600">{activeAgents.length}</p>
                    </div>
                    <div className="bg-green-100 p-4 rounded-lg shadow-sm">
                        <h2 className="text-lg font-semibold text-green-800">Current Month</h2>
                        <p className="text-3xl font-bold text-green-600">
                            {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="bg-purple-100 p-4 rounded-lg shadow-sm">
                        <h2 className="text-lg font-semibold text-purple-800">User ID</h2>
                        <p className="text-sm font-bold text-purple-600 break-all">{currentUser?.uid || 'N/A'}</p>
                    </div>
                </div>

                {/* Month Navigation */}
                <div className="flex justify-center items-center space-x-4 mb-6">
                    <button
                        onClick={() => handleMonthChange(-1)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition duration-300 shadow-sm"
                    >
                        &lt; Previous Month
                    </button>
                    <span className="text-xl font-semibold text-gray-700">
                        {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                        onClick={() => handleMonthChange(1)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition duration-300 shadow-sm"
                    >
                        Next Month &gt;
                    </button>
                </div>

                {/* Schedule Content for PDF Export */}
                <div id="schedule-content" className="p-4 bg-white rounded-lg">
                    {/* Main Shift Schedule Table */}
                    <div className="overflow-x-auto mb-8 border border-gray-200 rounded-lg shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Secondary Role</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift Time</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Break</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lunch</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {activeAgents.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-4 whitespace-nowrap text-center text-gray-500">
                                            No active staff members to display.
                                        </td>
                                    </tr>
                                ) : (
                                    activeAgents.map((agentName, index) => {
                                        const userProfile = usersData[agentName] || {};
                                        const agentCurrentSchedule = currentMonthSchedule[agentName] || {};

                                        // Determine initial values for dropdowns
                                        const initialShift = agentCurrentSchedule.shift || predefinedShifts[0].shift;
                                        const initialRole = agentCurrentSchedule.role || userProfile.role || predefinedRoles[0];
                                        const initialSecondaryRole = agentCurrentSchedule.secondaryRole || userProfile.secondaryRole || predefinedRoles[predefinedRoles.length - 1]; // "N/A"

                                        // Get break and lunch based on the selected shift
                                        const selectedShiftDetails = predefinedShifts.find(s => s.shift === initialShift);
                                        const displayBreak = selectedShiftDetails ? selectedShiftDetails.break : '-';
                                        const displayLunch = selectedShiftDetails ? selectedShiftDetails.lunch : '-';

                                        return (
                                            <tr key={agentName} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{index + 1}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{userProfile.fullName || agentName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    <select
                                                        value={initialRole}
                                                        onChange={(e) => handleRoleChange(agentName, e.target.value)}
                                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
                                                    >
                                                        {predefinedRoles.map(role => (
                                                            <option key={role} value={role}>{role}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    <select
                                                        value={initialSecondaryRole}
                                                        onChange={(e) => handleSecondaryRoleChange(agentName, e.target.value)}
                                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
                                                    >
                                                        {predefinedRoles.map(role => (
                                                            <option key={role} value={role}>{role}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    <select
                                                        value={initialShift}
                                                        onChange={(e) => handleShiftChange(agentName, e.target.value)}
                                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
                                                    >
                                                        {predefinedShifts.map(shift => (
                                                            <option key={shift.shift} value={shift.shift}>{shift.shift}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{displayBreak}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{displayLunch}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary Table */}
                    <SummaryTable scheduleData={currentMonthSchedule} predefinedShifts={predefinedShifts} />
                </div>

                {/* Export Button */}
                <div className="mt-8 flex justify-center">
                    <button
                        id="exportSchedulePdfBtn"
                        onClick={exportToPdf}
                        className="px-6 py-3 bg-red-600 text-white font-semibold rounded-md shadow-lg hover:bg-red-700 transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Export Schedule to PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

// SummaryTable Component
const SummaryTable = ({ scheduleData, predefinedShifts }) => {
    // Calculate counts for shifts, breaks, and lunches
    const shiftCounts = {};
    const breakCounts = {};
    const lunchCounts = {};

    // Initialize counts
    predefinedShifts.forEach(shift => {
        shiftCounts[shift.shift] = 0;
        if (shift.break !== '-') breakCounts[shift.break] = 0;
        if (shift.lunch !== '-') lunchCounts[shift.lunch] = 0;
    });

    // Populate counts based on current month's schedule
    Object.values(scheduleData).forEach(agentSchedule => {
        if (agentSchedule.shift) {
            shiftCounts[agentSchedule.shift]++;
        }
        if (agentSchedule.break && agentSchedule.break !== '-') {
            breakCounts[agentSchedule.break]++;
        }
        if (agentSchedule.lunch && agentSchedule.lunch !== '-') {
            lunchCounts[agentSchedule.lunch]++;
        }
    });

    // Sort breaks and lunches for consistent display
    const sortedBreaks = Object.keys(breakCounts).sort();
    const sortedLunches = Object.keys(lunchCounts).sort();

    return (
        <div className="mt-8 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <h2 className="text-xl font-semibold text-gray-800 p-4 bg-gray-50 border-b">Schedule Summary</h2>
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th rowSpan="2" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider align-bottom">Schedule Count</th>
                        <th colSpan="2" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Break</th>
                        <th colSpan="2" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Lunch</th>
                    </tr>
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {/* Combine break and lunch times for rows */}
                    {Array.from(new Set([...sortedBreaks, ...sortedLunches])).map((time, index) => (
                        <tr key={time} className="hover:bg-gray-50">
                            {index === 0 && (
                                <td rowSpan={Array.from(new Set([...sortedBreaks, ...sortedLunches])).length} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 align-top">
                                    <div className="flex items-center justify-center h-full">
                                        <span className="transform -rotate-90 origin-center text-lg font-bold">Schedule Count</span>
                                    </div>
                                </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{time}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{breakCounts[time] || 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{time}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lunchCounts[time] || 0}</td>
                        </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="bg-gray-100 font-bold">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td>
                        <td colSpan="2" className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">Total Breaks: {Object.values(breakCounts).reduce((sum, count) => sum + count, 0)}</td>
                        <td colSpan="2" className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">Total Lunches: {Object.values(lunchCounts).reduce((sum, count) => sum + count, 0)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};


export default App;
