"""
transcriber.py — Transcribes audio using Deepgram API.
Sends the recorded WAV file and returns the transcript text.
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


def transcribe(audio_path: str) -> str:
    """
    Transcribes a WAV audio file using Deepgram REST API.
    Returns the full transcript as a single string.
    """
    if not DEEPGRAM_API_KEY:
        raise RuntimeError("DEEPGRAM_API_KEY not set in .env")

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    params = {
        "model": "nova-2",
        "language": "en",
        "punctuate": "true",
        "smart_format": "true",
        "diarize": "true",       # speaker diarization for doctor/patient
        "utterances": "true",
    }

    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "audio/wav",
    }

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    print(f"[Transcriber] Sending {len(audio_bytes)} bytes to Deepgram...")

    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            DEEPGRAM_URL,
            params=params,
            headers=headers,
            content=audio_bytes,
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Deepgram error {response.status_code}: {response.text[:300]}"
        )

    result = response.json()

    # Try to build a speaker-labelled transcript from utterances
    utterances = result.get("results", {}).get("utterances", [])
    if utterances:
        lines = []
        for u in utterances:
            speaker = f"Speaker {u.get('speaker', '?')}"
            text = u.get("transcript", "").strip()
            if text:
                lines.append(f"{speaker}: {text}")
        transcript = "\n".join(lines)
    else:
        # Fall back to plain transcript
        channels = result.get("results", {}).get("channels", [])
        if channels:
            transcript = channels[0]["alternatives"][0].get("transcript", "")
        else:
            transcript = ""

    print(f"[Transcriber] Transcript length: {len(transcript)} chars")
    return transcript
