"""Environment config. Reads backend/.env if present, without pulling in a
dependency to do it — the file format we need is `KEY=value` and nothing else.
"""

import os
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        # Real environment always wins, so `MONGO_URI=... uvicorn ...` overrides.
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(ENV_PATH)

MONGO_URI = os.environ.get("MONGO_URI", "")
MONGO_DB = os.environ.get("MONGO_DB", "chess_ai")
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))  # 7 days

# Origins allowed to call the API from a browser. Behind a cloudflared or ngrok
# tunnel the page is served from a public hostname, so localhost alone is not
# enough. Comma separated; "*" allows any, which is only sensible because the
# API carries no ambient cookie auth - every call presents a bearer token.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# Auth and history are optional: without these the engine endpoints still work,
# they just refuse to persist anything. Better than failing to boot.
PERSISTENCE_ENABLED = bool(MONGO_URI and JWT_SECRET)
