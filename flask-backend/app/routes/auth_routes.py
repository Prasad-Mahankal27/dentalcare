from __future__ import annotations

from flask import Blueprint, request

from app.services.supabase_service import (
    create_fresh_anon_client,
    get_service_client,
    get_user_scoped_client,
)
from app.utils.http import error_response, success_response

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.post("/admin-signup")
def admin_signup() -> tuple:
    payload = request.get_json(silent=True) or {}

    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    clinic_name = str(payload.get("clinic_name", "")).strip()

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
    if not clinic_name:
        return error_response(
            code="invalid_clinic_name",
            message="clinic_name is required.",
            status=400,
        )

    service = get_service_client()
    auth_user_id: str | None = None
    clinic_id: str | None = None

    try:
        auth_result = service.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
            }
        )
        if auth_result.user is None:
            raise RuntimeError("Supabase create_user returned no user object.")
        auth_user_id = str(auth_result.user.id)

        clinic_result = service.table("clinics").insert({"name": clinic_name}).execute()
        if not clinic_result.data:
            raise RuntimeError("Clinic insert returned no rows.")

        clinic_id = clinic_result.data[0]["id"]

        service.table("users").insert(
            {
                "id": auth_user_id,
                "email": email,
                "clinic_id": clinic_id,
                "role": "admin",
            }
        ).execute()

    except Exception as exc:
        # Attempt best-effort rollback for partially completed setup.
        if clinic_id:
            try:
                service.table("clinics").delete().eq("id", clinic_id).execute()
            except Exception:
                pass

        if auth_user_id:
            try:
                service.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass

        return error_response(
            code="admin_signup_failed",
            message="Could not create clinic admin account.",
            status=500,
            details={"error": str(exc)},
        )

    return success_response(
        {
            "user_id": auth_user_id,
            "clinic_id": clinic_id,
            "role": "admin",
        },
        status=201,
    )


@auth_bp.post("/login")
def login() -> tuple:
    payload = request.get_json(silent=True) or {}

    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))

    if "@" not in email or not password:
        return error_response(
            code="invalid_credentials",
            message="email and password are required.",
            status=400,
        )

    try:
        anon_client = create_fresh_anon_client()
        auth_result = anon_client.auth.sign_in_with_password(
            {
                "email": email,
                "password": password,
            }
        )

        if auth_result.user is None or auth_result.session is None:
            return error_response(
                code="invalid_credentials",
                message="Invalid email/password.",
                status=401,
            )

        access_token = auth_result.session.access_token
        scoped_client = get_user_scoped_client(access_token)
        profile_response = (
            scoped_client.table("users")
            .select("id, email, clinic_id, role, created_at")
            .eq("id", auth_result.user.id)
            .single()
            .execute()
        )

        return success_response(
            {
                "access_token": auth_result.session.access_token,
                "refresh_token": auth_result.session.refresh_token,
                "expires_at": auth_result.session.expires_at,
                "token_type": auth_result.session.token_type,
                "user": profile_response.data,
            }
        )

    except Exception as exc:
        return error_response(
            code="login_failed",
            message="Invalid email/password.",
            status=401,
            details={"error": str(exc)},
        )