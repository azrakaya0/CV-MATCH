import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from services.rule_matcher import rule_skill_match


def test_rule_skill_match_finds_overlap():
    score, matched, missing = rule_skill_match(
        ["Python", "FastAPI"],
        ["python", "Docker"],
    )
    assert score > 0
    assert len(matched) >= 1
    assert "Docker" in missing or "docker" in [m.lower() for m in missing]
