import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import Header from "../components/Header";
import { DoctorsList } from "../components/DoctorsList";
import { useSearchParams, useNavigate } from "react-router-dom";

interface DoctorsPageProps {
  user: any;
}

export default function DoctorsPage({ user }: DoctorsPageProps) {
  const token = user.token;
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get("query") || "";
  const [query, setQuery] = useState(queryFromUrl);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  function searchPatient() {
    if (!query.trim()) return;
    navigate(`/doctor/patient/${query}`);
  }

  function logout() {
    localStorage.removeItem("user");
    window.location.reload();
  }

  const fetchDoctors = async () => {
    try {
      const res = await fetch("http://localhost:4000/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDoctors(data.doctorsList || []);
      }
    } catch (err) {
      console.error("Failed to fetch doctors", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        activeItem="Doctors"
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
                <h1 className="text-2xl font-bold text-gray-900">Clinic Staff</h1>
                <p className="text-gray-500 mt-1">Directory of all doctors currently practicing.</p>
             </div>
             
             {loading ? (
               <div className="animate-pulse flex flex-col gap-4">
                 <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
                 <div className="h-64 bg-gray-200 rounded-lg w-full"></div>
               </div>
             ) : (
               <DoctorsList doctors={doctors} />
             )}
          </div>
        </main>
      </div>
    </div>
  );
}
