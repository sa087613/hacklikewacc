"""File storage for uploaded docs and voice notes: Supabase Storage or local disk."""
import httpx

from config import settings


class LocalStorage:
    name = "local"
    live = False

    def upload(self, path: str, data: bytes, content_type: str) -> str:
        dest = settings.data_dir / "uploads" / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return f"local:{path}"


class SupabaseStorage:
    name = "supabase"
    live = True

    def _headers(self, content_type: str = "application/json") -> dict:
        key = settings.supabase_service_key
        return {"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": content_type}

    def ensure_bucket(self) -> None:
        r = httpx.post(
            f"{settings.supabase_url}/storage/v1/bucket",
            headers=self._headers(),
            json={"id": settings.storage_bucket, "name": settings.storage_bucket, "public": False},
        )
        if r.status_code >= 400 and "already exists" not in r.text.lower():
            r.raise_for_status()

    def upload(self, path: str, data: bytes, content_type: str) -> str:
        self.ensure_bucket()
        r = httpx.post(
            f"{settings.supabase_url}/storage/v1/object/{settings.storage_bucket}/{path}",
            headers={**self._headers(content_type), "x-upsert": "true"},
            content=data,
        )
        r.raise_for_status()
        return f"{settings.storage_bucket}/{path}"
