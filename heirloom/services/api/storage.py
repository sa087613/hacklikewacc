"""Minimal Supabase Storage client (uploaded docs and, later, voice notes)."""
import httpx

from config import settings


def _headers(content_type: str = "application/json") -> dict:
    key = settings.supabase_service_key
    return {"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": content_type}


def ensure_bucket() -> None:
    r = httpx.post(
        f"{settings.supabase_url}/storage/v1/bucket",
        headers=_headers(),
        json={"id": settings.storage_bucket, "name": settings.storage_bucket, "public": False},
    )
    if r.status_code >= 400 and "already exists" not in r.text.lower():
        r.raise_for_status()


def upload(path: str, data: bytes, content_type: str) -> str:
    r = httpx.post(
        f"{settings.supabase_url}/storage/v1/object/{settings.storage_bucket}/{path}",
        headers={**_headers(content_type), "x-upsert": "true"},
        content=data,
    )
    r.raise_for_status()
    return f"{settings.storage_bucket}/{path}"
