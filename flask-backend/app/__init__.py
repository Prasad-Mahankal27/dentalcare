from __future__ import annotations

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from app.config import load_settings
from app.routes.auth_routes import auth_bp
from app.routes.sync_routes import sync_bp
from app.routes.user_routes import user_bp
from app.utils.http import error_response, success_response


def create_app() -> Flask:
    load_dotenv()
    settings = load_settings()

    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=settings.secret_key,
        DEBUG=settings.debug,
        HOST=settings.host,
        PORT=settings.port,
        SUPABASE_URL=settings.supabase_url,
        SUPABASE_ANON_KEY=settings.supabase_anon_key,
        SUPABASE_SERVICE_ROLE_KEY=settings.supabase_service_role_key,
    )

    CORS(app, resources={r"/*": {"origins": "*"}})

    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(sync_bp)

    @app.get("/health")
    def health() -> tuple:
        return success_response({"status": "ok"})

    @app.errorhandler(Exception)
    def on_unhandled_exception(error: Exception) -> tuple:
        if app.debug:
            return error_response(
                code="internal_error",
                message="Unhandled exception.",
                status=500,
                details={"error": str(error)},
            )

        return error_response(
            code="internal_error",
            message="Internal server error.",
            status=500,
        )

    return app