"""curl_cffi ist lokal nicht installiert; die Scraper brechen beim Import ohne
es ab. Für die Tests der reinen Funktionen wird ein Stub eingehängt."""
import importlib.util, sys, types
from pathlib import Path

if "curl_cffi" not in sys.modules:
    stub = types.ModuleType("curl_cffi")
    stub.requests = types.SimpleNamespace(Session=lambda **kw: None)
    sys.modules["curl_cffi"] = stub

SCRIPTS = Path(__file__).resolve().parent.parent

def load(name: str):
    """Lädt ein Scraper-Skript als Modul (Bindestrich im Dateinamen)."""
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
