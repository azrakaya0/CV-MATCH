import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from rate_limit import check_rate_limit


def test_rate_limit_blocks_after_max():
    key = "test-key-unique"
    assert check_rate_limit(key, max_attempts=3, window_seconds=60) is True
    assert check_rate_limit(key, max_attempts=3, window_seconds=60) is True
    assert check_rate_limit(key, max_attempts=3, window_seconds=60) is True
    assert check_rate_limit(key, max_attempts=3, window_seconds=60) is False
