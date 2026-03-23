# FlightArc — Drone Mesh Mapper Web

Web-Anwendung für Echtzeit-Visualisierung und Überwachung von Drohnen auf einer interaktiven Karte. Basiert auf dem [drone-mesh-mapper](https://github.com/colonelpanichacks/drone-mesh-mapper) Projekt.

## Features

- **Echtzeit-Karte** mit Drohnen-Markern (Leaflet + OpenStreetMap Dark Theme)
- **Status-Farben**: Grün=Aktiv, Gelb=Leerlauf, Rot=Fehler, Grau=Verloren
- **Live-Status Panel** mit Signal, Batterie, Position, FAA-Daten
- **Flugzonen & Flugverbotszonen** (DIPUL-Layer) mit Verstoß-Erkennung
- **Multi-Mandanten** — Isolierte Arbeitsbereiche für verschiedene Organisationen
- **Hardware-Empfänger** — ESP32/ESP8266-Integration für echte Open Drone ID Erkennung
- **OTA-Updates** — Firmware-Updates über die Web-Oberfläche
- **Flugberichte** — Aufzeichnung und Export als HTML/PDF-Report

## Voraussetzungen

| Software | Version | Hinweis |
|----------|---------|---------|
| Python   | 3.8+    | Backend + Installer-Skripte |
| Node.js  | 16+     | Frontend (React Build) |
| npm      | 8+      | Wird mit Node.js mitgeliefert |
| Git      | beliebig | Optional — für automatische Updates |

## Installation

### Automatisch (empfohlen)

**Linux / macOS:**
```bash
git clone https://github.com/Mohija/drone-mesh-mapper-web.git
cd drone-mesh-mapper-web
python3 install.py
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/Mohija/drone-mesh-mapper-web.git
cd drone-mesh-mapper-web
.\install.ps1
```

Das Skript erstellt automatisch das Python venv, installiert alle Abhängigkeiten, baut das Frontend und erstellt die `.env`-Datei.

### Manuell

```bash
# Backend
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install --include=dev
npm run build
```

### Server starten

```bash
# Linux/macOS
cd backend && ./venv/bin/python3 app.py

# Windows
cd backend; .\venv\Scripts\python.exe app.py
```

Dann öffnen: http://localhost:3020

## Update

Das Installer-Skript erkennt automatisch, ob FlightArc bereits installiert ist und führt ein Update durch:

```bash
# Linux/macOS
python3 install.py

# Windows
.\install.ps1
```

**Die Datenbank mit allen Benutzern und Daten bleibt beim Update immer erhalten.**

### Update mit Datenbank-Reset

> **ACHTUNG:** Alle Benutzer, Mandanten und Flugdaten werden gelöscht!

```bash
# Linux/macOS
python3 install.py --reset-db

# Windows
.\install.ps1 -ResetDB
```

Es wird eine Sicherheitsabfrage angezeigt, bevor die Datenbank gelöscht wird.

## Deinstallation

### Standard (Datenbank bleibt erhalten)

```bash
# Linux/macOS
python3 uninstall.py

# Windows
.\uninstall.ps1
```

Entfernt: Python venv, node_modules, Frontend-Build, .env, __pycache__. Die Datenbank (`backend/data/flightarc.db`) bleibt erhalten, sodass eine erneute Installation die bestehenden Daten weiter nutzt.

### Mit Datenbank löschen

```bash
# Linux/macOS
python3 uninstall.py --delete-db

# Windows
.\uninstall.ps1 -DeleteDB
```

### Vollständige Entfernung

```bash
# Linux/macOS
python3 uninstall.py --full

# Windows
.\uninstall.ps1 -Full
```

Löscht das gesamte Projektverzeichnis unwiderruflich.

### Skript-Referenz

| Skript | Parameter | Beschreibung |
|--------|-----------|--------------|
| `install.py` / `.ps1` | (keine) | Neuinstallation oder Update |
| `install.py` | `--reset-db` | Update mit Datenbank-Reset |
| `install.ps1` | `-ResetDB` | Update mit Datenbank-Reset |
| `install.py` | `--port N` | Server-Port setzen |
| `install.ps1` | `-Port N` | Server-Port setzen |
| `uninstall.py` / `.ps1` | (keine) | Deinstallation (DB bleibt) |
| `uninstall.py` | `--delete-db` | Deinstallation inkl. Datenbank |
| `uninstall.ps1` | `-DeleteDB` | Deinstallation inkl. Datenbank |
| `uninstall.py` | `--full` | Gesamtes Verzeichnis löschen |
| `uninstall.ps1` | `-Full` | Gesamtes Verzeichnis löschen |

## Architektur

```
Python Flask Backend (Port 3020)
├── /api/drones          → Alle Drohnen (+ Filter nach lat/lon/radius)
├── /api/drones/<id>     → Einzelne Drohne
├── /api/drones/<id>/history → Position-Verlauf
├── /api/fleet/center    → Fleet-Zentrum ändern
├── /health              → Health Check
└── /*                   → React Frontend (dist/)
```

Production Server Pattern: Flask serviert das React Frontend als statische Dateien.

## Entwicklung

```bash
# Backend starten
cd backend && ./venv/bin/python3 app.py

# Frontend Dev Server (separates Terminal)
cd frontend && npm run dev
```

Frontend Dev Server nutzt Vite Proxy für `/api` Requests.

## Umgebungsvariablen

Siehe `.env.example`:

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `DRONE_PORT` | 3020 | Server Port |
| `DEFAULT_LAT` | 52.0302 | Standard-Zentrum Breitengrad |
| `DEFAULT_LON` | 8.5325 | Standard-Zentrum Längengrad |
| `DEFAULT_RADIUS` | 50000 | Standard-Suchradius (Meter) |

## Tech Stack

- **Backend:** Python 3.8+, Flask, SQLAlchemy, SQLite (WAL)
- **Frontend:** React 18, TypeScript, Vite, Leaflet.js
- **Firmware:** C++ (PlatformIO), ESP32-S3/C3, ESP8266
- **Karte:** CartoDB Dark Matter Tiles (OpenStreetMap)

## LabCore Hub

Projekt ist kompatibel mit LabCore Hub Live View:
- Dynamic Basename für React Router
- Relative API_BASE (`./api`)
- `vite.config.ts`: `base: './'`, `hmr: false`
