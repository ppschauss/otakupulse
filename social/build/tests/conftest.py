"""pytest-Grundkonfiguration: app-Importpfad und asyncio-Modus."""
import os
import sys
from pathlib import Path

import pytest_asyncio

# /app (bzw. build/) in den Suchpfad, damit `import app.…` funktioniert
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Pflicht-Variablen für den Import von app.config; Platzhalter, keine echten Secrets.
# Echte Werte (z.B. PG_PASSWORD für die Integrationstests) bleiben unberührt.
os.environ.setdefault("SOCIAL_BOT_TOKEN", "test")
os.environ.setdefault("ANTHROPIC_API_KEY", "test")


def pytest_configure(config):
    # entspricht `asyncio_mode = "auto"` für pytest-asyncio
    config.option.asyncio_mode = "auto"


@pytest_asyncio.fixture
async def tmp_db(tmp_path, monkeypatch):
    """Frische SQLite-Datei je Test (kein Postgres nötig); wird danach wieder geschlossen."""
    from app import config, db

    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "social.sqlite3"))
    await db.init()
    yield
    await db.close()
