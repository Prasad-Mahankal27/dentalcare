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
  Share2,
  Send
} from "lucide-react";

export default function VisitDetails() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const token = JSON.parse(localStorage.getItem("user")!).token;

  const [visit, setVisit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [patientEmail, setPatientEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [patientPhone, setPatientPhone] = useState("");
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (visit?.patient) {
      if (visit.patient.email) {
        setPatientEmail(visit.patient.email);
        setSendEmail(true);
      }
      if (visit.patient.phone) {
        setPatientPhone(visit.patient.phone);
        setSendWhatsApp(true);
      }
    }
  }, [visit]);

  async function handleSendReport() {
    if (!visitId) return;
    setSharing(true);
    setShareSuccess(null);
    setShareError(null);
    try {
      const res = await fetch(`http://127.0.0.1:4000/visits/send-report/${visitId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          patientEmail: sendEmail ? patientEmail : null,
          sendEmail: sendEmail,
          patientPhone: sendWhatsApp ? patientPhone : null,
          sendWhatsApp: sendWhatsApp
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send report");

      let successMsg = [];
      let errorMsg = [];

      if (sendEmail) {
        if (data.emailSent) successMsg.push("Email");
        else if (data.emailError) errorMsg.push(`Email (${data.emailError})`);
      }
      if (sendWhatsApp) {
        if (data.whatsappSent) successMsg.push("WhatsApp");
        else if (data.whatsappError) errorMsg.push(`WhatsApp (${data.whatsappError})`);
      }

      if (successMsg.length > 0 && errorMsg.length > 0) {
        setShareSuccess(`Report sent successfully via ${successMsg.join(" and ")}.`);
        setShareError(`Failed to send via ${errorMsg.join(", ")}.`);
      } else if (successMsg.length > 0) {
        setShareSuccess(`Report sent successfully via ${successMsg.join(" and ")}!`);
      } else if (errorMsg.length > 0) {
        setShareError(`Failed to send: ${errorMsg.join(", ")}`);
      } else {
        setShareError("No channel selected or send failed.");
      }
    } catch (err: any) {
      setShareError(err.message || "An unexpected error occurred while sharing.");
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => {
    async function fetchVisit() {
      try {
        const res = await fetch(
          `http://127.0.0.1:4000/visits/${visitId}`,
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

          <div className="grid md:grid-cols-2 gap-6 text-sm mb-6 pb-6 border-b border-gray-100">
            <div>
              <p className="text-gray-500 text-xs font-medium mb-1">Date & Time</p>
              <p className="text-gray-900 font-medium">{new Date(visit.createdAt).toLocaleString()}</p>
              
              <div className="mt-4 flex gap-4">
                <div>
                  <p className="text-gray-500 text-xs font-medium mb-1">Visit Type</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${visit.visitType === "NEW" ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {visit.visitType === "NEW" ? "New Patient" : "Follow-up"}
                  </span>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-medium mb-1">Status</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${visit.caseOutcome === "COMPLETED" ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                    {visit.caseOutcome === "COMPLETED" ? "Completed" : "Ongoing Case"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
              <p className="text-gray-800 font-bold mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                Patient Details
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-gray-500">Name:</span>
                  <span className="col-span-2 font-medium text-gray-900">{visit.patient.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-gray-500">Age/Gender:</span>
                  <span className="col-span-2 text-gray-900">{visit.patient.age} / {visit.patient.gender}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-gray-500">Contact:</span>
                  <span className="col-span-2 text-gray-900 flex items-center gap-1.5">
                    {visit.patient.phone}
                  </span>
                </div>
                {visit.patient.address && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500">Address:</span>
                    <span className="col-span-2 text-gray-900">{visit.patient.address}</span>
                  </div>
                )}
                {visit.patient.allergies && (
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-red-100">
                    <span className="text-red-500 font-medium">Allergies:</span>
                    <span className="col-span-2 text-red-600 font-medium">{visit.patient.allergies}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Share/Send Report Control Panel */}
        <div className="bg-white border border-emerald-100 rounded-lg p-6 mb-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-800">Share Report</h2>
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">New</span>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Send the latest PDF report and clinical summary directly to the patient.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="p-4 bg-gray-50 border rounded-lg flex flex-col justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                Email Share
              </label>
              <input
                type="email"
                placeholder="patient@example.com"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                disabled={!sendEmail}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-400 mt-1"
              />
            </div>

            <div className="p-4 bg-gray-50 border rounded-lg flex flex-col justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                WhatsApp Share
              </label>
              <input
                type="text"
                placeholder="e.g. 919876543210"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                disabled={!sendWhatsApp}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-400 mt-1"
              />
            </div>
          </div>

          {shareSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{shareSuccess}</span>
            </div>
          )}

          {shareError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span>{shareError}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSendReport}
              disabled={sharing || (!sendEmail && !sendWhatsApp)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-md text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
            >
              {sharing ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sending Report...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Report
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-white border rounded p-6 mb-6">
          <h2 className="font-semibold mb-6 flex items-center gap-2">
            <Stethoscope className="text-emerald-600" />
            Clinical Details
          </h2>

          <div className="space-y-6">
            {clinicalFields.map(({ key, label, icon: Icon }) => {
              if (key === 'medicines') {
                let parsedMedicines = [];
                try {
                  parsedMedicines = visit.medicines ? JSON.parse(visit.medicines) : [];
                } catch (e) {
                  console.error("Failed to parse medicines", e);
                }

                return (
                  <div key={key} className="border-l-4 border-indigo-500 pl-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs uppercase font-bold text-indigo-900">
                        {label}
                      </span>
                    </div>
                    {parsedMedicines && parsedMedicines.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 border rounded-lg overflow-hidden">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Medicine Name</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Dosage</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Frequency</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {parsedMedicines.map((med: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{med.name}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-600">{med.dosage || "-"}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-600">{med.frequency || "-"}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-600">{med.duration || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="italic text-gray-400 text-sm">No medicines prescribed</p>
                    )}
                  </div>
                );
              }

              return (
                <div key={key} className="border-l-4 border-emerald-500 pl-4 bg-emerald-50/30 py-2 pr-2 rounded-r-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs uppercase font-bold text-emerald-900">
                      {label}
                    </span>
                  </div>
                  {visit[key] ? (
                    <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{visit[key]}</p>
                  ) : (
                    <p className="italic text-gray-400 text-sm">
                      Not recorded
                    </p>
                  )}
                </div>
              );
            })}
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
