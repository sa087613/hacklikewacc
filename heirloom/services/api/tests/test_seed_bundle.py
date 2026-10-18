"""The bundled seed (shipped with the API) must match db/seed, the editable source."""
from scripts.build_seed_bundle import BUNDLE, build, render


def test_seed_bundle_is_up_to_date():
    assert BUNDLE.read_text() == render(build()), "Run: python scripts/build_seed_bundle.py"
