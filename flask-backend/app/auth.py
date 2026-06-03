from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps

from flask import g, request

from app.services.supabase_service import get_anon_client, get_user_scoped_client
from app.utils.http import error_response


def _get_bearer_token() -> str | None:
    authorization = request.headers.get("Authorization", "").strip()
    if not authorization:
        return None

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token = parts[1].strip()
    return token or None


def _parse_utc_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None

    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp


def auth_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = _get_bearer_token()
        if not token:
            return error_response(
                code="missing_authorization",
                message="Missing Bearer access token.",
                status=401,
            )

        try:
            auth_response = get_anon_client().auth.get_user(token)
            auth_user = auth_response.user
            if auth_user is None:
                return error_response(
                    code="invalid_token",
                    message="Invalid or expired access token.",
                    status=401,
                )

            scoped_client = get_user_scoped_client(token)
            profile_response = (
                scoped_client.table("users")
                .select("id, email, clinic_id, role, created_at")
                .eq("id", auth_user.id)
                .single()
                .execute()
            )

            profile = profile_response.data
            if not profile:
                return error_response(
                    code="profile_not_found",
                    message="Authenticated user has no tenant profile.",
                    status=404,
                )
        except Exception as exc:
            return error_response(
                code="invalid_token",
                message="Invalid or expired access token.",
                status=401,
                details={"error": str(exc)},
            )

        g.access_token = token
        g.auth_user = {
            "id": str(auth_user.id),
            "email": auth_user.email,
        }
        g.profile = profile
        g.scoped_supabase = scoped_client

        return func(*args, **kwargs)

    return wrapper


def admin_required(func):
    @wraps(func)
    @auth_required
    def wrapper(*args, **kwargs):
        if g.profile.get("role") != "admin":
            return error_response(
                code="forbidden",
                message="Admin role is required for this action.",
                status=403,
            )

        return func(*args, **kwargs)

    return wrapper


def subscription_required(func):
    @wraps(func)
    @auth_required
    def wrapper(*args, **kwargs):
        try:
            clinic_response = (
                g.scoped_supabase.table("clinics")
                .select("id, name, subscription_plan, subscription_expiry")
                .eq("id", g.profile["clinic_id"])
                .single()
                .execute()
            )
            clinic = clinic_response.data
            if not clinic:
                return error_response(
                    code="clinic_not_found",
                    message="Clinic profile not found.",
                    status=404,
                )

            expiry = _parse_utc_timestamp(clinic.get("subscription_expiry"))
            if expiry and expiry < datetime.now(timezone.utc):
                return error_response(
                    code="subscription_expired",
                    message="Clinic subscription has expired.",
                    status=402,
                    details={"subscription_expiry": clinic.get("subscription_expiry")},
                )
        except Exception as exc:
            return error_response(
                code="subscription_check_failed",
                message="Could not validate clinic subscription.",
                status=500,
                details={"error": str(exc)},
            )

        g.clinic = clinic
        return func(*args, **kwargs)

    return wrapper