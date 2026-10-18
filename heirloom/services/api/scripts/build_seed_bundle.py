"""Pack db/seed (the editable source) into services/api/seed_bundle.json, which ships with the API.

Run after editing anything under db/seed:  python scripts/build_seed_bundle.py
tests/test_seed_bundle.py fails if the bundle is out of date.
"""
import json
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[1]
SEED = API.parents[1] / "db" / "seed"
BUNDLE = API / "seed_bundle.json"


def build() -> dict:
    data = {name: json.loads((SEED / f"{name}.json").read_text()) for name in ("teams", "people", "topics", "topic_knowers", "entries")}
    data["docs"] = {f"{p.parent.name}/{p.name}": p.read_text() for p in sorted((SEED / "docs").glob("*/*.md"))}
    return data


def render(data: dict) -> str:
    return json.dumps(data, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


if __name__ == "__main__":
    BUNDLE.write_text(render(build()))
    print(f"Wrote {BUNDLE.relative_to(API)} ({len(build()['docs'])} docs)")
    sys.exit(0)
