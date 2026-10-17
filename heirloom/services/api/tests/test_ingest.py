import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import ROOT  # noqa: E402
from ingest import PersonalDataError, check_personal_data, chunk_text, parse_file  # noqa: E402

SEED_DOCS = sorted((ROOT / "db" / "seed" / "docs").glob("*/*.md"))


def test_chunk_offsets_are_exact():
    text = "Para one.\n\nPara two is here.\n\n\n" + ("Long " * 400).strip() + "\n\nEnd."
    chunks = chunk_text(text, max_chars=300)
    assert len(chunks) > 1
    for c in chunks:
        assert text[c.start_offset : c.end_offset] == c.text
        assert len(c.text) <= 300


@pytest.mark.parametrize("path", SEED_DOCS, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_seed_docs_chunk_and_pass_screening(path):
    text, meta = parse_file(path.name, path.read_bytes())
    check_personal_data(text, meta)
    for key in ("title", "type", "share_level", "topics"):
        assert key in meta
    chunks = chunk_text(text)
    assert chunks
    for c in chunks:
        assert text[c.start_offset : c.end_offset] == c.text


def test_seed_has_27_docs():
    assert len(SEED_DOCS) == 27


def test_flagged_document_rejected():
    with pytest.raises(PersonalDataError):
        check_personal_data("Process notes.", {"contains_personal_data": True})


@pytest.mark.parametrize(
    "text",
    ["Employee SSN 123-45-6789", "Routing number: 021000021", "DOB: 04/12/1990", "Employee ID: 448812"],
)
def test_personal_data_patterns_rejected(text):
    with pytest.raises(PersonalDataError):
        check_personal_data(text, {})
