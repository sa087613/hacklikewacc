from typing import List, Literal, Optional

from pydantic import BaseModel

ShareLevel = Literal["team", "cross_team", "company"]
SourceType = Literal["doc", "meeting", "voice_note", "expert_answer"]


class Team(BaseModel):
    id: str
    name: str
    accent_color: str
    default_share_level: ShareLevel
    capability_card: dict


class Person(BaseModel):
    id: str
    name: str
    title: str
    team_id: str
    role: Literal["member", "expert", "lead"]
    is_knowledge_owner: bool
    is_departing: bool


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
