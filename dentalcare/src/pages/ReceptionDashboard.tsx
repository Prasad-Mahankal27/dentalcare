import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardPlus,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  User,
  X
} from "lucide-react";

type GenderOption = "" | "Male" | "Female" | "Other";
type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";
type StatusFilter = AppointmentStatus | "all";

interface ReceptionDashboardProps {
  user: {
    token: string;
    role: string;
  };
}

interface AppointmentFormState {
  name: string;
  phone: string;
  age: string;
  gender: GenderOption;
  address: string;
  date: string;
  timeSlot: string;
  reason: string;
}

interface BackendAppointment {
  appointmentId: string;
  patientName?: string | null;
  patientPhone?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  patientAddress?: string | null;
  scheduledAt: string;
  status: string;
  source?: string | null;
  reason?: string | null;
  patient?: {
    patientId?: string;
    name?: string;
    phone?: string;
  } | null;
}

interface Appointment {
  id: string;
  patientId: string;
  name: string;
  phone: string;
  age: string;
  gender: GenderOption;
  address: string;
  date: string;
  timeSlot: string;
  status: AppointmentStatus;
  source: string;
  reason: string;
  createdAt: string;
}

const ALL_STATUSES: StatusFilter[] = ["all", "pending", "confirmed", "completed", "cancelled"];

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; badgeClass: string; tileClass: string }> = {
  pending: {
    label: "Pending",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    tileClass: "border-amber-200 bg-amber-50"
  },
  confirmed: {
    label: "Confirmed",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    tileClass: "border-emerald-200 bg-emerald-50"
  },
  completed: {
    label: "Completed",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
    tileClass: "border-sky-200 bg-sky-50"
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
    tileClass: "border-rose-200 bg-rose-50"
  }
};

const INITIAL_APPOINTMENT_FORM: AppointmentFormState = {
  name: "",
  phone: "",
  age: "",
  gender: "",
  address: "",
  date: "",
  timeSlot: "",
  reason: ""
};

function buildTimeSlots(): string[] {
  const slots: string[] = [];
  const startMinutes = 10 * 60;
  const endMinutes = 18 * 60;

  for (let minutes = startMinutes; minutes < endMinutes; minutes += 20) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  return slots;
}

function formatTimeSlot(timeValue: string): string {
  const [hourText, minuteText] = timeValue.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return timeValue;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return new Date();
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function toTimeKey(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function mapBackendStatus(rawStatus: string): AppointmentStatus {
  const normalized = String(rawStatus || "").trim().toUpperCase();

  if (normalized === "REQUESTED") {
    return "pending";
  }

  if (normalized === "CONFIRMED") {
    return "confirmed";
  }

  if (normalized === "COMPLETED") {
    return "completed";
  }

  return "cancelled";
}

function normalizeGender(rawGender: string | null | undefined): GenderOption {
  const normalized = String(rawGender || "").trim().toLowerCase();
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  if (normalized === "other") return "Other";
  return "";
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatChipDate(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

export default function ReceptionDashboard({ user }: ReceptionDashboardProps) {
  const token = user.token;

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [appointmentDates, setAppointmentDates] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentFormState>(INITIAL_APPOINTMENT_FORM);
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const dateStr = toDateKey(selectedDate);
  const timeSlots = useMemo(() => buildTimeSlots(), []);

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.date === dateStr)
      .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot)),
    [appointments, dateStr]
  );

  const filteredAppointments = useMemo(
    () => (statusFilter === "all" ? dayAppointments : dayAppointments.filter((a) => a.status === statusFilter)),
    [dayAppointments, statusFilter]
  );

  const stats = useMemo(() => {
    const base = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0
    };

    dayAppointments.forEach((appointment) => {
      base[appointment.status] += 1;
    });

    return base;
  }, [dayAppointments]);

  const bookedSlots = useMemo(
    () => dayAppointments.filter((appointment) => appointment.status !== "cancelled").map((appointment) => appointment.timeSlot),
    [dayAppointments]
  );

  function updateAppointmentField(key: keyof AppointmentFormState, value: string) {
    setAppointmentForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleLogout() {
    localStorage.removeItem("user");
    window.location.reload();
  }

  async function fetchDayAppointments(day: Date, showLoader = true) {
    if (showLoader) {
      setAppointmentsLoading(true);
    }

    setAppointmentsError(null);

    try {
      const requestedDate = toDateKey(day);
      const res = await fetch(`http://localhost:4000/appointments/day?date=${requestedDate}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to load appointments");
      }

      const mapped: Appointment[] = (Array.isArray(data.appointments) ? data.appointments : [])
        .map((entry: BackendAppointment) => {
          const scheduled = new Date(entry.scheduledAt);
          const hasValidDate = !Number.isNaN(scheduled.getTime());

          return {
            id: entry.appointmentId,
            patientId: String(entry.patient?.patientId || ""),
            name: String(entry.patient?.name || entry.patientName || "Unknown"),
            phone: String(entry.patient?.phone || entry.patientPhone || "-"),
            age: entry.patientAge ? String(entry.patientAge) : "-",
            gender: normalizeGender(entry.patientGender),
            address: String(entry.patientAddress || ""),
            date: hasValidDate ? toDateKey(scheduled) : requestedDate,
            timeSlot: hasValidDate ? toTimeKey(scheduled) : "",
            status: mapBackendStatus(entry.status),
            source: String(entry.source || "FRONT_DESK"),
            reason: String(entry.reason || "-"),
            createdAt: entry.scheduledAt
          };
        });

      setAppointments(mapped);
    } catch (err) {
      setAppointments([]);
      const message = err instanceof Error ? err.message : "Failed to load appointments";
      setAppointmentsError(message);
    } finally {
      if (showLoader) {
        setAppointmentsLoading(false);
      }
    }
  }

  async function fetchAppointmentDates() {
    try {
      const res = await fetch("http://localhost:4000/appointments?limit=500", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json().catch(() => ({}));
      const uniqueDates = new Set<string>();

      const items = Array.isArray(data.appointments) ? data.appointments : [];
      items.forEach((entry: BackendAppointment) => {
        const scheduled = new Date(entry.scheduledAt);
        if (!Number.isNaN(scheduled.getTime())) {
          uniqueDates.add(toDateKey(scheduled));
        }
      });

      setAppointmentDates(Array.from(uniqueDates).sort((a, b) => a.localeCompare(b)));
    } catch {
      setAppointmentDates([]);
    }
  }

  async function refreshDashboard(showLoader = true) {
    await Promise.all([fetchDayAppointments(selectedDate, showLoader), fetchAppointmentDates()]);
  }

  function openRescheduleDialog(appointment: Appointment) {
    setAppointmentError(null);
    setAppointmentMessage(null);
    setRescheduleTarget(appointment);
    setRescheduleDate(appointment.date);
    setRescheduleTime(appointment.timeSlot);
    setRescheduleOpen(true);
  }

  function closeRescheduleDialog() {
    setRescheduleOpen(false);
    setRescheduleTarget(null);
    setRescheduleDate("");
    setRescheduleTime("");
  }

  async function completeAppointment(appointmentId: string) {
    const actionId = `complete:${appointmentId}`;
    setActionLoadingId(actionId);
    setAppointmentError(null);
    setAppointmentMessage(null);

    try {
      const res = await fetch(`http://localhost:4000/appointments/${appointmentId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to complete appointment");
      }

      setAppointmentMessage(`Appointment ${appointmentId} marked as completed.`);
      await refreshDashboard(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete appointment";
      setAppointmentError(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function cancelAppointment(appointmentId: string) {
    const actionId = `cancel:${appointmentId}`;
    setActionLoadingId(actionId);
    setAppointmentError(null);
    setAppointmentMessage(null);

    try {
      const res = await fetch(`http://localhost:4000/appointments/${appointmentId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to cancel appointment");
      }

      setAppointmentMessage(`Appointment ${appointmentId} cancelled.`);
      await refreshDashboard(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel appointment";
      setAppointmentError(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function deleteAppointment(appointmentId: string) {
    const shouldDelete = window.confirm(
      "Delete this appointment permanently? If it is linked to a visit, deletion will be blocked."
    );
    if (!shouldDelete) {
      return;
    }

    const actionId = `delete:${appointmentId}`;
    setActionLoadingId(actionId);
    setAppointmentError(null);
    setAppointmentMessage(null);

    try {
      const res = await fetch(`http://localhost:4000/appointments/${appointmentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete appointment");
      }

      setAppointmentMessage(`Appointment ${appointmentId} deleted.`);
      await refreshDashboard(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete appointment";
      setAppointmentError(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function submitReschedule() {
    if (!rescheduleTarget) {
      return;
    }

    setAppointmentError(null);
    setAppointmentMessage(null);

    if (!rescheduleDate || !rescheduleTime) {
      setAppointmentError("Please select both date and time for rescheduling.");
      return;
    }

    const updatedDateTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
    if (Number.isNaN(updatedDateTime.getTime())) {
      setAppointmentError("Invalid reschedule date or time.");
      return;
    }

    const actionId = `reschedule:${rescheduleTarget.id}`;
    setActionLoadingId(actionId);

    try {
      const res = await fetch(`http://localhost:4000/appointments/${rescheduleTarget.id}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          preferredDateTime: updatedDateTime.toISOString()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to reschedule appointment");
      }

      closeRescheduleDialog();
      setAppointmentMessage(`Appointment ${rescheduleTarget.id} rescheduled successfully.`);
      await refreshDashboard(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reschedule appointment";
      setAppointmentError(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function bookAppointment() {
    setAppointmentLoading(true);
    setAppointmentError(null);
    setAppointmentMessage(null);

    try {
      const requiredFields = [
        appointmentForm.name,
        appointmentForm.phone,
        appointmentForm.age,
        appointmentForm.gender,
        appointmentForm.date,
        appointmentForm.timeSlot,
        appointmentForm.reason
      ];

      if (requiredFields.some((value) => !String(value || "").trim())) {
        throw new Error("Name, phone, age, gender, date, time slot, and chief complaint are required.");
      }

      const preferredDateTime = new Date(`${appointmentForm.date}T${appointmentForm.timeSlot}:00`);
      if (Number.isNaN(preferredDateTime.getTime())) {
        throw new Error("Invalid appointment date or time slot.");
      }

      const res = await fetch("http://localhost:4000/appointments/reception/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: appointmentForm.name.trim(),
          phone: appointmentForm.phone.trim(),
          age: Number(appointmentForm.age),
          gender: appointmentForm.gender,
          address: appointmentForm.address.trim(),
          preferredDateTime: preferredDateTime.toISOString(),
          reason: appointmentForm.reason.trim()
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Appointment booking failed");
      }

      setAppointmentMessage(
        `Appointment booked and confirmed. Ref: ${data.appointmentId} | Patient: ${data.patientId}`
      );
      setAppointmentForm(INITIAL_APPOINTMENT_FORM);
      setFormOpen(false);

      if (appointmentForm.date === dateStr) {
        await fetchDayAppointments(selectedDate, false);
      }
      await fetchAppointmentDates();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Appointment booking failed";
      setAppointmentError(message);
    } finally {
      setAppointmentLoading(false);
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, [selectedDate, token]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshDashboard(false);
    }, 20000);

    return () => clearInterval(interval);
  }, [selectedDate, token]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:gap-6">
        <aside className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm md:w-80 md:shrink-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              Reception Appointments
            </h1>
            <p className="mt-1 text-xs text-slate-500">Front desk planner for bookings and check-ins.</p>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Selected Date
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={(event) => setSelectedDate(parseDateKey(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setSelectedDate(new Date())}
                className="mt-2 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Jump to Today
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Booked Dates</p>
              <div className="flex flex-wrap gap-2">
                {appointmentDates.length === 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
                    No recent bookings
                  </span>
                ) : (
                  appointmentDates.slice(0, 10).map((dateKey) => (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setSelectedDate(parseDateKey(dateKey))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        dateKey === dateStr
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                      }`}
                    >
                      {formatChipDate(dateKey)}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day Snapshot</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{formatLongDate(selectedDate)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(Object.keys(stats) as AppointmentStatus[]).map((status) => {
                  const config = STATUS_CONFIG[status];
                  return (
                    <div key={status} className={`rounded-lg border px-2 py-2 ${config.tileClass}`}>
                      <p className="text-lg font-bold text-slate-900">{stats[status]}</p>
                      <p className="text-xs font-medium text-slate-600">{config.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs text-slate-500">Logged in as</p>
              <p className="text-sm font-semibold text-slate-800">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col gap-4">
          <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedDate.toLocaleDateString("en-IN", {
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                })}
              </h2>
              <p className="text-sm text-slate-500">
                {dayAppointments.length} appointment{dayAppointments.length === 1 ? "" : "s"} scheduled
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => refreshDashboard()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={() => {
                  setAppointmentError(null);
                  setAppointmentMessage(null);
                  setAppointmentForm((prev) => ({
                    ...prev,
                    date: prev.date || dateStr
                  }));
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Appointment
              </button>
            </div>
          </header>

          {appointmentMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {appointmentMessage}
            </div>
          )}

          {appointmentsError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {appointmentsError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(Object.keys(stats) as AppointmentStatus[]).map((status) => {
              const config = STATUS_CONFIG[status];
              const isActive = statusFilter === status;

              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter((prev) => (prev === status ? "all" : status))}
                  className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${
                    isActive
                      ? `${config.tileClass} ring-2 ring-blue-200`
                      : "border-slate-200 bg-white hover:border-blue-200 hover:shadow"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{config.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stats[status]}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map((status) => {
                const isActive = statusFilter === status;
                const label = status === "all" ? "All" : STATUS_CONFIG[status].label;

                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {appointmentsLoading ? (
              <div className="flex h-full min-h-60 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading appointments...
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="flex h-full min-h-60 items-center justify-center px-4 text-center text-sm text-slate-500">
                No appointments found for this filter on the selected day.
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Time</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Patient</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Contact</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Reason</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Source</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAppointments.map((appointment) => {
                      const config = STATUS_CONFIG[appointment.status];
                      const canReschedule = appointment.status === "pending" || appointment.status === "confirmed";
                      const canComplete = appointment.status === "pending" || appointment.status === "confirmed";
                      const canCancel = appointment.status !== "cancelled";

                      const isRescheduleLoading = actionLoadingId === `reschedule:${appointment.id}`;
                      const isCompleteLoading = actionLoadingId === `complete:${appointment.id}`;
                      const isCancelLoading = actionLoadingId === `cancel:${appointment.id}`;
                      const isDeleteLoading = actionLoadingId === `delete:${appointment.id}`;

                      return (
                        <tr key={appointment.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {appointment.timeSlot ? formatTimeSlot(appointment.timeSlot) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{appointment.name}</p>
                            <p className="text-xs text-slate-500">ID: {appointment.id}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            <p>{appointment.phone || "-"}</p>
                            <p className="text-xs text-slate-500">
                              Age {appointment.age || "-"}
                              {appointment.gender ? ` | ${appointment.gender}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{appointment.reason || "-"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${config.badgeClass}`}
                            >
                              {config.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                            {appointment.source.replace(/_/g, " ")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => openRescheduleDialog(appointment)}
                                disabled={!canReschedule || isRescheduleLoading}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isRescheduleLoading ? "Rescheduling..." : "Reschedule"}
                              </button>

                              <button
                                type="button"
                                onClick={() => completeAppointment(appointment.id)}
                                disabled={!canComplete || isCompleteLoading}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                {isCompleteLoading ? "Completing..." : "Complete"}
                              </button>

                              <button
                                type="button"
                                onClick={() => cancelAppointment(appointment.id)}
                                disabled={!canCancel || isCancelLoading}
                                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isCancelLoading ? "Cancelling..." : "Cancel"}
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteAppointment(appointment.id)}
                                disabled={isDeleteLoading}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {isDeleteLoading ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 md:items-center">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <ClipboardPlus className="h-5 w-5 text-blue-600" />
                    New Appointment
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Patient profile is auto-created/updated when this booking is submitted.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              {appointmentError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {appointmentError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={appointmentForm.name}
                      onChange={(event) => updateAppointmentField("name", event.target.value)}
                      className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={appointmentForm.phone}
                      onChange={(event) => updateAppointmentField("phone", event.target.value)}
                      className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Age</label>
                  <input
                    type="number"
                    value={appointmentForm.age}
                    onChange={(event) => updateAppointmentField("age", event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Gender</label>
                  <select
                    value={appointmentForm.gender}
                    onChange={(event) => updateAppointmentField("gender", event.target.value as GenderOption)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    value={appointmentForm.date}
                    onChange={(event) => updateAppointmentField("date", event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Time Slot</label>
                  <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={appointmentForm.timeSlot}
                      onChange={(event) => updateAppointmentField("timeSlot", event.target.value)}
                      className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Select slot</option>
                      {timeSlots.map((slot) => {
                        const blocked = appointmentForm.date === dateStr && bookedSlots.includes(slot);

                        return (
                          <option key={slot} value={slot} disabled={blocked}>
                            {formatTimeSlot(slot)}{blocked ? " (Booked)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Address (Optional)</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <textarea
                      rows={2}
                      value={appointmentForm.address}
                      onChange={(event) => updateAppointmentField("address", event.target.value)}
                      className="w-full resize-none rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Chief Complaint / Reason</label>
                <textarea
                  rows={3}
                  value={appointmentForm.reason}
                  onChange={(event) => updateAppointmentField("reason", event.target.value)}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={bookAppointment}
                disabled={appointmentLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {appointmentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {appointmentLoading ? "Booking..." : "Book Appointment (Confirmed)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rescheduleOpen && rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 md:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Reschedule Appointment</h3>
              <p className="mt-1 text-xs text-slate-500">
                Ref: {rescheduleTarget.id} | Patient: {rescheduleTarget.name}
              </p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(event) => setRescheduleDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Time Slot</label>
                <select
                  value={rescheduleTime}
                  onChange={(event) => setRescheduleTime(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select slot</option>
                  {timeSlots.map((slot) => {
                    const blockedByDay = rescheduleDate === dateStr && bookedSlots.includes(slot);
                    const isCurrentSlot = rescheduleTarget.date === rescheduleDate && rescheduleTarget.timeSlot === slot;
                    const blocked = blockedByDay && !isCurrentSlot;

                    return (
                      <option key={slot} value={slot} disabled={blocked}>
                        {formatTimeSlot(slot)}{blocked ? " (Booked)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeRescheduleDialog}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={submitReschedule}
                disabled={actionLoadingId === `reschedule:${rescheduleTarget.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoadingId === `reschedule:${rescheduleTarget.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {actionLoadingId === `reschedule:${rescheduleTarget.id}` ? "Saving..." : "Save Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
