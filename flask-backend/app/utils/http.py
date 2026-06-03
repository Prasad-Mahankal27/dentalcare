from __future__ import annotations

from flask import jsonify


def success_response(data: dict | list | str | None = None, status: int = 200) -> tuple:
    return jsonify({"ok": True, "data": data}), status


def error_response(
    code: str,
    message: str,
    status: int = 400,
    details: dict | str | None = None,
) -> tuple:
    error_payload: dict = {
        "code": code,
        "message": message,
    }
    if details is not None:
        error_payload["details"] = details

    return jsonify({"ok": False, "error": error_payload}), status