from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    debug: bool
    host: str
    port: int
    secret_key: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str


def load_settings() -> Settings:
    port_raw = os.getenv("PORT", "5001")
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise RuntimeError("PORT must be an integer value.") from exc

    settings = Settings(
        debug=_as_bool(
            os.getenv("FLASK_DEBUG"),
            default=os.getenv("FLASK_ENV", "development") == "development",
        ),
        host=os.getenv("HOST", "127.0.0.1"),
        port=port,
        secret_key=os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me"),
        supabase_url=(os.getenv("SUPABASE_URL") or "").strip(),
        supabase_anon_key=(os.getenv("SUPABASE_ANON_KEY") or "").strip(),
        supabase_service_role_key=(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip(),
    )

    missing: list[str] = []
    if not settings.supabase_url:
        missing.append("SUPABASE_URL")
    if not settings.supabase_anon_key:
        missing.append("SUPABASE_ANON_KEY")
    if not settings.supabase_service_role_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")

    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )

    return settings