#!/usr/bin/env python3
"""
FlightArc Uninstaller
=====================
Removes FlightArc installation while preserving the database by default.

Usage:
    python3 uninstall.py                # Remove install, keep database
    python3 uninstall.py --keep-db      # Same as above (explicit)
    python3 uninstall.py --delete-db    # Remove everything including database
    python3 uninstall.py --full         # Remove entire project directory
"""

import argparse
import os
import platform
import shutil
import sys
from pathlib import Path

# ─── Constants ────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / "venv"
NODE_MODULES = FRONTEND / "node_modules"
DIST = FRONTEND / "dist"
DB_FILE = BACKEND / "data" / "flightarc.db"
DB_SHM = BACKEND / "data" / "flightarc.db-shm"
DB_WAL = BACKEND / "data" / "flightarc.db-wal"
ENV_FILE = ROOT / ".env"

# ─── Helpers ──────────────────────────────────────────────

def log(msg: str, level: str = "INFO"):
    colors = {"INFO": "\033[36m", "OK": "\033[32m", "WARN": "\033[33m", "ERROR": "\033[31m"}
    reset = "\033[0m"
    prefix = colors.get(level, "") + f"[{level}]" + reset
    print(f"{prefix} {msg}")


def remove_dir(path: Path, name: str):
    """Remove a directory if it exists."""
    if path.exists():
        shutil.rmtree(path)
        log(f"{name} entfernt: {path}", "OK")
    else:
        log(f"{name} nicht vorhanden — übersprungen.", "OK")


def remove_file(path: Path, name: str):
    """Remove a file if it exists."""
    if path.exists():
        path.unlink()
        log(f"{name} entfernt: {path}", "OK")

# ─── Uninstall Steps ─────────────────────────────────────

def uninstall_venv():
    """Remove Python virtual environment."""
    remove_dir(VENV, "Python venv")


def uninstall_node_modules():
    """Remove Node.js dependencies."""
    remove_dir(NODE_MODULES, "node_modules")


def uninstall_dist():
    """Remove frontend build."""
    remove_dir(DIST, "Frontend dist")


def uninstall_env():
    """Remove .env file."""
    remove_file(ENV_FILE, ".env")


def uninstall_pycache():
    """Remove all __pycache__ directories."""
    count = 0
    for cache_dir in ROOT.rglob("__pycache__"):
        shutil.rmtree(cache_dir)
        count += 1
    if count:
        log(f"{count} __pycache__-Verzeichnisse entfernt.", "OK")


def uninstall_database():
    """Remove database files."""
    deleted = False
    for f in [DB_FILE, DB_SHM, DB_WAL]:
        if f.exists():
            f.unlink()
            deleted = True
    if deleted:
        log("Datenbank-Dateien entfernt.", "OK")
    else:
        log("Keine Datenbank-Dateien vorhanden.", "OK")


def uninstall_full():
    """Remove the entire project directory."""
    log(f"Lösche gesamtes Projektverzeichnis: {ROOT}", "WARN")
    # We need to cd out first, then delete
    os.chdir(ROOT.parent)
    shutil.rmtree(ROOT)
    log("Projektverzeichnis vollständig entfernt.", "OK")

# ─── Main ─────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FlightArc Uninstaller",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Beispiele:\n"
            "  python3 uninstall.py              Deinstallation (Datenbank bleibt)\n"
            "  python3 uninstall.py --delete-db   Alles entfernen inkl. Datenbank\n"
            "  python3 uninstall.py --full        Gesamtes Projektverzeichnis löschen\n"
        ),
    )
    parser.add_argument(
        "--keep-db",
        action="store_true",
        default=True,
        help="Datenbank behalten (Standard)",
    )
    parser.add_argument(
        "--delete-db",
        action="store_true",
        help="Datenbank ebenfalls löschen (ACHTUNG: Alle Benutzer und Daten werden gelöscht!)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Gesamtes Projektverzeichnis löschen (inkl. Quellcode, Datenbank, alles)",
    )
    args = parser.parse_args()

    print()
    print("=" * 60)
    print("  FlightArc — DEINSTALLATION")
    print("=" * 60)
    print()

    if args.full:
        log("--full: Das gesamte Projektverzeichnis wird gelöscht!", "WARN")
        confirm = input("  Wirklich ALLES löschen? (ja/nein): ")
        if confirm.strip().lower() not in ("ja", "j", "yes", "y"):
            log("Abgebrochen.", "OK")
            sys.exit(0)
        uninstall_full()
        print()
        log("FlightArc vollständig deinstalliert.", "OK")
        print()
        sys.exit(0)

    if args.delete_db:
        log("--delete-db: Datenbank wird ebenfalls gelöscht!", "WARN")
        confirm = input("  Alle Benutzer und Daten werden gelöscht. Fortfahren? (ja/nein): ")
        if confirm.strip().lower() not in ("ja", "j", "yes", "y"):
            log("Datenbank-Löschung abgebrochen. Fahre ohne DB-Löschung fort.", "OK")
            args.delete_db = False

    # Remove installed components
    log("Entferne installierte Komponenten...")
    print()

    uninstall_venv()
    uninstall_node_modules()
    uninstall_dist()
    uninstall_env()
    uninstall_pycache()

    if args.delete_db:
        uninstall_database()
    else:
        log("Datenbank wird beibehalten (--delete-db zum Löschen).", "OK")

    print()
    print("=" * 60)
    log("Deinstallation abgeschlossen!", "OK")
    if not args.delete_db:
        log("Datenbank wurde beibehalten: backend/data/flightarc.db", "OK")
        log("Neuinstallation mit: python3 install.py", "INFO")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
