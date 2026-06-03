import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  RefreshCw,
  Settings,
  Shield,
  Stethoscope,
  UserCog,
  Users
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";

interface AdminDashboardProps {
  user: {
    token: string;
    role: string;
    name?: string;
  };
}

interface UserSummary {
  totalUsers: number;
  totalDoctors: number;
  totalReceptionists: number;
  totalAdmins: number;
}

interface DashboardStats {
  appointments: number;
  operations: number;
  newPatients: number;
}

const EMPTY_SUMMARY: UserSummary = {
  totalUsers: 0,
  totalDoctors: 0,
  totalReceptionists: 0,
  totalAdmins: 0
};

const EMPTY_STATS: DashboardStats = {
  appointments: 0,
  operations: 0,
  newPatients: 0
};

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<UserSummary>(EMPTY_SUMMARY);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboardData(showSpinner = false) {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch("http://127.0.0.1:4000/users/summary", {
          headers: { Authorization: `Bearer ${user.token}` }
        }),
        fetch("http://127.0.0.1:4000/dashboard/stats", {
          headers: { Authorization: `Bearer ${user.token}` }
        })
      ]);

      if (!usersRes.ok) {
        const usersError = await usersRes.json().catch(() => ({}));
        throw new Error(usersError.message || "Failed to load users summary");
      }

      if (!statsRes.ok) {
        const statsError = await statsRes.json().catch(() => ({}));
        throw new Error(statsError.message || "Failed to load dashboard stats");
      }

      const usersData = await usersRes.json();
      const statsData = await statsRes.json();

      setSummary({
        totalUsers: Number(usersData.totalUsers || 0),
        totalDoctors: Number(usersData.totalDoctors || 0),
        totalReceptionists: Number(usersData.totalReceptionists || 0),
        totalAdmins: Number(usersData.totalAdmins || 0)
      });

      setStats({
        appointments: Number(statsData.appointments || 0),
        operations: Number(statsData.operations || 0),
        newPatients: Number(statsData.newPatients || 0)
      });

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load admin dashboard";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();

    const interval = window.setInterval(() => {
      void loadDashboardData();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  function logout() {
    localStorage.removeItem("user");
    window.location.replace("/");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        role="ADMIN"
        activeItem="Dashboard"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={logout}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="h-14 border-b bg-white px-3 sm:px-6">
          <div className="mx-auto flex h-full max-w-6xl items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded p-2 transition hover:bg-slate-100 lg:hidden"
              >
                <Menu className="h-5 w-5 text-slate-700" />
              </button>

              <div>
                <h1 className="text-base font-semibold text-slate-900">Admin Panel</h1>
                <p className="text-xs text-slate-500">Manage clinic users and global settings</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadDashboardData(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                onClick={() => navigate("/admin/settings")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Users</p>
                  <Users className="h-4 w-4 text-slate-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900">{loading ? "-" : summary.totalUsers}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admins</p>
                  <Shield className="h-4 w-4 text-slate-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900">{loading ? "-" : summary.totalAdmins}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctors</p>
                  <Stethoscope className="h-4 w-4 text-slate-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900">{loading ? "-" : summary.totalDoctors}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receptionists</p>
                  <UserCog className="h-4 w-4 text-slate-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900">{loading ? "-" : summary.totalReceptionists}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Appointments</p>
                <p className="mt-2 text-xl font-bold text-blue-900">{loading ? "-" : stats.appointments}</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completed Operations</p>
                <p className="mt-2 text-xl font-bold text-emerald-900">{loading ? "-" : stats.operations}</p>
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Patients</p>
                <p className="mt-2 text-xl font-bold text-violet-900">{loading ? "-" : stats.newPatients}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add doctors, receptionists, and other admins from the users section.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => navigate("/admin/users")}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Manage Users
                </button>
                <button
                  onClick={() => navigate("/admin/settings")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Open Settings
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
