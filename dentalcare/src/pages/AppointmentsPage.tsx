import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import Header from "../components/Header";
import { AppointmentsTable } from "../components/AppointmentsTable";
import { useSearchParams, useNavigate } from "react-router-dom";

interface AppointmentsPageProps {
  user: any;
}

type AppointmentFilter = "pending" | "confirmed" | "completed";

interface AppointmentRecord {
  id: number;
  appointmentId: string;
  patientName?: string | null;
  patientPhone: string;
  scheduledAt: string;
  status: string;
  source: string;
  reason?: string | null;
  doctor?: {
    id: number;
    name: string;
  } | null;
  patient?: {
    patientId: string;
    name: string;
    phone: string;
  } | null;
}

const FILTER_OPTIONS: Array<{ value: AppointmentFilter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" }
];

export default function AppointmentsPage({ user }: AppointmentsPageProps) {
  const token = user.token;
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get("query") || "";
  const [query, setQuery] = useState(queryFromUrl);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<AppointmentFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  function searchPatient() {
    if (!query.trim()) return;
    navigate(`/doctor/patient/${query}`);
  }

  function logout() {
    localStorage.removeItem("user");
    window.location.reload();
  }

  const fetchAppointments = async (statusFilter: AppointmentFilter, showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setErrorMessage("");

      const res = await fetch(`http://localhost:4000/appointments?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to fetch appointments");
      }

      const data = await res.json();
      setAppointments(data.appointments || []);
    } catch (err) {
      console.error("Failed to fetch appointments", err);
      const message = err instanceof Error ? err.message : "Failed to fetch appointments";
      setErrorMessage(message);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments(activeFilter);

    const interval = setInterval(() => {
      fetchAppointments(activeFilter, false);
    }, 15000);

    return () => clearInterval(interval);
  }, [activeFilter, token]);

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
          <div className="max-w-6xl mx-auto">
             <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">All Appointments</h1>
                <p className="text-gray-500 mt-1">View pending, confirmed, and completed appointments including WhatsApp bookings.</p>
             </div>

             <div className="mb-4 flex flex-wrap items-center gap-2">
               {FILTER_OPTIONS.map((option) => {
                 const isActive = activeFilter === option.value;
                 return (
                   <button
                     key={option.value}
                     onClick={() => setActiveFilter(option.value)}
                     className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                       isActive
                         ? "bg-blue-600 text-white"
                         : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"
                     }`}
                   >
                     {option.label}
                   </button>
                 );
               })}
             </div>

             {errorMessage && (
               <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                 {errorMessage}
               </div>
             )}
             
             {loading ? (
               <div className="animate-pulse flex flex-col gap-4">
                 <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
                 <div className="h-64 bg-gray-200 rounded-lg w-full"></div>
               </div>
             ) : (
               <AppointmentsTable
                 appointments={appointments}
                 onOpenAppointment={(appointmentId) => navigate(`/doctor/appointments/${appointmentId}`)}
               />
             )}
          </div>
        </main>
      </div>
    </div>
  );
}
