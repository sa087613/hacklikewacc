from typing import List, Literal, Optional

from pydantic import BaseModel

ShareLevel = Literal["team", "cross_team", "company"]


class Chunk(BaseModel):
    text: str
    start_offset: int
    end_offset: int


class IngestResult(BaseModel):
    source_id: str
    team_id: str
    title: str
    share_level: ShareLevel
    chunk_count: int
    topic_ids: List[str]
    storage_path: Optional[str] = None


class AskRequest(BaseModel):
    question: str
    agent_team: Optional[str] = None


class AnswerIn(BaseModel):
    text: Optional[str] = None


class PrEdit(BaseModel):
    question: Optional[str] = None
    summary: Optional[str] = None
    steps: Optional[List[str]] = None
    caveats: Optional[List[str]] = None
    entry_type: Optional[str] = None
    expiry_months: Optional[int] = None
    share_level: Optional[ShareLevel] = None


class FlagIn(BaseModel):
    reason: Optional[str] = None


class EntryFix(BaseModel):
    summary: str
    steps: List[str] = []
    caveats: List[str] = []


class ResolveConflict(BaseModel):
    keep_entry_id: str


class FeedbackIn(BaseModel):
    status: Literal["useful", "not_relevant"]


class ImpactIn(BaseModel):
    change_description: str
    from_team: Optional[str] = None


class ExitStart(BaseModel):
    person_id: str
    consent: bool


class ExitMessage(BaseModel):
    text: Optional[str] = None
    transcript: Optional[str] = None
    kind: Literal["text", "voice"] = "text"
    duration_s: Optional[int] = None


class ExitSubmit(BaseModel):
    drafts: Optional[dict] = None


class TeamSettingsIn(BaseModel):
    capability_card: Optional[dict] = None
    default_share_level: Optional[ShareLevel] = None
    expiry_defaults: Optional[dict] = None
