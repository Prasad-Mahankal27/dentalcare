"""
main.py — FastAPI server for the AI service.
Endpoints:
  POST /record/start   → start microphone recording
  POST /record/stop    → stop recording + transcribe
  POST /summary        → generate consultation summary
  POST /emr            → extract structured EMR from transcript
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import recorder
import transcriber
import emr_extractor

app = FastAPI(title="DentalCare AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state shared across requests
_transcript: str = ""
_summary: str = ""


@app.get("/health")
def health():
    return {"status": "ok", "recording": recorder.is_recording()}


@app.post("/record/start")
def record_start():
    """Start microphone recording. Resets if already recording."""
    try:
        recorder.start()
        return {"status": "recording_started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/record/stop")
def record_stop():
    """
    Stop recording, save WAV, transcribe with Deepgram.
    Returns transcript_length so the frontend can detect empty recordings.
    """
    global _transcript, _summary

    if not recorder.is_recording():
        raise HTTPException(status_code=409, detail="Not currently recording")

    try:
        audio_path = recorder.stop()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop recording: {e}")

    try:
        _transcript = transcriber.transcribe(audio_path)
        _summary = ""  # reset summary cache
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    return {
        "status": "transcription_complete",
        "transcript_length": len(_transcript),
        "transcript_preview": _transcript[:200] if _transcript else "",
    }


@app.post("/summary")
def get_summary():
    """Generate a consultation summary from the stored transcript."""
    global _summary

    if not _transcript:
        raise HTTPException(status_code=400, detail="No transcript available. Record first.")

    try:
        if not _summary:
            _summary = emr_extractor.generate_summary(_transcript)
        return {"summary": _summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {e}")


@app.post("/emr")
def get_emr():
    """Extract structured EMR data from the stored transcript."""
    if not _transcript:
        raise HTTPException(status_code=400, detail="No transcript available. Record first.")

    try:
        emr = emr_extractor.extract_emr(_transcript)
        return emr
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EMR extraction failed: {e}")


@app.get("/transcript")
def get_transcript():
    """Return the raw transcript (for debugging)."""
    return {"transcript": _transcript, "length": len(_transcript)}
