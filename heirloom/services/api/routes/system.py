import sqlalchemy as sa
from fastapi import APIRouter

from config import settings
from store.db import tx
from store.schema import chunks, knowledge_entries, people, sources, teams

router = APIRouter()

SAMPLES = {
    "maria-retro": {
        "label": "Maria: retro pay with overtime (voice note, 0:48)",
        "duration_s": 48,
        "text": "When a retro pay correction touches overtime, I recalculate each affected workweek separately at the "
                "corrected regular rate. First, find every workweek in the correction window. Then recompute the overtime "
                "premium at 1.5 times the corrected rate for each of those weeks. Pay the difference in the next regular "
                "run as a retro earning coded RETRO-OT. Don't reopen the closed period. Watch out for the shortcut of rate "
                "difference times total hours, because it underpays anyone with overtime.",
    },
    "maria-followup": {
        "label": "Maria: exceptions and backup",
        "duration_s": 21,
        "text": "The usual mistake is skipping weeks that had no overtime before the correction but do after it. "
                "Ana Torres has watched me run the worksheet and could cover in a pinch.",
    },
    "marcus-recheck": {
        "label": "Marcus: retro pay and eligibility re-checks (voice note, 0:32)",
        "duration_s": 32,
        "text": "Yes. A retro pay correction triggers a benefits eligibility re-check only when it changes scheduled hours "
                "for a biweekly period. Overtime-only corrections do not trigger a re-check, because eligibility ignores "
                "overtime hours. Rerun the eligibility evaluation for each affected biweekly period. Notify Priya Nair if "
                "the result changes someone's coverage.",
    },
}


@router.get("/config")
def config():
    status = settings.provider_status()
    return {"providers": status, "offline": settings.offline_providers, "demo_mode": settings.demo_mode,
            "expert_timeout_minutes": settings.timeout_minutes, "max_hops": settings.max_hops,
            "expert_open_cap": settings.expert_open_cap, "llm_model": settings.anthropic_model if status["llm"] == "claude" else "mock"}


@router.get("/health")
def health():
    try:
        with tx() as conn:
            count = lambda t: conn.execute(sa.select(sa.func.count()).select_from(t)).scalar()
            counts = {"teams": count(teams), "people": count(people), "sources": count(sources),
                      "chunks": count(chunks), "entries": count(knowledge_entries)}
        return {"status": "ok", "db": True, "counts": counts, "providers": settings.provider_status()}
    except Exception as e:  # health should report, not crash
        return {"status": "degraded", "db": False, "error": str(e)}


@router.get("/demo/samples")
def samples():
    return SAMPLES


@router.post("/demo/reset")
def reset():
    """Reset to the seed state (demo rehearsal)."""
    from scripts.seed import seed

    return {"reset": True, "counts": seed(verbose=False)}
