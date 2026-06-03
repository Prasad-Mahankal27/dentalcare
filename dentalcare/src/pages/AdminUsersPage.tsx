import { useEffect, useMemo, useState } from "react";
import { Menu, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Sidebar } from "../components/Sidebar";

interface AdminUsersPageProps {
  user: {
    id?: number;
    token: string;
    role: string;
  };
}

type RoleOption = "ADMIN" | "DOCTOR" | "RECEPTIONIST";

interface UserRow {
  id: number;
  name: string;
  email?: string;
  phone: string;
  role: RoleOption;
  createdAt: string;
}

interface NewUserState {
  name: string;
  email: string;
  password: string;
  role: RoleOption;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  upgradeUrl?: string;
}

const ROLE_OPTIONS: RoleOption[] = ["ADMIN", "DOCTOR", "RECEPTIONIST"];

const INITIAL_NEW_USER: NewUserState = {
  name: "",
  email: "",
  password: "",
  role: "RECEPTIONIST"
};

const DEFAULT_UPGRADE_URL = "https://orisyn.parallaxstudio.co.in";

export default function AdminUsersPage({ user }: AdminUsersPageProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [showUpgradeCta, setShowUpgradeCta] = useState(false);
  const [upgradeUrl, setUpgradeUrl] = useState(DEFAULT_UPGRADE_URL);
  const [newUser, setNewUser] = useState<NewUserState>(INITIAL_NEW_USER);
  const [updatingRoleForId, setUpdatingRoleForId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const currentUserId = typeof user.id === "number" ? user.id : null;

  const roleCounts = useMemo(() => {
    return users.reduce(
      (acc, current) => {
        acc.total += 1;
        if (current.role === "ADMIN") {
          acc.admins += 1;
        } else if (current.role === "DOCTOR") {
          acc.doctors += 1;
        } else {
          acc.receptionists += 1;
        }
        return acc;
      },
      { total: 0, admins: 0, doctors: 0, receptionists: 0 }
    );
  }, [users]);

  async function fetchUsers(showRefreshing = false) {
    if (showRefreshing) {
      setRefreshing(true);
    }

    try {
      const res = await fetch("http://127.0.0.1:4000/users", {
        headers: { Authorization: `Bearer ${user.token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to load users");
      }

      setUsers(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function openUpgradePage(targetUrl: string) {
    const normalized = String(targetUrl || DEFAULT_UPGRADE_URL).trim() || DEFAULT_UPGRADE_URL;

    try {
      if (window.ipcRenderer?.invoke) {
        await window.ipcRenderer.invoke("app:open-external", normalized);
        return;
      }
    } catch {
      // Fall back to browser navigation.
    }

    window.open(normalized, "_blank", "noopener,noreferrer");
  }

  function resetUpgradeNotice() {
    setShowUpgradeCta(false);
    setUpgradeUrl(DEFAULT_UPGRADE_URL);
  }

  function setUpgradeNotice(payload?: ApiErrorPayload) {
    setNotice("Upgrade to add more users.");
    setShowUpgradeCta(true);
    setUpgradeUrl(String(payload?.upgradeUrl || DEFAULT_UPGRADE_URL).trim() || DEFAULT_UPGRADE_URL);
  }

  function logout() {
    localStorage.removeItem("user");
    window.location.replace("/");
  }

  async function addUser() {
    const name = newUser.name.trim();
    const email = newUser.email.trim().toLowerCase();
    const password = newUser.password;

    if (!name || !email || !password) {
      resetUpgradeNotice();
      setNotice("Name, email, and password are required.");
      return;
    }

    if (!/.+@.+\..+/.test(email)) {
      resetUpgradeNotice();
      setNotice("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    resetUpgradeNotice();
    setNotice("");

    try {
      const res = await fetch("http://127.0.0.1:4000/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role: newUser.role
        })
      });

      const data = (await res.json().catch(() => ({}))) as ApiErrorPayload;
      if (!res.ok) {
        if (data?.code === "SUBSCRIPTION_LIMIT_REACHED") {
          setUpgradeNotice(data);
          return;
        }

        throw new Error(data.message || "Failed to add user");
      }

      setNewUser(INITIAL_NEW_USER);
      setNotice("User added successfully.");
      resetUpgradeNotice();
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add user";
      setNotice(message);
      resetUpgradeNotice();
    } finally {
      setSaving(false);
    }
  }

  async function updateUserRole(userId: number, role: RoleOption) {
    setUpdatingRoleForId(userId);
    resetUpgradeNotice();
    setNotice("");

    try {
      const res = await fetch(`http://127.0.0.1:4000/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ role })
      });

      const data = (await res.json().catch(() => ({}))) as ApiErrorPayload;
      if (!res.ok) {
        if (data?.code === "SUBSCRIPTION_LIMIT_REACHED") {
          setUpgradeNotice(data);
          return;
        }

        throw new Error(data.message || "Failed to update role");
      }

      setUsers((previous) =>
        previous.map((row) => (row.id === userId ? { ...row, role } : row))
      );
      setNotice("Role updated successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update role";
      setNotice(message);
    } finally {
      setUpdatingRoleForId(null);
    }
  }

  async function deleteUser(row: UserRow) {
    if (currentUserId === row.id) {
      resetUpgradeNotice();
      setNotice("You cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(`Delete user ${row.name} (${row.email || row.phone})?`);
    if (!confirmed) {
      return;
    }

    setDeletingUserId(row.id);
    resetUpgradeNotice();
    setNotice("");

    try {
      const res = await fetch(`http://127.0.0.1:4000/users/${row.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${user.token}`
        }
      });

      const data = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete user");
      }

      setUsers((previous) => previous.filter((candidate) => candidate.id !== row.id));
      setNotice("User deleted successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
      setNotice(message);
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        role="ADMIN"
        activeItem="Users"
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
                <h1 className="text-base font-semibold text-slate-900">Users Management</h1>
                <p className="text-xs text-slate-500">Add and manage admin, doctor, and receptionist accounts</p>
              </div>
            </div>

            <button
              onClick={() => void fetchUsers(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                <div className="flex flex-wrap items-center gap-3">
                  <span>{notice}</span>
                  {showUpgradeCta && (
                    <button
                      onClick={() => void openUpgradePage(upgradeUrl)}
                      className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Upgrade
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Users</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{roleCounts.total}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admins</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{roleCounts.admins}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctors</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{roleCounts.doctors}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receptionists</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{roleCounts.receptionists}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Add New User</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <input
                  value={newUser.name}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Full name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={newUser.email}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Password"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <select
                  value={newUser.role}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value as RoleOption }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={addUser}
                disabled={saving}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <Plus className="h-4 w-4" />
                {saving ? "Adding..." : "Add User"}
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={5}>
                          Loading users...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={5}>
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((row) => (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-4 py-3 text-slate-700">{row.email || row.phone}</td>
                          <td className="px-4 py-3">
                            <select
                              value={row.role}
                              disabled={updatingRoleForId === row.id || deletingUserId === row.id}
                              onChange={(event) => {
                                const nextRole = event.target.value as RoleOption;
                                if (nextRole !== row.role) {
                                  void updateUserRole(row.id, nextRole);
                                }
                              }}
                              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => void deleteUser(row)}
                              disabled={deletingUserId === row.id || currentUserId === row.id}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              title={currentUserId === row.id ? "You cannot delete your own account" : "Delete user"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingUserId === row.id ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
