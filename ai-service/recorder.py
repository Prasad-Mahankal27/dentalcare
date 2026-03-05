"""
recorder.py — Handles audio capture from microphone using sounddevice.
Audio is recorded in real-time and stored as a WAV file.
"""

import threading
import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wav
import os

SAMPLE_RATE = 16000
CHANNELS = 1
AUDIO_FILE = "recording.wav"

_audio_chunks: list[np.ndarray] = []
_lock = threading.Lock()
_stream: sd.InputStream | None = None
_is_recording = False


def _audio_callback(indata: np.ndarray, frames: int, time, status):
    """Called by sounddevice for each audio block."""
    if status:
        print(f"[Recorder] Audio status: {status}")
    with _lock:
        _audio_chunks.append(indata.copy())


def start() -> None:
    """Start recording from the default microphone. Resets if already recording."""
    global _stream, _is_recording, _audio_chunks

    with _lock:
        if _is_recording or _stream is not None:
            print("[Recorder] Already recording. Resetting...")
            try:
                _stream.stop()
                _stream.close()
            except:
                pass
            _stream = None
            _is_recording = False
        
        _audio_chunks = []

    _stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="int16",
        callback=_audio_callback,
    )
    _stream.start()
    _is_recording = True
    print("[Recorder] Recording started.")


def stop() -> str:
    """Stop recording and save to WAV file. Returns path to the file."""
    global _stream, _is_recording

    if not _is_recording or _stream is None:
        raise RuntimeError("Recorder is not currently recording.")

    _stream.stop()
    _stream.close()
    _stream = None
    _is_recording = False

    with _lock:
        chunks = list(_audio_chunks)

    if not chunks:
        raise RuntimeError("No audio was captured.")

    audio_data = np.concatenate(chunks, axis=0)
    wav.write(AUDIO_FILE, SAMPLE_RATE, audio_data)
    print(f"[Recorder] Audio saved to {AUDIO_FILE} ({len(audio_data)} samples)")
    return AUDIO_FILE


def is_recording() -> bool:
    return _is_recording
