import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Settings as SettingsIcon
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";

interface SettingsPageProps {
  user: any;
  onLogout: () => void;
}

interface UpdateStatusPayload {
  status: string;
  version?: string;
  percent?: number;
  message?: string;
}

interface ManualCheckResult {
  ok: boolean;
  message?: string;
}

interface UpiConfigResult {
  ok: boolean;
  upiId?: string;
  upiName?: string;
  message?: string;
}

interface UpiUpdateResult {
  ok: boolean;
  message?: string;
}

interface UpiNoticeState {
  tone: "idle" | "success" | "error";
  message: string;
}

function formatUpdateStatus(payload: UpdateStatusPayload): string {
  switch (payload.status) {
    case "checking":
      return "Checking for updates...";
    case "available":
      return payload.version ? `Update available: v${payload.version}` : "Update available";
    case "not-available":
      return "You are on the latest version";
    case "downloading":
      return typeof payload.percent === "number"
        ? `Downloading update (${payload.percent.toFixed(1)}%)`
        : "Downloading update...";
    case "downloaded":
      return payload.version
        ? `Update v${payload.version} downloaded. Installing now...`
        : "Update downloaded. Installing now...";
    case "disabled":
      return payload.message || "Auto updates are disabled in development mode.";
    case "error":
      return payload.message || "Update check failed.";
    default:
      return "Idle";
  }
}

function statusToneClasses(status: string): string {
  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "available" || status === "downloading" || status === "downloaded") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "not-available") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const navigate = useNavigate();
  const isDoctor = user.role === "DOCTOR";
  const isAdmin = user.role === "ADMIN";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [version, setVersion] = useState("Loading...");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload>({ status: "idle" });
  const [isChecking, setIsChecking] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [upiName, setUpiName] = useState("");
  const [isLoadingUpi, setIsLoadingUpi] = useState(false);
  const [isSavingUpi, setIsSavingUpi] = useState(false);
  const [upiNotice, setUpiNotice] = useState<UpiNoticeState>({ tone: "idle", message: "" });

  const statusText = useMemo(() => formatUpdateStatus(updateStatus), [updateStatus]);
  const backPath = isAdmin ? "/admin" : isDoctor ? "/doctor" : "/reception";

  useEffect(() => {
    let active = true;

    const updateListener = (_event: unknown, payload: UpdateStatusPayload) => {
      if (!active || !payload || typeof payload !== "object") {
        return;
      }

      if (typeof payload.status === "string") {
        setUpdateStatus(payload);
      }
    };

    window.ipcRenderer.on("auto-update-status", updateListener as any);

    void (async () => {
      try {
        const [appVersion, updaterStatus] = await Promise.all([
          window.ipcRenderer.invoke("app:get-version"),
          window.ipcRenderer.invoke("updater:get-status")
        ]);

        if (!active) {
          return;
        }

        if (typeof appVersion === "string" && appVersion.trim()) {
          setVersion(appVersion);
        }

        if (
          updaterStatus &&
          typeof updaterStatus === "object" &&
          "status" in updaterStatus &&
          typeof (updaterStatus as UpdateStatusPayload).status === "string"
        ) {
          setUpdateStatus(updaterStatus as UpdateStatusPayload);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to read updater status";
        setUpdateStatus({ status: "error", message });
      }
    })();

    if (isAdmin) {
      setIsLoadingUpi(true);

      void (async () => {
        try {
          const upiConfig = await window.ipcRenderer.invoke("upi:get-config") as UpiConfigResult;
          if (!active) {
            return;
          }

          if (upiConfig.ok) {
            setUpiId(typeof upiConfig.upiId === "string" ? upiConfig.upiId : "");
            setUpiName(typeof upiConfig.upiName === "string" ? upiConfig.upiName : "");
            return;
          }

          setUpiNotice({
            tone: "error",
            message: upiConfig.message || "Unable to load UPI settings"
          });
        } catch (error) {
          if (!active) {
            return;
          }

          const message = error instanceof Error ? error.message : "Unable to load UPI settings";
          setUpiNotice({ tone: "error", message });
        } finally {
          if (active) {
            setIsLoadingUpi(false);
          }
        }
      })();
    }

    return () => {
      active = false;
      window.ipcRenderer.off("auto-update-status", updateListener as any);
    };
  }, [isAdmin]);

  async function checkForUpdates() {
    setIsChecking(true);

    try {
      const result = await window.ipcRenderer.invoke("updater:check") as ManualCheckResult;
      if (!result.ok) {
        setUpdateStatus({
          status: "error",
          message: result.message || "Could not check for updates"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check for updates";
      setUpdateStatus({ status: "error", message });
    } finally {
      setIsChecking(false);
    }
  }

  async function saveUpiSettings() {
    if (!isAdmin) {
      setUpiNotice({
        tone: "error",
        message: "Only admins can update UPI settings."
      });
      return;
    }

    const trimmedUpiId = upiId.trim();
    const trimmedUpiName = upiName.trim();

    if (!trimmedUpiId || !trimmedUpiName) {
      setUpiNotice({
        tone: "error",
        message: "UPI ID and UPI name are required."
      });
      return;
    }

    setIsSavingUpi(true);
    setUpiNotice({ tone: "idle", message: "" });

    try {
      const result = await window.ipcRenderer.invoke("upi:update-config", {
        upiId: trimmedUpiId,
        upiName: trimmedUpiName
      }) as UpiUpdateResult;

      if (!result.ok) {
        setUpiNotice({
          tone: "error",
          message: result.message || "Failed to update UPI settings"
        });
        return;
      }

      setUpiId(trimmedUpiId);
      setUpiName(trimmedUpiName);
      setUpiNotice({
        tone: "success",
        message: result.message || "UPI settings saved and service restarted."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update UPI settings";
      setUpiNotice({ tone: "error", message });
    } finally {
      setIsSavingUpi(false);
    }
  }

  const settingsCard = (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <SettingsIcon className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-slate-900">Application Settings</h2>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Version</p>
          <p className="mt-1 text-lg font-bold text-slate-900">v{version}</p>
        </div>

        <div className={`rounded-xl border px-4 py-3 ${statusToneClasses(updateStatus.status)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">Update Status</p>
          <p className="mt-1 text-sm font-medium">{statusText}</p>
          {typeof updateStatus.percent === "number" && updateStatus.status === "downloading" && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${Math.max(0, Math.min(100, updateStatus.percent))}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={checkForUpdates}
            disabled={isChecking}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isChecking ? "Checking..." : "Check for Updates"}
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Download className="h-3.5 w-3.5" />
            Updates are downloaded and installed automatically when available
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">UPI Payment Receiver</p>
            <p className="mt-1 text-sm text-slate-600">
              Save your UPI ID and payee name here. Only the UPI payment service is restarted after saving.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="doctor-upi-id">
                UPI ID
                <input
                  id="doctor-upi-id"
                  value={upiId}
                  onChange={(event) => setUpiId(event.target.value)}
                  placeholder="name@bank"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700" htmlFor="doctor-upi-name">
                Payee Name
                <input
                  id="doctor-upi-name"
                  value={upiName}
                  onChange={(event) => setUpiName(event.target.value)}
                  placeholder="Clinic or doctor name"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

            {upiNotice.message && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  upiNotice.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {upiNotice.message}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={saveUpiSettings}
                disabled={isSavingUpi || isLoadingUpi}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {(isSavingUpi || isLoadingUpi) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSavingUpi
                  ? "Saving and restarting..."
                  : isLoadingUpi
                    ? "Loading UPI settings..."
                    : "Save & Restart UPI Service"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isDoctor || isAdmin) {
    return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar
          role={isAdmin ? "ADMIN" : "DOCTOR"}
          activeItem="Settings"
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={onLogout}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="h-14 border-b bg-white px-3 sm:px-6">
            <div className="mx-auto flex h-full max-w-5xl items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded p-2 transition hover:bg-slate-100 lg:hidden"
                >
                  <Menu className="h-5 w-5 text-slate-700" />
                </button>
                <h1 className="text-base font-semibold text-slate-900">Settings</h1>
              </div>

              <button
                onClick={() => navigate(backPath)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          </div>

          <main className="flex-1 overflow-y-auto p-4 lg:p-8">
            <div className="mx-auto max-w-5xl">
              {settingsCard}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button
            onClick={() => navigate(backPath)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        {settingsCard}
      </div>
    </div>
  );
}
