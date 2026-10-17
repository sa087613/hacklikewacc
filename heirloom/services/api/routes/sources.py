import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

import storage
from db import transaction
from ingest import PersonalDataError, ingest_source, parse_file
from models import IngestResult

router = APIRouter()


@router.post("/sources/upload", response_model=IngestResult)
async def upload_source(
    file: UploadFile = File(...),
    team_id: str = Form(...),
    title: Optional[str] = Form(None),
    share_level: Optional[str] = Form(None),
    topics: str = Form(""),
    source_type: str = Form("doc"),
):
    data = await file.read()
    try:
        text, meta = parse_file(file.filename or "upload.md", data)
    except ValueError as e:
        raise HTTPException(400, str(e))

    topic_ids = [t.strip() for t in (topics or ",".join(meta.get("topics", []))).split(",") if t.strip()]
    try:
        with transaction() as conn:
            # Ingest (which screens for personal data) before anything is written to storage.
            result = ingest_source(
                conn,
                team_id=team_id,
                title=title or meta.get("title") or file.filename or "Untitled",
                text=text,
                source_type=meta.get("type", source_type),
                share_level=share_level or meta.get("share_level"),
                topic_ids=topic_ids,
                meta=meta,
            )
            storage_path = storage.upload(
                f"{team_id}/{uuid.uuid4()}-{file.filename}", data, file.content_type or "application/octet-stream"
            )
            conn.execute("update sources set storage_path = %s where id = %s", (storage_path, result.source_id))
            result.storage_path = storage_path
    except PersonalDataError as e:
        raise HTTPException(422, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result
