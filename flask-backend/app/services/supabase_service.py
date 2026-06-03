from __future__ import annotations

from functools import lru_cache

from flask import current_app
from supabase import Client, create_client


@lru_cache(maxsize=16)
def _build_client(url: str, key: str) -> Client:
    return create_client(url, key)


def get_service_client() -> Client:
    return _build_client(
        current_app.config["SUPABASE_URL"],
        current_app.config["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_anon_client() -> Client:
    return _build_client(
        current_app.config["SUPABASE_URL"],
        current_app.config["SUPABASE_ANON_KEY"],
    )


def create_fresh_anon_client() -> Client:
    return create_client(
        current_app.config["SUPABASE_URL"],
        current_app.config["SUPABASE_ANON_KEY"],
    )


def get_user_scoped_client(access_token: str) -> Client:
    client = create_fresh_anon_client()
    client.postgrest.auth(access_token)
    return client