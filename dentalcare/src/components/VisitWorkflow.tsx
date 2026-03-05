import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { User, FileText, CreditCard, CheckCircle, Mic } from "lucide-react";

import ConversationRecorder from "./ConversationRecorder";
import ClinicalDetailsWithAI from "./ClinicalDetailsWithAI";
import MedicationSuggestionPage from "./MedicationSuggestionPage";
import BillingForm from "./BillingForm";
import VisitReport from "./VisitReport";

/* ─── Types ─── */
type Step = 1 | 2 | 3 | 4;
// Sub-phases inside Step 2
type Step2Phase = "recording" | "clinical" | "medications";

interface VisitWorkflowProps {
  token: string;
}

/* ─── Component ─── */
export default function VisitWorkflow({ token }: VisitWorkflowProps) {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();

  const [visit, setVisit] = useState<any>(null);
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [step2Phase, setStep2Phase] = useState<Step2Phase>("recording");
  const [clinicalSaved, setClinicalSaved] = useState(false);
  const [closeStatus, setCloseStatus] = useState<boolean | null>(null);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visitType, setVisitType] = useState<"NEW" | "FOLLOW_UP">("NEW");
  const [patientEmail, setPatientEmail] = useState("");

  // AI data
  const [aiEmr, setAiEmr] = useState<Record<string, any> | null>(null);
  const [aiSummary, setAiSummary] = useState<string>("");

  /* ─── Fetch visit ─── */
  const fetchVisit = useCallback(async () => {
    if (!visitId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`http://localhost:4000/visits/${visitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load visit");
      setVisit(data);
      setClinicalSaved(
        Boolean(data.symptoms || data.diagnosis || data.observations || data.treatmentPlan || data.procedures)
      );
    } catch (err: any) {
      setError(err.message || "Unable to load visit");
    } finally {
      setLoading(false);
    }
  }, [visitId, token]);

  useEffect(() => { 
    if (visitId) fetchVisit(); 
  }, [fetchVisit, visitId]);

  useEffect(() => {
    if (visit?.patient?.email) {
      setPatientEmail(visit.patient.email);
    }
  }, [visit]);

  /* ─── Step guard ─── */
  function canGoToStep(step: Step) {
    if (step === 1) return true;
    if (step === 2) return true;          // always accessible
    if (step >= 3 && clinicalSaved) return true;
    return false;
  }

  function goToStep(step: Step) {
    if (!canGoToStep(step)) return;
    // When navigating back to step 2, skip recording if already completed
    if (step === 2 && clinicalSaved) setStep2Phase("clinical");
    setActiveStep(step);
  }

  /* ─── Visit type update ─── */
  async function updateVisitType(type: "NEW" | "FOLLOW_UP") {
    setVisitType(type);
    await fetch(`http://localhost:4000/visits/${visit.visitId}/type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ visitType: type }),
    });
    fetchVisit();
  }

  /* ─── Close visit ─── */
  async function closeVisit() {
    if (closeStatus === null || !visit) return;
    try {
      setClosing(true);
      const res = await fetch(`http://localhost:4000/visits/close/${visit.visitId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          isCompleted: closeStatus,
          patientEmail: patientEmail,
          sendEmail: true
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to close visit");
      navigate("/doctor");
    } catch (err: any) {
      alert(err.message || "Failed to close visit");
    } finally {
      setClosing(false);
    }
  }

  /* ─── Step 2 sub-flow handlers ─── */
  function handleRecordingDone(data: { summary: string; emr: Record<string, any> }) {
    setAiEmr(data.emr);
    setAiSummary(data.summary);
    setStep2Phase("clinical");
  }

  function handleSkipRecording() {
    setAiEmr(null);
    setAiSummary("");
    setStep2Phase("clinical");
  }

  function handleClinicalSavedAndProceed(emr: Record<string, any>, summary: string) {
    setAiEmr(emr);
    setAiSummary(summary);
    setClinicalSaved(true);
    fetchVisit();
    setStep2Phase("medications");
  }

  function handleMedicationsFinish(_prescription: any[]) {
    // Prescription selected — move to billing
    setActiveStep(3);
  }

  /* ─── Step labels ─── */
  const steps = [
    { step: 1, label: "Patient Info",      icon: User },
    { step: 2, label: "Clinical Details",  icon: activeStep === 2 && step2Phase === "recording" ? Mic : FileText },
    { step: 3, label: "Billing",           icon: CreditCard },
    { step: 4, label: "Complete",          icon: CheckCircle },
  ];

  /* ─── Render ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading visit…
        </div>
      </div>
    );
  }

  if (error || !visit || !visit.patient) {
    return (
      <div className="p-6 text-center text-red-600">{error || "Invalid visit data"}</div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">

        {/* Back button */}
        <button
          disabled={activeStep === 4}
          onClick={async () => {
            try {
              if (visit?.visitId) {
                await fetch(`http://localhost:4000/visits/${visit.visitId}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
            } catch (e) {
              console.error("Failed to delete visit", e);
            }
            const q = visit?.patient?.patientId || visit?.patient?.phone;
            if (q) navigate(`/doctor?query=${q}`);
            else navigate("/doctor");
          }}
          className="mb-4 text-sm text-emerald-600 hover:underline"
        >
          ← Back to Visits
        </button>

        {/* Step progress bar */}
        <div className="flex flex-wrap justify-between gap-2 mb-6">
          {steps.map(({ step, label, icon: Icon }) => {
            const enabled = canGoToStep(step as Step);
            const active  = activeStep === step;
            return (
              <button
                key={step}
                disabled={!enabled}
                onClick={() => goToStep(step as Step)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition
                  ${active   ? "bg-emerald-600 text-white"
                  : enabled  ? "bg-white border hover:bg-gray-50"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Step 2 sub-phase indicator */}
        {activeStep === 2 && (
          <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
            {["recording", "clinical", "medications"].map((phase, i) => (
              <span key={phase} className="flex items-center gap-1">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-white
                  ${step2Phase === phase ? "bg-emerald-500" : i < ["recording","clinical","medications"].indexOf(step2Phase) ? "bg-gray-300" : "bg-gray-200 text-gray-400"}`}>
                  {i + 1}
                </span>
                <span className={step2Phase === phase ? "text-emerald-600 font-semibold" : "text-gray-400"}>
                  {phase === "recording" ? "Record" : phase === "clinical" ? "Clinical Form" : "Medications"}
                </span>
                {i < 2 && <span className="text-gray-300">›</span>}
              </span>
            ))}
          </div>
        )}

        {/* ── STEP 1: Patient Info ── */}
        {activeStep === 1 && (
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Visit Type</label>
              <select
                value={visit.visitType}
                onChange={(e) => updateVisitType(e.target.value as "NEW" | "FOLLOW_UP")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="NEW">New Visit</option>
                <option value="FOLLOW_UP">Follow-up</option>
              </select>
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-4">Patient Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-6">
              <div className="text-gray-700"><span className="font-semibold">Name:</span>{" "}<span className="text-gray-600">{visit.patient.name}</span></div>
              <div className="text-gray-700"><span className="font-semibold">Phone:</span>{" "}<span className="text-gray-600">{visit.patient.phone}</span></div>
              <div className="text-gray-700"><span className="font-semibold">Patient ID:</span>{" "}<span className="text-gray-600">{visit.patient.patientId}</span></div>
              <div className="text-gray-700"><span className="font-semibold">Gender:</span>{" "}<span className="text-gray-600">{visit.patient.gender || "—"}</span></div>
            </div>

            <button
              onClick={() => { setActiveStep(2); setStep2Phase("recording"); }}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-md font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <Mic className="w-4 h-4" /> Continue to Clinical Details
            </button>
          </div>
        )}

        {/* ── STEP 2: Recording → Clinical → Medications ── */}
        {activeStep === 2 && (
          <>
            {step2Phase === "recording" && (
              <ConversationRecorder
                patientId={visit.patient.patientId}
                onDataExtracted={handleRecordingDone}
                onSkip={handleSkipRecording}
              />
            )}

            {step2Phase === "clinical" && (
              <ClinicalDetailsWithAI
                visit={visit}
                token={token}
                aiEmr={aiEmr}
                summary={aiSummary}
                onSavedAndProceed={handleClinicalSavedAndProceed}
              />
            )}

            {step2Phase === "medications" && (
              <MedicationSuggestionPage
                emrData={aiEmr || {}}
                summary={aiSummary}
                patientId={visit.patient.patientId}
                onFinish={handleMedicationsFinish}
              />
            )}
          </>
        )}

        {/* ── STEP 3: Billing ── */}
        {activeStep === 3 && (
          <div className="bg-white rounded-lg border p-6">
            <BillingForm
              visit={visit}
              token={token}
              onBillingDone={() => { fetchVisit(); setActiveStep(4); }}
            />
          </div>
        )}

        {/* ── STEP 4: Complete ── */}
        {activeStep === 4 && (
          <div className="bg-white rounded-lg border p-6 space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">Final Visit Report</h2>
              <p className="text-sm text-gray-500">Review the clinical details before closing the case.</p>
            </div>

            {/* Report Preview */}
            <div className="max-h-[500px] overflow-y-auto border rounded-lg bg-gray-50 p-4">
              <VisitReport visit={visit} patient={visit.patient} />
            </div>

            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
              <h3 className="font-semibold text-emerald-800 mb-3">Close Case Details</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Is the case fully completed?</p>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input 
                        type="radio" 
                        name="complete" 
                        checked={closeStatus === true}
                        onChange={() => setCloseStatus(true)} 
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      Yes, Treatment Completed
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input 
                        type="radio" 
                        name="complete" 
                        checked={closeStatus === false}
                        onChange={() => setCloseStatus(false)} 
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      No, Follow-up Required
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Send Report to Patient Email
                  </label>
                  <input
                    type="email"
                    placeholder="patient@example.com"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                disabled={closeStatus === null || closing}
                onClick={closeVisit}
                className="bg-emerald-600 text-white px-8 py-2.5 rounded-md font-bold disabled:opacity-50 hover:bg-emerald-700 transition shadow-sm"
              >
                {closing ? "Processing & Emailing..." : "Confirm & Close Visit"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
