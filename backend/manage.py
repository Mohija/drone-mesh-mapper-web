#!/usr/bin/env python3
"""FlightArc DB management CLI.

Usage:
    python manage.py backup [reason]            # create snapshot
    python manage.py list-backups               # show existing backups
    python manage.py restore FILENAME           # restore from backup
    python manage.py migrate status             # list applied + pending migrations
    python manage.py migrate run                # apply pending migrations
    python manage.py verify-data                # quick sanity check (counts)

All operations target the DB referenced by the app config
(`sqlite:///.../flightarc.db` by default). See DATABASE_LIFECYCLE.md.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time


def _resolve_db_path() -> str:
    # Importing app also runs its startup path — we don't want that for CLI ops.
    # Instead we read the path directly from the known default.
    from backup import DEFAULT_DB_PATH
    return os.environ.get("FLIGHTARC_DB_PATH") or DEFAULT_DB_PATH


def cmd_backup(args) -> int:
    from backup import create_backup
    db_path = _resolve_db_path()
    reason = args.reason or "manual"
    dst = create_backup(reason, db_path=db_path)
    if dst is None:
        print(f"No backup created — source file missing or empty: {db_path}")
        return 1
    print(f"Backup: {dst}")
    return 0


def cmd_list(args) -> int:
    from backup import list_backups
    items = list_backups()
    if not items:
        print("No backups yet.")
        return 0
    print(f"{'Date':20} {'Size':>10} {'Name'}")
    for it in items:
        t = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(it["mtime"]))
        size = f"{it['size']/1024:.1f} KB"
        print(f"{t:20} {size:>10} {it['name']}")
    return 0


def cmd_restore(args) -> int:
    from backup import restore_backup
    db_path = _resolve_db_path()
    if not args.confirm:
        print(
            f"WARNING: Will replace {db_path}\n"
            f"A pre-restore snapshot of the current DB is taken automatically.\n"
            f"Re-run with --confirm to proceed."
        )
        return 2
    pre = restore_backup(args.file, db_path=db_path)
    print(f"Restored from {args.file}")
    if pre:
        print(f"Pre-restore snapshot: {pre}")
    return 0


def cmd_migrate_status(args) -> int:
    from app import app, db  # noqa: F401  (imports start the app briefly)
    from migrations import MIGRATIONS, applied_versions
    with app.app_context():
        applied = applied_versions(db)
    print(f"{'Status':<10} {'Version':<35} Description")
    print("-" * 80)
    for m in MIGRATIONS:
        status = "applied" if m["version"] in applied else "PENDING"
        print(f"{status:<10} {m['version']:<35} {m.get('description','')}")
    pending = [m for m in MIGRATIONS if m["version"] not in applied]
    if pending:
        print(f"\n{len(pending)} pending migration(s). Run: python manage.py migrate run")
    else:
        print("\nAll migrations applied.")
    return 0


def cmd_migrate_run(args) -> int:
    from app import app, db
    from migrations import run_migrations
    from backup import create_backup
    db_path = _resolve_db_path()
    with app.app_context():
        applied = run_migrations(
            db,
            backup_fn=lambda reason: create_backup(reason, db_path=db_path),
        )
    if applied:
        print(f"Applied: {', '.join(applied)}")
    else:
        print("Nothing to do — schema already current.")
    return 0


def cmd_cleanup(args) -> int:
    """Run retention prune immediately — safe to run anytime."""
    from app import app  # noqa: F401
    from retention import run_retention
    stats = run_retention(app)
    print(json.dumps(stats, indent=2))
    return 0


def cmd_db_stats(args) -> int:
    """Show per-table row counts + DB file size."""
    from app import app  # noqa: F401
    from retention import db_stats
    stats = db_stats(app)
    print(json.dumps(stats, indent=2))
    return 0


def cmd_verify_data(args) -> int:
    from app import app, db  # noqa: F401
    from models import Tenant, User, ReceiverNode, FlightZone
    with app.app_context():
        data = {
            "tenants": Tenant.query.count(),
            "users": User.query.count(),
            "receivers": ReceiverNode.query.count(),
            "flight_zones": FlightZone.query.count(),
            "tenants_detail": [
                {"id": t.id, "name": t.name, "display_name": t.display_name, "active": t.is_active}
                for t in Tenant.query.all()
            ],
        }
    print(json.dumps(data, indent=2))
    # Exit non-zero if suspiciously empty
    if data["tenants"] == 0:
        print("\nWARNING: zero tenants — data may have been wiped", file=sys.stderr)
        return 2
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_backup = sub.add_parser("backup", help="Create a timestamped DB snapshot")
    p_backup.add_argument("reason", nargs="?", default=None)
    p_backup.set_defaults(func=cmd_backup)

    p_list = sub.add_parser("list-backups", help="List existing backups")
    p_list.set_defaults(func=cmd_list)

    p_restore = sub.add_parser("restore", help="Restore DB from a backup file")
    p_restore.add_argument("file", help="Backup filename (under data/backups/) or full path")
    p_restore.add_argument("--confirm", action="store_true", help="Actually perform the restore")
    p_restore.set_defaults(func=cmd_restore)

    p_migrate = sub.add_parser("migrate", help="Schema migration management")
    msub = p_migrate.add_subparsers(dest="migrate_cmd", required=True)
    msub.add_parser("status").set_defaults(func=cmd_migrate_status)
    msub.add_parser("run").set_defaults(func=cmd_migrate_run)

    sub.add_parser("cleanup", help="Run retention pruning now (normally hourly)").set_defaults(func=cmd_cleanup)
    sub.add_parser("db-stats", help="Show row counts + DB file size").set_defaults(func=cmd_db_stats)
    sub.add_parser("verify-data", help="Sanity check — print counts").set_defaults(func=cmd_verify_data)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    raise SystemExit(main())
