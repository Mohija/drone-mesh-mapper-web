# FlightArc — Drone Mesh Mapper Web

Web-Anwendung für Echtzeit-Visualisierung und Überwachung von Drohnen auf einer interaktiven Karte. Multi-Mandanten-fähig, mit Hardware-Empfänger-Integration (ESP32) und Anbindung an mehrere ADS-B-/Open-Drone-ID-Datenquellen. Basiert auf dem [drone-mesh-mapper](https://github.com/colonelpanichacks/drone-mesh-mapper) Projekt.

## Features

### Karte und Live-Tracking
- **Echtzeit-Karte** (Leaflet + CartoDB Dark Matter) mit Drohnen-Markern, Trails (max. 2000 Punkte, 8 Farben pro Drohne) und Höhenfärbung
- **Status-Farben:** Grün = Aktiv, Gelb = Leerlauf, Rot = Fehler/Verstoß, Grau = Verloren
- **Quellen-Farbcodierung** in Markern (Simulator, OpenSky, adsb.fi, adsb.lol, OGN, Hardware-Empfänger)
- **Live-Status-Panel** mit Signal (dBm), Batterie, Position, Höhe, Geschwindigkeit, Pilot, FAA- und OGN-Daten
- **Aircraft Lookup** aus 4 öffentlichen Datenbanken (adsbdb, OpenSky, hexdb.io, OGN DDB) mit 1 h Cache
- **Auto-Refresh-Indikator** mit pulsierendem Dot, „vor Xs" Counter und Klick-Refresh

### Mehrere Datenquellen (pro Mandant aktivierbar)
- **Drohnen-Simulator** mit 8 konfigurierbaren Flugmustern (linear / circular / spiral, 1–50 Drohnen pro Instanz, mehrere Instanzen parallel)
- **OpenSky Network**, **adsb.fi**, **adsb.lol** (ADS-B Community-Quellen)
- **Open Glider Network (OGN)** für Segelflug- und UAV-Aktivitäten
- **Hardware-Empfänger** (ESP32) — eigene Open-Drone-ID-Erkennung über WiFi + BLE
- Parallele Aggregation über `ProviderRegistry` mit Dedup nach Metadaten-Qualität

### Flugzonen, Einsatzzonen und NoFly
- **Polygon-Editor** mit Drag-and-Drop Vertex, Doppelklick / Long-Press zum Entfernen, Snap-to-Close und Live-Preview
- **Mission Zones** über Adress-Geokodierung (Nominatim) — automatischer 100-m-Puffer um die Zieladresse
- **Höhenrestriktionen** (Min / Max AGL) je Zone, Drohnen-Zuweisung und automatisches Verstoß-Tracking
- **NoFly-Layer** über DIPUL WMS (Flughäfen, Naturschutz, Infrastruktur) mit GetFeatureInfo-Proxy gegen CORS
- **Verstoß-Erkennung** mit Trail-Speicherung, Audio-Alert, Kommentaren und einzeln/kollektiver Löschung

### Hardware-Empfänger (ESP32)
- **Drei Hardware-Typen:** ESP32-S3, ESP32-C3, ESP32-S3 mit GPS (ATGM336H @ UART1) — ESP8266 ist seit Firmware v1.6.0 entfernt
- **Firmware-Build aus dem Browser** (PlatformIO-Pipeline auf dem Backend) inkl. WiFi-Profile (max. 3) und Backend-URL
- **Web-Flash Wizard** über USB / WebSerial (chrome-basierte Browser)
- **OTA-Updates** mit Cancel-Button und Signal-Cyan Progress-Anzeige; Watchdog 180 s, 10 %-Progress-Logging
- **Captive Portal** für die Ersteinrichtung (WiFi-Setup ohne USB) mit Multi-OS-Detection
- **Heartbeat** mit GPS-Telemetrie, sichtbaren Satelliten, NMEA-Aktivitäts-Badge, Backend-Reachability-Probe
- **Backend-Watchdog** (Reboot nach 10 min ohne Backend-Kontakt oder 20 HTTP-Fehlern in Folge)
- **Coverage-Karte** und Hex-Grid-Placement-Plan, Antennen-Profile

### Multi-Mandant und Auth
- **JWT-Auth** (HS256) mit Bcrypt-Passwort-Hashing und Refresh-Token
- **Drei Rollen:** `super_admin`, `tenant_admin`, `user`
- **UserTenantMembership** — ein Nutzer kann mehreren Mandanten in unterschiedlichen Rollen angehören und zwischen ihnen wechseln
- **Mandanten-Isolation** auf DB-Ebene (alle Tabellen außer Tenant/User/ServiceToken haben `tenant_id`)
- **Service-Tokens** für externe Monitoring-Tools (Token-Hash mit einmalig sichtbarem Plaintext)

### Verwaltung und Diagnose
- **Logs-Tab** mit Filterung (Level, Modul, Suche), Auto-Refresh und Per-Tenant-Loglevel
- **Audit-Trail** für jede mutierende Aktion (Action, Resource, Nutzer, IP, Details, Timestamp)
- **Adressbuch** für Drohnen-Identifier mit Vorschlägen aus aktuell gescannten Geräten
- **Retention-Job** stündlich (System-Logs 14 d, Audit-Logs 90 d, Trail-Archives 7 d, alle per Mandant konfigurierbar)
- **DB-Statistik** (Zeilenzähler je Tabelle, Dateigröße)
- **Flugberichte** mit HTML/PDF-Export aus archivierten Trails (30 d Aufbewahrung)

### Alarmierung an externe Systeme
- **Schnittstellen-Editor** im Admin-Bereich (`/admin/interfaces`): pro Mandant beliebige Anzahl
  Außenkanäle anlegen — **Webhook (Push)**, **Pull-Out** (FlightArc pollt extern), **Pull-In**
  (Drittsystem holt von FlightArc ab via Service-Token), **Subscription (Pub/Sub)**
  mit API-Key + HMAC-SHA256 — beliebig viele Drittsysteme können sich pro Channel registrieren.
- **Authentifizierung** pro Schnittstelle: Bearer-Token, Basic Auth, API-Key (Header oder
  Query-Parameter). Geheimnisse werden mit Fernet verschlüsselt und im UI mit `••••••••` maskiert.
- **Drag-and-Drop-Payload-Builder** (`@dnd-kit`) mit dreispaltiger Oberfläche: Variablen-Palette
  (kategorie-farbcodiert) · Tree-Editor (verschachtelte Objekte/Arrays mit ↑/↓-Sortierung) ·
  Live-Vorschau. Variablen per Drag auf Knoten ablegen erzeugt typisierte
  `${{path}}`-Tokens; Drop auf String-Felder hängt Mustache-Tokens an. Toggle zu Raw-JSON jederzeit möglich.
- **Templates**: Alamos FE2, Slack-Webhook, Discord, MS Teams Adaptive Card, Generic-JSON,
  Subscription-Starter — als Ein-Klick-Vorlage anwendbar.
- **Beispiel-Code-Generator** in **sechs Sprachen** (curl/bash, Python, JavaScript, Go, Rust,
  Ruby) — fertige Snippets für oneShot-Aufruf, Subscriber-Registrierung und Empfangshandler
  mit timing-konstanter HMAC-Verifikation (`crypto.timingSafeEqual` / `hmac.compare_digest` /
  `hmac.Equal` / `secure_compare`).
- **Pull-Out Response-Mapping**: Status-Code-Allowlist + JSON-Path-Auswertung (Punkt-Notation
  inkl. Array-Index) gegen erwarteten Wert + dedizierter Fehler-Pfad — eine 200-Antwort kann
  trotzdem als Fehler markiert werden.
- **Per-Subscriber-Lieferungs-Log**: jeder Subscriber separat aufklappbar, letzte 30
  Push-Versuche mit HTTP-Code, Trigger, Response-Body und Latenz.
- **Health-Monitoring**: 24h-Erfolgsrate als Bruch („47/50"), 7-Tage-Sparkline, letzte
  Lieferung mit Zeit-Differenz, Subscriber-Count bei Channels — direkt auf jeder Karte.
- **Sicherheits-Härtung** (Phase 6 Pentest): SSRF-Schutz (Callback-URLs werden via DNS aufgelöst
  und gegen Loopback/Private/Link-Local geprüft), Subscriber-Cap 50/Channel mit HTTP 409,
  Rate-Limit 20 Registrierungen/Min/Channel mit HTTP 429, API-Key-Vergleich via
  `hmac.compare_digest` gegen SHA-256-Hash.
- **Test-Button** sendet sofort gegen einen Beispielkontext oder den letzten echten Verstoß,
  Response wird angezeigt, jeder Versuch landet im Lieferungs-Log.
- **Alarmverwaltung** (`/admin/alarms`): Regeln verbinden Zone (oder „alle Zonen") × Schnittstelle ×
  Trigger (Verstoß-Start / -Ende / -Update). Pro Regel ein-/ausschaltbar + testbar.
- **Lieferungs-Log** pro Schnittstelle: Status, HTTP-Code, Trigger, Request- und Response-Body
  jedes Versuchs (3 Wiederholungen mit Backoff bei Fehler). Audit-Trail für jede Konfigurationsänderung.

### Datenbank & Lifecycle
- **Auto-Backup** beim Backend-Start und vor jeder Migration in `backend/data/backups/`
  (inkl. WAL/SHM), Rotation auf die letzten 30 Snapshots.
- **Versionierte Migrationen** in `backend/migrations.py` — additive Pipeline ohne destruktive
  `DROP`/`DELETE`, Tracking via `schema_migrations`-Tabelle, Pre-Migration-Backup automatisch.
- **Management-CLI** (`python backend/manage.py`): `backup`, `list-backups`, `restore`,
  `migrate status`, `migrate run`, `verify-data`.
- **Test-Isolation**: `backend/tests/conftest.py` zwingt jede Pytest-Session auf eine isolierte
  `/tmp`-DB (via `DATABASE_URL`-Override + Hard-Guard mit `pytest.exit()`) — destruktive Tests
  können niemals die Produktions-DB treffen.
- Vollständige Anleitung & Notfall-Checkliste: siehe [`DATABASE_LIFECYCLE.md`](DATABASE_LIFECYCLE.md).

### Frontend
- **Mobile- und Desktop-Layout** mit Drawer-Menü, 44 px Touch-Targets, collapsible Sections, Tablet-Detection
- **Dark / Light Theme** (localStorage-persistent)
- **Dynamic Basename** für Verwendung hinter LabCore Hub Live View Proxy
- **Inline-Validation** und disambiguierte Login-Fehler
- **Version-Counter-Polling** als WebSocket-Ersatz (Proxy-kompatibel, ~2 s Latenz)

## Voraussetzungen

| Software | Version | Hinweis |
|----------|---------|---------|
| Python   | 3.8+    | Backend + Installer-Skripte |
| Node.js  | 16+     | Frontend (React Build) |
| npm      | 8+      | Wird mit Node.js mitgeliefert |
| Git      | beliebig | Optional — für automatische Updates |
| PlatformIO | aktuell | Nur für Server-seitiges Firmware-Build (`pio` im PATH) |

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

### Update- und Backup-Prozess (verbindlich)

Ausführliche Dokumentation + Rollback-Anleitung in [`DATABASE_LIFECYCLE.md`](DATABASE_LIFECYCLE.md).
Kurzfassung:

- Beim App-Start wird automatisch ein Snapshot nach `backend/data/backups/` gelegt; die letzten 30 bleiben.
- Schema-Änderungen laufen versioniert über `backend/migrations.py` (additiv, idempotent). Vor jeder neuen Migration wird ein weiteres Backup gezogen.
- Management-CLI:
  ```bash
  ./backend/venv/bin/python backend/manage.py backup manual-pre-update
  ./backend/venv/bin/python backend/manage.py list-backups
  ./backend/venv/bin/python backend/manage.py migrate status
  ./backend/venv/bin/python backend/manage.py migrate run
  ./backend/venv/bin/python backend/manage.py verify-data
  ./backend/venv/bin/python backend/manage.py restore <backup.db> --confirm
  ```
- Tests laufen isoliert gegen `/tmp/flightarc-test-*.db`; `backend/tests/conftest.py` setzt `DATABASE_URL` vor jedem Import und hat einen Hard-Guard gegen Production-DB-Aktionen.

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
│
├── Auth & Mandanten
│   ├── POST /api/auth/login              JWT-Login (Username + Passwort + Tenant)
│   ├── POST /api/auth/refresh            Token-Erneuerung
│   ├── GET  /api/auth/me                 Aktueller Nutzer
│   ├── GET  /api/auth/tenants            Öffentliche Tenant-Liste (für Login)
│   └── POST /api/auth/switch-tenant      Tenant-Wechsel
│
├── Drohnen & Lookup
│   ├── GET /api/drones                   Aggregiert aus allen aktiven Quellen
│   ├── GET /api/drones/<id>              Einzelne Drohne
│   ├── GET /api/drones/<id>/history      Positionshistorie
│   └── GET /api/aircraft/lookup/<id>     adsbdb / OpenSky / hexdb / OGN (1 h Cache)
│
├── Flotte & Status
│   ├── POST /api/fleet/center            Karten-Zentrum speichern
│   ├── GET  /api/status                  Fleet-Status
│   ├── POST /api/simulation/restart      Fleet neu initialisieren
│   ├── GET  /api/simulation/instances    Dummy-Receiver-Instanzen
│   ├── POST /api/simulation/instances    Neue Instanz (1–50 Drohnen)
│   ├── POST /api/simulation/instances/<id>/start|stop
│   └── POST /api/simulation/stop-all
│
├── Empfänger (Hardware)
│   ├── GET  /api/receivers               Alle Receiver (admin)
│   ├── POST /api/receivers               Neu registrieren (API-Key)
│   ├── PUT  /api/receivers/<id>          Name/Status/Coverage
│   ├── POST /api/receivers/<id>/location GPS-Position setzen
│   ├── DELETE /api/receivers/<id>        Receiver + Firmware-Datei löschen
│   ├── POST /api/receivers/<id>/regenerate-key
│   ├── GET  /api/receivers/stats         Online/Stale/Offline
│   ├── GET  /api/receivers/ingest        Open-Drone-ID-Ingest (Node-Auth)
│   ├── POST /api/receivers/heartbeat     Heartbeat mit GPS-Telemetrie
│   ├── GET  /api/receivers/placement-plan  Hex-Grid-Coverage
│   └── POST /api/receivers/build-firmware  PlatformIO-Build
│
├── Flugzonen & Einsatzzonen
│   ├── GET    /api/zones                 Alle Zonen
│   ├── POST   /api/zones                 Polygon ≥ 3 Punkte
│   ├── PUT    /api/zones/<id>            Name / Farbe / Polygon / Höhe
│   ├── DELETE /api/zones/<id>
│   ├── POST   /api/zones/<id>/assign     Drohnen zuweisen
│   ├── POST   /api/zones/<id>/unassign
│   └── POST   /api/zones/mission         Schnelle Mission Zone (Adresse)
│
├── Verstöße & Trails
│   ├── GET    /api/violations            Alle (aktiv + beendet)
│   ├── GET    /api/violations/<id>       Einzeln mit Trail
│   ├── PUT    /api/violations/<id>/comments
│   ├── DELETE /api/violations/<id>
│   ├── DELETE /api/violations            Alle löschen (admin)
│   ├── GET    /api/trails/archives       Metadaten (7 d Aufbewahrung)
│   ├── GET    /api/trails/archives/<id>  Komplette Trail-Punkte
│   ├── POST   /api/trails/archives       Trail archivieren
│   └── DELETE /api/trails/archives/<id>
│
├── Geo & NoFly
│   ├── GET /api/geocode                  Nominatim Forward
│   ├── GET /api/elevation                Open-Meteo Höhe (Batch + Cache)
│   ├── GET /api/nofly/check              DIPUL WMS Verfügbarkeit
│   └── GET /api/nofly/info               DIPUL GetFeatureInfo Proxy
│
├── Einstellungen
│   ├── GET/POST /api/settings            Aktive Quellen
│   ├── GET/POST /api/settings/mission-zone-defaults
│   └── GET/POST /api/settings/wifi-networks  Max. 3 (Passwörter maskiert)
│
├── Adressbuch
│   ├── GET    /api/addressbook
│   ├── POST   /api/addressbook
│   ├── PUT    /api/addressbook/<id>
│   ├── DELETE /api/addressbook/<id>
│   └── GET    /api/addressbook/suggestions
│
├── Verwaltung
│   ├── /api/admin/tenants                CRUD (super_admin)
│   ├── /api/admin/users                  CRUD inkl. Passwort-Reset
│   ├── /api/admin/users/<id>/memberships Tenant-Zuordnungen
│   ├── /api/admin/service-tokens         Token (Plaintext einmalig)
│   ├── /api/admin/logs                   System-Logs (Filter, Levels)
│   ├── /api/admin/audit                  Audit-Trail
│   ├── /api/admin/retention/run          Manueller Cleanup
│   └── /api/admin/db-stats               Tabellenzeilen + Dateigröße
│
├── /health                               Health Check
└── /*                                    React Frontend (dist/)
```

Production Server Pattern: Flask serviert das React Frontend als statische Dateien aus `frontend/dist/`. Ein Port für Backend und Frontend.

### Frontend-Routen

| Route | Beschreibung |
|-------|--------------|
| `/login` | Login mit Tenant-Auswahl |
| `/` | MapPage (Hauptansicht) |
| `/drone/:id` | Drohnen-Detailseite |
| `/report/:recordId` | Flugbericht-Ansicht |
| `/settings` | Nutzer-Einstellungen |
| `/help` | Benutzerhandbuch |
| `/admin` | Admin-Dashboard |
| `/admin/tenants` | Mandanten-Verwaltung (super_admin) |
| `/admin/users` | Benutzer- und Membership-Verwaltung |
| `/admin/receivers` | Hardware-Empfänger inkl. Build- und Flash-Wizard |
| `/admin/addressbook` | Drohnen-Adressbuch |
| `/admin/settings` | Datenquellen, Mission-Zone-Defaults, WiFi-Profile |
| `/admin/simulation` | Simulator-Instanzen |
| `/admin/logs` | System-Logs mit Filter und Auto-Refresh |
| `/admin/planning` | Polygon- und Mission-Editor |
| `/admin/audit` | Audit-Trail-Browser |

### Hintergrund-Jobs

| Job | Intervall | Aufgabe |
|-----|-----------|---------|
| Drohnen-Simulator | 2 s | Aktualisiert Simulator-Drohnen |
| Retention | 1 h | Löscht abgelaufene SystemLogs / AuditLogs / TrailArchives |
| Violation-Check | pro Drohnen-Poll, 2 s Throttle pro Tenant | Verstoß-Erkennung gegen aktive Zonen |

### Push-Mechanismus

FlightArc nutzt **kein WebSocket / SSE**, sondern HTTP-Polling mit Versionszählern (`zone_version`, `violation_version`, `settings_version`, `receiver_version`, `addressbook_version`). Frontend pollt periodisch, refetcht die Detail-Endpunkte aber nur bei einer Versionsänderung. Vorteil: Reverse-Proxy-kompatibel, keine WebSocket-Probleme bei Cloudflare-Tunneln.

## Entwicklung

```bash
# Backend starten
cd backend && ./venv/bin/python3 app.py

# Frontend Dev Server (separates Terminal)
cd frontend && npm run dev
```

Frontend Dev Server nutzt Vite Proxy für `/api` Requests.

### Tests

```bash
# Backend (pytest)
cd backend && ./venv/bin/python -m pytest tests/ -v

# Frontend Unit (Vitest)
cd frontend && NODE_ENV=test npx vitest run

# Frontend E2E (Playwright, ~100+ Tests, 11 Spec-Dateien)
cd frontend && npx playwright test --config e2e/playwright.config.ts
```

E2E-Suiten: `auth`, `flight-zones`, `nofly-zones`, `nfz-verify`, `receivers`, `multi-tenant`, `mobile`, `admin`, `map-page`, `drone-detail`, `api`.

### Firmware (PlatformIO)

```bash
cd firmware
pio run -e esp32-s3                # Build für ESP32-S3
pio run -e esp32-c3                # Build für ESP32-C3
pio run -e esp32-s3-gps            # Build für ESP32-S3 mit GPS
pio run -e esp32-s3 -t upload      # Build + Upload in einem Schritt
```

Aktuelle Firmware-Version: siehe `firmware/changelog.json` (zuletzt 1.6.3, 2026-04-24). Server-seitiger Build über `POST /api/receivers/build-firmware` mit WiFi-Profilen und Backend-URL aus `TenantSettings`.

## Umgebungsvariablen

Siehe `.env.example`:

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `DRONE_PORT` | 3020 | Server Port |
| `DEFAULT_LAT` | 52.0302 | Standard-Zentrum Breitengrad |
| `DEFAULT_LON` | 8.5325 | Standard-Zentrum Längengrad |
| `DEFAULT_RADIUS` | 50000 | Standard-Suchradius (Meter) |
| `JWT_SECRET` | (zufällig) | Signing-Key für JWT-Tokens |
| `DATABASE_URL` | `sqlite:///data/flightarc.db` | DB-Pfad (Test-Override über pytest-Conftest) |

## Tech Stack

- **Backend:** Python 3.8+, Flask, SQLAlchemy, SQLite (WAL), bcrypt, PyJWT
- **Frontend:** React 18, TypeScript, Vite, Leaflet.js, React Router v6
- **Firmware:** C++ (PlatformIO), ESP32-S3 / ESP32-C3 / ESP32-S3 mit GPS (ATGM336H)
- **Karte:** CartoDB Dark Matter Tiles (OpenStreetMap)
- **NoFly-Quelle:** DIPUL WMS (Deutsche UAV-Flugbeschränkungen)
- **Tests:** pytest, Vitest, Playwright

## Datenmodelle (SQLAlchemy)

| Modell | Zweck |
|--------|-------|
| `Tenant` | Mandant (Workspace) |
| `User` | Benutzer mit globaler Rolle und Default-Tenant |
| `UserTenantMembership` | Pro-Tenant-Rolle (super_admin / tenant_admin / user) |
| `TenantSettings` | Aktive Quellen, Karten-Zentrum, Mission-Defaults, WiFi-Profile, Loglevel, Retention |
| `FlightZone` | Polygon, Farbe, Min/Max AGL, zugewiesene Drohnen |
| `ViolationRecord` | Verstoß-Trail mit Start/End-Zeit und Kommentaren |
| `TrailArchive` | Archivierter Flug-Trail (7 d TTL) |
| `ReceiverNode` | Hardware-Empfänger (API-Key, Position, Coverage, Status) |
| `SystemLog` | Pro-Tenant Log-Einträge mit Level und Modul |
| `AuditLog` | Mutationen mit Action, Resource, Nutzer, IP, Details |
| `ServiceToken` | Externer API-Key (Hash + einmaliger Plaintext) |
| `DroneAddressBookEntry` | Identifier → Custom Name |

## LabCore Hub

Projekt ist kompatibel mit LabCore Hub Live View:
- Dynamic Basename für React Router (`/api/live/<projekt>/...`-Detection)
- Relative `API_BASE = './api'`
- `vite.config.ts`: `base: './'`, `hmr: false`
- Production Server Pattern (kombinierter Service in `manifest.json`)
