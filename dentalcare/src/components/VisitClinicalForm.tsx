import { useEffect, useRef, useState } from "react";
import { Save, CheckCircle } from "lucide-react";

interface VisitClinicalFormProps {
  visit: any;
  token: string;
  onSaved: () => void;
  readOnly?: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function VisitClinicalForm({
  visit,
  token,
  onSaved,
  readOnly = false
}: VisitClinicalFormProps) {

  const [form, setForm] = useState({
    symptoms: "",
    diagnosis: "",
    observations: "",
    treatmentPlan: "",
    procedures: "",
    followUpAdvice: "",
    medicines: "",
    labTests: ""
  });

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const isDirtyRef = useRef(false);
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!visit) return;

    setForm({
      symptoms: visit.symptoms || "",
      diagnosis: visit.diagnosis || "",
      observations: visit.observations || "",
      treatmentPlan: visit.treatmentPlan || "",
      procedures: visit.procedures || "",
      followUpAdvice: visit.followUpAdvice || "",
      medicines: visit.medicines || "",
      labTests: visit.labTests || ""
    });

    isDirtyRef.current = false;
    setStatus("idle");
    setError(null);
  }, [visit]);

  useEffect(() => {
    if (readOnly) return;
    if (!isDirtyRef.current) return;

    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = setTimeout(() => {
      save(false);
    }, 8000);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };

  }, [form]);

  function updateField(
    key: keyof typeof form,
    value: string
  ) {
    setForm(prev => ({
      ...prev,
      [key]: value
    }));

    isDirtyRef.current = true;
    setStatus("idle");
    setError(null);
  }

  async function save(proceed: boolean) {
    if (!visit?.visitId) {
      setError("Visit not loaded properly");
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const res = await fetch(
        `http://localhost:4000/visits/update/${visit.visitId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(form)
        }
      );

      if (!res.ok) {
        throw new Error("Failed to save clinical details");
      }

      setStatus("saved");
      isDirtyRef.current = false;

      setTimeout(() => {
        setStatus("idle");
      }, 2000);

      if (proceed) {
        onSaved();
      }

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setError(err.message || "Save failed");
    }
  }

  const fields: Array<[keyof typeof form, string]> = [
    ["symptoms", "Symptoms"],
    ["diagnosis", "Diagnosis"],
    ["observations", "Observations"],
    ["treatmentPlan", "Treatment Plan"],
    ["procedures", "Procedures"],
    ["medicines", "Medicines"],
    ["labTests", "Lab Tests"],
    ["followUpAdvice", "Follow-up Advice"]
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">
          Clinical Details
        </h2>
        <p className="text-sm text-gray-500">
          Record symptoms, diagnosis, and treatment
        </p>
      </div>

      <div className="space-y-5">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label}
            </label>
            <textarea
              rows={3}
              value={form[key]}
              disabled={readOnly}
              onChange={e => updateField(key, e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}`}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                         focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
                         disabled:bg-gray-100 resize-none"
            />
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <div className="text-sm">
            {status === "saving" && (
              <span className="text-gray-500">Saving…</span>
            )}
            {status === "saved" && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                Saved
              </span>
            )}
            {status === "error" && (
              <span className="text-red-600">
                {error}
              </span>
            )}
          </div>

          <button
            onClick={() => save(true)}
            disabled={status === "saving"}
            className="flex items-center gap-2 bg-emerald-600 text-white
                       px-4 py-2 rounded hover:bg-emerald-700
                       disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" />
            Save & Continue
          </button>
        </div>
      )}
    </div>
  );
}
