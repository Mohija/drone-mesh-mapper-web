# Conversation Log: Drone Mesh Mapper Web Frontend
> Automatisch gepflegtes Log aller Änderungen

## Metadaten
- **Erstellt:** 2026-03-04 | **Letzte Änderung:** 2026-03-11
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

### 2026-03-04 - Bugfix: Map-Position nach Drohnen-Detail Navigation
**Änderungen:**
- **Bug:** Beim Öffnen der Drohnen-Detailseite und Zurückkehren wurde die Karte auf Frankfurt (Initialposition) zurückgesetzt statt die aktuelle Position beizubehalten
- **Ursache:** MapPage wird beim Routenwechsel unmounted, MapComponent initialisiert beim Remount mit hardcoded `[50.1109, 8.6821]`
- **Fix:** Module-level Variablen `savedCenter`/`savedZoom` speichern die Map-Position beim Unmount und stellen sie beim Remount wieder her

**Dateien:**
- `frontend/src/components/MapComponent.tsx` - Map-Position persistieren über Remounts
- `frontend/dist/` - Rebuild

### 2026-03-10 - Provider Pattern: Oeffentliche Datenquellen
**Änderungen:**
- **Provider Pattern:** Abstrakte Basisklasse mit Caching, Error Handling und Normalisierung
- **5 Datenquellen:** Simulator (Default ON), OpenSky Network, adsb.fi, adsb.lol, Open Glider Network
- **Settings-System:** `settings.json` mit thread-safe SettingsManager, REST API (`GET/POST /api/settings`)
- **Provider Registry:** Paralleles Fetching via ThreadPoolExecutor, Compound IDs (`{source}_{id}`)
- **Settings-Seite:** Dark Theme UI mit Toggle-Switches pro Datenquelle
- **Source-Marker:** Farbcodierung nach Quelle (Blau=Simulator, Orange=OpenSky, Lila=adsb.fi, Pink=adsb.lol, Gruen=OGN)
- **Null-safe Rendering:** StatusPanel, DroneDetailPage, MapComponent behandeln fehlende Felder (signal, battery, pilot) mit "N/A"
- **Source-Badge:** Label der Datenquelle in StatusPanel, DroneDetailPage und Map-Popup

**Dateien:**
- `backend/settings.py` - SettingsManager (load/save/thread-safe)
- `backend/providers/__init__.py` - ProviderRegistry mit parallelem Fetching
- `backend/providers/base_provider.py` - Abstrakte Basisklasse
- `backend/providers/simulator_provider.py` - DroneFleet Wrapper
- `backend/providers/opensky_provider.py` - OpenSky Network API
- `backend/providers/adsbfi_provider.py` - adsb.fi API
- `backend/providers/adsblol_provider.py` - adsb.lol API
- `backend/providers/ogn_provider.py` - Open Glider Network API
- `backend/app.py` - Registry + Settings Endpoints integriert
- `frontend/src/types/drone.ts` - Nullable Felder, DataSourceSettings Interface
- `frontend/src/api.ts` - fetchSettings/updateSettings, encodeURIComponent fuer Compound IDs
- `frontend/src/App.tsx` - Route /settings
- `frontend/src/components/SettingsPage.tsx` - Datenquellen-Verwaltung
- `frontend/src/components/MapPage.tsx` - Settings-Button (Zahnrad)
- `frontend/src/components/MapComponent.tsx` - Source-Farben, null-safe Popup
- `frontend/src/components/StatusPanel.tsx` - Source-Badge, null-safe Signal/Batterie/Pilot
- `frontend/src/components/DroneDetailPage.tsx` - Source-Badge, null-safe Stats
- `frontend/dist/` - Rebuild

### 2026-03-10 - Radius-Steuerung + Performance-Optimierung
**Änderungen:**
- **Radius zentriert auf Benutzer-Position:** Wenn Geolocation aktiv, wird der Radius um die eigene Position angewendet
- **Radius-Toggle:** Button zum Ein-/Ausschalten des Radius-Filters (Aus = alle Drohnen anzeigen)
- **Radius-Auswahl:** Dropdown mit 5/10/25/50/100/250 km Optionen (Default: 50km)
- **Backend:** `radius=0` bedeutet kein Filter (Simulator gibt alle zurück, externe APIs nutzen MAX_EXTERNAL_RADIUS=500km)
- **Radius-Bug Fix:** Cache berücksichtigt jetzt Parameter (lat/lon/radius) — bei Radius-Wechsel wird Cache invalidiert
- **Cache-Key Fix:** `radius_key = 0 if radius_m <= 0 else max(round(radius_m, -2), 100)` verhindert Kollision zwischen radius=0 und kleinen positiven Werten
- **Performance:** `L.circleMarker` mit Canvas-Renderer statt `L.DivIcon` (DOM-Elemente) — drastisch weniger DOM-Manipulation bei 300+ Markern
- **Performance:** Polling-Intervall erhöht auf 5s wenn >100 Drohnen (sonst 2s)
- **Performance:** Pulse-CSS-Animation entfernt (verursachte Repaints für jeden Marker)
- **Default-Ort:** Bielefeld (52.0302, 8.5325) statt Frankfurt als Standard-Zentrum
- **Radius immer aktiv:** lat/lon/radius werden immer gesendet (Default-Center wenn keine Geolocation)
- **Zoom-Fix:** Canvas-Renderer (`preferCanvas: true`) statt SVG — korrekte Marker-Positionen bei allen Zoom-Stufen

### 2026-03-10 - Umfassende Test-Abdeckung für Radius-Toggle
**Änderungen:**
- **Backend Tests (+18):** 105 Tests gesamt (vorher 87)
  - `test_api.py`: radius=0 returns all, toggle-sequence, default radius, drone data structure
  - `test_providers.py`: SimulatorRadiusFilter (5 Tests), BaseProviderCaching (+2), ExternalProviderDefaults (4)
  - `test_settings.py`: Settings API und Datenquellen-Integration (9 Tests)
- **E2E Tests (+10):** 39 Tests gesamt (vorher 29)
  - `map-page.spec.ts`: Radius-Toggle UI (shows controls, disables/enables, API params, select changes), Settings-Navigation
  - `api.spec.ts`: radius=0 API, toggle-sequence, Settings GET/POST
  - Canvas-kompatible Marker-Klicks via `page.evaluate()` mit Leaflet interner API (`_leaflet_map`)

**Dateien:**
- `frontend/src/components/MapPage.tsx` - Radius-State, Toggle-Button, DEFAULT_CENTER Bielefeld, immer lat/lon senden
- `frontend/src/components/MapComponent.tsx` - Canvas-Renderer, CircleMarker, `_leaflet_map` Exposure für E2E
- `frontend/e2e/map-page.spec.ts` - 6 neue Tests (Radius-Toggle, Settings), Canvas-Marker-Klick-Helper
- `frontend/e2e/api.spec.ts` - 4 neue Tests (radius=0, toggle-sequence, Settings API)
- `backend/app.py` - Default-Center Bielefeld, Default-Radius 50km
- `backend/providers/base_provider.py` - Cache-Invalidierung mit Parameter-Tuple, Cache-Key-Fix
- `backend/providers/simulator_provider.py` - radius<=0 gibt alle Drohnen zurück
- `backend/providers/__init__.py` - MAX_EXTERNAL_RADIUS für externe APIs wenn Radius deaktiviert
- `backend/tests/test_api.py` - 4 neue Tests, Bielefeld-Koordinaten
- `backend/tests/test_providers.py` - 8 neue Tests (Radius, Caching, External Defaults)
- `.env.example` - Bielefeld als Default
- `frontend/dist/` - Rebuild

### 2026-03-11 - No-Flight-Zones (DIPUL WMS Integration) + Hover-Tooltip
**Änderungen:**
- **DIPUL WMS Integration:** Flugverbotszonen-Overlay basierend auf DFS Deutsche Flugsicherung WMS-Service
- **WMS Endpoint:** `https://uas-betrieb.de/geoservices/dipul/wms` - 17 Layer in 5 Kategorien
- **Kategorien:** Luftfahrt (4 Layer, default AN), Temporaer (1), Naturschutz (4), Infrastruktur (4), Sensible Bereiche (3)
- **NFZ Toggle-Button:** In der Top-Bar mit Warn-Icon, Badge mit aktiver Layer-Anzahl, X-Button zum Deaktivieren
- **Layer-Auswahl-Panel:** Dropdown mit Kategorie- und Einzel-Layer-Toggles, Master-Toggle (Alle an/aus)
- **MapComponent:** `L.tileLayer.wms()` mit transparentem PNG-Overlay, dynamische Layer-Updates via `setParams()`
- **Hover-Tooltip:** Beim Hovern ueber NFZ-Zonen wird per WMS GetFeatureInfo (direkt, CORS erlaubt) der Zonenname, Typ (Flughafen/Kontrollzone/etc.), Hoehengrenze und Rechtsgrundlage angezeigt
- **GetFeatureInfo:** Debounced (200ms), AbortController fuer Cancellation, versteckt bei Zoom/Pan/Mouseout
- **WMS Version:** 1.1.1 (maximale Kompatibilitaet mit Leaflet EPSG:3857)
- **Backend Proxy:** `/api/nofly/check` (WMS-Verfuegbarkeitspruefung), `/api/nofly/info` (GetFeatureInfo-Proxy als Fallback)
- **Logging:** `nofly` Logger fuer alle WMS-Proxy-Aufrufe (debug/info/warning/error)
- **LocalStorage:** Layer-Auswahl wird persistent gespeichert
- **Attribution:** "Geodaten: DFS, BKG 2026" wird bei aktiven Zonen angezeigt
- **Positionspruefung:** Screenshots bei Frankfurt Airport (z11/z14) und Bielefeld (z10/z13) verifiziert - korrekte Ausrichtung
- **Backend Tests (+18):** 123 Tests gesamt - NoFlyCheck (5 Tests), NoFlyFeatureInfo (13 Tests)
- **Frontend Unit Tests (+11):** 56 Tests gesamt - noFlyZones config (20), API nofly functions (3)
- **E2E Tests (+20):** 59 Tests gesamt - NFZ UI (12), Hover-Tooltip (3), NFZ API (5)
- **API-Pruefung:** Alle WMS-Anbindungen einzeln getestet (GetCapabilities, GetMap, GetFeatureInfo, CORS)

**Dateien:**
- `frontend/src/config/noFlyZones.ts` - **NEU** Layer-Definitionen, Kategorien, WMS URL
- `frontend/src/components/NoFlyZonesPanel.tsx` - **NEU** Layer-Auswahl-UI mit Kategorie-Toggles
- `frontend/src/components/MapComponent.tsx` - WMS TileLayer, Hover GetFeatureInfo Tooltip, type_code Labels
- `frontend/src/components/MapPage.tsx` - NFZ State-Management, Toggle-Button, Panel-Integration
- `frontend/src/api.ts` - checkNoFlyWms(), fetchNoFlyInfo() API-Funktionen
- `backend/app.py` - /api/nofly/check und /api/nofly/info Proxy-Endpoints, nofly_logger
- `frontend/src/config/noFlyZones.test.ts` - **NEU** 20 Unit-Tests
- `frontend/src/api.test.ts` - 3 neue Tests fuer nofly API
- `frontend/e2e/nofly-zones.spec.ts` - **NEU** 20 E2E-Tests (UI + Hover + API)
- `backend/tests/test_nofly.py` - **NEU** 18 Backend-Tests
- `frontend/dist/` - Rebuild

### 2026-03-11 - NFZ Infrastruktur-Sichtbarkeit + Bugfixes + Detail-Popups
**Änderungen:**
- **Infrastruktur-Layer unsichtbar:** Root Cause gefunden — WMS rendert alle Features in dunklen Farben (dunkelblau/lila), die auf der dunklen Karte (CartoDB Dark Matter) unsichtbar waren
- **CSS Color Inversion:** `filter: invert(1) hue-rotate(180deg) brightness(1.3)` auf WMS-Tiles — wandelt dunkle Features in helle Farben um, perfekt sichtbar auf Dark Theme
- **Alle 4 Infrastruktur-Layer verifiziert:** Bundesautobahnen (Pufferzonen), Stromleitungen (Linien), Windkraftanlagen (kleine Polygone in Norddeutschland), Kraftwerke (Punkte) — alle rendern korrekt und sind jetzt sichtbar
- **FFH-Gebiete Layer Fix:** WMS-Layername korrigiert von `dipul:ffh_gebiete` (Unterstrich) zu `dipul:ffh-gebiete` (Bindestrich) — Layer war vorher nicht auffindbar (WMS "LayerNotDefined" Fehler)
- **Klick-Popup:** Beim Klicken auf eine NFZ-Zone öffnet sich ein Leaflet-Popup mit detaillierten Informationen (Name, Typ, Höhengrenzen, Rechtsgrundlage, Referenz, und alle weiteren verfügbaren Properties)
- **Popup Dark-Theme:** CSS-Styling für Leaflet-Popups angepasst (dunkler Hintergrund, heller Text)
- **Tooltip-Verbesserungen:** Zeigt jetzt untere UND obere Höhengrenzen (vorher nur obere), kategoriespezifische Farben (rot=Luftfahrt, grün=Natur, gelb=Infrastruktur, lila=Sensibel, orange=Temporär)
- **WMS Layer-Analyse:** Alle 34 verfügbaren DIPUL WMS-Layer identifiziert (17 konfiguriert, 17 weitere verfügbar)
- **Property-Schema verifiziert:** Alle Layer nutzen gleiches Schema: `name`, `type_code`, `legal_ref`, `lower_limit_altitude/unit/alt_ref`, `upper_limit_altitude/unit/alt_ref`, `external_reference`

**Dateien:**
- `frontend/src/index.css` - CSS Filter für WMS-Tiles (invert+hue-rotate+brightness), Popup Dark-Theme
- `frontend/src/config/noFlyZones.ts` - FFH-Layername Fix (Unterstrich → Bindestrich)
- `frontend/src/components/MapComponent.tsx` - className für WMS-Layer, Klick-Handler mit Popup, Opacity 0.85, verbesserte Tooltip-Formatierung
- `frontend/src/config/noFlyZones.test.ts` - FFH-Hyphen-Regression-Test
- `frontend/e2e/nofly-zones.spec.ts` - Klick-Popup E2E-Test
- `frontend/dist/` - Rebuild

### 2026-03-11 - NFZ Radius-Begrenzung + Alle Layer verifiziert + Disable-Fix
**Änderungen:**
- **NFZ Radius-Begrenzung:** Optionaler Radius um aktuelle Position, begrenzt WMS-Tile-Ladung auf Umkreis
  - Toggle-Button + Dropdown (10/25/50/100/250 km) erscheint wenn NFZ aktiviert
  - Nutzt Leaflet `bounds`-Option auf WMS-TileLayer — verhindert Tile-Requests außerhalb des Radius
  - Zentriert auf Benutzer-Position (GPS) oder Default-Position (Bielefeld)
  - Deaktivierbar für unbegrenztes Laden (Symbol ∞)
- **Alle 17 Layer einzeln verifiziert:** GetMap-Requests für jeden Layer bestätigt:
  - 15/17 Layer haben sichtbare Daten bei Deutschland-Übersicht
  - `temporaere_betriebseinschraenkungen`: Leer (keine aktuellen temporären Einschränkungen)
  - `kraftwerke`: Sehr kleine Punkt-Features, sichtbar bei höherem Zoom
- **Enable/Disable verifiziert:** 4 dedizierte E2E-Tests bestätigen:
  - Aktivieren lädt WMS-Tiles (`.nfz-wms-tiles img` Elemente vorhanden)
  - Deaktivieren entfernt alle Tiles, versteckt Tooltip, entfernt Disable-Button
  - Erneutes Aktivieren nach Deaktivieren funktioniert
  - "Alle aus" im Panel entfernt Tiles
- **WMS Layer neu erstellt bei Bounds-Änderung:** `bounds` kann nicht dynamisch aktualisiert werden → Layer wird entfernt und mit neuen Bounds neu erstellt
- **E2E Tests (+9):** 30 NFZ-Tests gesamt — Enable/Disable (4), Radius-Control (4), Visual Rendering (1)

**Dateien:**
- `frontend/src/components/MapPage.tsx` - NFZ Radius State (nfzRadiusEnabled, nfzRadius), Bounds-Berechnung, Radius-UI-Control
- `frontend/src/components/MapComponent.tsx` - nfzBounds Prop, bounds-basierte WMS-Layer-Erstellung, Layer-Recreate bei Bounds-Änderung
- `frontend/e2e/nfz-verify.spec.ts` - **NEU** 9 E2E-Tests (Enable/Disable, Radius, Visual)
- `frontend/dist/` - Rebuild

### 2026-03-11 - Drohnen-Deduplizierung + Radius-Visualisierung + NFZ Clip-Path
**Änderungen:**
- **Drohnen-Deduplizierung:** Wenn dieselbe Drohne (gleiche `basic_id`) aus mehreren Quellen erscheint, wird nur die Quelle mit den meisten Metadaten behalten
  - Scoring-System: Zählt vorhandene Felder (pilot_lat/lon, battery, signal_strength, faa_data, mac, flight_pattern)
  - Priorisierung: Simulator (alle Daten) > adsb.fi/adsb.lol (Signal) > OpenSky > OGN
  - Logging: Debug-Meldung bei jeder Deduplizierung, Info-Meldung mit Gesamt-Statistik
  - 9 neue Unit-Tests für Deduplizierungs-Logik und Scoring
- **NFZ Radius Clip-Path:** WMS-Tiles werden per CSS `clip-path: circle()` exakt auf den Radius zugeschnitten
  - Eigene Leaflet-Pane `nfz` für WMS-Layer mit clip-path
  - `latLngToLayerPoint` + meters-to-pixels Berechnung für zoom-unabhängiges Clipping
  - Aktualisiert auf `zoomend`/`moveend` — Position bleibt geographisch fixiert beim Panning
  - Gestrichelte rote Kreislinie (`L.circle`) als zusätzlicher visueller Rand-Indikator
  - Leaflet `bounds`-Option bleibt für Performance (verhindert Tile-Requests außerhalb)
- **Drohnen-Radius Kreis:** Gestrichelte blaue Kreislinie zeigt den Drohnen-Suchradius auf der Karte
  - `L.circle()` mit Position (GPS oder Bielefeld) und gewähltem Radius
  - Erscheint wenn Drohnen-Radius aktiv, verschwindet wenn deaktiviert
  - Unabhängig vom Zoom-Level da Leaflet `L.circle` in Metern arbeitet

**Dateien:**
- `backend/providers/__init__.py` - `_metadata_score()`, `_deduplicate_drones()`, Integration in `get_all_drones()`
- `backend/tests/test_providers.py` - 9 neue Tests (TestDroneDeduplication)
- `frontend/src/components/MapComponent.tsx` - NFZ Pane + clip-path, Drohnen-Radius L.Circle, NFZ L.Circle
- `frontend/src/components/MapPage.tsx` - droneRadiusCenter/droneRadiusMeters Props
- `frontend/dist/` - Rebuild

### 2026-03-11 - Höhenfilter + NFZ-Warnung + Aircraft Lookup
**Änderungen:**
- **Höhenfilter (Altitude Zones):** Dropdown basierend auf EU/DE Drohnen-Vorschriften
  - 0-50m (Kontrollzone/CTR), 0-100m (Naturschutz), 0-120m (Open Category), 120-300m (Specific), 300m+ (Certified)
  - Filtert Drohnen nach Flughöhe, zeigt "gefiltert/gesamt" Zähler
- **NFZ-Warnung im StatusPanel:** Beim Klick auf eine Drohne wird geprüft ob sie in einer Flugverbotszone ist
  - Direkte DIPUL WMS GetFeatureInfo Abfrage an der Drohnen-Position
  - Rote Warnbox mit Zonennamen und Typ (z.B. Kontrollzone, Naturschutzgebiet)
- **Aircraft Lookup (async):** Beim Klick auf externe Drohnen werden Zusatzinfos asynchron geladen
  - Backend: `/api/aircraft/lookup/<hex>` Endpoint mit 3 Quellen:
    - adsbdb.com (kostenlos, kein API-Key) — Typ, Hersteller, Kennzeichen, Halter, Foto
    - OpenSky Network Metadata API — Betreiber, Seriennr., ICAO-Klasse, Land
    - planespotters.net — Foto-Thumbnail als Fallback
  - Callsign-Lookup: Airline, Flugroute (Herkunft/Ziel) via adsbdb.com
  - 1h Cache im Backend (Thread-safe)
  - Frontend: Spinner während Laden, Foto-Anzeige, Flugrouten-Sektion
  - ICAO Aircraft Class Labels (L2J = "Zweimotorig Jet", H1T = "Helikopter" etc.)
- **Spinner-Animation:** CSS `@keyframes spin` für Lade-Indikatoren

**Dateien:**
- `backend/app.py` - Aircraft Lookup Endpoint mit adsbdb/OpenSky/Planespotters + Caching
- `frontend/src/types/drone.ts` - AircraftLookup Interface
- `frontend/src/api.ts` - lookupAircraft() API-Funktion
- `frontend/src/components/StatusPanel.tsx` - NFZ-Warnung, Aircraft Lookup, Spinner
- `frontend/src/components/MapPage.tsx` - Höhenfilter, enabledNoFlyLayers an StatusPanel
- `frontend/src/index.css` - Spinner Animation
- `frontend/dist/` - Rebuild

### 2026-03-11 - Erweiterte Aircraft-Lookup auf DroneDetailPage + Neue Quellen
**Änderungen:**
- **DroneDetailPage Aircraft Lookup:** Alle Lookup-Daten (Typ, Hersteller, Kennzeichen, Halter, Foto, Flugroute) werden jetzt auch auf der Detailseite asynchron geladen — nicht mehr nur im StatusPanel
- **NFZ-Warnung auf DroneDetailPage:** Banner unter Header zeigt Flugverbotszonen mit Chip-Tags
- **OGN Provider erweitert:** ICAO Hex (Mode-S Transponder, Feld 12) und Aircraft Type Code (Feld 10, 16 Kategorien) werden jetzt aus den OGN-Rohdaten extrahiert
  - OGN Aircraft Type Labels: Segelflugzeug, Helikopter, Motorflugzeug, Jet, UAV/Drohne, etc.
  - ICAO Hex wird für Aircraft Lookup verwendet (D-HDAL → 3DDA97 → adsbdb/OpenSky)
- **OGN Device Database (DDB):** 34.538 Einträge als 5. Lookup-Quelle
  - Download von `http://ddb.glidernet.org/download/`, 24h Cache
  - Liefert Modell, Kennzeichen, Wettbewerbsnummer für FLARM-Geräte
- **hexdb.io als Fallback:** 6. Lookup-Quelle wenn adsbdb keine Daten hat
- **airport-data.com:** 7. Lookup-Quelle für Fotos als Fallback nach planespotters.net
- **Base Provider erweitert:** Extra-Felder (icao_hex, ogn_aircraft_type, ogn_aircraft_type_label) werden durch Normalisierung durchgereicht
- **Lookup-Kette (7 Quellen):** adsbdb → OpenSky → hexdb.io → OGN DDB → Callsign-Route → Planespotters → airport-data.com
- **Frontend `lookupAircraft()`:** Neuer `icaoHex` Parameter für OGN-Drohnen mit Transponder
- **OGN Typ-Karte:** Eigene Card auf DroneDetailPage und Section im StatusPanel mit OGN-Kategorie

**Dateien:**
- `backend/app.py` - OGN DDB Loader, hexdb.io + airport-data.com Lookup, icao_hex Parameter
- `backend/providers/ogn_provider.py` - ICAO Hex + Aircraft Type Code Extraktion, OGN_AIRCRAFT_TYPES Labels
- `backend/providers/base_provider.py` - Extra-Felder Pass-through in _normalize()
- `frontend/src/types/drone.ts` - icao_hex, ogn_aircraft_type, ogn_aircraft_type_label auf Drone; ogn_cn, ogn_device_type auf AircraftLookup
- `frontend/src/api.ts` - lookupAircraft() mit icaoHex Parameter
- `frontend/src/components/DroneDetailPage.tsx` - Aircraft Lookup, NFZ-Warnung, OGN Typ Card, Spinner
- `frontend/src/components/StatusPanel.tsx` - icao_hex an Lookup, OGN Typ Section
- `frontend/dist/` - Rebuild

### 2026-03-11 - Shared Cache + Light/Dark Theme + Loading Indicator
**Änderungen:**
- **Shared Lookup/NFZ Cache (`lookupCache.ts`):** Modul-Level Cache persistiert Aircraft-Lookup und NFZ-Daten über Component-Lebenszyklen hinweg. Daten verschwinden nicht mehr beim Re-Mount
- **Cache Pruning:** `pruneCache()` wird aus MapPage aufgerufen — entfernt Cache-Einträge für Drohnen die nicht mehr sichtbar sind. NFZ-Cache wird erst bei >200 Einträgen getrimmt
- **Resilientes Polling (DroneDetailPage):** Behält letzte bekannte Drohnen-Daten bei temporären 404s. Zeigt "Signal verloren" erst nach 5 aufeinanderfolgenden Fehlern (10s)
- **Light/Dark Theme:** Vollständiges Theme-System mit CSS Custom Properties
  - `ThemeContext.tsx`: React Context für Theme-State, persistiert in localStorage
  - CSS: `:root`/`[data-theme="dark"]` und `[data-theme="light"]` Variablen
  - Karten-Tiles: Automatischer Wechsel zwischen CartoDB Dark/Light
  - NFZ WMS Filter: Inversion nur im Dark Mode, normale Farben im Light Mode
  - Popups, Tooltips, Leaflet Controls: Alle theme-aware
  - Flash-Prevention: Inline-Script im HTML setzt Theme vor React-Hydration
- **Theme-Toggle in Einstellungen:** Hell/Dunkel-Umschalter auf der SettingsPage, Seite umbenannt zu "Einstellungen"
- **Loading Indicator (DroneDetailPage):** Animierte Progress-Bar unter dem Header während Lookup/NFZ-Daten laden

**Dateien:**
- `frontend/src/ThemeContext.tsx` - NEU: Theme Context + Provider
- `frontend/src/index.css` - Light/Dark CSS Variables, Popup-Styling, Loading-Animation
- `frontend/src/main.tsx` - ThemeProvider Wrapper
- `frontend/index.html` - Inline Theme-Script (Flash-Prevention)
- `frontend/src/components/MapComponent.tsx` - Theme-aware Tile Layer, CSS Variable Popups/Tooltips
- `frontend/src/components/MapPage.tsx` - pruneCache() Integration
- `frontend/src/components/SettingsPage.tsx` - Theme-Toggle, "Einstellungen" Header
- `frontend/src/components/DroneDetailPage.tsx` - Loading Progress Bar
- `frontend/src/lookupCache.ts` - NEU: Shared Cache für Lookup + NFZ
- `frontend/dist/` - Rebuild

### 2026-03-11 - Flugverlauf-Tracking + Archivierung
**Änderungen:**
- **Tracking-System:** Beliebiges Luftfahrzeug per Klick tracken — Flugverlauf wird als Polyline auf der Karte angezeigt
  - Tracking starten/stoppen über StatusPanel-Buttons
  - Trail bleibt sichtbar auch nach Stopp, solange Drohne im Gebiet
  - Position wird alle 2s erfasst (min. 15m Bewegung), max 2000 Punkte
  - 8 verschiedene Trail-Farben für Unterscheidbarkeit
  - Tracked IDs werden in localStorage gespeichert (überlebt Page Refresh)
- **Archivierung (7 Tage):** Getrackte Flüge können archiviert werden
  - Backend speichert Trail als JSON in `backend/data/archives/`
  - Automatische Cleanup-Routine löscht Einträge nach 7 Tagen
  - REST API: GET/POST/DELETE `/api/trails/archives`
  - Archivierte Trails werden gestrichelt auf der Karte dargestellt
- **TrackingPanel:** Dropdown-Panel in der Top-Bar mit Übersicht aller aktiven Trackings + Archive
  - Zeigt Punktanzahl, Status, Verbleibende Tage für Archive
  - Quick-Actions: Stop, Archivieren, Archiv löschen
- **Karten-Darstellung:** Leaflet Polylines mit Canvas-Renderer
  - Aktives Tracking: Durchgezogene Linie, Opacity 0.8
  - Gestoppt/Archiviert: Gestrichelte Linie, Opacity 0.5
  - Tooltip mit Drohnen-Name bei Hover über Trail
- **Loading-Flicker Fix:** Loading-Indikatoren (Progress-Bar, Spinner-Cards) werden erst nach 400ms Verzögerung angezeigt

**Dateien:**
- `backend/trail_archive.py` - NEU: TrailArchive Manager mit JSON-Persistenz + Cleanup
- `backend/app.py` - 4 neue Archive-Routes + TrailArchive Init
- `frontend/src/types/drone.ts` - TrailPoint, TrackedFlight, ArchivedTrail Interfaces
- `frontend/src/api.ts` - Archive CRUD API-Funktionen
- `frontend/src/useTracking.ts` - NEU: Tracking Hook (State, Position-Update, Archive)
- `frontend/src/components/TrackingPanel.tsx` - NEU: Tracking-Übersicht Panel
- `frontend/src/components/MapComponent.tsx` - Trail Polyline Rendering
- `frontend/src/components/MapPage.tsx` - Tracking Integration + TrackingPanel
- `frontend/src/components/StatusPanel.tsx` - Track/Untrack/Archiv Buttons
- `frontend/src/components/DroneDetailPage.tsx` - Verzögerter Loading-Indikator
- `frontend/dist/` - Rebuild

### 2026-03-11 - Praezise Hoehenanzeige (MSL + AGL) + Geschwindigkeitskorrektur
**Aenderungen:**
- **Hoehenreferenzierung:** Alle Provider liefern jetzt getrennte Hoehenwerte
  - `altitude_baro`: Barometrische Hoehe (MSL, druckkorrigiert) — primaere Hoehe fuer Luftfahrt
  - `altitude_geom`: Geometrische/GPS-Hoehe (WGS84) — wo verfuegbar
  - `altitude`: Bleibt als "beste verfuegbare Hoehe" (Abwaertskompatibilitaet)
- **Provider-Korrekturen:**
  - adsb.fi/adsb.lol: `alt_geom` (GPS-Hoehe) wird jetzt zusaetzlich zu `alt_baro` erfasst
  - adsb.fi/adsb.lol: Feet-zu-Meter Konversionsfaktor korrigiert (0.3048 statt 1/3.281)
  - adsb.fi/adsb.lol: Knoten-zu-m/s Konversionsfaktor praezisiert (0.514444 statt 0.5144)
  - OpenSky: `baro_altitude` (s[7]) und `geo_altitude` (s[13]) werden getrennt durchgereicht
  - OGN: Hoehe als `altitude_geom` markiert (GPS-basiert AMSL)
- **Terrain-Elevation API:** Neuer Endpunkt `/api/elevation?locations=lat,lon|lat,lon`
  - Nutzt Open-Meteo Elevation API (kostenlos, kein API-Key)
  - In-Memory-Cache (4 Dezimalstellen ≈ 11m Aufloesung)
  - Batch-Abfragen unterstuetzt
- **AGL-Berechnung:** Hoehe ueber Grund = MSL - Gelaendehoehe, im Frontend berechnet
- **Frontend-Anzeige:**
  - StatusPanel: Zeigt "Hoehe MSL", "Hoehe AGL", "Hoehe GPS" (wenn verfuegbar), "Gelaende"
  - DroneDetailPage Live-Status: MSL + AGL Tiles, Geschwindigkeit in m/s + km/h
  - DroneDetailPage Position: MSL (baro), GPS (geom), AGL, Gelaendehoehe
  - Map Tooltip: Zeigt "Hoehe MSL" statt generisch "Hoehe", Speed mit km/h

**Dateien:**
- `backend/providers/adsbfi_provider.py` - altitude_baro + altitude_geom, Faktorkorrektur
- `backend/providers/adsblol_provider.py` - altitude_baro + altitude_geom, Faktorkorrektur
- `backend/providers/opensky_provider.py` - Getrennte baro/geo Altitude
- `backend/providers/ogn_provider.py` - altitude_geom Markierung
- `backend/providers/base_provider.py` - altitude_baro/altitude_geom Pass-through
- `backend/app.py` - /api/elevation Endpoint mit Open-Meteo + Caching
- `frontend/src/types/drone.ts` - altitude_baro, altitude_geom, ground_elevation, altitude_agl
- `frontend/src/api.ts` - fetchElevation() mit Client-Cache
- `frontend/src/components/StatusPanel.tsx` - Elevation Fetch, MSL/AGL/GPS/Gelaende Anzeige
- `frontend/src/components/DroneDetailPage.tsx` - MSL/AGL/GPS Anzeige, km/h Conversion
- `frontend/src/components/MapComponent.tsx` - Tooltip MSL + km/h
- `frontend/src/test/mocks.ts` - altitude_baro/altitude_geom in Mock-Daten
- `frontend/dist/` - Rebuild

### 2026-03-11 - Elevation Grid Pre-Computation + Progressive Loading
**Aenderungen:**
- **Elevation Grid (`elevationGrid.ts`):** Vorberechnetes Hoehenraster fuer den gesamten Drohnen-Suchbereich
  - Generiert regulaeres Lat/Lon-Gitter ueber den Suchkreis, holt Hoehen von Open-Meteo in Batches
  - O(1) bilineare Interpolation fuer beliebige Punkte im Raster
  - Float32Array Storage (Row-Major), ~600 Punkte im Kreis (6 API-Batches)
  - Spacing-Formel: `max(500, min(15000, radius/14))` — skaliert mit Suchradius
  - Re-Fetch nur wenn Position >30% des Radius verschoben oder Radius >50% geaendert
- **Progressive Loading:** Grid wird nach dem ersten erfolgreichen Batch als "ready" markiert
  - Listener werden sofort benachrichtigt, Hoehenanzeige erscheint progressiv
  - Spaetere Batches verfeinern das Grid im Hintergrund
- **Rate-Limiting Fix:** Open-Meteo Free Tier (max 100 Coords/Request, ~10 req/sec)
  - Batch-Delay von 300ms auf 500ms erhoeht
  - Exponentieller Backoff bei HTTP 429: 3s → 6s (2 Retries)
  - Abbruch nach 3 aufeinanderfolgenden Fehlern (partial grid bleibt nutzbar)
- **Frontend-Integration:**
  - MapPage: `buildGrid()` wird bei Position/Radius-Aenderung getriggert
  - StatusPanel + DroneDetailPage: `getElevation()` + `onGridReady()` fuer synchrone Abfrage mit Listener
  - Loading-Indicator (Spinner) wenn Grid noch laedt
  - Alle Hoehen-Felder (MSL, AGL, GPS, Gelaende) immer sichtbar, "Laden..." wenn Daten pending
- **Elevation API direkt:** Frontend ruft Open-Meteo direkt auf (CORS erlaubt), kein Backend-Proxy noetig
  - Batch-Fetch fuer mehrere Koordinaten, Deduplizierung, Client-seitiger Cache

**Dateien:**
- `frontend/src/elevationGrid.ts` - NEU: Grid-Modul mit bilinearer Interpolation
- `frontend/src/api.ts` - fetchElevation/fetchElevationBatch (Open-Meteo direkt)
- `frontend/src/components/MapPage.tsx` - buildGrid() Integration
- `frontend/src/components/StatusPanel.tsx` - getElevation + onGridReady, Loading-Props
- `frontend/src/components/DroneDetailPage.tsx` - getElevation + onGridReady, Loading-Props
- `frontend/dist/` - Rebuild

### 2026-03-11 - Versionsanzeige + Version Bump 1.1.0
**Aenderungen:**
- **Versionsanzeige im Header:** Version wird neben dem App-Titel in der Top-Bar angezeigt (z.B. "v1.1.0")
- **Build-Time Injection:** Vite `define` liest Version aus `manifest.json` zur Build-Zeit und injiziert sie als `__APP_VERSION__` Konstante
- **Synchrone Versionierung:** `manifest.json` (Hub) und `package.json` (Frontend) haben immer die gleiche Version
- **Version Bump:** 1.0.0 → 1.1.0 (Provider Pattern, NFZ, Tracking, Elevation Grid, Aircraft Lookup, Themes)

**Dateien:**
- `frontend/vite.config.ts` - `define: { __APP_VERSION__ }` aus manifest.json
- `frontend/src/vite-env.d.ts` - NEU: TypeScript-Deklaration fuer __APP_VERSION__
- `frontend/src/components/MapPage.tsx` - Version im Header anzeigen
- `manifest.json` - Version 1.0.0 → 1.1.0
- `frontend/package.json` - Version 1.0.0 → 1.1.0
- `frontend/dist/` - Rebuild

## Offene Aufgaben
- [ ] WebSocket-Integration für echte Push-Updates statt Polling
- [ ] ESP 8266 MicroPython-Anpassung
- [ ] Integration mit echtem drone-mesh-mapper Hardware-Setup
- [ ] Docker Deployment Package

## Notizen
- Simulation generiert 5 Drohnen mit verschiedenen Flugmustern (linear, circular, waypoint, search, hover)
- Drohnen-Positionen basierend auf dem drone-mesh-mapper Tester-Format
- Standard-Zentrum: Bielefeld (52.0302, 8.5325) - kann über Geolocation oder ENV angepasst werden
- Polling-Intervall: 2s (normal), 5s (>100 Drohnen)
- DIPUL WMS: 34 Layer gesamt (17 konfiguriert), Daten von DFS Deutsche Flugsicherung, aktualisiert im AIRAC-Zyklus (28 Tage)
- DIPUL WMS CORS erlaubt (`Access-Control-Allow-Origin: *`) - GetFeatureInfo direkt vom Frontend moeglich
- DIPUL WMS rendert in dunklen Farben → CSS `filter: invert(1) hue-rotate(180deg) brightness(1.3)` nur im Dark Theme, Light Theme zeigt Originalfarben
- Hover-Tooltip: Zeigt Zonenname, Typ, Hoehengrenzen, Rechtsgrundlage. Klick-Popup: Vollstaendige Details inkl. Referenz
- FFH-Gebiete: WMS-Layer heisst `dipul:ffh-gebiete` (Bindestrich!), nicht `dipul:ffh_gebiete`
- Test-Abdeckung: 132 Backend-Tests, 57 Frontend Unit-Tests, 69 E2E-Tests (30 davon NFZ-spezifisch)
- Aircraft Lookup Quellen (7): adsbdb.com, OpenSky Network, hexdb.io, OGN DDB, adsbdb Callsign, planespotters.net, airport-data.com
- OGN Aircraft Type Codes: 0=Unknown, 1=Segelflugzeug, 3=Helikopter, 8=Motorflugzeug, 9=Jet, 13=UAV/Drohne, etc.
- OGN Feld 12 = ICAO Hex (Mode-S), Feld 10 = Aircraft Type Code, Feld 13 = OGN/FLARM Device ID
