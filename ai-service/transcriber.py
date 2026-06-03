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
_raw_language = os.getenv("DEEPGRAM_LANGUAGE", "auto").strip().lower()
_raw_language_list = os.getenv("DEEPGRAM_LANGUAGE_LIST", "hi,mr,en")
if _raw_language in {"auto", "detect", "multilingual", "multi"}:
    DEEPGRAM_LANGUAGE = "auto"
else:
    DEEPGRAM_LANGUAGE = _raw_language or "en"


def _parse_language_list(raw_value: str) -> list[str]:
    return [value.strip() for value in raw_value.split(",") if value.strip()]


def _build_params(language: str) -> dict:
    return {
        "model": "nova-2",
        "language": language,
        "punctuate": "true",
        "smart_format": "true",
        "diarize": "true",       # speaker diarization for doctor/patient
        "utterances": "true",
    }


def _extract_transcript(result: dict) -> tuple[str, float]:
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
        channels = result.get("results", {}).get("channels", [])
        if channels:
            transcript = channels[0]["alternatives"][0].get("transcript", "")
        else:
            transcript = ""

    confidence = None
    channels = result.get("results", {}).get("channels", [])
    if channels and channels[0].get("alternatives"):
        confidence = channels[0]["alternatives"][0].get("confidence")

    score = float(confidence) if confidence is not None else 0.0
    if score <= 0.0:
        score = len(transcript) / 1000.0

    return transcript, score


def transcribe(audio_path: str) -> str:
    """
    Transcribes a WAV audio file using Deepgram REST API.
    Returns the full transcript as a single string.
    """
    if not DEEPGRAM_API_KEY:
        raise RuntimeError("DEEPGRAM_API_KEY not set in .env")

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "audio/wav",
    }

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    languages = [DEEPGRAM_LANGUAGE]
    if DEEPGRAM_LANGUAGE == "auto":
        languages = _parse_language_list(_raw_language_list) or ["hi", "mr", "en"]

    best_transcript = ""
    best_score = -1.0
    last_error = None

    print(f"[Transcriber] Sending {len(audio_bytes)} bytes to Deepgram...")

    with httpx.Client(timeout=120.0) as client:
        for language in languages:
            params = _build_params(language)
            try:
                response = client.post(
                    DEEPGRAM_URL,
                    params=params,
                    headers=headers,
                    content=audio_bytes,
                )
            except httpx.RequestError as exc:
                last_error = exc
                continue

            if response.status_code != 200:
                last_error = RuntimeError(
                    f"Deepgram error {response.status_code}: {response.text[:300]}"
                )
                continue

            result = response.json()
            transcript, score = _extract_transcript(result)
            print(f"[Transcriber] Language '{language}' score={score:.3f} length={len(transcript)}")

            if score > best_score and transcript:
                best_score = score
                best_transcript = transcript

    if not best_transcript:
        if last_error:
            raise RuntimeError(str(last_error))
        raise RuntimeError("Deepgram returned empty transcript")

    print(f"[Transcriber] Transcript length: {len(best_transcript)} chars")
    return best_transcript
