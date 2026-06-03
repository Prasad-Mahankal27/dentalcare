from __future__ import annotations

from flask import Blueprint, g, request

from app.auth import admin_required, auth_required
from app.services.supabase_service import get_service_client
from app.utils.http import error_response, success_response

user_bp = Blueprint("users", __name__, url_prefix="/users")

INVITE_ROLES = {"doctor", "receptionist"}


@user_bp.post("/invite")
@admin_required
def invite_user() -> tuple:
    payload = request.get_json(silent=True) or {}

    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "")).strip().lower()

    if "@" not in email:
        return error_response(
            code="invalid_email",
            message="A valid email is required.",
            status=400,
        )
    if len(password) < 8:
        return error_response(
            code="invalid_password",
            message="Password must be at least 8 characters.",
            status=400,
        )
    if role not in INVITE_ROLES:
        return error_response(
            code="invalid_role",
            message="role must be doctor or receptionist.",
            status=400,
        )

    service = get_service_client()
    invited_auth_user_id: str | None = None

    try:
        create_result = service.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
            }
        )
        if create_result.user is None:
            raise RuntimeError("Supabase create_user returned no user object.")
        invited_auth_user_id = str(create_result.user.id)

        service.table("users").insert(
            {
                "id": invited_auth_user_id,
                "email": email,
                "clinic_id": g.profile["clinic_id"],
                "role": role,
            }
        ).execute()

    except Exception as exc:
        if invited_auth_user_id:
            try:
                service.auth.admin.delete_user(invited_auth_user_id)
            except Exception:
                pass

        return error_response(
            code="invite_failed",
            message="Could not invite user.",
            status=500,
            details={"error": str(exc)},
        )

    return success_response(
        {
            "user_id": invited_auth_user_id,
            "clinic_id": g.profile["clinic_id"],
            "role": role,
        },
        status=201,
    )


@user_bp.get("/me")
@auth_required
def get_me() -> tuple:
    return success_response({"user": g.profile})