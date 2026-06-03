import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";

interface SyncIndicatorProps {
  token: string;
  className?: string;
  pollMs?: number;
}

interface SyncIndicatorResponse {
  enabled: boolean;
  hasClinicContext: boolean;
  inProgress: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastPullCount: number;
  lastPushCount: number;
  pendingOutbox: number;
}

export function SyncIndicator({ token, className = "", pollMs = 8000 }: SyncIndicatorProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SyncIndicatorResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const fetchSyncIndicator = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const res = await fetch("http://127.0.0.1:4000/sync/indicator", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to fetch sync status");
      }

      setStatus({
        enabled: Boolean(data.enabled),
        hasClinicContext: Boolean(data.hasClinicContext),
        inProgress: Boolean(data.inProgress),
        lastSyncAt: data.lastSyncAt || null,
        lastSyncError: data.lastSyncError || null,
        lastPullCount: Number(data.lastPullCount || 0),
        lastPushCount: Number(data.lastPushCount || 0),
        pendingOutbox: Number(data.pendingOutbox || 0)
      });
      setRequestError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync status unavailable";
      setRequestError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchSyncIndicator(true);

    const interval = window.setInterval(() => {
      void fetchSyncIndicator(false);
    }, pollMs);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void fetchSyncIndicator(false);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchSyncIndicator, pollMs]);

  const display = useMemo(() => {
    if (requestError) {
      return {
        label: "Sync Issue",
        detail: requestError,
        icon: AlertTriangle,
        className: "border-rose-200 bg-rose-50 text-rose-700",
        iconClassName: "text-rose-600"
      };
    }

    if (loading && !status) {
      return {
        label: "Checking Sync",
        detail: "Loading",
        icon: RefreshCw,
        className: "border-slate-200 bg-slate-50 text-slate-700",
        iconClassName: "text-slate-500 animate-spin"
      };
    }

    if (!status) {
      return {
        label: "Sync Unknown",
        detail: "No status",
        icon: CloudOff,
        className: "border-slate-200 bg-slate-50 text-slate-700",
        iconClassName: "text-slate-500"
      };
    }

    if (status.lastSyncError) {
      return {
        label: "Sync Error",
        detail: status.lastSyncError,
        icon: AlertTriangle,
        className: "border-rose-200 bg-rose-50 text-rose-700",
        iconClassName: "text-rose-600"
      };
    }

    if (!status.enabled || !status.hasClinicContext) {
      return {
        label: "Sync Offline",
        detail: "Cloud sync not linked",
        icon: CloudOff,
        className: "border-slate-200 bg-slate-50 text-slate-700",
        iconClassName: "text-slate-500"
      };
    }

    if (status.inProgress) {
      return {
        label: "Syncing",
        detail: `Pull ${status.lastPullCount} | Push ${status.lastPushCount}`,
        icon: RefreshCw,
        className: "border-amber-200 bg-amber-50 text-amber-800",
        iconClassName: "text-amber-600 animate-spin"
      };
    }

    if (status.pendingOutbox > 0) {
      return {
        label: `Pending ${status.pendingOutbox}`,
        detail: "Waiting to upload",
        icon: RefreshCw,
        className: "border-blue-200 bg-blue-50 text-blue-800",
        iconClassName: "text-blue-600"
      };
    }

    const lastSyncText = status.lastSyncAt
      ? `Last ${new Date(status.lastSyncAt).toLocaleTimeString()}`
      : "Synced";

    return {
      label: "Up To Date",
      detail: lastSyncText,
      icon: CheckCircle2,
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      iconClassName: "text-emerald-600"
    };
  }, [loading, requestError, status]);

  const Icon = display.icon;

  return (
    <div
      title={display.detail}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${display.className} ${className}`.trim()}
    >
      <Icon className={`h-3.5 w-3.5 ${display.iconClassName}`} />
      <span>{display.label}</span>
      <span className="hidden md:inline text-[11px] font-medium opacity-80">{display.detail}</span>
    </div>
  );
}
