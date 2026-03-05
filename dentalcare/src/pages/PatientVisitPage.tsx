import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IndianRupee, ArrowLeft } from "lucide-react";

interface Props {
  token: string;
}

export default function PatientVisitsPage({ token }: Props) {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visitType: "NEW" | "FOLLOW_UP" = "NEW";

  useEffect(() => {
    if (!patientId) return;

    async function fetchData() {
      try {
        setLoading(true);

        const patientRes = await fetch(
          `http://localhost:4000/patients/search?query=${patientId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!patientRes.ok) throw new Error("Patient not found");

        const patientData = await patientRes.json();
        setPatient(patientData);

        const visitsRes = await fetch(
          `http://localhost:4000/visits/history/${patientData.patientId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const visitsData = await visitsRes.json();
        setVisits(visitsData.visits || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [patientId, token]);


  const filteredVisits = useMemo(() => {
    return visits.filter(v => v.bill);
  }, [visits]);

  const latestOutstanding = useMemo(() => {
    if (!filteredVisits.length) return 0;
    // Find the most recent visit that has a non-zero updatedPending
    const visitWithPending = filteredVisits.find(v => (v.bill?.updatedPending || 0) > 0);
    return visitWithPending ? visitWithPending.bill.updatedPending : 0;
  }, [filteredVisits]);


  async function startNewVisit() {
    if (!patient) return;

    const res = await fetch("http://localhost:4000/visits/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ patientId: patient.patientId, visitType })
    });

    const data = await res.json();
    navigate(`/doctor/visit/${data.visitId}/workflow`);
  }


  if (loading) return <p className="p-4">Loading…</p>;
  if (error) return <p className="p-4 text-red-600">{error}</p>;

  return (
    <div className="p-4 max-w-4xl mx-auto">

      <button
        onClick={() => navigate("/doctor")}
        className="flex items-center gap-2 text-emerald-600 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <div className="bg-white rounded-lg p-4 mb-4 border">
        <h2 className="text-lg font-semibold mb-2">
          Patient Details
        </h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><b>Name:</b> {patient.name}</div>
          <div><b>ID:</b> {patient.patientId}</div>
          <div><b>Phone:</b> {patient.phone}</div>
        </div>
      </div>

      <div
        className={`border rounded-lg p-4 mb-4 flex items-center justify-between ${
          latestOutstanding > 0
            ? "bg-orange-50 border-orange-300"
            : "bg-red-50 border-emerald-300"
        }`}
      >
        <span className="font-medium">
            Outstanding (Latest)
        </span>
        <span className="flex items-center gap-1 text-lg font-bold">
          <IndianRupee className="w-5 h-5" />
          {latestOutstanding}
        </span>
      </div>

      <div className="bg-white rounded-lg p-4 border">
        <div className="flex justify-between mb-3">
          <h3 className="font-semibold">Visit History</h3>
          <button
            onClick={startNewVisit}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
          >
            Start New Visit
          </button>
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Visit ID</th>
              <th className="p-2 border">Date</th>
              <th className="p-2 border">Paid</th>
              <th className="p-2 border">Pending</th>
              <th className="p-2 border">Type</th>
              <th className="p-2 border">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredVisits.map(v => (
              <tr
                key={v.visitId}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() =>
                  navigate(`/doctor/visit/${v.visitId}/view`)
                }
              >
                <td className="p-2 border">{v.visitId}</td>
                <td className="p-2 border">
                  {new Date(v.createdAt).toLocaleString()}
                </td>
                <td className="p-2 border text-sm">
  {v.bill ? (
    <div className="space-y-1">
      <div className="text-green-700 font-medium">
        Paid: ₹{(v.bill.paidAmount || 0) + (v.bill.pendingCleared || 0)}
      </div>
    </div>
  ) : (
    "Unbilled"
  )}
</td>
                <td className="p-2 border">
                {v.bill
                    ? `₹${v.bill.updatedPending}`
                    : "Unbilled"}
                </td>
                <td className="p-2 border">
                {v.visitType === "NEW" ? "New" : "Follow-up"}
                </td>
                <td className="p-2 border">
                {v.caseOutcome === "COMPLETED" ? "Completed" : "Ongoing"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
