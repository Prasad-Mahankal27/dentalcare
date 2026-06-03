"""
emr_extractor.py — Uses Gemini to extract structured EMR data from
a doctor-patient conversation transcript and generate a summary.
"""

import os
import json
import re
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in .env")

genai.configure(api_key=GEMINI_API_KEY)
_model = genai.GenerativeModel("gemini-2.5-flash-lite")


def _clean_json(text: str) -> str:
    """Strip markdown code fences if present."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def generate_summary(transcript: str) -> str:
    """Generate a concise consultation summary from the transcript."""
    if not transcript.strip():
        return "No transcript available."

    prompt = f"""You are a medical AI. Based on the following doctor-patient conversation transcript, 
write a concise clinical consultation summary (2-4 sentences) covering:
- Chief complaint
- Key symptoms mentioned
- Preliminary assessment or diagnosis if mentioned
- Treatment or advice given

Transcript:
{transcript}

Summary:"""

    response = _model.generate_content(prompt)
    return response.text.strip()


def extract_emr(transcript: str) -> dict:
    """
    Extract structured EMR data from a conversation transcript using Gemini.
    Returns a dict matching the EMR schema.
    """
    if not transcript.strip():
        return _empty_emr()

    prompt = f"""You are a highly accurate medical AI assistant. 
Extract structured EMR (Electronic Medical Record) data from this doctor-patient conversation transcript.

Return ONLY a valid JSON object with NO markdown, NO code fences, NO explanation.

Transcript:
{transcript}

Extract and return this exact JSON structure (fill null for unknown fields):
{{
  "patient": {{
    "name": null,
    "dob": null,
    "age": null,
    "gender": null,
    "bloodGroup": null,
    "phone": null,
    "email": null,
    "address": null
  }},
  "visit": {{
    "visitType": null,
    "mode": null,
    "department": null,
    "doctorName": null
  }},
  "chiefComplaint": {{
    "complaint": null,
    "duration": {{"value": null, "unit": null}},
    "severity": null,
    "onset": null
  }},
  "symptoms": [
    {{"name": null, "duration": null, "severity": null, "source": "AI"}}
  ],
  "vitals": {{
    "temperature": {{"value": null, "unit": "°F"}},
    "bloodPressure": {{"systolic": null, "diastolic": null, "unit": "mmHg"}},
    "heartRate": {{"value": null, "unit": "bpm"}},
    "respiratoryRate": {{"value": null, "unit": "breaths/min"}},
    "oxygenSaturation": {{"value": null, "unit": "%"}},
    "height": {{"value": null, "unit": "cm"}},
    "weight": {{"value": null, "unit": "kg"}},
    "bmi": null
  }},
  "medicalHistory": {{
    "conditions": [{{"condition": null, "icdCode": null, "diagnosedDate": null, "status": null}}],
    "surgeries": [],
    "hospitalizations": []
  }},
  "allergies": [{{"allergen": null, "type": null, "reaction": null, "severity": null}}],
  "currentMedications": [],
  "diagnosis": {{
    "primary": {{"condition": null, "icdCode": null, "confidence": null, "source": "AI"}},
    "secondary": [],
    "differential": []
  }},
  "treatmentPlan": {{
    "plan": null,
    "diet": null,
    "exercise": null,
    "precautions": null
  }},
  "followUp": {{
    "required": null,
    "date": null,
    "instructions": null
  }},
  "conversation": {{
    "transcript": {json.dumps(transcript)},
    "summary": null,
    "aiExtracted": true
  }}
}}

Rules:
- Only include symptoms, medications, conditions that were ACTUALLY MENTIONED in the transcript
- Remove array items that are entirely null (e.g. empty symptom objects)
- For symptoms array: include one object per symptom mentioned
- For allergies array: only include if allergies were mentioned, otherwise return []
- Keep all field names exactly as shown
- Return raw JSON only"""

    try:
        response = _model.generate_content(prompt)
        raw = _clean_json(response.text)
        emr = json.loads(raw)

        # Remove null-only array items
        if isinstance(emr.get("symptoms"), list):
            emr["symptoms"] = [s for s in emr["symptoms"] if s.get("name")]
        if isinstance(emr.get("allergies"), list):
            emr["allergies"] = [a for a in emr["allergies"] if a.get("allergen")]
        if isinstance(emr.get("medicalHistory", {}).get("conditions"), list):
            emr["medicalHistory"]["conditions"] = [
                c for c in emr["medicalHistory"]["conditions"] if c.get("condition")
            ]

        return emr
    except (json.JSONDecodeError, Exception) as e:
        print(f"[EMR Extractor] Error parsing Gemini response: {e}")
        return _empty_emr()


def _empty_emr() -> dict:
    return {
        "patient": {},
        "visit": {},
        "chiefComplaint": {"complaint": None},
        "symptoms": [],
        "vitals": {},
        "medicalHistory": {"conditions": [], "surgeries": [], "hospitalizations": []},
        "allergies": [],
        "currentMedications": [],
        "diagnosis": {"primary": None, "secondary": [], "differential": []},
        "treatmentPlan": {"plan": None},
        "followUp": {"required": None},
        "conversation": {"aiExtracted": True},
    }
