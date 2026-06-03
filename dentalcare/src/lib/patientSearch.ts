const NO_RECORD_FOUND_MESSAGE = "No record found for this name, Patient ID, or phone number.";
const SEARCH_FAILURE_MESSAGE = "Unable to search patient right now. Please try again.";

export interface PatientSearchValidationResult {
  found: boolean;
  normalizedQuery: string;
  message: string;
}

export async function validatePatientSearch(
  query: string,
  token: string
): Promise<PatientSearchValidationResult> {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return {
      found: false,
      normalizedQuery,
      message: "Enter name, Patient ID, or phone number."
    };
  }

  try {
    const res = await fetch(
      `http://127.0.0.1:4000/patients/search?query=${encodeURIComponent(normalizedQuery)}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      const candidate = Array.isArray(payload?.results)
        ? payload.results[0]
        : payload;
      const resolvedPatientId = String(candidate?.patientId || normalizedQuery).trim();

      return {
        found: true,
        normalizedQuery: resolvedPatientId || normalizedQuery,
        message: ""
      };
    }

    if (res.status === 404) {
      return {
        found: false,
        normalizedQuery,
        message: NO_RECORD_FOUND_MESSAGE
      };
    }

    const body = await res.json().catch(() => ({}));
    return {
      found: false,
      normalizedQuery,
      message: String(body?.message || SEARCH_FAILURE_MESSAGE)
    };
  } catch {
    return {
      found: false,
      normalizedQuery,
      message: SEARCH_FAILURE_MESSAGE
    };
  }
}
