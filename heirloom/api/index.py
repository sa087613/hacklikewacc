"""Vercel entry point: serves the FastAPI backend (services/api) as one Python function."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "api"))

from main import app  # noqa: E402,F401
