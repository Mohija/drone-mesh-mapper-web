# Drone Mesh Mapper Web Frontend

Web-Frontend für Echtzeit-Visualisierung von Drohnen auf einer interaktiven Karte. Basiert auf dem [drone-mesh-mapper](https://github.com/colonelpanichacks/drone-mesh-mapper) Projekt.

## Features

- **Echtzeit-Karte** mit Drohnen-Markern (Leaflet + OpenStreetMap Dark Theme)
- **Status-Farben**: Grün=Aktiv, Gelb=Leerlauf, Rot=Fehler, Grau=Verloren
- **Live-Status Panel** mit Signal, Batterie, Position, FAA-Daten
- **Geolocation** - Karte auf deinen Standort zentrieren
- **Umkreis-Filter** - Drohnen in deiner Nähe anzeigen
- **Drohnen-Details** mit Verlaufs-Tabelle
- **Drone Simulator** - 5 simulierte Drohnen mit verschiedenen Flugmustern

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

## Schnellstart

```bash
# Dependencies installieren
cd frontend && npm install --include=dev
cd ../backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

# Frontend bauen
cd frontend && npm run build

# Server starten
cd backend && ./venv/bin/python3 app.py
```

Dann: http://localhost:3020

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
| `DEFAULT_LAT` | 50.1109 | Standard-Zentrum Breitengrad |
| `DEFAULT_LON` | 8.6821 | Standard-Zentrum Längengrad |
| `DEFAULT_RADIUS` | 10000 | Standard-Suchradius (Meter) |

## Tech Stack

- **Backend:** Python 3.8+, Flask, Flask-CORS
- **Frontend:** React 18, TypeScript, Vite, Leaflet.js
- **Karte:** CartoDB Dark Matter Tiles (OpenStreetMap)

## LabCore Hub

Projekt ist kompatibel mit LabCore Hub Live View:
- Dynamic Basename für React Router
- Relative API_BASE (`./api`)
- `vite.config.ts`: `base: './'`, `hmr: false`
