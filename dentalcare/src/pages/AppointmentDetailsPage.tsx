import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  MapPin,
  Phone,
  PlayCircle,
  User as UserIcon
} from "lucide-react";

import { Sidebar } from "../components/Sidebar";
import Header from "../components/Header";

interface AppointmentDetailsPageProps {
  user: {
    token: string;
    role: string;
  };
}

interface AppointmentDetails {
  id: number;
  appointmentId: string;
  patientName?: string | null;
  patientPhone: string;
  patientAge?: number | null;
  patientGender?: string | null;
  patientAddress?: string | null;
  scheduledAt: string;
  status: string;
  source: string;
  reason?: string | null;
  linkedVisitId?: string | null;
  doctor?: {
    id: number;
    name: string;
  } | null;
  patient?: {
    patientId: string;
    name: string;
    phone: string;
    age?: number | null;
    gender?: string | null;
    address?: string | null;
  } | null;
}

const STATUS_CLASS_MAP: Record<string, string> = {
  REQUESTED: "bg-amber-50 text-amber-700 border border-amber-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border border-blue-200",
  COMPLETED: "bg-green-50 text-green-700 border border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border border-red-200",
  NO_SHOW: "bg-gray-50 text-gray-700 border border-gray-200"
};

function formatStatus(status: string): string {
  if (status === "REQUESTED") return "Pending";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "COMPLETED") return "Completed";
  if (status === "NO_SHOW") return "No Show";
  if (status === "CANCELLED") return "Cancelled";
  return status;
}

function formatSource(source: string): string {
  return source
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(dateTimeIso: string): string {
  const parsed = new Date(dateTimeIso);
  if (Number.isNaN(parsed.getTime())) {
    return dateTimeIso;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

export default function AppointmentDetailsPage({ user }: AppointmentDetailsPageProps) {
  const token = user.token;
  const navigate = useNavigate();
  const { appointmentId = "" } = useParams<{ appointmentId: string }>();

  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get("query") || "";
  const [query, setQuery] = useState(queryFromUrl);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [startingVisit, setStartingVisit] = useState(false);

  const patientName = appointment?.patient?.name || appointment?.patientName || "Unknown";
  const patientPhone = appointment?.patient?.phone || appointment?.patientPhone || "-";
  const patientAge = appointment?.patient?.age ?? appointment?.patientAge;
  const patientGender = appointment?.patient?.gender || appointment?.patientGender || "-";
  const patientAddress = appointment?.patient?.address || appointment?.patientAddress || "Not provided";

  const canStartVisit = useMemo(() => {
    if (!appointment) {
      return false;
    }
    return !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status);
  }, [appointment]);

  function searchPatient() {
    if (!query.trim()) return;
    navigate(`/doctor/patient/${query}`);
  }

  function logout() {
    localStorage.removeItem("user");
    window.location.reload();
  }

  const fetchAppointment = async () => {
    if (!appointmentId) {
      setErrorMessage("Missing appointment ID");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const res = await fetch(`http://localhost:4000/appointments/${appointmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load appointment details");
      }

      setAppointment(data as AppointmentDetails);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load appointment details";
      setErrorMessage(message);
      setAppointment(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointment();
  }, [appointmentId, token]);

  async function startVisitFromAppointment() {
    if (!appointment) {
      return;
    }

    setStartingVisit(true);
    setActionError("");
    setActionMessage("");

    try {
      const res = await fetch(`http://localhost:4000/appointments/${appointment.appointmentId}/start-visit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ visitType: "NEW" })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to start visit from appointment");
      }

      const visitId = data.visitId as string | undefined;
      if (!visitId) {
        throw new Error("Visit started but visit ID is missing in response");
      }

      const message = data.alreadyStarted
        ? "Visit was already started. Redirecting to workflow."
        : "Visit started successfully. Redirecting to workflow.";
      setActionMessage(message);
      toast.success(message);
      navigate(`/doctor/visit/${visitId}/workflow`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start visit from appointment";
      setActionError(message);
      toast.error(message);
    } finally {
      setStartingVisit(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        activeItem="Appointments"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={logout}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          user={user}
          searchQuery={query}
          setSearchQuery={setQuery}
          onSearch={searchPatient}
          onMenuClick={() => setSidebarOpen(true)}
          onLogout={logout}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-gray-50/50">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => navigate("/doctor/appointments")}
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Appointments
            </button>

            {errorMessage && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {actionMessage && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {actionMessage}
              </div>
            )}

            {actionError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}

            {loading ? (
              <div className="animate-pulse flex flex-col gap-4">
                <div className="h-14 bg-gray-200 rounded-lg w-full" />
                <div className="h-64 bg-gray-200 rounded-lg w-full" />
              </div>
            ) : !appointment ? (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
                Appointment not found.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">Appointment {appointment.appointmentId}</h1>
                      <p className="text-sm text-gray-500 mt-1">Source: {formatSource(appointment.source)}</p>
                    </div>
                    <span
                      className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${
                        STATUS_CLASS_MAP[appointment.status] || "bg-gray-50 text-gray-700 border border-gray-200"
                      }`}
                    >
                      {formatStatus(appointment.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="text-xs uppercase text-gray-500">Scheduled Slot</div>
                      <div className="mt-1 text-sm font-semibold text-gray-800 flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-blue-600" />
                        {formatDateTime(appointment.scheduledAt)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="text-xs uppercase text-gray-500">Assigned Doctor</div>
                      <div className="mt-1 text-sm font-semibold text-gray-800">
                        {appointment.doctor?.name || "Unassigned"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Patient Intake</h2>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="text-xs uppercase text-gray-500">Name</div>
                      <div className="mt-1 text-sm font-medium text-gray-900 flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-500" />
                        {patientName}
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="text-xs uppercase text-gray-500">Phone</div>
                      <div className="mt-1 text-sm font-medium text-gray-900 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-500" />
                        {patientPhone}
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="text-xs uppercase text-gray-500">Age / Gender</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {(patientAge ?? "-") + " / " + patientGender}
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="text-xs uppercase text-gray-500">Patient ID</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {appointment.patient?.patientId || "Not linked yet"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-gray-100 p-3">
                    <div className="text-xs uppercase text-gray-500">Address</div>
                    <div className="mt-1 text-sm font-medium text-gray-900 flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-500 mt-0.5" />
                      <span>{patientAddress}</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-gray-100 p-3">
                    <div className="text-xs uppercase text-gray-500">Chief Complaint / Reason</div>
                    <div className="mt-1 text-sm font-medium text-gray-900 flex items-start gap-2">
                      <FileText className="w-4 h-4 text-gray-500 mt-0.5" />
                      <span>{appointment.reason || "-"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Visit Actions</h2>

                  {appointment.linkedVisitId ? (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                      Visit already linked: {appointment.linkedVisitId}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={startVisitFromAppointment}
                      disabled={!canStartVisit || startingVisit}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PlayCircle className="w-4 h-4" />
                      {startingVisit ? "Starting..." : "Start Visit From Appointment"}
                    </button>

                    {appointment.linkedVisitId ? (
                      <button
                        onClick={() => navigate(`/doctor/visit/${appointment.linkedVisitId}/workflow`)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50"
                      >
                        Open Linked Visit
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
