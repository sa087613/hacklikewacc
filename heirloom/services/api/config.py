"""Settings and provider selection.

Every external service has a live and an offline provider. A provider goes live
only when its credentials are present and not template placeholders, so the app
runs end to end with no keys and switches over as keys are added to .env.
"""
import os
from pathlib import Path
from typing import Dict, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]  # heirloom/

_PLACEHOLDERS = ("YOUR-", "YOUR_", "REGION", "<", "xxxx")


def is_real(value: Optional[str]) -> bool:
    return bool(value) and not any(p in value for p in _PLACEHOLDERS)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    database_url: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Force every provider offline (tests, rehearsals without network).
    heirloom_offline: bool = False
    # Tests only: a disposable Postgres to run against even when offline. Never point it at real data.
    heirloom_test_database_url: str = ""

    anthropic_model: str = "claude-opus-5-5"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    transcription_model: str = "whisper-1"
    storage_bucket: str = "sources"
    # Vercel's filesystem is read-only except /tmp.
    data_dir: Path = Path("/tmp/heirloom") if os.environ.get("VERCEL") else ROOT / ".data"

    # "inprocess" calls team agents directly; "mcp" launches one MCP server per team over stdio.
    agent_transport: str = "inprocess"

    # §6 behavior rules
    demo_mode: bool = True
    max_hops: int = 2
    expert_open_cap: int = 5
    expert_timeout_minutes: int = 24 * 60
    demo_expert_timeout_minutes: int = 2
    insight_confidence_threshold: float = 0.7
    dedupe_similarity: float = 0.5

    web_origin: str = "http://localhost:3100"  # comma-separated list of allowed web origins

    @property
    def effective_database_url(self) -> str:
        if self.heirloom_offline:
            return self.heirloom_test_database_url
        return self.database_url if is_real(self.database_url) else ""

    @property
    def timeout_minutes(self) -> int:
        return self.demo_expert_timeout_minutes if self.demo_mode else self.expert_timeout_minutes

    @property
    def sqlite_path(self) -> Path:
        return self.data_dir / "heirloom.db"

    def provider_status(self) -> Dict[str, str]:
        off = self.heirloom_offline
        openai_live = not off and is_real(self.openai_api_key)
        return {
            "database": "postgres" if self.effective_database_url else "sqlite",
            "embeddings": "openai" if openai_live else "keyword",
            "llm": "claude" if not off and is_real(self.anthropic_api_key) else "mock",
            "transcription": "whisper" if openai_live else "transcript",
            "storage": "supabase"
            if not off and is_real(self.supabase_url) and is_real(self.supabase_service_key)
            else "local",
            "agents": self.agent_transport,
        }

    @property
    def offline_providers(self):
        live = {"postgres", "openai", "claude", "whisper", "supabase"}
        return [k for k, v in self.provider_status().items() if k != "agents" and v not in live]


settings = Settings()
