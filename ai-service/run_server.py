"""
run_server.py — entrypoint used for packaged AI service binaries.
"""

import os
import uvicorn

from main import app


def main() -> None:
    host = os.getenv("AI_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    log_level = os.getenv("AI_SERVICE_LOG_LEVEL", "info")

    uvicorn.run(app, host=host, port=port, log_level=log_level)


if __name__ == "__main__":
    main()
