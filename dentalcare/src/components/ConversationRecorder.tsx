import { useEffect, useRef, useState } from "react";

type RecordingState = "idle" | "recording" | "processing" | "done" | "error";

interface ExtractedData {
  summary: string;
  emr: Record<string, any>;
}

interface Props {
  patientId: string;
  onDataExtracted: (data: ExtractedData) => void;
  onSkip: () => void;
}

export default function ConversationRecorder({ patientId, onDataExtracted, onSkip }: Props) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => stopTimer(), []);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  async function startRecording() {
    setError(null);
    setStatusMsg("Starting microphone...");
    try {
      const res = await fetch("http://127.0.0.1:8000/record/start", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to start recording");
      }
    } catch (e: any) {
      setError(e.message);
      setStatusMsg("");
      return;
    }

    setDuration(0);
    setState("recording");
    setStatusMsg("Recording in progress...");
    timerRef.current = setInterval(() => setDuration((p) => p + 1), 1000);
  }

  async function stopRecording() {
    stopTimer();
    setState("processing");
    setError(null);
    setStatusMsg("Stopping recording & transcribing...");

    let transcriptLen = 0;
    try {
      const res = await fetch("http://127.0.0.1:8000/record/stop", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to stop recording");
      }
      const data = await res.json();
      transcriptLen = Number(data.transcript_length ?? 0);
    } catch (e: any) {
      setError(e.message);
      setState("error");
      return;
    }

    if (transcriptLen <= 0) {
      setError("No speech detected. Please speak clearly and try again.");
      setState("error");
      return;
    }

    setStatusMsg("Analysing conversation with AI...");

    try {
      const [summaryRes, emrRes] = await Promise.all([
        fetch("http://127.0.0.1:8000/summary", { method: "POST" }),
        fetch("http://127.0.0.1:8000/emr", { method: "POST" }),
      ]);

      if (!summaryRes.ok || !emrRes.ok) {
        throw new Error("AI analysis failed. Check the Python service.");
      }

      const summaryData = await summaryRes.json();
      const emrData = await emrRes.json();

      setState("done");
      setStatusMsg("Analysis complete!");
      onDataExtracted({
        summary: summaryData.summary ?? "",
        emr: emrData ?? {},
      });
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }

  const ringColor =
    state === "recording"
      ? "from-red-500 to-rose-600"
      : state === "processing"
      ? "from-blue-500 to-indigo-600"
      : state === "done"
      ? "from-emerald-500 to-teal-600"
      : state === "error"
      ? "from-gray-400 to-gray-500"
      : "from-emerald-400 to-emerald-600";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">🎙️</span> Conversation Recording
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Record the doctor-patient conversation. AI will extract clinical details automatically.
        </p>
      </div>

      {/* Circular indicator */}
      <div className="flex flex-col items-center gap-4 my-8">
        <div
          className={`w-32 h-32 rounded-full bg-gradient-to-br ${ringColor} flex flex-col items-center justify-center shadow-lg transition-all duration-500
            ${state === "recording" ? "animate-pulse scale-105" : ""}
          `}
        >
          {state === "idle" && (
            <span className="text-white text-4xl">🎤</span>
          )}
          {state === "recording" && (
            <>
              <span className="text-white text-xs uppercase tracking-widest opacity-80 mb-1">Recording</span>
              <span className="text-white text-3xl font-mono font-bold">{fmt(duration)}</span>
            </>
          )}
          {state === "processing" && (
            <>
              <svg className="animate-spin h-10 w-10 text-white mb-1" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-white text-xs">AI Processing</span>
            </>
          )}
          {state === "done" && <span className="text-white text-5xl">✓</span>}
          {state === "error" && <span className="text-white text-4xl">✕</span>}
        </div>

        {statusMsg && (
          <p className={`text-sm font-medium ${state === "recording" ? "text-red-600" : state === "done" ? "text-emerald-600" : "text-blue-600"} animate-pulse`}>
            {statusMsg}
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <span className="text-red-500 mt-0.5">⚠</span>
          <div>
            <p className="font-medium">Recording Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={startRecording}
          disabled={state !== "idle" && state !== "error"}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2
            ${state === "idle" || state === "error"
              ? "bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-md hover:shadow-lg"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
        >
          {state === "error" ? "🔄 Try Again" : "▶ Start Conversation"}
        </button>

        <button
          onClick={stopRecording}
          disabled={state !== "recording"}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2
            ${state === "recording"
              ? "bg-red-600 hover:bg-red-700 cursor-pointer shadow-md hover:shadow-lg"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
        >
          ⏹ Stop & Analyse with AI
        </button>

        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={onSkip}
            className="w-full py-2.5 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition text-sm"
          >
            Skip Recording — Fill Manually
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        Patient ID: <span className="font-mono">{patientId}</span>
      </p>
    </div>
  );
}
