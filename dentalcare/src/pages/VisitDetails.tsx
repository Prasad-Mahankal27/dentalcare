import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Stethoscope,
  FileText,
  ClipboardList,
  Activity,
  Pill,
  MessageSquare,
  TestTube,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  User,
  Phone
} from "lucide-react";

export default function VisitDetails() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const token = JSON.parse(localStorage.getItem("user")!).token;

  const [visit, setVisit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVisit() {
      try {
        const res = await fetch(
          `http://localhost:4000/visits/${visitId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        setVisit(data);
      } catch (err) {
        console.error(err);
        alert("Failed to load visit details");
      } finally {
        setLoading(false);
      }
    }

    fetchVisit();
  }, [visitId, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading visit details…
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Invalid visit
      </div>
    );
  }

  const clinicalFields = [
    { key: "symptoms", label: "Symptoms", icon: Activity },
    { key: "diagnosis", label: "Diagnosis", icon: Stethoscope },
    { key: "observations", label: "Observations", icon: FileText },
    { key: "treatmentPlan", label: "Treatment Plan", icon: ClipboardList },
    { key: "procedures", label: "Procedures", icon: Activity },
    { key: "medicines", label: "Medicines Prescribed", icon: Pill },
    { key: "followUpAdvice", label: "Follow-up Advice", icon: MessageSquare },
    { key: "labTests", label: "Lab Tests", icon: TestTube }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-emerald-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Visit Details</h1>
            <p className="text-sm text-gray-500">
              Clinical & billing record for this visit
            </p>
          </div>
          <div className="font-mono font-semibold">
            {visit.visitId}
          </div>
        </div>

<div className="bg-white border rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-800">Visit Information</h2>
          </div>

          <div className="text-sm text-gray-700 mb-4 space-y-1">
            <div>
              <span className="font-semibold">Visit Type:</span>{" "}
              <span className="text-gray-600">
                {visit.visitType === "NEW" ? "New" : "Follow-up"}
              </span>
            </div>
            <div>
              <span className="font-semibold">Case Status:</span>{" "}
              <span className="text-gray-600">
                {visit.caseOutcome === "COMPLETED" ? "Completed" : "Ongoing"}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-gray-500 text-xs font-medium mb-1">Date & Time</p>
              <p className="text-gray-800">{new Date(visit.createdAt).toLocaleString()}</p>
            </div>

            <div>
              <p className="text-gray-500 text-xs font-medium mb-2">Patient</p>
              <div className="flex items-center gap-2 text-gray-800 mb-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{visit.patient.name}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                <span>{visit.patient.phone}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-6 mb-6">
          <h2 className="font-semibold mb-6 flex items-center gap-2">
            <Stethoscope className="text-emerald-600" />
            Clinical Details
          </h2>

          <div className="space-y-6">
            {clinicalFields.map(({ key, label, icon: Icon }) => (
              <div key={key} className="border-l-4 border-emerald-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs uppercase font-semibold">
                    {label}
                  </span>
                </div>
                {visit[key] ? (
                  <p>{visit[key]}</p>
                ) : (
                  <p className="italic text-gray-400 text-sm">
                    Not recorded
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded p-6">
          <h2 className="font-semibold mb-6 flex items-center gap-2">
            <CreditCard className="text-emerald-600" />
            Billing Information
          </h2>

          {visit.bill ? (
            <div className="grid md:grid-cols-4 gap-4 text-sm">

              <div className="bg-blue-50 border rounded p-4">
                <p className="text-xs uppercase">Visit Charges</p>
                <p className="font-bold">
                  ₹{visit.bill.currentCharges}
                </p>
              </div>

              <div className="bg-red-50 border rounded p-4">
                <p className="text-xs uppercase">Discount</p>
                <p className="font-bold">
                  ₹{visit.bill.discount}
                </p>
              </div>

              <div className="bg-green-50 border rounded p-4">
                <p className="text-xs uppercase">Paid</p>
                <p className="font-bold">
                  ₹{visit.bill.paidAmount}
                </p>
              </div>

              <div
                className={`border rounded p-4 ${
                  visit.bill.pendingAmount > 0
                    ? "bg-orange-50"
                    : "bg-emerald-50"
                }`}
              >
                <p className="text-xs uppercase">Pending</p>
                <div className="flex items-center gap-2">
                  <p className="font-bold">
                    ₹{visit.bill.pendingAmount}
                  </p>
                  {visit.bill.pendingAmount > 0 ? (
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
              </div>

              <div className="md:col-span-4 pt-3 border-t">
                <b>Total Amount:</b> ₹{visit.bill.totalAmount}
              </div>

            </div>
          ) : (
            <p className="text-gray-500">
              No billing completed for this visit
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4 text-sm mt-6">
        <div className="bg-gray-50 border rounded p-4">
            <p className="text-xs uppercase">Previous Pending</p>
            <p className="font-bold">₹{visit.bill.previousPending}</p>
        </div>

        <div className="bg-blue-50 border rounded p-4">
            <p className="text-xs uppercase">Pending Cleared</p>
            <p className="font-bold">₹{visit.bill.pendingCleared}</p>
        </div>

        <div className="bg-orange-50 border rounded p-4">
            <p className="text-xs uppercase">Updated Pending</p>
            <p className="font-bold">₹{visit.bill.updatedPending}</p>
        </div>
        </div>

      </div>
    </div>
  );
}
