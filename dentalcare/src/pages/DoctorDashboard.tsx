import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import Header from "../components/Header";

import { StatCard } from "../components/StatCard";
import { BookedAppointments } from "../components/BookedAppointments";
import { DoctorsList } from "../components/DoctorsList";

import { HospitalSurvey } from "../components/HospitalSurvey";
import { CommonDiseasesReport } from "../components/CommonDiseasesReport";

import {
  Activity,
  CalendarCheck,
  IndianRupee,
  Users
} from "lucide-react";

interface DoctorDashboardProps {
  user: any;
}

export default function DoctorDashboard({ user }: DoctorDashboardProps) {
  const token = user.token;
  const navigate = useNavigate();

  /* ===================== */
  /* URL SEARCH STATE */
  /* ===================== */

  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get("query") || "";

  const [query, setQuery] = useState(queryFromUrl);

  const [patient] = useState<any>(null);
  const [visits] = useState<any[]>([]);
  const [error] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [startingVisit, setStartingVisit] = useState(false);
  const [visitType] = useState<"NEW" | "FOLLOW_UP">("NEW");

  const [stats, setStats] = useState<any>({
    appointments: 0,
    operations: 0,
    newPatients: 0,
    earnings: 0,
    recentAppointments: [],
    doctorsList: [],
    patientSurveyData: [],
    dentalIssuesData: []
  });

  function searchPatient() {
    if (!query.trim()) return;
    navigate(`/doctor/patient/${query}`);
  }

  const fetchStats = async () => {
    try {
      const res = await fetch("http://localhost:4000/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
  };

  useEffect(() => {
    fetchStats();
    if (queryFromUrl) {
      setQuery(queryFromUrl);
      searchPatient();
    }

    // Real-time polling
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []); // run once on mount

  async function startNewVisit() {
    if (!patient) return;

    try {
      setStartingVisit(true);

      const res = await fetch(
        "http://localhost:4000/visits/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            patientId: patient.patientId,
            visitType
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to start visit");
      }

      navigate(`/doctor/visit/${data.visitId}/workflow`);

    } catch (err: any) {
      alert(err.message || "Failed to start visit");
    } finally {
      setStartingVisit(false);
    }
  }

  function logout() {
    localStorage.removeItem("user");
    window.location.reload();
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        activeItem="Dashboard"
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

        <main className="flex-1 overflow-y-auto p-3 bg-gray-50">
          {error && (
            <div className="bg-yellow-100 text-yellow-800 p-3 rounded mb-3">
              {error}
            </div>
          )}

          {patient ? (
            <>
              <div className="bg-white rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold mb-2">
                  Patient Details
                </h2>
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <div><b>Name:</b> {patient.name}</div>
                  <div><b>ID:</b> {patient.patientId}</div>
                  <div><b>Phone:</b> {patient.phone}</div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4">
                <div className="flex justify-between mb-3">
                  <h3 className="font-semibold">Visit History</h3>
                  <button
                    onClick={startNewVisit}
                    disabled={startingVisit}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
                  >
                    {startingVisit ? "Starting…" : "Start New Visit"}
                  </button>
                </div>

                <table className="w-full text-sm border">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 border">Visit ID</th>
                      <th className="p-2 border">Date</th>
                      <th className="p-2 border">Billing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map(v => (
                      <tr
                        key={v.visitId}
                        onClick={() =>
                          navigate(`/doctor/visit/${v.visitId}/view`)
                        }
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="p-2 border">{v.visitId}</td>
                        <td className="p-2 border">
                          {new Date(v.createdAt).toLocaleString()}
                        </td>
                        <td className="p-2 border">
                          {v.bill
                            ? `Pending ₹${v.bill.pendingAmount}`
                            : "Unbilled"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <StatCard 
                  icon={CalendarCheck} 
                  label="Appointments" 
                  value={stats.appointments.toString()} 
                  data={stats.appointmentTrend}
                  lineColor="#3b82f6"
                  iconBgColor="bg-blue-50"
                  iconColor="text-blue-500"
                />
                <StatCard 
                  icon={Activity} 
                  label="Operations" 
                  value={stats.operations.toString()} 
                  data={stats.operationTrend}
                  lineColor="#a855f7"
                  iconBgColor="bg-purple-50"
                  iconColor="text-purple-500"
                />
                <StatCard 
                  icon={Users} 
                  label="New Patients" 
                  value={stats.newPatients.toString()} 
                  data={stats.patientTrend}
                  lineColor="#22c55e"
                  iconBgColor="bg-green-50"
                  iconColor="text-green-500"
                />
                <StatCard 
                  icon={IndianRupee} 
                  label="Earnings" 
                  value={`₹${stats.earnings}`} 
                  data={stats.earningsTrend}
                  lineColor="#f97316"
                  iconBgColor="bg-orange-50"
                  iconColor="text-orange-500"
                />
              </div>

              <div className="grid lg:grid-cols-2 gap-3 mb-3">
                <HospitalSurvey data={stats.patientSurveyData} />
                <CommonDiseasesReport data={stats.dentalIssuesData} />
              </div>

              <div className="grid lg:grid-cols-2 gap-3">
                <BookedAppointments appointments={stats.recentAppointments} />
                <DoctorsList doctors={stats.doctorsList} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
