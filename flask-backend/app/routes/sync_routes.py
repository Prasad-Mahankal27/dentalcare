from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from flask import Blueprint, g, request

from app.auth import subscription_required
from app.utils.http import error_response, success_response

sync_bp = Blueprint("sync", __name__, url_prefix="/sync")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@sync_bp.post("/upload")
@subscription_required
def upload() -> tuple:
    payload = request.get_json(silent=True) or {}
    encrypted_data = payload.get("encrypted_data")

    if encrypted_data is None:
        return error_response(
            code="invalid_payload",
            message="encrypted_data is required and must be JSON serializable.",
            status=400,
        )

    record = {
        "id": str(payload.get("id") or uuid4()),
        "clinic_id": g.profile["clinic_id"],
        "encrypted_data": encrypted_data,
        "updated_at": payload.get("updated_at") or _utc_now_iso(),
    }

    try:
        result = g.scoped_supabase.table("patients").upsert(
            record,
            on_conflict="id",
        ).execute()
        saved_record = result.data[0] if result.data else record
    except Exception as exc:
        return error_response(
            code="sync_upload_failed",
            message="Could not upload patient payload.",
            status=500,
            details={"error": str(exc)},
        )

    return success_response({"record": saved_record}, status=201)


@sync_bp.get("/download")
@subscription_required
def download() -> tuple:
    since = request.args.get("since")
    limit_raw = request.args.get("limit", "1000")

    try:
        limit = min(max(int(limit_raw), 1), 5000)
    except ValueError:
        return error_response(
            code="invalid_limit",
            message="limit must be an integer.",
            status=400,
        )

    try:
        query = (
            g.scoped_supabase.table("patients")
            .select("id, encrypted_data, updated_at")
            .order("updated_at", desc=False)
            .limit(limit)
        )
        if since:
            query = query.gt("updated_at", since)

        rows = query.execute().data or []
    except Exception as exc:
        return error_response(
            code="sync_download_failed",
            message="Could not download patient payloads.",
            status=500,
            details={"error": str(exc)},
        )

    return success_response(
        {
            "records": rows,
            "count": len(rows),
            "limit": limit,
        }
    )