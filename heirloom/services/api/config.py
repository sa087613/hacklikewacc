from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]  # heirloom/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    database_url: str = ""
    openai_api_key: str = ""
    anthropic_api_key: Optional[str] = None

    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    storage_bucket: str = "sources"

    # §6: 24h expert timeout, 2 minutes in demo mode.
    demo_mode: bool = True
    web_origin: str = "http://localhost:3000"


settings = Settings()
