import os
import sys
import tempfile
from pathlib import Path

# Tests always run fully offline against a throwaway SQLite file, whatever .env says.
os.environ["HEIRLOOM_OFFLINE"] = "1"
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="heirloom-test-")
os.environ["AGENT_TRANSPORT"] = "inprocess"
# HEIRLOOM_TEST_DATABASE_URL (if set) runs the suite against a disposable Postgres instead of SQLite.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


@pytest.fixture()
def seeded():
    """A freshly seeded database for tests that change state."""
    from scripts.seed import seed

    seed(verbose=False)
    yield


@pytest.fixture()
def client(seeded):
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


def as_(person_id):
    return {"X-Person-Id": person_id}
