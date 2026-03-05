import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import Header from "../components/Header";
import { BookedAppointments } from "../components/BookedAppointments";
import { useSearchParams, useNavigate } from "react-router-dom";

interface AppointmentsPageProps {
  user: any;
}

export default function AppointmentsPage({ user }: AppointmentsPageProps) {
  const token = user.token;
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get("query") || "";
  const [query, setQuery] = useState(queryFromUrl);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  function searchPatient() {
    if (!query.trim()) return;
    navigate(`/doctor/patient/${query}`);
  }

  function logout() {
    localStorage.removeItem("user");
    window.location.reload();
  }

  const fetchAppointments = async () => {
    try {
      const res = await fetch("http://localhost:4000/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Fallback to recentAppointments if a dedicated full-list endpoint 
        // isn't available right now.
        setAppointments(data.recentAppointments || []);
      }
    } catch (err) {
      console.error("Failed to fetch appointments", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

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
                <p className="text-gray-500 mt-1">View and manage all your booked and completed visits.</p>
             </div>
             
             {loading ? (
               <div className="animate-pulse flex flex-col gap-4">
                 <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
                 <div className="h-64 bg-gray-200 rounded-lg w-full"></div>
               </div>
             ) : (
               <BookedAppointments appointments={appointments} />
             )}
          </div>
        </main>
      </div>
    </div>
  );
}
