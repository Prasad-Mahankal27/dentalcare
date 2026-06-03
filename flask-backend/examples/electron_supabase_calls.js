import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5001";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  }

  return payload.data;
}

export async function adminSignup({ email, password, clinicName }) {
  return apiFetch("/auth/admin-signup", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      clinic_name: clinicName,
    }),
  });
}

export async function loginWithSupabase(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw error;
  }
  return data.session;
}

export async function getCurrentUser(accessToken) {
  return apiFetch("/users/me", { accessToken });
}

export async function inviteUser({ accessToken, email, password, role }) {
  return apiFetch("/users/invite", {
    accessToken,
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

export async function uploadEncryptedPatient({
  accessToken,
  id,
  encryptedData,
  updatedAt,
}) {
  return apiFetch("/sync/upload", {
    accessToken,
    method: "POST",
    body: JSON.stringify({
      id,
      encrypted_data: encryptedData,
      updated_at: updatedAt,
    }),
  });
}

export async function downloadEncryptedPatients({
  accessToken,
  since,
  limit = 1000,
}) {
  const query = new URLSearchParams();
  if (since) {
    query.set("since", since);
  }
  query.set("limit", String(limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/sync/download${suffix}`, { accessToken });
}