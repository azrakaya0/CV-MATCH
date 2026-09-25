import logging
import sys

from config import settings


def setup_logging() -> None:
    level = logging.DEBUG if settings.is_development else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    logging.getLogger("uvicorn.access").setLevel(logging.INFO if settings.is_development else logging.WARNING)
