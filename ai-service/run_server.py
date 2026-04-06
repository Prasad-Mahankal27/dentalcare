"""Run the AI service with predictable Ctrl+C shutdown behavior."""

import asyncio

import uvicorn


if __name__ == "__main__":
    try:
        uvicorn.run("main:app", host="127.0.0.1", port=8000, loop="asyncio")
    except (KeyboardInterrupt, asyncio.CancelledError):
        # Swallow shutdown exceptions so npm/concurrently exits cleanly.
        pass
