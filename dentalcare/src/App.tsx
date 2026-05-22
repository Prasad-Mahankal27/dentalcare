import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster } from "react-hot-toast";

import DoctorDashboard from "./pages/DoctorDashboard";
import Login from "./pages/login";
import ReceptionDashboard from "./pages/ReceptionDashboard";
import VisitWorkflow from "./components/VisitWorkflow";
import VisitDetails from "./pages/VisitDetails";
import PatientVisitsPage from "./pages/PatientVisitPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import DoctorsPage from "./pages/DoctorsPage";
import AppointmentDetailsPage from "./pages/AppointmentDetailsPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  const [user, setUser] = useState<any>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  // Debugging helper
  useEffect(() => {
    if (user) {
      console.log("Logged in user role:", user.role);
    }
  }, [user]);

  function handleLogin(data: any) {
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  }

  function handleLogout() {
    localStorage.removeItem("user");
    setUser(null);
  }

  // 1. If no user, show Login page
  if (!user) {
    return (
      <>
        <Toaster />
        <Login onLogin={handleLogin} />
      </>
    );
  }

  const isDoctor = user.role === "DOCTOR";
  const isReception = user.role === "RECEPTION" || user.role === "RECEPTIONIST";

  return (
    <>
      <Toaster />
      <Routes>
      {/* Root redirect logic */}
      <Route
        path="/"
        element={
          isDoctor ? (
            <Navigate replace to="/doctor" />
          ) : isReception ? (
            <Navigate replace to="/reception" />
          ) : (
            <div style={{ padding: 20 }}>
              <p>Unknown Role: {user.role}</p>
              <button onClick={handleLogout}>Logout</button>
            </div>
          )
        }
      />

      {/* Doctor Routes */}
      {isDoctor && (
        <>
          <Route path="/doctor" element={<DoctorDashboard user={user} />} />
          <Route path="/doctor/appointments" element={<AppointmentsPage user={user} />} />
          <Route path="/doctor/appointments/:appointmentId" element={<AppointmentDetailsPage user={user} />} />
          <Route path="/doctor/doctors" element={<DoctorsPage user={user} />} />
          <Route path="/doctor/settings" element={<SettingsPage user={user} onLogout={handleLogout} />} />
          <Route path="/doctor/visit/:visitId/view" element={<VisitDetails />} />
          <Route path="/doctor/visit/:visitId/workflow" element={<VisitWorkflow token={user.token} />} />
        </>
      )}

      {/* Reception Routes */}
      {isReception && (
        <>
          <Route path="/reception" element={<ReceptionDashboard user={user} />} />
          <Route path="/reception/settings" element={<SettingsPage user={user} onLogout={handleLogout} />} />
        </>
      )}

      {/* Catch-all: Redirects to appropriate dashboard based on role to prevent blank screens */}
      <Route
        path="*"
        element={
          isDoctor ? (
            <Navigate replace to="/doctor" />
          ) : (
            <Navigate replace to="/reception" />
          )
        }
      />

      <Route
  path="/doctor/patient/:patientId"
  element={<PatientVisitsPage token={user.token} />}
/>
      </Routes>
    </>
  );
}

export default App;