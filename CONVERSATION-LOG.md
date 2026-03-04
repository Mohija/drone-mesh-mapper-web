# Conversation Log: Drone Mesh Mapper Web Frontend
> Automatisch gepflegtes Log aller Änderungen

## Metadaten
- **Erstellt:** 2026-03-04 | **Letzte Änderung:** 2026-03-04
- **Typ:** Projekt | **Status:** Development

## Änderungshistorie

### 2026-03-04 - Initiale Projekterstellung
**Änderungen:**
- Projekt-Struktur erstellt (backend/ + frontend/)
- Python Flask Backend mit Drone Simulator (adaptiert von drone-mesh-mapper Tester)
- REST API: `/api/drones`, `/api/drones/<id>`, `/api/drones/<id>/history`, `/api/fleet/center`
- React + TypeScript Frontend mit Vite
- Leaflet.js Karte mit Dark Theme (CartoDB Dark Matter Tiles)
- Drohnen-Marker mit Status-Farben und Pulsing-Animation
- StatusPanel mit Signal, Batterie, Position, FAA-Daten
- Geolocation-Button für Benutzer-Standort
- Drohnen-Detailseite mit vollständigen Infos und Status-History
- Production Server Pattern (Flask serviert frontend/dist/)
- LabCore Hub Live View kompatibel (Dynamic Basename, relative API_BASE)
- manifest.json und CONVERSATION-LOG.md erstellt

**Dateien:**
- `backend/app.py` - Flask Server mit API und Static File Serving
- `backend/drone_simulator.py` - Drone Fleet Simulation (5 Drohnen)
- `backend/requirements.txt` - Python Dependencies
- `frontend/src/main.tsx` - Entry mit Dynamic Basename
- `frontend/src/App.tsx` - Router Setup
- `frontend/src/api.ts` - API Client (relative './api')
- `frontend/src/index.css` - Dark Theme CSS
- `frontend/src/types/drone.ts` - TypeScript Interfaces
- `frontend/src/components/MapComponent.tsx` - Leaflet Karte
- `frontend/src/components/MapPage.tsx` - Hauptseite
- `frontend/src/components/StatusPanel.tsx` - Rechts-Panel
- `frontend/src/components/GeolocationButton.tsx` - Standort-Button
- `frontend/src/components/DroneDetailPage.tsx` - Detailseite
- `frontend/src/components/StatusHistory.tsx` - Verlaufs-Tabelle
- `frontend/vite.config.ts` - Vite Config (base: './', hmr: false)
- `manifest.json` - LabCore Hub Manifest
- `.env.example` - Umgebungsvariablen-Vorlage
- `.gitignore`
- `README.md`

### 2026-03-04 - Strukturiertes Logging und vollständiges Testing

**Änderungen:**
- **Backend Logging:** `print()` durch Python `logging` Modul ersetzt (app.py + drone_simulator.py)
  - Named Logger (`app`, `dronefleet`) mit Levels (INFO, WARNING, DEBUG)
  - Logging für API-Requests, Fleet Start/Stop, Batterie-Warnungen, Status-Änderungen, Fehler
- **Backend Tests (pytest):** 59 Tests in `tests/test_drone_simulator.py` und `tests/test_api.py`
  - Alle Utility-Funktionen, DroneSimulator, DroneFleet, alle API-Endpoints
- **Frontend Unit Tests (Vitest):** 32 Tests
  - `api.test.ts` - API Client mit fetch mocking
  - `App.test.tsx` - Router Setup
  - `StatusPanel.test.tsx` - Alle Panel-Sektionen
  - `DroneDetailPage.test.tsx` - Detail-Seite inkl. Fehler-/Loading-States
- **E2E Tests (Playwright):** 29 Tests in `e2e/`
  - `api.spec.ts` - Alle API-Endpoints E2E
  - `map-page.spec.ts` - Karte, Marker, StatusPanel, Navigation
  - `drone-detail.spec.ts` - Detailseite, alle 5 Drohnen, Fehlerseite
- **Bugfixes:**
  - Flask SPA Fallback: `static_folder=None` statt FRONTEND_DIST (Fix für Subrouten)
  - Vite `base: '/'` statt `'./'` (Fix für Asset-Pfade auf Subrouten)
  - `API_BASE = '/api'` statt `'./api'` (Fix für API-Calls auf Subrouten)
  - StatusPanel Close-Button: `aria-label="Panel schließen"` für eindeutige E2E-Selektion
  - MapPage `loadDrones`: Stale Closure behoben durch funktionalen `setSelectedDrone`

**Dateien:**
- `backend/app.py` - Logging hinzugefügt, static_folder=None
- `backend/drone_simulator.py` - Logging hinzugefügt
- `backend/requirements.txt` - pytest, pytest-flask hinzugefügt
- `backend/tests/__init__.py` - Test-Package
- `backend/tests/conftest.py` - pytest Fixtures
- `backend/tests/test_drone_simulator.py` - 40 Simulator-Tests
- `backend/tests/test_api.py` - 19 API-Tests
- `frontend/vite.config.ts` - base: '/'
- `frontend/vitest.config.ts` - Vitest Konfiguration
- `frontend/src/api.ts` - API_BASE = '/api'
- `frontend/src/test/setup.ts` - Test Setup
- `frontend/src/test/mocks.ts` - Mock Helpers
- `frontend/src/api.test.ts` - API Tests
- `frontend/src/App.test.tsx` - Router Tests
- `frontend/src/components/StatusPanel.tsx` - aria-label auf Close-Button
- `frontend/src/components/StatusPanel.test.tsx` - Panel Tests
- `frontend/src/components/DroneDetailPage.test.tsx` - Detailseite Tests
- `frontend/src/components/MapPage.tsx` - Stale Closure Fix
- `frontend/e2e/playwright.config.ts` - Playwright Konfiguration
- `frontend/e2e/api.spec.ts` - API E2E Tests
- `frontend/e2e/map-page.spec.ts` - Map E2E Tests
- `frontend/e2e/drone-detail.spec.ts` - Detail E2E Tests

## Offene Aufgaben
- [ ] WebSocket-Integration für echte Push-Updates statt Polling
- [ ] ESP 8266 MicroPython-Anpassung
- [ ] Integration mit echtem drone-mesh-mapper Hardware-Setup
- [ ] Docker Deployment Package

## Notizen
- Simulation generiert 5 Drohnen mit verschiedenen Flugmustern (linear, circular, waypoint, search, hover)
- Drohnen-Positionen basierend auf dem drone-mesh-mapper Tester-Format
- Standard-Zentrum: Frankfurt (50.1109, 8.6821) - kann über Geolocation oder ENV angepasst werden
- Polling-Intervall: 2 Sekunden
