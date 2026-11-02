"""pytest-Grundkonfiguration: app-Importpfad und asyncio-Modus."""
import sys
from pathlib import Path

# /app (bzw. build/) in den Suchpfad, damit `import app.…` funktioniert
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def pytest_configure(config):
    # entspricht `asyncio_mode = "auto"` für pytest-asyncio
    config.option.asyncio_mode = "auto"
