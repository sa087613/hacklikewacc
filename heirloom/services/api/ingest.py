"""Parse, screen, chunk, embed, and store team sources (SPEC §6, §10)."""
import io
import re
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import frontmatter
import sqlalchemy as sa

from models import Chunk, IngestResult
from providers import get_embedder
from store.schema import chunks as chunks_t
from store.schema import new_id, source_topics, sources, teams

MAX_CHUNK_CHARS = 1200


class PersonalDataError(ValueError):
    """Raised when a document is flagged as, or looks like, employee records (§6)."""


# Shapes that indicate employee records rather than process knowledge.
_PERSONAL_DATA_PATTERNS = [
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("bank account", re.compile(r"\b(account|routing)\s*(number|no\.?|#)\s*:?\s*\d{6,}", re.I)),
    ("date of birth", re.compile(r"\b(DOB|date of birth)\s*:?\s*\d", re.I)),
    ("employee ID", re.compile(r"\bemployee\s*(id|number)\s*:?\s*\d{4,}", re.I)),
]


def check_personal_data(text: str, meta: dict) -> None:
    if meta.get("contains_personal_data"):
        raise PersonalDataError("Document is flagged as containing personal data.")
    for label, pattern in _PERSONAL_DATA_PATTERNS:
        if pattern.search(text):
            raise PersonalDataError(f"Document appears to contain personal data ({label}).")


def parse_file(filename: str, data: bytes) -> Tuple[str, dict]:
    """Return (text, metadata). Markdown/text may carry YAML frontmatter."""
    suffix = Path(filename).suffix.lower()
    if suffix in (".md", ".markdown", ".txt"):
        post = frontmatter.loads(data.decode("utf-8"))
        return post.content, dict(post.metadata)
    if suffix == ".pdf":
        import pdfplumber

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n\n".join(page.extract_text() or "" for page in pdf.pages), {}
    if suffix == ".docx":
        import docx

        doc = docx.Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in doc.paragraphs), {}
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> List[Chunk]:
    """Split on paragraph boundaries, packing paragraphs up to max_chars.

    Offsets are exact: text[c.start_offset:c.end_offset] == c.text. Citation
    verification depends on this to locate quotes in the original source.
    """
    paras = [(m.start(), m.end()) for m in re.finditer(r"\S(?:.*?\S)?(?=\n\s*\n|\s*\Z)", text, re.S)]
    out: List[Chunk] = []
    start: Optional[int] = None
    end = 0
    for p_start, p_end in paras:
        if start is not None and p_end - start > max_chars:
            out.append(Chunk(text=text[start:end], start_offset=start, end_offset=end))
            start = None
        if start is None:
            start = p_start
        end = p_end
        # A single paragraph longer than max_chars is split on hard boundaries.
        while end - start > max_chars:
            cut = start + max_chars
            out.append(Chunk(text=text[start:cut], start_offset=start, end_offset=cut))
            start = cut
    if start is not None and end > start:
        out.append(Chunk(text=text[start:end], start_offset=start, end_offset=end))
    return out


def ingest_source(
    conn: sa.Connection,
    *,
    team_id: str,
    title: str,
    text: str,
    source_type: str = "doc",
    share_level: Optional[str] = None,
    storage_path: Optional[str] = None,
    topic_ids: Sequence[str] = (),
    meta: Optional[dict] = None,
    label: Optional[str] = None,
    author_ids: Sequence[str] = (),
) -> IngestResult:
    """Screen, store, chunk, and embed one source. Caller owns the transaction."""
    check_personal_data(text, meta or {})
    if share_level is None:
        share_level = conn.execute(sa.select(teams.c.default_share_level).where(teams.c.id == team_id)).scalar()
        if share_level is None:
            raise ValueError(f"Unknown team: {team_id}")
    if share_level not in ("team", "cross_team", "company"):
        raise ValueError(f"Invalid share level: {share_level}")

    source_id = new_id()
    conn.execute(
        sources.insert().values(
            id=source_id, team_id=team_id, type=source_type, title=title, label=label,
            storage_path=storage_path, text=text, share_level=share_level, author_ids=list(author_ids),
        )
    )
    for topic_id in dict.fromkeys(topic_ids):
        conn.execute(source_topics.insert().values(source_id=source_id, topic_id=topic_id))

    pieces = chunk_text(text)
    vectors = get_embedder().embed([f"{title}\n\n{c.text}" for c in pieces])
    if pieces:
        conn.execute(
            chunks_t.insert(),
            [
                dict(id=new_id(), source_id=source_id, team_id=team_id, text=c.text,
                     start_offset=c.start_offset, end_offset=c.end_offset, embedding=v)
                for c, v in zip(pieces, vectors)
            ],
        )
    return IngestResult(
        source_id=source_id, team_id=team_id, title=title, share_level=share_level,
        chunk_count=len(pieces), topic_ids=list(topic_ids), storage_path=storage_path,
    )
