import { useEffect, useRef, useState } from "react";
import { Save, CheckCircle, Sparkles, Edit3 } from "lucide-react";

interface ClinicalDetailsWithAIProps {
  visit: any;
  token: string;
  aiEmr: Record<string, any> | null;
  summary: string;
  onSavedAndProceed: (emr: Record<string, any>, summary: string) => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// ---- Field definitions ----
// These map to the SQLite visit table columns (existing backend).
// We also store AI-extracted rich EMR separately in state for passing to medication page.

interface FormFields {
  symptoms: string;
  diagnosis: string;
  observations: string;
  treatmentPlan: string;
  procedures: string;
  followUpAdvice: string;
  medicines: string;
  labTests: string;
}

function extractPlainText(emr: Record<string, any> | null): Partial<FormFields> {
  if (!emr) return {};

  const symptoms = Array.isArray(emr.symptoms)
    ? emr.symptoms.map((s: any) => s.name).filter(Boolean).join(", ")
    : "";

  const diagnosis = emr.diagnosis?.primary?.condition || "";

  const chiefComplaint = emr.chiefComplaint?.complaint || "";

  const observations = [
    chiefComplaint ? `Chief Complaint: ${chiefComplaint}` : "",
    emr.chiefComplaint?.severity ? `Severity: ${emr.chiefComplaint.severity}` : "",
    emr.chiefComplaint?.onset ? `Onset: ${emr.chiefComplaint.onset}` : "",
  ]
    .filter(Boolean)
    .join(" | ") || "";

  const treatmentPlan = emr.treatmentPlan?.plan || "";

  const medicines = Array.isArray(emr.currentMedications)
    ? emr.currentMedications.map((m: any) => m.name).filter(Boolean).join(", ")
    : "";

  const labTests = Array.isArray(emr.testsOrdered)
    ? emr.testsOrdered.map((t: any) => t.testName).filter(Boolean).join(", ")
    : "";

  const followUpAdvice = emr.followUp?.instructions || "";

  return { symptoms, diagnosis, observations, treatmentPlan, medicines, labTests, followUpAdvice };
}

const FIELDS: Array<[keyof FormFields, string, string]> = [
  ["symptoms",      "Symptoms",         "AI-extracted symptoms from the conversation"],
  ["diagnosis",     "Diagnosis",        "Primary diagnosis identified"],
  ["observations",  "Observations",     "Clinical observations & chief complaint"],
  ["treatmentPlan", "Treatment Plan",   "Recommended treatment"],
  ["procedures",    "Procedures",       "Procedures performed"],
  ["medicines",     "Medicines",        "Medications prescribed"],
  ["labTests",      "Lab Tests",        "Tests ordered"],
  ["followUpAdvice","Follow-up Advice", "Follow-up instructions"],
];

export default function ClinicalDetailsWithAI({
  visit,
  token,
  aiEmr,
  summary,
  onSavedAndProceed,
}: ClinicalDetailsWithAIProps) {
  const [form, setForm] = useState<FormFields>({
    symptoms: "",
    diagnosis: "",
    observations: "",
    treatmentPlan: "",
    procedures: "",
    followUpAdvice: "",
    medicines: "",
    labTests: "",
  });

  const [aiFilledFields, setAiFilledFields] = useState<Set<keyof FormFields>>(new Set());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDirtyRef = useRef(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate from visit (existing data) then overlay AI extraction
  useEffect(() => {
    const visitData: FormFields = {
      symptoms:      visit?.symptoms || "",
      diagnosis:     visit?.diagnosis || "",
      observations:  visit?.observations || "",
      treatmentPlan: visit?.treatmentPlan || "",
      procedures:    visit?.procedures || "",
      followUpAdvice:visit?.followUpAdvice || "",
      medicines:     visit?.medicines || "",
      labTests:      visit?.labTests || "",
    };

    const aiData = extractPlainText(aiEmr);
    const filled = new Set<keyof FormFields>();

    const merged = { ...visitData };
    for (const key of Object.keys(visitData) as (keyof FormFields)[]) {
      const aiVal = aiData[key];
      if (aiVal && !visitData[key]) {
        merged[key] = aiVal;
        filled.add(key);
      }
    }

    setForm(merged);
    setAiFilledFields(filled);
    isDirtyRef.current = false;
    setStatus("idle");
    setErrorMsg(null);
  }, [visit, aiEmr]);

  // Autosave
  useEffect(() => {
    if (!isDirtyRef.current) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => save(false), 10000);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
  }, [form]);

  function updateField(key: keyof FormFields, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setAiFilledFields((prev) => { const s = new Set(prev); s.delete(key); return s; });
    isDirtyRef.current = true;
    setStatus("idle");
    setErrorMsg(null);
  }

  async function save(proceed: boolean) {
    if (!visit?.visitId) {
      setErrorMsg("Visit not loaded.");
      return;
    }

    setStatus("saving");
    setErrorMsg(null);

    try {
      const res = await fetch(`http://localhost:4000/visits/update/${visit.visitId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Failed to save clinical details");

      setStatus("saved");
      isDirtyRef.current = false;
      setTimeout(() => setStatus("idle"), 2500);

      if (proceed) {
        // Merge form data into aiEmr for passing downstream
        const enrichedEmr = {
          ...(aiEmr || {}),
          symptoms: form.symptoms
            ? form.symptoms.split(",").map((s) => ({ name: s.trim(), source: "doctor" }))
            : (aiEmr?.symptoms || []),
          diagnosis: {
            ...(aiEmr?.diagnosis || {}),
            primary: {
              condition: form.diagnosis || aiEmr?.diagnosis?.primary?.condition,
              source: "doctor",
            },
          },
          treatmentPlan: {
            ...(aiEmr?.treatmentPlan || {}),
            plan: form.treatmentPlan || aiEmr?.treatmentPlan?.plan,
          },
        };
        onSavedAndProceed(enrichedEmr, summary);
      }
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message || "Save failed");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-emerald-600" /> Clinical Details
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Review and edit AI-extracted details before proceeding to medication suggestions.
          </p>
        </div>
        {aiFilledFields.size > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-medium whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5" />
            {aiFilledFields.size} field{aiFilledFields.size > 1 ? "s" : ""} AI-filled
          </div>
        )}
      </div>

      {/* AI Summary banner */}
      {summary && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI Consultation Summary
          </p>
          <p className="text-sm text-blue-800 italic">"{summary}"</p>
        </div>
      )}

      {/* Fields */}
      <div className="space-y-5">
        {FIELDS.map(([key, label, placeholder]) => {
          const isAI = aiFilledFields.has(key);
          return (
            <div key={key} className={`rounded-xl p-1 transition-all ${isAI ? "bg-amber-50 border border-amber-200" : ""}`}>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1 px-1">
                {label}
                {isAI && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> AI
                  </span>
                )}
              </label>
              <textarea
                rows={3}
                value={form[key]}
                onChange={(e) => updateField(key, e.target.value)}
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                           focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
                           resize-none bg-white transition-colors"
              />
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
        <div className="text-sm">
          {status === "saving" && <span className="text-gray-400">Saving…</span>}
          {status === "saved" && (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          {status === "error" && <span className="text-red-600">{errorMsg}</span>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => save(false)}
            disabled={status === "saving"}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700
                       px-4 py-2 rounded-lg disabled:opacity-50 transition text-sm font-medium"
          >
            <Save className="w-4 h-4" /> Save Draft
          </button>

          <button
            onClick={() => save(true)}
            disabled={status === "saving"}
            className="flex items-center gap-2 bg-emerald-600 text-white
                       px-5 py-2 rounded-lg hover:bg-emerald-700
                       disabled:opacity-50 transition font-semibold"
          >
            Save & Proceed to Medications →
          </button>
        </div>
      </div>
    </div>
  );
}
