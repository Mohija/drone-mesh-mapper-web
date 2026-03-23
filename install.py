#!/usr/bin/env python3
"""
FlightArc Installer / Updater
==============================
- Fresh install: sets up Python venv, Node dependencies, builds frontend, creates .env
- Update: pulls latest code, updates dependencies, rebuilds frontend
- Database is NEVER deleted unless --reset-db is explicitly passed
- Works on Linux, macOS, and Windows (with Python 3.8+)

Usage:
    python3 install.py              # Install or update
    python3 install.py --reset-db   # Install/update AND reset the database
    python3 install.py --port 3020  # Set custom port
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# ─── Constants ────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / "venv"
DB_FILE = BACKEND / "data" / "flightarc.db"
DB_SHM = BACKEND / "data" / "flightarc.db-shm"
DB_WAL = BACKEND / "data" / "flightarc.db-wal"
ENV_FILE = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"

IS_WINDOWS = platform.system() == "Windows"
PYTHON = str(VENV / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python3"))
PIP = str(VENV / ("Scripts" if IS_WINDOWS else "bin") / ("pip.exe" if IS_WINDOWS else "pip"))

# ─── Helpers ──────────────────────────────────────────────

def log(msg: str, level: str = "INFO"):
    colors = {"INFO": "\033[36m", "OK": "\033[32m", "WARN": "\033[33m", "ERROR": "\033[31m"}
    reset = "\033[0m"
    prefix = colors.get(level, "") + f"[{level}]" + reset
    print(f"{prefix} {msg}")


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    """Run a command, stream output, raise on failure."""
    log(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=check)
    return result


def check_prerequisite(name: str, cmd: list[str]) -> bool:
    """Check if a command is available."""
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        log(f"{name} nicht gefunden. Bitte installieren: https://nodejs.org/ / https://python.org/", "ERROR")
        return False


def is_installed() -> bool:
    """Check if FlightArc is already installed (venv + node_modules + dist exist)."""
    return (
        VENV.exists()
        and (FRONTEND / "node_modules").exists()
        and (FRONTEND / "dist").exists()
    )

# ─── Installation Steps ──────────────────────────────────

def check_prerequisites() -> bool:
    """Verify Python 3.8+ and Node.js are available."""
    ok = True
    # Python version
    if sys.version_info < (3, 8):
        log(f"Python 3.8+ erforderlich, gefunden: {sys.version}", "ERROR")
        ok = False
    # Node.js
    if not check_prerequisite("Node.js", ["node", "--version"]):
        ok = False
    # npm
    if not check_prerequisite("npm", ["npm", "--version"]):
        ok = False
    return ok


def setup_venv():
    """Create or update Python virtual environment."""
    if not VENV.exists():
        log("Erstelle Python Virtual Environment...")
        run([sys.executable, "-m", "venv", str(VENV)])
    else:
        log("Python Virtual Environment existiert bereits.", "OK")

    log("Installiere/aktualisiere Python-Abhängigkeiten...")
    run([PIP, "install", "--upgrade", "pip"], cwd=BACKEND)
    run([PIP, "install", "-r", "requirements.txt"], cwd=BACKEND)
    log("Python-Abhängigkeiten installiert.", "OK")


def setup_frontend():
    """Install Node.js dependencies and build frontend."""
    log("Installiere/aktualisiere Node.js-Abhängigkeiten...")
    run(["npm", "install", "--include=dev"], cwd=FRONTEND)
    log("Node.js-Abhängigkeiten installiert.", "OK")

    log("Baue Frontend (Production Build)...")
    run(["npm", "run", "build"], cwd=FRONTEND)
    log("Frontend erfolgreich gebaut.", "OK")


def setup_env(port: int | None = None):
    """Create .env from .env.example if it doesn't exist."""
    if not ENV_FILE.exists():
        if ENV_EXAMPLE.exists():
            shutil.copy(ENV_EXAMPLE, ENV_FILE)
            log(f".env erstellt aus .env.example", "OK")
        else:
            # Create minimal .env
            ENV_FILE.write_text(
                "DRONE_PORT=3020\n"
                "DEFAULT_LAT=52.0302\n"
                "DEFAULT_LON=8.5325\n"
                "DEFAULT_RADIUS=50000\n"
            )
            log(".env mit Standardwerten erstellt.", "OK")
    else:
        log(".env existiert bereits — wird nicht überschrieben.", "OK")

    # Override port if specified
    if port:
        content = ENV_FILE.read_text()
        lines = content.splitlines()
        new_lines = []
        port_set = False
        for line in lines:
            if line.startswith("DRONE_PORT="):
                new_lines.append(f"DRONE_PORT={port}")
                port_set = True
            else:
                new_lines.append(line)
        if not port_set:
            new_lines.append(f"DRONE_PORT={port}")
        ENV_FILE.write_text("\n".join(new_lines) + "\n")
        log(f"Port auf {port} gesetzt.", "OK")


def setup_data_dir():
    """Ensure backend/data directory exists."""
    data_dir = BACKEND / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "firmware").mkdir(exist_ok=True)
    (data_dir / "archives").mkdir(exist_ok=True)


def reset_database():
    """Delete the database files (only when explicitly requested)."""
    deleted = False
    for f in [DB_FILE, DB_SHM, DB_WAL]:
        if f.exists():
            f.unlink()
            deleted = True
    if deleted:
        log("Datenbank wurde zurückgesetzt. Beim nächsten Start wird eine neue erstellt.", "WARN")
    else:
        log("Keine Datenbank-Dateien zum Löschen gefunden.", "OK")


def pull_updates():
    """Pull latest changes from git if this is a git repository."""
    git_dir = ROOT / ".git"
    if git_dir.exists():
        log("Ziehe aktuelle Änderungen von Git...")
        result = run(["git", "pull", "--ff-only"], cwd=ROOT, check=False)
        if result.returncode == 0:
            log("Git-Updates erfolgreich geladen.", "OK")
        else:
            log("Git pull fehlgeschlagen. Bitte manuell prüfen.", "WARN")
    else:
        log("Kein Git-Repository — überspringe Git pull.", "WARN")

# ─── Main ─────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FlightArc Installer / Updater",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Beispiele:\n"
            "  python3 install.py              Neuinstallation oder Update\n"
            "  python3 install.py --reset-db   Update mit Datenbank-Reset\n"
            "  python3 install.py --port 8080  Installation mit Port 8080\n"
        ),
    )
    parser.add_argument(
        "--reset-db",
        action="store_true",
        help="Datenbank zurücksetzen (ACHTUNG: Alle Benutzer und Daten werden gelöscht!)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Server-Port setzen (Standard: 3020)",
    )
    args = parser.parse_args()

    updating = is_installed()
    mode = "UPDATE" if updating else "INSTALLATION"

    print()
    print("=" * 60)
    print(f"  FlightArc — {mode}")
    print("=" * 60)
    print()

    # 1. Check prerequisites
    if not check_prerequisites():
        log("Fehlende Voraussetzungen. Bitte installieren und erneut versuchen.", "ERROR")
        sys.exit(1)

    # 2. Git pull (only on update)
    if updating:
        pull_updates()

    # 3. Database reset (only if explicitly requested)
    if args.reset_db:
        log("--reset-db angegeben: Datenbank wird zurückgesetzt!", "WARN")
        confirm = input("  Alle Benutzer und Daten werden gelöscht. Fortfahren? (ja/nein): ")
        if confirm.strip().lower() not in ("ja", "j", "yes", "y"):
            log("Datenbank-Reset abgebrochen.", "OK")
        else:
            reset_database()

    # 4. Setup
    setup_data_dir()
    setup_venv()
    setup_frontend()
    setup_env(args.port)

    # 5. Done
    print()
    print("=" * 60)
    if updating:
        log(f"Update erfolgreich abgeschlossen!", "OK")
        log("Datenbank und Benutzer wurden beibehalten.", "OK")
    else:
        log(f"Installation erfolgreich abgeschlossen!", "OK")

    # Read port from .env
    port = 3020
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith("DRONE_PORT="):
                try:
                    port = int(line.split("=", 1)[1].strip())
                except ValueError:
                    pass

    print()
    log("Server starten mit:")
    if IS_WINDOWS:
        log(f"  cd backend && venv\\Scripts\\python.exe app.py")
    else:
        log(f"  cd backend && ./venv/bin/python3 app.py")
    log(f"  Dann öffnen: http://localhost:{port}")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
