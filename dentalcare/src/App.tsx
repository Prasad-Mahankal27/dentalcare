import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";

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
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsersPage from "./pages/AdminUsersPage";

let hasPlayedStartupMusic = false;
const SUBSCRIPTION_CHECK_INTERVAL_MS = 30 * 1000;
const DEFAULT_UPGRADE_URL = "https://orisyn.parallaxstudio.co.in";

interface SubscriptionStatusPayload {
  outOfLimit?: boolean;
  message?: string;
  reasonCodes?: string[];
  upgradeUrl?: string;
}

function App() {
  const [user, setUser] = useState<any>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatusPayload | null>(null);

  useEffect(() => {
    if (hasPlayedStartupMusic) {
      return;
    }

    hasPlayedStartupMusic = true;
    const startupAudio = new Audio("/Startup.mp3");
    void startupAudio.play().catch((error) => {
      console.warn("Startup music playback failed:", error);
    });
  }, []);

  // Debugging helper
  useEffect(() => {
    if (user) {
      console.log("Logged in user role:", user.role);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.token) {
      setSubscriptionStatus(null);
      return;
    }

    let disposed = false;

    const fetchSubscriptionStatus = async () => {
      try {
        const res = await fetch("http://127.0.0.1:4000/subscription/status", {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (!disposed) {
          setSubscriptionStatus(data || null);
        }
      } catch {
        // Ignore transient subscription polling errors.
      }
    };

    void fetchSubscriptionStatus();
    const intervalId = window.setInterval(() => {
      void fetchSubscriptionStatus();
    }, SUBSCRIPTION_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [user?.token]);

  function handleLogin(data: any) {
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  }

  function handleLogout() {
    localStorage.removeItem("user");
    setUser(null);
    window.location.replace("/");
  }

  async function handleUpgrade() {
    const targetUrl = String(subscriptionStatus?.upgradeUrl || DEFAULT_UPGRADE_URL).trim() || DEFAULT_UPGRADE_URL;

    try {
      if (window.ipcRenderer?.invoke) {
        await window.ipcRenderer.invoke("app:open-external", targetUrl);
        return;
      }
    } catch {
      // Fall back to browser navigation.
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  async function handleExitApp() {
    try {
      if (window.ipcRenderer?.invoke) {
        await window.ipcRenderer.invoke("app:exit");
        return;
      }
    } catch {
      // Fall back to local logout in browser context.
    }

    handleLogout();
  }

  // 1. If no user, show Login page
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const isDoctor = user.role === "DOCTOR";
  const isAdmin = user.role === "ADMIN";
  const isReception = user.role === "RECEPTION" || user.role === "RECEPTIONIST";
  const isOutOfLimit = Boolean(subscriptionStatus?.outOfLimit);
  const outOfLimitReasonCodes = Array.isArray(subscriptionStatus?.reasonCodes)
    ? subscriptionStatus.reasonCodes
    : [];
  const outOfLimitMessage =
    String(subscriptionStatus?.message || "").trim() ||
    (outOfLimitReasonCodes.includes("PLAN_EXPIRED")
      ? "Your clinic subscription has expired. Upgrade to continue using Orisyn."
      : "Your clinic account is out of plan limits. Upgrade to continue using Orisyn.");

  return (
    <>
      <Routes>
        {/* Root redirect logic */}
        <Route
          path="/"
          element={
            isDoctor ? (
              <Navigate replace to="/doctor" />
            ) : isAdmin ? (
              <Navigate replace to="/admin" />
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
            <Route path="/doctor/patient/:patientId" element={<PatientVisitsPage token={user.token} />} />
          </>
        )}

        {/* Admin Routes */}
        {isAdmin && (
          <>
            <Route path="/admin" element={<AdminDashboard user={user} />} />
            <Route path="/admin/users" element={<AdminUsersPage user={user} />} />
            <Route path="/admin/settings" element={<SettingsPage user={user} onLogout={handleLogout} />} />
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
            ) : isAdmin ? (
              <Navigate replace to="/admin" />
            ) : (
              <Navigate replace to="/reception" />
            )
          }
        />

      </Routes>

      {isOutOfLimit && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-slate-900">Subscription Action Required</h2>
            <p className="mt-3 text-sm text-slate-700">{outOfLimitMessage}</p>
            <p className="mt-2 text-xs text-slate-500">To continue, upgrade the clinic subscription or exit the app.</p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={handleExitApp}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Exit App
              </button>
              <button
                onClick={() => void handleUpgrade()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;