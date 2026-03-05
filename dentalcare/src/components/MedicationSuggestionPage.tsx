import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Loader2,
  RefreshCw,
  Stethoscope,
  X,
} from "lucide-react";

const AI_BACKEND = "http://127.0.0.1:3000";

interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  allergyWarning?: boolean;
}

interface Suggestion {
  disease: string;
  icdCode: string;
  score: number;
  symptoms: string[];
  medications: Medication[];
  tests: string[];
}

interface Props {
  emrData: Record<string, any>;
  summary: string;
  patientId: string;
  onFinish: (prescription: Medication[]) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
              : pct >= 40 ? "text-amber-700 bg-amber-50 border-amber-200"
              : "text-gray-600 bg-gray-50 border-gray-200";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% match
    </span>
  );
}

export default function MedicationSuggestionPage({ emrData, summary, patientId, onFinish }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Medication[]>([]);
  const [expanded, setExpanded] = useState<number | null>(0);

  const allergyNames = new Set(
    (emrData?.allergies || []).map((a: any) => a.allergen?.toLowerCase()).filter(Boolean)
  );

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${AI_BACKEND}/api/suggestions/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, emrData }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Suggestion service error");
      }
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSuggestions(); }, []);

  function toggleMed(med: Medication) {
    setSelected((prev) =>
      prev.some((m) => m.name === med.name)
        ? prev.filter((m) => m.name !== med.name)
        : [...prev, med]
    );
  }

  function removeMed(name: string) {
    setSelected((prev) => prev.filter((m) => m.name !== name));
  }

  const patientName = emrData?.patient?.name;
  const patientAge  = emrData?.patient?.age;
  const allergiesText = emrData?.allergies?.map((a: any) => a.allergen).filter(Boolean).join(", ") || "None";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5">
        <div className="flex items-center gap-3">
          <Stethoscope className="w-6 h-6 text-white" />
          <div>
            <h2 className="text-xl font-bold text-white">AI Medication Suggestions</h2>
            <p className="text-indigo-200 text-sm">
              Based on recorded conversation · RAG-powered matching
            </p>
          </div>
        </div>

        {(patientName || patientId) && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-indigo-100">
            {patientName && <span>👤 {patientName}{patientAge ? ` (${patientAge})` : ""}</span>}
            {allergiesText !== "None" && (
              <span className="flex items-center gap-1 text-red-200 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> Allergies: {allergiesText}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-0.5">Consultation Summary</p>
          <p className="text-sm text-indigo-900 italic">"{summary}"</p>
        </div>
      )}

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suggestions list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-500" />
              Top Matched Conditions
            </h3>
            <button
              onClick={fetchSuggestions}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm">Searching medical database...</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <p className="font-semibold">Could not fetch suggestions</p>
              <p className="mt-1 text-xs">{error}</p>
              <p className="mt-1 text-xs text-gray-500">Make sure the Node AI backend (port 3000) is running and MongoDB Atlas has a vector_index on the medicines collection.</p>
            </div>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-sm text-center">
              No matching conditions found in the database.
            </div>
          )}

          {!loading && !error && suggestions.map((item, i) => (
            <div key={i} className={`border rounded-xl overflow-hidden transition-all ${expanded === i ? "border-indigo-300 shadow-md" : "border-gray-200"}`}>
              {/* Disease header - clickable to expand */}
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{item.disease}</p>
                    <p className="text-xs text-gray-400">ICD: {item.icdCode}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge score={item.score} />
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === i ? "rotate-90" : ""}`} />
                </div>
              </button>

              {expanded === i && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                  {/* Symptoms */}
                  {item.symptoms?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Associated Symptoms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.symptoms.map((s, j) => (
                          <span key={j} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Medications */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggested Medications</p>
                    <div className="space-y-2">
                      {item.medications.map((med, j) => {
                        const isAllergic = allergyNames.has(med.name?.toLowerCase());
                        const isSelected = selected.some((m) => m.name === med.name);
                        return (
                          <label
                            key={j}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                              ${isAllergic ? "bg-red-50 border-red-300" : isSelected ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200 hover:border-emerald-300"}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isAllergic}
                              onChange={() => !isAllergic && toggleMed(med)}
                              className="w-4 h-4 accent-emerald-600"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-gray-800">{med.name}</p>
                              <p className="text-xs text-gray-500">{med.dosage} · {med.frequency}</p>
                            </div>
                            {isAllergic && (
                              <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Allergy
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tests */}
                  {item.tests?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <FlaskConical className="w-3 h-3" /> Recommended Tests
                      </p>
                      <ul className="space-y-1">
                        {item.tests.map((t, j) => (
                          <li key={j} className="text-sm text-gray-700 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 inline-block" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sticky prescription panel */}
        <div className="lg:col-span-1">
          <div className="border border-gray-200 rounded-xl p-4 lg:sticky lg:top-4">
            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" /> Draft Prescription
            </h3>

            {selected.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6">
                Select medications from the left to add them here.
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {selected.map((med, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{med.name}</p>
                      <p className="text-xs text-gray-500">{med.dosage} · {med.frequency}</p>
                    </div>
                    <button onClick={() => removeMed(med.name)} className="text-gray-400 hover:text-red-500 transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => onFinish(selected)}
              className="w-full py-2.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition text-sm flex items-center justify-center gap-2"
            >
              Finish & Continue to Billing →
            </button>

            <p className="text-xs text-gray-400 text-center mt-2">
              {selected.length} medication{selected.length !== 1 ? "s" : ""} selected
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
