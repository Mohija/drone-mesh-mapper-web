"""
Database initialization — SQLAlchemy + SQLite with WAL mode.
Supports future migration to PostgreSQL by changing DATABASE_URL.
"""

import logging
import os

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event

logger = logging.getLogger("database")

db = SQLAlchemy()

DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "flightarc.db"
)


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    """Set SQLite PRAGMAs for performance and safety."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def init_db(app, db_uri=None):
    """Initialize the database with the Flask app.

    Args:
        app: Flask application instance.
        db_uri: Optional database URI override (e.g. for testing with :memory:).
    """
    if db_uri is None:
        db_uri = os.environ.get(
            "DATABASE_URL",
            f"sqlite:///{DEFAULT_DB_PATH}",
        )

    app.config["SQLALCHEMY_DATABASE_URI"] = db_uri
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    # SQLite-specific PRAGMAs for performance and safety
    if db_uri.startswith("sqlite"):
        with app.app_context():
            event.listens_for(db.engine, "connect")(_set_sqlite_pragmas)

    logger.info("Database initialized: %s", db_uri)
