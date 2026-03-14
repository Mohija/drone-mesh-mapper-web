# Conversation Log: FlightArc (ehem. Drone Mesh Mapper)
> Automatisch gepflegtes Log aller Änderungen

## Metadaten
- **Erstellt:** 2026-03-04 | **Letzte Änderung:** 2026-03-14 (v1.5.2: Connection Log für Empfänger-Kommunikation)
- **Typ:** Projekt | **Status:** Development

## Offene Aufgaben
- [x] ESP Hardware-Empfänger Phase 1: Backend-Grundlagen
- [x] ESP Hardware-Empfänger Phase 5.1: Farben für Empfänger-Drohnen
- [x] ESP Hardware-Empfänger Phase 2: Frontend Admin-UI
- [x] ESP Hardware-Empfänger Phase 3: ESP Firmware
- [x] ESP Hardware-Empfänger Phase 5: Map-Integration
- [x] ESP Hardware-Empfänger Phase 4: Flash-Wizard
- [x] ESP Hardware-Empfänger Phase 6: Tests
- [x] Umfassende E2E-Tests für Receiver-System (60 Tests, alle bestanden)

## Änderungshistorie

### 2026-03-14 - v1.5.2: Connection Log + erweiterte Firmware-Telemetrie

**Firmware-Telemetrie erweitert (Heartbeat sendet jetzt zusätzlich):**
- `hardware_type` — Welcher Chip-Typ (esp32-s3, esp32-c3, esp8266)
- `wifi_channel` — Auf welchem WiFi-Kanal der ESP lauscht
- `detections_since_boot` — Erkennungszähler seit Boot
- `ap_active` — Ob der SoftAP-Hotspot gerade aktiv ist
- `error_count` + `last_http_code` — HTTP-Fehlerstatistiken seit Boot

**Firmware-Ingest erweitert (sendet jetzt zusätzlich pro Drohne):**
- `id_type` — ID-Typ (serial, caa, utm, specific_session)
- `self_id_desc` — Drohnen-Selbstbeschreibung (aus ODID SelfID Message)

**Connection Log im Frontend zeigt neue Felder:**
- WiFi-Kanal, AP-Status (gelb markiert), Error-Count + letzter HTTP-Code

### 2026-03-14 - v1.5.2: Connection Log für Empfänger-Kommunikation

**Neues Feature: Echtzeit-Kommunikationslog für Hardware-Empfänger**
- Backend: `ConnectionLog` Service mit In-Memory Ring-Buffer (max 500 Einträge/Tenant)
- Backend: Loggt automatisch Heartbeats, Ingest-Requests und Auth-Fehler
- Backend: Jeder Log-Eintrag enthält: Timestamp, Receiver-ID/Name, Endpoint, HTTP-Status, Fehler, Detections-Count, IP, WiFi/Heap/FW-Details
- Backend: Auth-Fehler (ungültiger Key, fehlender Header, deaktivierter Empfänger) werden als globale Einträge geloggt
- Backend: API-Endpoints: `GET /connection-log`, `POST /connection-log/toggle`, `POST /connection-log/clear`
- Frontend: "Log aktiv/aus" Toggle-Button in der Empfänger-Übersicht
- Frontend: Globales Log-Fenster (Terminal-Style) mit Filter nach Empfänger
- Frontend: Per-Receiver "Kommunikations-Log" Button in der Detail-Ansicht
- Frontend: Farbcodierte Einträge (grün=Ingest, blau=Heartbeat, rot=Fehler)
- Frontend: Auto-Polling alle 3s wenn Log sichtbar und aktiviert
- Log kann ein-/ausgeschaltet und geleert werden

**Dateien (neu):** `backend/services/__init__.py`, `backend/services/connection_log.py`
**Dateien (geändert):** `backend/auth.py`, `backend/routes/receiver_routes.py`, `frontend/src/api.ts`, `frontend/src/components/admin/ReceiverList.tsx`, `manifest.json`

### 2026-03-14 - v1.5.1: Async Firmware Build mit Polling (Proxy-kompatibel)

**Problem:** SSE-Streaming für Live Build Output funktionierte nicht durch LabCore Hub Live View Proxy (responseInterceptor buffert gesamte Response) und Cloudflare Tunnel.

**Lösung: Async Build + Polling statt SSE-Streaming:**
- Backend: `POST /firmware/build-async` startet Build in Background-Thread, gibt sofort 202 zurück
- Backend: `GET /firmware/build-status/<node_id>` gibt aktuellen Status, Log-Zeilen, Checks und Ergebnis als JSON
- Backend: In-Memory `_build_jobs` Dict speichert Build-Status pro Receiver
- Frontend: Nach Build-Start pollt der Wizard alle 800ms den Status
- Frontend: Terminal zeigt Log-Zeilen progressiv an, jeder Poll bringt neue Zeilen
- Funktioniert durch jeden Proxy (nginx, Cloudflare, LabCore Hub Live View) da nur normale JSON-Requests
- nginx `/api/` Block: `proxy_buffering off` hinzugefügt (für zukünftige SSE-Nutzung)
- DB-Migration: `last_build_at`, `last_build_size`, `last_build_sha256` Spalten zu receiver_nodes hinzugefügt

**Dateien:** `backend/routes/receiver_routes.py`, `frontend/src/api.ts`, `frontend/src/components/admin/ReceiverFlashWizard.tsx`, `/etc/nginx/sites-available/labcore-hub`

### 2026-03-14 - v1.5.0: Firmware Management, Live Build Terminal, Antennen-Empfehlung

**Firmware Build & Download Management:**
- Backend: Firmware-Binaries werden pro Receiver gespeichert (`backend/data/firmware/{node_id}.bin`)
- Backend: Neuer Download-Endpoint (`GET /firmware/download/<node_id>`) für gespeicherte Firmware
- Backend: Streaming-Build-Endpoint (`POST /firmware/build-stream`) mit Server-Sent Events
- Backend: `regenerate_key` Option im Build — generiert neuen API-Key, alter wird ungültig
- Backend: Build-Metadaten in DB (`last_build_at`, `last_build_size`, `last_build_sha256`)
- Backend: Firmware-Datei wird beim Löschen eines Receivers automatisch aufgeräumt
- Backend: Node-Name und WiFi-Credentials werden für Build-Flags sanitized (Sonderzeichen-Fix)
- Frontend: **Live Build Terminal** im Flash-Wizard — zeigt Compiler-Output in Echtzeit mit Syntax-Highlighting
- Frontend: Receiver-Detail zeigt letzten Build (Datum, Größe, SHA-256) mit Download-Button
- Frontend: "Firmware herunterladen" (cached) vs. "Neu bauen (neuer Key)" Buttons
- Frontend: Fehlerdetails als monospaced Pre-Block im Wizard
- API-Key Banner und "Key regenerieren" Button entfernt — Key wird nur automatisch in Firmware eingebettet

**Hardware-Empfehlung aktualisiert:**
- ESP32-S3 Board gewechselt: diymore (ohne IPEX) → **Heemol mit IPEX + 2,4 GHz Antenne im Lieferumfang**
- Boards ohne IPEX-Anschluss entfernt — nur noch Boards mit externer Antenne empfohlen
- Neue Antennen-Verdrahtungsanleitung in HelpPage (3-Schritt: IPEX finden → aufstecken → positionieren)
- Reichweiten-Tabelle: PCB 200-500m, 3dBi 500-1000m, 5dBi 1-2km
- Credit zu colonelpanichacks/drone-mesh-mapper und OpenDroneID in HelpPage

**Dateien:** `backend/routes/receiver_routes.py`, `backend/models.py`, `backend/app.py`, `frontend/src/api.ts`, `frontend/src/components/admin/ReceiverFlashWizard.tsx`, `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/HelpPage.tsx`, `firmware/platformio.ini`

### 2026-03-14 - ODID Scanner komplett neu: opendroneid-Library, NAN, Dual-Core, alle Message-Typen

**Firmware-Scanner komplett neu geschrieben basierend auf colonelpanichacks/drone-mesh-mapper:**
- `opendroneid.c/.h` (48KB+31KB): Vollständige OpenDroneID Decode/Encode Library integriert
- `odid_wifi.c` + `odid_wifi.h`: WiFi NAN Action Frame Parser + MessagePack Support
- `odid_scanner.cpp/.h` komplett neu geschrieben:
  - WiFi Beacon Frames: Beide OUIs (FA:0B:BC + 90:3A:E6)
  - WiFi NAN Action Frames (DJI u.a.) via `odid_wifi_receive_message_pack_nan_action_frame()`
  - BLE ODID via NimBLE mit MessagePack-Support
  - Alle 7 ODID Message-Typen: BasicID, Location, System, OperatorID, Auth, SelfID, MessagePack
  - Dual-Core FreeRTOS für ESP32-S3 (BLE Core 1, WiFi Core 0, Detection Queue)
  - Detection-Merging: gleiche MAC/basic_id werden zusammengeführt statt dupliziert
- `OdidDetection` struct erweitert: pilot_lat/lon, operator_id, self_id_desc, height_agl, id_type, source
- `http_client.cpp`: Sendet neue Felder (pilot_lat/lon, operator_id, height_agl, source)
- `odid_wifi.c`: ESP8266-Kompatibilität (byteswap.h Fallback)
- `config.h`: ODID-Konstanten aus opendroneid.h, keine Duplikate
- Alle 3 Builds erfolgreich: ESP32-S3 (33.7%), ESP32-C3 (89.6%), ESP8266 (32.4%)

**Dateien (neu):** `firmware/src/opendroneid.c`, `firmware/src/opendroneid.h`, `firmware/src/odid_wifi.c`, `firmware/src/odid_wifi.h`
**Dateien (geändert):** `firmware/src/odid_scanner.cpp`, `firmware/src/odid_scanner.h`, `firmware/src/http_client.cpp`, `firmware/src/config.h`, `firmware/platformio.ini`

### 2026-03-14 - ESP32-S3 Flash-Fix: DIO-Modus, 8MB-Partition, Firmware-Verifizierungs-Checkliste

**Problem:** ESP32-S3 Boot-Loop mit "SHA-256 comparison failed" durch falsche Flash-Konfiguration.

**Firmware-Änderungen:**
- `platformio.ini`: ESP32-S3 Flash-Modus auf `dio` gesetzt (statt QIO default), Partition auf `default_8MB.csv` (statt 4MB default)
- Backend: Umfassende Firmware-Binary-Verifizierung nach Build mit 10-Punkt-Checkliste:
  - Datei existiert, Binary-Größe (Partitionslimits), Header lesbar, Magic Byte (0xE9)
  - Flash-Modus (DIO/QIO Match), Flash-Größe (4MB/8MB Match), Flash-Frequenz
  - Segmente (1-16), SHA-256 Hash, Bootloader valid, Partitionstabelle valid
- Backend: Checks als JSON-Header (`X-Firmware-Checks`) in Build-Response
- Backend: Board-Info Endpoint (`/api/receivers/firmware/board-info`)
- Frontend: Visuelle Firmware-Verifizierungs-Checkliste im Flash-Wizard (Schritt 4)
  - Jeder Check mit Pass/Fail-Indikator, aufklappbare Details (Erwartet vs. Aktuell)
  - Summary-Header mit Fortschrittsbalken (X/10 bestanden)
  - Download gesperrt wenn Checks fehlschlagen
- Frontend Flash-Wizard: Korrekte esptool-Befehle, Flash-Config Infobox, SHA-256 Troubleshooting
- Frontend HelpPage: Erweiterte Flash-Anleitung, Hardware-Vergleich, SHA-256 Troubleshooting

**Dateien:** `firmware/platformio.ini`, `backend/routes/receiver_routes.py`, `backend/app.py`, `frontend/src/api.ts`, `frontend/src/components/admin/ReceiverFlashWizard.tsx`, `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/HelpPage.tsx`

### 2026-03-13 - Multi-SSID Support: Bis zu 3 WiFi-Netzwerke im Firmware Build

**Firmware-Architektur für Multi-SSID komplett überarbeitet:**
- `config.h`: WIFI_SSID_2/3, WIFI_PASS_2/3, MAX_WIFI_NETWORKS=3
- `platformio.ini`: Build-Flags für 3 WiFi-Slots
- `wifi_manager.h/cpp`: WiFiCredential-Struct, Array-basierte Speicherung, Round-Robin + Scan-basierte Netzwerkauswahl (bestes RSSI)
- `main.cpp`: Übergabe aller 3 SSID/Pass-Slots als Arrays an WiFiManager
- `ReceiverFlashWizard.tsx`: Dynamische WiFi-Netzwerk-Liste (1-3 Netzwerke hinzufügen/entfernen)
- `api.ts`: `buildFirmware()` akzeptiert `wifi_networks[]` statt einzelner SSID/Pass
- `receiver_routes.py`: Backend setzt WIFI_SSID, WIFI_SSID_2, WIFI_SSID_3 als Env-Vars (rückwärtskompatibel)
- E2E-Tests aktualisiert für neue data-testid-Selektoren

**Firmware Compile-Fixes (odid_scanner):**
- `odid_scanner.cpp`: `min(_count, maxCount)` schlug fehl wegen `volatile int` vs `int` Type-Mismatch → durch ternären Operator mit explizitem Cast ersetzt
- `odid_scanner.h`: `OdidBleCallbacks` konnte nicht auf private `_addDetection()` zugreifen → `friend class` Deklaration hinzugefügt
- Alle 3 Firmware-Varianten (ESP32-S3, ESP32-C3, ESP8266) bauen erfolgreich

**Tests:** 268 E2E-Tests bestanden, alle 3 FW-Builds erfolgreich, TypeScript fehlerfrei

**Dateien:** `firmware/src/config.h`, `firmware/platformio.ini`, `firmware/src/wifi_manager.h`, `firmware/src/wifi_manager.cpp`, `firmware/src/main.cpp`, `firmware/src/odid_scanner.cpp`, `firmware/src/odid_scanner.h`, `frontend/src/api.ts`, `frontend/src/components/admin/ReceiverFlashWizard.tsx`, `backend/routes/receiver_routes.py`, `frontend/e2e/receivers.spec.ts`, `frontend/dist/`

### 2026-03-13 - Kompatibilitätsprüfung: Inkompatible Breakout Boards ersetzt

**Recherche ergab 2 von 3 Breakout Boards waren inkompatibel:**
- ESP32-C3: diymore 38-Pin Breakout (B0CG8YW5VH) passt NICHT auf 30-Pin C3-DevKitM-1 → ENTFERNT, durch Nylon Abstandshalter ersetzt
- ESP8266: Terminal Adapter (B0CLD28SHQ) ist für ESP32, nicht NodeMCU (28mm vs 23mm Pin-Abstand) → ENTFERNT, durch DUBEUYEW Base Board (B0D1KCYG3W) ersetzt (bestätigt kompatibel mit Wide NodeMCU V3)
- ESP32-S3: Meshnology N40 (B0FLK4MDDW) behauptet 44-Pin S3 Kompatibilität → beibehalten

**Aktualisierte Gesamtkosten:** ESP32-S3 ~52€ (2 Boards), ESP32-C3 ~28€, ESP8266 ~37€
**Empfehlungstext für C3 angepasst:** Hinweis auf fehlenden Steckboden
**ReceiverList.tsx und HelpPage.tsx synchronisiert**

**Dateien:** `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/HelpPage.tsx`, `frontend/dist/`

### 2026-03-13 - Vorgelötete Boards & GPIO Breakout Boards für alle Varianten

**Shopping-Listen erstellt (ReceiverList.tsx, HelpPage.tsx):**
- Alle Controller-Boards durch vorgelötete Varianten ersetzt (kein Löten nötig)
- ESP32-S3: diymore 2er-Pack mit gelöteten Pins (B0DFCQGW4C) + Meshnology GPIO Breakout (B0FLK4MDDW)
- ESP8266: AZDelivery NodeMCU vorgelötet (B07Z5C3KQF)
- GPIO Breakout Boards als Montagelösung: ESP einstecken, im Gehäuse verschrauben

**Dateien:** `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/HelpPage.tsx`, `frontend/dist/`

### 2026-03-13 - SoftAP Provisioning: Automatischer Hotspot bei fehlendem WiFi

**WiFi-Manager komplett überarbeitet (wifi_manager.cpp/h):**
- Kein permanent aktiver AP mehr — AP startet nur wenn nötig
- Boot: Versucht zuerst STA-only Verbindung zum konfigurierten WiFi
- Nach 30s ohne STA-Verbindung (WIFI_AP_TIMEOUT_MS): AP-Hotspot startet automatisch
- Sofortiger AP-Start wenn keine WiFi-Credentials konfiguriert
- AP schaltet sich 5s nach erfolgreicher STA-Verbindung automatisch ab (WIFI_AP_SHUTDOWN_DELAY)
- Bei STA-Verbindungsverlust: AP startet erneut für Re-Provisioning
- Neue Methoden: isApActive(), getApSsid(), _startAp(), _stopAp(), _updateWiFiMode()
- Verbindungsversuche werden gezählt und geloggt

**Neuer LED-State LED_AP_ACTIVE (led_status.h/cpp):**
- Dreifach-Blinken alle 2s — signalisiert aktiven Hotspot / Wartend auf Konfiguration
- Unterscheidet sich klar von LED_BOOT (schnell) und LED_ERROR (doppelt)

**Captive Portal Status erweitert (web_server.cpp):**
- /status Endpoint meldet jetzt: ap_active, ap_ssid, ap_ip
- Portal-HTML zeigt Hotspot-Status an wenn AP aktiv

**Config (config.h):**
- WIFI_AP_TIMEOUT_MS = 30000 (AP-Start nach 30s ohne STA)
- WIFI_AP_SHUTDOWN_DELAY = 5000 (AP-Stop 5s nach STA-Verbindung)

**Benutzerhandbuch (HelpPage.tsx) aktualisiert:**
- Neues LED-Muster dokumentiert (Dreifach-Blinken = Hotspot aktiv)
- Inbetriebnahme-Anleitung beschreibt automatisches AP-Provisioning
- Troubleshooting: 30s Wartezeit vor Hotspot-Start

**Dateien:** `firmware/src/wifi_manager.h`, `firmware/src/wifi_manager.cpp`, `firmware/src/config.h`, `firmware/src/main.cpp`, `firmware/src/led_status.h`, `firmware/src/led_status.cpp`, `firmware/src/web_server.cpp`, `frontend/src/components/HelpPage.tsx`, `frontend/dist/`

### 2026-03-13 - Einkaufslisten für Hardware-Empfänger

**Shopping-Listen pro Hardware-Typ im Erstellen-Formular:**
- ESP32-S3 (8 Komponenten, ~21–35 € Pflichtteile) — als "Beste Wahl" markiert
- ESP32-C3 (7 Komponenten, ~17–27 € Pflichtteile) — "Gute Alternative"
- ESP8266 (5 Komponenten, ~13–20 € Pflichtteile) — "Nur für Spezialfälle"
- Aufklappbare Einkaufsliste im Empfänger-Erstellen-Formular (ReceiverList.tsx)
- Jede Liste mit Pflicht/Optional-Kennzeichnung, Preisen, Gesamtkostenschätzung
- Empfehlungsbox pro Variante mit farbcodierter Bewertung
- Hardware-Typ im Select mit ★-Markierung für Empfehlung
- Gleiche Listen auch im Benutzerhandbuch (HelpPage.tsx) unter "Hardware-Inbetriebnahme"

**Dateien:** `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/HelpPage.tsx`, `frontend/dist/`

### 2026-03-13 - Benutzerhandbuch (HelpPage) mit Frontend-Integration

**Umfassendes Benutzerhandbuch als React-Komponente:**
- `HelpPage.tsx`: 700+ Zeilen, 13 Abschnitte (Übersicht, Login, Karte, Drohnen, Flugzonen, NFZ, Verstöße, Berichte, Einstellungen, Admin, Empfänger, Hardware, Tipps)
- 5 inline SVG-Diagramme: App-Layout, Rollen-Hierarchie, Netzwerk-Architektur, ESP-Setup, Quellfarben-Legende
- Sidebar-Navigation mit Suchfilter
- InfoBox-Hilfskomponente (Info/Warnung-Varianten)
- Vollständige Hardware-Inbetriebnahme: esptool-Befehle, LED-Muster, Troubleshooting-Tabelle, Hardware-Vergleich
- Theme-aware Styling mit CSS-Variablen

**Frontend-Integration:**
- Route `/help` in App.tsx mit ProtectedRoute
- Hilfe-Button (❓) in MapPage.tsx Kontrollleiste (zwischen Einstellungen und Benutzerinfo)
- Frontend-Build aktualisiert

**Dateien:** `frontend/src/components/HelpPage.tsx` (neu), `frontend/src/App.tsx`, `frontend/src/components/MapPage.tsx`, `frontend/dist/`


### 2026-03-13 - ESP Hardware-Empfänger: Vollständige Implementierung (Phase 1-6)

**Phase 1 — Backend-Grundlagen:**
- ReceiverNode DB-Model mit 20 Feldern (hardware_type, api_key, Standort, Health-Daten, Detection-Counter)
- `@node_auth_required` Decorator für ESP-Authentifizierung via X-Node-Key Header
- ReceiverProvider: In-Memory-Store mit Thread-Safe Deduplizierung (stärkstes RSSI), 30s Staleness
- ProviderRegistry erweitert: tenant_id Parameter, receiver_provider Property
- receiver_routes Blueprint: Admin-CRUD (7 Endpoints) + Node-Ingest/Heartbeat (2 Endpoints) + Firmware-Build
- "receiver" als neue Datenquelle in DEFAULT_SOURCES
- receiver_version im /api/drones Response (Version-Counter-Pattern)

**Phase 5.1 — Farben:**
- SOURCE_COLORS um `receiver: '#14b8a6'` (Teal) in MapComponent, StatusPanel, SettingsPage, DroneDetailPage

**Phase 2 — Frontend Admin-UI:**
- ReceiverNode TypeScript-Interface + 7 API-Funktionen (fetchReceivers, createReceiver, updateReceiver, deleteReceiver, regenerateReceiverKey, fetchReceiverStats, buildFirmware)
- ReceiverList.tsx: Tabelle mit Status-Dots, ESP8266-Light-Badge, Erstellen-Dialog, API-Key-Anzeige (einmal), Detail-Expand, Auto-Refresh 30s
- AdminLayout.tsx: Nav-Eintrag "Empfänger"
- AdminDashboard.tsx: Empfänger Online/Gesamt Karte
- App.tsx: Route `/admin/receivers`

**Phase 3 — ESP Firmware:**
- platformio.ini: 3 Environments (esp32-s3, esp32-c3, esp8266)
- config.h: Build-Flags, Runtime-Konstanten
- wifi_manager: AP+STA Dual-Mode, NVS-Persistence, Auto-Reconnect, WiFi-Scan
- odid_scanner: Promiscuous Mode + BLE NimBLE, ODID Beacon/NAN/BLE Parsing, Ring-Buffer
- http_client: POST Ingest (2s) + Heartbeat (30s), TLS (ESP32), Retry-Logic
- web_server: Captive Portal (WiFi-Config, GPS via Browser Geolocation, Status)
- led_status: 5 LED-Muster (Boot/WiFi/Online/Detection/Error)
- main.cpp: Boot-Sequenz + Main Loop

**Phase 4 — Flash-Wizard:**
- ReceiverFlashWizard.tsx: 5-Schritte-Wizard (Intro → Config → Build → Download → Done)
- Backend-Endpoint POST /api/receivers/firmware/build: On-Demand PlatformIO-Kompilierung
- Firmware-Download als .bin, manuelle esptool-Anleitung als Fallback

**Phase 5 — Map/Settings-Integration:**
- receiver_count + receiver_nodes Felder in Drone-Interface
- StatusPanel zeigt Empfänger-Anzahl bei Receiver-Drohnen
- Receiver-Drohnen erscheinen automatisch auf Karte (via /api/drones, Teal-Farbe)

**Phase 6 — E2E-Tests (60 Tests, alle bestanden):**
- receivers.spec.ts komplett neu geschrieben mit umfassender Abdeckung
- **Receiver API CRUD (17 Tests):** List, Create (3 HW-Typen), Validierung (invalid HW, leerer Name, Whitespace), Get Single, Get 404, Update Name, Update Reject Empty, Deactivate, Reactivate, Regenerate Key, Delete, Delete 404
- **Receiver Stats API (2 Tests):** Alle Stat-Felder vorhanden, total inkrementiert nach Create
- **Node Authentication (10 Tests):** Heartbeat ohne/falscher/gültiger Key, Heartbeat persistiert Felder (firmware_version, wifi_ssid, wifi_rssi, free_heap, uptime, location, status=online), Ingest ohne Key 401, Ingest speichert + Counter, Ingest leere Detections 400, Ingest aktualisiert Location, Deaktivierter Receiver → 403
- **Receiver Version Counter (2 Tests):** /api/drones enthält receiver_version, Version inkrementiert nach Ingest
- **API Auth Requirements (4 Tests):** GET/POST/stats ohne Token → 401, Invalid Token → 401
- **Firmware Build API (4 Tests):** Erfordert node_id, Erfordert backend_url, Non-existent Node → 404, PlatformIO-Fehlerbehandlung
- **Receiver Admin UI (14 Tests):** Sidebar-Navigation, Seitentitel, Stats-Bar (5 Karten), Create-Form Toggle, Create via UI + API-Key-Banner, Dismiss Key-Banner, Tabelle zeigt Receiver, ESP8266-Warning, Row Expand/Collapse, Detail-Inhalt (ID, Firmware, WiFi, Heap), Online-Status nach Heartbeat, Deaktivieren (Akt./Deakt.), Löschen entfernt aus Tabelle, Key-Regeneration zeigt neuen Key
- **Flash Wizard UI (4 Tests):** Modal öffnet mit Receiver-Name, Intro-Step mit Hardware-Typ, Navigation Intro→Config mit Feldern, Close-Button schließt Modal
- **Admin Dashboard (1 Test):** "Empfänger Online" Karte sichtbar
- **Settings Page (2 Tests):** Receiver-Quelle "Empfänger" sichtbar, Beschreibung "Hardware-Empfänger" sichtbar

**Dateien (Backend):**
- `backend/models.py` — ReceiverNode Model + Tenant-Relationship
- `backend/auth.py` — node_auth_required Decorator
- `backend/providers/receiver_provider.py` — NEU
- `backend/providers/__init__.py` — ProviderRegistry Integration
- `backend/routes/receiver_routes.py` — NEU: CRUD + Node + Firmware Build
- `backend/routes/__init__.py` — Blueprint Registration
- `backend/settings.py` — receiver in DEFAULT_SOURCES
- `backend/app.py` — tenant_id, receiver_version, Registry in app.config

**Dateien (Frontend):**
- `frontend/src/api.ts` — ReceiverNode Interface + 7 API-Funktionen
- `frontend/src/types/drone.ts` — receiver_version, receiver_count, receiver_nodes
- `frontend/src/App.tsx` — Route /admin/receivers
- `frontend/src/components/admin/ReceiverList.tsx` — NEU
- `frontend/src/components/admin/ReceiverFlashWizard.tsx` — NEU
- `frontend/src/components/admin/AdminLayout.tsx` — Nav-Eintrag
- `frontend/src/components/admin/AdminDashboard.tsx` — Stats-Karte
- `frontend/src/components/MapComponent.tsx` — receiver Farbe
- `frontend/src/components/SettingsPage.tsx` — receiver Farbe
- `frontend/src/components/StatusPanel.tsx` — receiver Farbe + count
- `frontend/src/components/DroneDetailPage.tsx` — receiver Farbe
- `frontend/e2e/receivers.spec.ts` — NEU: 60 E2E-Tests (API + UI + Wizard + Dashboard + Settings)

**Dateien (Firmware):**
- `firmware/platformio.ini` — NEU
- `firmware/src/main.cpp` — NEU
- `firmware/src/config.h` — NEU
- `firmware/src/wifi_manager.h/.cpp` — NEU
- `firmware/src/odid_scanner.h/.cpp` — NEU
- `firmware/src/http_client.h/.cpp` — NEU
- `firmware/src/web_server.h/.cpp` — NEU
- `firmware/src/led_status.h/.cpp` — NEU

### 2026-03-13 - E2E-Tests erweitert: data-testid Attribute + 60 umfassende Tests

**Änderungen:**
- `data-testid` Attribute zu ReceiverList.tsx hinzugefügt (receiver-list, receiver-create-btn, receiver-create-form, receiver-name-input, receiver-type-select, receiver-submit-btn, esp8266-warning, api-key-banner, api-key-value, api-key-copy, api-key-dismiss, receiver-stats, stat-total/online/stale/offline/detections, receiver-empty, receiver-table, receiver-row-{id}, receiver-status-{id}, receiver-status-label-{id}, receiver-toggle-{id}, receiver-delete-{id}, receiver-detail-{id}, receiver-detail-grid-{id}, receiver-flash-{id}, receiver-regen-key-{id})
- `data-testid` Attribute zu ReceiverFlashWizard.tsx hinzugefügt (flash-wizard-overlay, flash-wizard, flash-wizard-title, flash-wizard-close, flash-wizard-step-label, flash-step-intro, flash-wizard-next, flash-step-config, flash-backend-url, flash-wifi-ssid, flash-wifi-pass)
- receivers.spec.ts komplett neu geschrieben: 60 Tests in 10 describe-Blöcken (vorher 15 Tests)
- Alle 60 Tests bestanden in 22.2 Sekunden
- Backend-Neustart war nötig (Server lief mit alter Version ohne Receiver-Routes)

**Dateien:**
- `frontend/src/components/admin/ReceiverList.tsx` — data-testid Attribute
- `frontend/src/components/admin/ReceiverFlashWizard.tsx` — data-testid Attribute
- `frontend/e2e/receivers.spec.ts` — 60 E2E-Tests (komplett neu)
- `manifest.json` — lastModified aktualisiert

### 2026-03-13 - ESP Hardware-Empfänger: Vollständiger Implementierungsplan
**Status: Phase 1 umgesetzt, Phasen 2-6 offen**
**Referenz:** github.com/colonelpanichacks/drone-mesh-mapper (Original-Hardware-Projekt)

#### Ziel
ESP32-S3, ESP32-C3 und ESP8266 Controller als Hardware-Empfänger für Open Drone ID (ODID) in FlightArc integrieren. Controller erkennen Drohnen via WiFi-Sniffing, senden Daten per HTTP/HTTPS ans Backend, erscheinen als neue Datenquelle "Empfänger" neben Simulator/OpenSky/etc.

#### Entscheidungen (mit User abgestimmt)
1. **Hardware:** ESP32-S3 (BLE+WiFi), ESP32-C3 (BLE+WiFi), ESP8266 "Light" (nur WiFi-Beacon, kein BLE, kein TLS)
2. **Kommunikation:** HTTP (lokal) + HTTPS (Internet), Fokus auf Internet-Betrieb
3. **AP-Verhalten:** Hotspot immer aktiv (AP+STA Dual-Mode). Offline-Status bei Stromausfall. Auto-Reconnect
4. **Key-Übertragung:** Automatisch beim Flashen via Serial (in Firmware eingebrannt via Build-Flags)
5. **Firmware-Build:** On-Demand auf Server via PlatformIO CLI (muss installiert werden)
6. **Deduplizierung:** Standard: stärkstes RSSI. Optional: Triangulation bei ≥3 Empfängern
7. **Mobilität:** Controller sind mobil. Standort via Handy-GPS über Captive Portal Browser-Geolocation
8. **ESP8266-Einschränkungen:** Kein BLE-ODID, kein HTTPS (80KB RAM), nur Beacon-Frame-ODID — muss im UI sichtbar sein

#### Phase 1: Backend-Grundlagen

**1.1 Neues DB-Model `ReceiverNode`** (`backend/models.py`)
```python
class ReceiverNode(db.Model):
    __tablename__ = "receiver_nodes"
    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id", ondelete="CASCADE"))
    name = db.Column(db.String(200), nullable=False)
    hardware_type = db.Column(db.String(20), nullable=False)  # "esp32-s3"|"esp32-c3"|"esp8266"
    api_key = db.Column(db.String(64), unique=True, nullable=False)  # secrets.token_hex(32)
    firmware_version = db.Column(db.String(20), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    last_latitude/last_longitude/last_location_accuracy = db.Column(db.Float, nullable=True)
    last_heartbeat = db.Column(db.Float, nullable=True)  # epoch
    last_ip = db.Column(db.String(45), nullable=True)
    wifi_ssid = db.Column(db.String(64), nullable=True)
    wifi_rssi = db.Column(db.Integer, nullable=True)
    free_heap = db.Column(db.Integer, nullable=True)
    uptime_seconds = db.Column(db.Integer, nullable=True)
    total_detections = db.Column(db.Integer, default=0)
    detections_since_boot = db.Column(db.Integer, default=0)
    created_at/updated_at = db.Column(db.Float)
```
Status berechnet aus `last_heartbeat`: online (<90s), stale (90-300s), offline (>300s)

**1.2 `@node_auth_required` Decorator** (`backend/auth.py`)
- Prüft `X-Node-Key` Header gegen `api_key` in DB
- Setzt `g.receiver_node` und `g.tenant_id`
- Prüft `is_active` und Tenant-Status

**1.3 ReceiverProvider** (`backend/providers/receiver_provider.py`)
- In-Memory-Store: `_store[tenant_id][basic_id] = {detections: {node_id: data}, merged: drone_dict}`
- `ingest(tenant_id, node_id, node_lat, node_lon, detections)` → speichert/merged
- `fetch_drones(tenant_id)` → gibt nicht-stale Drohnen zurück (>30s = stale)
- Deduplizierung: stärkstes RSSI pro basic_id über alle Empfänger
- Thread-safe via `threading.Lock`
- Normalisiert auf Standard-Drohnen-Format (gleich wie andere Provider)

**1.4 ProviderRegistry-Integration** (`backend/providers/__init__.py`)
- `_receiver_provider = ReceiverProvider()` im `__init__`
- `get_all_drones()` bekommt neuen Parameter `tenant_id`
- Wenn "receiver" in `enabled_sources`: `fetch_drones(tenant_id)` + Compound-ID `receiver_{basic_id}`

**1.5 API-Endpoints** (`backend/routes/receiver_routes.py`, Prefix `/api/receivers`)

Admin-CRUD (JWT, tenant_admin+):
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/api/receivers` | Liste aller Empfänger des Mandanten |
| POST | `/api/receivers` | Empfänger erstellen (name, hardware_type) → api_key generiert |
| GET | `/api/receivers/:id` | Einzelner Empfänger |
| PUT | `/api/receivers/:id` | Name/Status ändern |
| DELETE | `/api/receivers/:id` | Empfänger löschen |
| POST | `/api/receivers/:id/regenerate-key` | Neuen API-Key generieren |
| GET | `/api/receivers/stats` | Aggregierte Statistiken |

Node-Endpoints (X-Node-Key Header):
| Methode | Pfad | Body | Beschreibung |
|---------|------|------|-------------|
| POST | `/api/receivers/ingest` | `{node_lat, node_lon, detections: [{basic_id, lat, lon, alt, rssi, ...}]}` | Erkennungen senden |
| POST | `/api/receivers/heartbeat` | `{firmware_version, wifi_ssid, wifi_rssi, free_heap, uptime_seconds}` | Status-Update |
| POST | `/api/receivers/firmware/build` | `{hardware_type, backend_url, api_key, wifi_ssid?, wifi_password?}` | On-Demand Firmware-Build (super_admin) |

**1.6 Neue Datenquelle** (`backend/settings.py`)
```python
"receiver": {"enabled": False, "label": "Empfänger", "description": "Hardware-Empfänger (ESP32/ESP8266) für Open Drone ID"}
```

**1.7 receiver_version** im `/api/drones`-Response (Version-Counter-Pattern)

**1.8 PlatformIO installieren** (`backend/scripts/install-platformio.sh`)
```bash
pip3 install --user platformio
~/.local/bin/pio platform install espressif32 espressif8266
```

#### Phase 2: Frontend Admin-UI

**2.1 TypeScript-Interface** (`frontend/src/api.ts`)
```typescript
interface ReceiverNode {
  id, tenantId, name, hardwareType, apiKey, firmwareVersion, isActive,
  lastLatitude, lastLongitude, lastLocationAccuracy, lastHeartbeat, lastIp,
  wifiSsid, wifiRssi, freeHeap, uptimeSeconds, totalDetections,
  detectionsSinceBoot, status: 'online'|'stale'|'offline', createdAt, updatedAt
}
```

**2.2 API-Funktionen:** fetchReceivers, createReceiver, updateReceiver, deleteReceiver, regenerateReceiverKey, fetchReceiverStats, buildFirmware

**2.3 ReceiverList.tsx** (`frontend/src/components/admin/ReceiverList.tsx`)
- Tabelle: Status-Dot, Name, Typ (ESP8266 mit gelber "Eingeschränkt"-Badge), Letzter Kontakt, Standort, Erkennungen, Firmware, Aktionen
- Erstellen-Dialog: Name + Hardware-Typ-Auswahl (S3/C3/ESP8266 mit Einschränkungshinweis)
- API-Key-Anzeige (einmal, mit Copy-Button)
- Auto-Refresh alle 30s
- Flash-Button öffnet Wizard

**2.4 ReceiverFlashWizard.tsx** (Phase 2: Placeholder, Phase 4: volle Implementierung)

**2.5 AdminLayout.tsx** → neuer Nav-Eintrag "Empfänger"
**2.6 AdminDashboard.tsx** → Empfänger-Karten (Online/Gesamt)
**2.7 App.tsx** → Route `/admin/receivers`

#### Phase 3: ESP32/ESP8266 Firmware

**3.1 PlatformIO-Projekt** (`firmware/`)
```
firmware/
  platformio.ini        # 3 Environments: esp32-s3, esp32-c3, esp8266
  src/
    main.cpp            # Boot-Sequenz, Loop mit Ingest/Heartbeat-Timer
    config.h            # Build-Flags (Backend-URL, API-Key, WiFi-Credentials)
    wifi_manager.h/.cpp # AP+STA Dual-Mode, NVS-Persistence, Auto-Reconnect
    web_server.h/.cpp   # Captive Portal (WiFi-Config, GPS via Browser, Status)
    odid_scanner.h/.cpp # Promiscuous Mode, ODID Beacon+NAN+BLE Parsing
    http_client.h/.cpp  # POST Ingest+Heartbeat, TLS (ESP32), Retry-Logic
    led_status.h/.cpp   # LED-Muster für Status-Anzeige
  data/
    index.html          # Captive Portal Webseite
```

**3.2 platformio.ini Environments:**
- `esp32-s3`: espressif32, BLE via NimBLE, TLS, AP+STA
- `esp32-c3`: espressif32, BLE via NimBLE, TLS, AP+STA
- `esp8266`: espressif8266, kein BLE, kein TLS, nur Beacon-Frames

**3.3 WiFi Manager:**
- AP immer aktiv: SSID `FlightArc-{node_id_kurz}` (offen)
- STA verbindet zum konfigurierten WLAN
- Credentials in NVS (non-volatile storage)
- Auto-Reconnect bei Verbindungsverlust (alle 10s)
- WiFi-Scan alle 60s für Captive Portal

**3.4 Captive Portal** (ESPAsyncWebServer auf Port 80):
- `GET /` → Status + Config-Seite
- `GET /scan` → JSON: sichtbare WLANs
- `POST /connect` → WiFi-Credentials speichern + verbinden
- `POST /location` → GPS vom Handy speichern (Browser Geolocation API)
- `GET /status` → JSON: Verbindungsstatus, Backend-Erreichbarkeit, Erkennungen
- Captive Portal Detection (Android/Apple/Windows URLs)

**3.5 ODID Scanner:**
- WiFi Promiscuous Mode: Beacon-Frames (OUI 0xFA0BBC) + NAN Action Frames (ESP32)
- BLE: NimBLE Scan für ODID Service UUID 0xFFFA (ESP32 nur)
- ESP8266: Nur Beacon-Frames (kein NAN, kein BLE)
- Ring-Buffer: max 50 Erkennungen bis nächster Ingest

**3.6 HTTP Client:**
- POST `/api/receivers/ingest` alle 2s mit gepufferten Erkennungen
- POST `/api/receivers/heartbeat` alle 30s
- Header: `X-Node-Key: {api_key}`
- TLS auf ESP32 (WiFiClientSecure mit CA-Bundle)
- HTTP-only auf ESP8266
- Retry: 3x mit exponential backoff (1s/2s/4s)

**3.7 LED-Status:**
| Zustand | Muster |
|---------|--------|
| Boot / kein WiFi | Schnelles Blinken (100ms) |
| WiFi OK, kein Backend | Langsames Blinken (500ms) |
| Online (Heartbeat OK) | Dauerhaft an |
| Erkennung empfangen | Kurzer Flash (50ms aus) |
| Fehler | Doppelblink alle 2s |

**3.8 main.cpp Boot-Sequenz:**
```
setup(): LED → WiFiManager.begin() → WebServer.begin() → Scanner.begin() → HTTPClient.begin()
loop(): WiFiManager.loop() → Scanner.loop() → LED-Update → Ingest (2s) → Heartbeat (30s)
```

#### Phase 4: Web-Flash-Wizard

**4.1 Dependency:** `esptool-js: ^0.4.3` (npm)

**4.2 ReceiverFlashWizard.tsx** — 7-Schritte-Wizard:
1. **Intro:** Hardware-Typ, Voraussetzungen, ESP8266-Warnung falls zutreffend
2. **Serial:** `navigator.serial.requestPort()` (nur Chrome/Edge)
3. **WiFi:** Optional SSID+Password + Backend-URL konfigurieren
4. **Build:** `POST /api/receivers/firmware/build` → Firmware on-demand kompilieren (30-60s)
5. **Flash:** esptool-js `ESPLoader.writeFlash()` mit Fortschrittsbalken
6. **Verify:** Warte auf ersten Heartbeat (poll alle 2s, Timeout 60s)
7. **Done:** Erfolgs-Meldung, Status-Anzeige

**Non-Chrome Fallback:** Firmware-Download als .bin + manuelle esptool.py-Anleitung

**4.3 Backend Build-Endpoint:** PlatformIO CLI mit `-D` Build-Flags für Backend-URL, API-Key, WiFi-Credentials. Binary als Download zurück.

#### Phase 5: Karten- & Settings-Integration

**5.1 SOURCE_COLORS:** `receiver: '#14b8a6'` (Teal) in MapComponent, StatusPanel, SettingsPage, DroneDetailPage

**5.2 Empfänger-Marker auf Karte:** Eigene Marker für Empfänger-Standorte (Teal Antenne-Icon), Status-abhängige Farbe (grün/gelb/grau)

**5.3 Settings-Erweiterung:** Wenn "Empfänger" aktiv → Status-Widget: "X von Y online, Z Erkennungen/min"

**5.4 ESP8266-Hinweise:** Gelbe Badge "Eingeschränkt" in ReceiverList, Flash-Wizard, Settings-Hinweis

**5.5 Drohnen-Detail:** `receiver_count` Feld → "(3 Empfänger)" wenn mehrere Nodes dieselbe Drohne sehen

**5.6 Empfänger-Standorte:** MapPage fetcht ReceiverNodes wenn Source aktiv, zeigt als separate Marker-Layer

#### Phase 6: Tests

**Backend Unit-Tests** (`backend/tests/test_receivers.py`):
- TestReceiverCRUD: list, create, create_invalid, get, get_notfound, update, deactivate, delete, regenerate_key, stats
- TestNodeAuth: ohne Key (401), falscher Key (401), gültiger Key (200), inaktiver Node (401)
- TestIngest: single, multiple, stats_update
- TestReceiverProvider: in_drone_list, receiver_version

**E2E-Tests** (`frontend/e2e/receivers.spec.ts`):
- Admin-Seite erreichbar, Empfänger erstellen, Erstellen-Button, Ingest-Endpoint, Stats, Auth-Rejection, Version-Counter, Dashboard-Karten

#### Implementierungsreihenfolge
```
Phase 1 (Backend) → Phase 5.1 (Colors) → Phase 2 (Admin-UI) → Phase 3 (Firmware) → Phase 5 (Map) → Phase 4 (Flash-Wizard) → Phase 6 (Tests)
```
Phase 2 und Phase 3 können parallel laufen. Phase 4 braucht Phase 2 + 3. Tests laufen begleitend.

#### Voraussetzungen
- PlatformIO CLI auf Server installieren: `pip3 install platformio`
- ESP32/ESP8266 Plattform-Support: `pio platform install espressif32 espressif8266`
- npm: `esptool-js@^0.4.3` für Flash-Wizard
- Web Serial API nur in Chrome/Edge (Fallback für andere Browser)

### 2026-03-13 - Adress-Geocoding für Einsatz-Zonen
**Änderungen:**
- **Forward-Geocoding (Backend):** `_forward_geocode(address)` via Nominatim API — wandelt Adressen in Koordinaten um
- **Neuer Endpoint `GET /api/geocode?q=...`:** Standalone Forward-Geocoding für autorisierte Benutzer
- **`POST /api/zones/mission` erweitert:** Akzeptiert jetzt `lat`+`lon` ODER `address` (mindestens eins erforderlich). `lat`/`lon` hat Vorrang wenn beides angegeben. Bei Adresse wird `resolved_address` in der Response zurückgegeben
- **Frontend FlightZonesPanel:** Toggle zwischen "Kartenmitte" und "Adresse"-Modus. Adress-Eingabefeld mit automatischer Geocodierung und Fehleranzeige
- **Frontend API:** `forwardGeocode()` und `createMissionZone()` mit optionalem `address`-Feld
- **useFlightZones Hook:** `createMissionZoneByAddress()` für Adress-basierte Zonenerstellung
- **PS1-Script aktualisiert:** Neuer `-Address` Parameter als Alternative zu `-Lat`/`-Lon`. Validierung: mindestens Koordinaten oder Adresse erforderlich
- **E2E-Tests:** 8 neue Tests (Geocode API: resolve/404/400, Mission Zone mit Adresse: create/precedence/bad-addr, UI: mode-toggle/address-create/error-display)
- **Alle 73 Unit-Tests bestehen**
**Dateien:** `backend/app.py`, `frontend/src/api.ts`, `frontend/src/useFlightZones.ts`, `frontend/src/components/FlightZonesPanel.tsx`, `frontend/src/components/MapPage.tsx`, `frontend/e2e/flight-zones.spec.ts`, `examples/create_mission_zone.ps1`

### 2026-03-13 - Simulation-Neustart, Einsatz-Zonen, E2E-Test-Fixes
**Änderungen:**
- **Simulation-Neustart:** Neuer Button in Settings zum Neustarten der Dronen-Simulation (nur wenn Simulator aktiv, tenant_admin+)
- **Einsatz-Zonen (Mission Zones):** `POST /api/zones/mission` erstellt kreisförmige 100m-Zone an gegebener Position; Button im FlightZonesPanel; `circle_polygon()` Haversine-Berechnung
- **Map-Navigation:** `onSelectZone` fliegt jetzt zum Zonenzentrum nach Erstellung
- **API-Beispiele:** Python + PowerShell Beispielskripts für Mission Zone API via Live-Proxy
- **E2E Multi-Tenant-Tests komplett repariert:** 38/38 Tests bestehen
  - UID-Stabilität über Worker-Restarts (File-basierte State-Persistenz)
  - Rollenbasierte Zone-Operationen (tenant_admin für CRUD, user für Read)
  - Cross-Tenant-Isolation mit tenant_admin-Headers
  - apiLogin wirft jetzt bei Login-Fehlern statt "Bearer undefined"
  - Cleanup entfernt alle e2e-* Daten (nicht nur aktuelle UID)
- **Violations-API-Format:** `data.violations` → `data.records` in E2E-Tests korrigiert
- **E2E Mission Zone Tenant Isolation:** 3 neue Tests prüfen PS1-Script-Flow (Tenant-Lookup → Login mit tenant_id → Zone erstellen → Isolation verifizieren)
- **Echtzeit-Sync für alle Tenant-Clients:** Version-Counter-Pattern generalisiert für Zones, Violations und Settings
  - `zone_version`: bei jeder Zone-Mutation (create/update/delete/assign/unassign)
  - `violation_version`: bei neuen/beendeten Violations, Delete, Clear, Comment-Update (nur bei tatsächlicher Änderung)
  - `settings_version`: bei Settings-Update (Sources, Center, Radius)
  - Alle drei Versionen im `/api/drones`-Response mitgeliefert (piggyback auf bestehendem 2s-Polling)
  - Frontend `useViolationLog` skippt API-Fetch wenn violation_version unverändert (spart ~25 API-Calls/s bei 50 Clients)
  - `clearAll`/`deleteRecord` resetten Version-Ref für sofortiges Refetch nach Re-Detection
- **E2E Zone Auto-Refresh:** 4 Tests (zone_version im Response, Inkrement bei Create/Delete, UI-Auto-Update innerhalb eines Poll-Zyklus)
- **E2E Violation-Fix:** Umlaut-Encoding `Zonenverstoesze` → `Zonenverstöße`, Re-Detection-Count auf ≥2 statt ≥initialCount, `.first()` für mehrdeutige Drone-Selektoren
**Dateien:** `backend/app.py`, `backend/flight_zones.py`, `frontend/src/api.ts`, `frontend/src/types/drone.ts`, `frontend/src/components/SettingsPage.tsx`, `frontend/src/components/FlightZonesPanel.tsx`, `frontend/src/components/MapPage.tsx`, `frontend/src/useFlightZones.ts`, `frontend/e2e/multi-tenant.spec.ts`, `frontend/e2e/flight-zones.spec.ts`, `frontend/e2e/helpers.ts`, `examples/create_mission_zone.py`, `examples/create_mission_zone.ps1`

### 2026-03-12 - Mandanten-Isolation für Zones, Settings, Archives, Center
**Änderungen:**
- **Settings per Mandant:** `GET/POST /api/settings` verwendet jetzt `g.tenant_id` — jeder Mandant hat eigene Datenquellen-Konfiguration
- **Drones per Mandant:** `GET /api/drones` liest `enabled_sources` aus den mandantenspezifischen Settings; Center-Koordinaten kommen aus TenantSettings statt globalem Fleet
- **Kartenzentrum per Mandant:** `POST /api/fleet/center` aktualisiert `center_lat`/`center_lon` in TenantSettings statt globaler Simulator-Einstellung
- **Trail-Archive per Mandant:** Alle Archive-Routes (`GET/POST/DELETE /api/trails/archives`) filtern jetzt nach `g.tenant_id`
- **Settings-API erweitert:** `_read_from_db()` liefert jetzt auch `center_lat`, `center_lon`, `radius`; `_write_to_db()` unterstützt Updates dieser Felder
- **Neue Mandanten:** `create_tenant()` setzt Default-Center (Bielefeld) und Radius bei TenantSettings
- **Bereits isoliert (verifiziert):** Flight Zones, Violations, User/Tenant Management — waren schon korrekt per `g.tenant_id` gefiltert
**Dateien:** `backend/app.py`, `backend/settings.py`, `backend/routes/admin_routes.py`

### 2026-03-12 - Benutzer-Bearbeitung im Admin-Panel
**Änderungen:**
- **Inline-Bearbeitung:** Admins können Benutzer direkt in der Tabelle bearbeiten (Anzeigename, E-Mail, Rolle, Aktiv-Status)
- **Rollenbasierte Einschränkungen:** Nur Super-Admins können die Rolle eines Benutzers ändern, Mandanten-Admins können ihre Benutzer bearbeiten
- **Toggle-Switch:** Aktiv/Inaktiv-Status mit animiertem Toggle-Switch statt Dropdown
**Dateien:** `frontend/src/components/admin/UserList.tsx`

### 2026-03-12 - Rollenbasiertes Berechtigungssystem + Multi-Tenant-Login
**Änderungen:**
- **Multi-Tenant-Zuordnung:** Neues `UserTenantMembership`-Model — Benutzer können mehreren Mandanten zugeordnet sein mit individuellen Rollen pro Mandant
- **Login mit Mandantenauswahl:** Dropdown mit Autocomplete-Suche im Login-Formular zur Mandantenauswahl; letzter Mandant wird in localStorage gespeichert
- **Mandantenwechsel:** `POST /api/auth/switch-tenant` Endpoint + Mandantenwähler in der Admin-Sidebar
- **Rollenbasierte Berechtigungen:**
  - Benutzer (user): Kann alles sehen, aber keine Datenquellen, Flugzonen oder Verstöße ändern/löschen
  - Mandanten-Admin (tenant_admin): Kann Benutzer, Datenquellen und Flugzonen für den eigenen Mandanten verwalten
  - Super-Admin (super_admin): Voller Zugriff auf alle Mandanten
- **Backend-Absicherung:** `@role_required("tenant_admin")` auf alle schreibenden Zone-Routen (POST/PUT/DELETE/assign/unassign), Settings POST und Violation DELETE Routen
- **Frontend ReadOnly-Modus:** FlightZonesPanel, ViolationTable und SettingsPage zeigen Verwaltungsoptionen nur für Admins an
- **JWT-Payload erweitert:** Enthält jetzt `tenant_id` des gewählten Mandanten und `effective_role` (per-Tenant-Rolle)
- **Admin-Dashboard:** Mandanten-Übersicht für Super-Admins mit Benutzer-/Zonenanzahl pro Mandant
- **Migration:** Bestehende Benutzer werden automatisch in die Membership-Tabelle überführt
- **Öffentlicher Tenant-Endpoint:** `GET /api/auth/tenants` (ohne Auth) für Login-Dropdown
**Dateien:** `backend/models.py`, `backend/auth.py`, `backend/app.py`, `backend/routes/auth_routes.py`, `backend/routes/admin_routes.py`, `frontend/src/types/auth.ts`, `frontend/src/api.ts`, `frontend/src/AuthContext.tsx`, `frontend/src/components/LoginPage.tsx`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/components/SettingsPage.tsx`, `frontend/src/components/FlightZonesPanel.tsx`, `frontend/src/components/ViolationTable.tsx`, `frontend/src/components/MapPage.tsx`, `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/components/admin/AdminDashboard.tsx`

### 2026-03-12 - Umlaute-Fix + Verstoß-Alarmton-Toggle
**Änderungen:**
- **Umlaute korrigiert:** Alle fehlerhaften Umlaute (sz→ß, ae→ä, oe→ö, ue→ü) und HTML-Entities (&ouml;→ö etc.) im gesamten Frontend durch korrekte UTF-8-Zeichen ersetzt
- **Per-User Alarmton-Toggle:** Verstoß-Alarmton kann in den Einstellungen pro Benutzer aktiviert/deaktiviert werden (localStorage via userStorage.ts)
**Dateien:** `frontend/src/components/SettingsPage.tsx`, `frontend/src/components/ViolationAlert.tsx`, `frontend/src/useViolationLog.ts`, `frontend/src/components/FlightReportView.tsx`, `frontend/src/components/StatusPanel.tsx`, `frontend/src/components/DroneDetailPage.tsx`, `frontend/src/components/ViolationTable.tsx`, `frontend/src/components/FlightZonesPanel.tsx`, `frontend/src/components/TrackingPanel.tsx`, `frontend/src/components/MapComponent.tsx`, `frontend/src/config/noFlyZones.ts`

### 2026-03-12 - Flugbericht-Verbesserungen + NFZ-Fix + Reverse Geocoding
**Änderungen:**
- **FlightReportView komplett überarbeitet:**
  - Fix: Leere Karte behoben — Map-Container wird immer gerendert (kein early-return vor dem div), Loading-Overlay statt conditional rendering
  - Layer-Toggle-Checkboxen (oben rechts): Zone, Trail, Drohne, Pilot, DIPUL NFZ, Statistiken ein/ausblendbar
  - Drohnen- und Pilotenposition auf Karte mit Markern
  - Reverse Geocoding (Nominatim) für Drohnen- und Pilotenstandort → Straßenadresse
  - Pilot-Sektion im HTML-Bericht (Koordinaten + Adresse)
  - Stats-Overlay repositioniert (`left: 60`) damit Zoom-Controls nicht verdeckt werden
- **StatusPanel NFZ-Prüfung:** Von oben nach unten verschoben, blinkender Spinner durch Refresh-Circle-Button (&#8635;) ersetzt der bei Prüfung rotiert
- **StatusPanel Pilot-Adresse:** Reverse Geocoding zeigt Straßenadresse des Piloten an
- **Backend Trail-Daten erweitert:** `pilot_lat` und `pilot_lon` werden jetzt in Trail-Snapshots gespeichert
- **API:** `reverseGeocode()` Funktion mit Nominatim, 1 req/s Rate-Limiting und In-Memory-Cache; `ViolationTrailPoint` Interface um `pilot_lat`/`pilot_lon` erweitert
**Dateien:** `frontend/src/components/FlightReportView.tsx`, `frontend/src/components/StatusPanel.tsx`, `frontend/src/api.ts`, `backend/flight_zones.py`

### 2026-03-12 - Flugbericht-Feature + Trail-Fixes + Demo-Drohnen-Muster
**Änderungen:**
- **Flugbericht (FlightReportView):** Neues Feature — jeder Alarm-Eintrag hat einen "Bericht"-Button der eine vollständige Flugbericht-Ansicht öffnet:
  - Leaflet-Karte mit Zonen-Polygon und Drohnen-Trail (animiert)
  - Timeline mit Play/Pause, Geschwindigkeitsregler (0.5x–10x), Range-Slider
  - Rechte Seite: Aktuelle Messpunkt-Details + scrollbare Messpunkt-Tabelle (synced mit Timeline)
  - Kommentar-Feld mit Backend-Persistierung
  - "Bericht erstellen"-Button generiert professionellen HTML-Flugbericht zum Drucken/PDF
  - Stats-Overlay (Höhenbereich, Geschwindigkeit, Punkte, Dauer)
- **Backend Trail-Daten:** `update_violations()` sammelt jetzt bei jeder Prüfung Position-Snapshots (lat, lon, alt, speed, battery, signal, heading, ts) in `trail_data` JSON-Spalte. Neue Endpoints: `GET /api/violations/<id>` (mit Trail), `PUT /api/violations/<id>/comments`
- **DB-Migration:** Neue Spalten `trail_data`, `comments`, `zone_polygon` auf `violation_records`
- **Trail-Fix (3 Ursachen):** (1) `visibleTrails` Fallback wenn selektierte Violation-Drohne keinen Trail hat, (2) `vl.sync()` wird jetzt awaited + zweiter `updatePositions()`-Call nach Auto-Tracking, (3) `trackDrone()` erzeugt 2 initiale Trail-Punkte statt 1
- **ViolationTable-Fix:** `e.stopPropagation()` auf Trail-Toggle und Delete-Buttons, damit Row-Selection nicht gleichzeitig feuert
- **Demo-Drohnen:** Jede Drohne hat ein eigenes festes Flugmuster (linear, circular, waypoint, figure_eight, search_pattern) statt zufälliger Muster. 3 neue Patterns: figure_eight (Lemniskate), spiral, random_walk
- **Test-Fix:** `test_violations_endpoint` auf neuen `records`-Key angepasst (280/280 Tests bestanden)
**Dateien:** `frontend/src/components/FlightReportView.tsx` (NEU), `frontend/src/components/MapPage.tsx`, `frontend/src/components/ViolationTable.tsx`, `frontend/src/useTracking.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `backend/flight_zones.py`, `backend/app.py`, `backend/models.py`, `backend/drone_simulator.py`, `backend/tests/test_flight_zones.py`

### 2026-03-12 - Fix: Zone Violations nur für erste Zone + Multi-Tenant Sync
**Änderungen:**
- **Bug-Fix:** Violations/Alarme wurden nur für die erste Flight Zone ausgelöst, nicht für nachfolgende. Ursache: `checkViolations` in `useFlightZones.ts` nutzte `zones` aus dem `useCallback`-Closure (Dependency `[zones]`). Bei React State-Batching konnte der Polling-Intervall die veraltete `checkViolations`-Funktion aufrufen bevor die Ref aktualisiert wurde. Fix: `zonesRef` (Ref) statt Closure — `checkViolations` liest immer `zonesRef.current` und hat Dependency `[]` (stabile Referenz).
- **Multi-Tenant Sync:** Zones werden jetzt alle 30s vom Backend nachgeladen, damit alle User im gleichen Tenant Zones sehen die von anderen Usern erstellt wurden (ohne Page Reload).
**Dateien:** `frontend/src/useFlightZones.ts`

### 2026-03-12 - Multi-Tenant Zone Isolation + E2E Tests
**Änderungen:**
- **Bug-Fix (kritisch):** Zone-Routes in `app.py` nutzten nicht `g.tenant_id` aus dem JWT — alle Zonen wurden dem Default-Tenant zugeordnet statt dem Tenant des eingeloggten Users. Fix: Alle Zone-Operationen (`list_zones`, `create_zone`, `get_zone`, `update_zone`, `delete_zone`, `assign_drones`, `unassign_drones`, `check_violations`) übergeben jetzt `tenant_id=g.tenant_id`.
- **Neue E2E Tests (35 Tests):** Multi-Tenant-Isolation umfassend getestet:
  - Zone-Isolation: Nutzer im gleichen Tenant sehen gleiche Zonen, verschiedene Tenants sehen nichts voneinander
  - Cross-Tenant-Schutz: Zugriff, Update, Delete, Assign auf fremde Zonen → 404
  - Violation-Isolation: Nur eigene Tenant-Zonen erzeugen Violations
  - Role-Based Access: Regular User → 403 auf Admin-Endpoints, Tenant-Admin sieht nur eigene Tenant-User
  - Admin Board: Tenant/User-Counts, User-Filter, Passwort-Reset
  - UI-Tests: Gleicher Tenant sieht gleiche Zonen/Violations im Browser, anderer Tenant nicht
- **Gesamt: 178 E2E Tests bestanden** (144 bestehende + 34 neue)
**Dateien:** `backend/app.py` (tenant_id fix), `frontend/e2e/multi-tenant.spec.ts` (neu)

### 2026-03-12 - Fix: Polling-Performance + Auto-Tracking bei Zone-Violations
**Änderungen:**
- **Performance:** `loadDrones` wurde bei jedem Poll-Zyklus neu erstellt weil `tracking.isTracked` sich bei jeder Trail-Änderung änderte → Polling-Intervall wurde ständig zurückgesetzt → unkontrolliertes Re-Polling. Fix: Refs (`trackingRef`, `flightZonesRef`, `violationLogRef`) statt direkte Hook-Abhängigkeiten in `loadDrones`. Dependencies reduziert auf `[userLocation, radiusEnabled, radius]`.
- **Auto-Tracking:** Stale-Closure-Problem in `onAutoTrack`-Callback — nutzte veraltete `tracking.isTracked` aus dem Closure. Fix: `trackingRef.current.isTracked()` für immer aktuelle State-Referenz.
- **Violation Log Optimierung:** Records werden nicht mehr bei jedem Poll komplett kopiert (`prev.map(r => ({...r}))`), sondern nur geänderte Records kopiert.
- **Unnötiger Re-Render entfernt:** `setViolations()` in `checkViolations` entfernt — Violations werden direkt zurückgegeben und vom ViolationLog verwaltet.
**Dateien:** `frontend/src/components/MapPage.tsx`, `frontend/src/useViolationLog.ts`, `frontend/src/useFlightZones.ts`

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

### 2026-03-11 - Projekt-Umbenennung: FlightArc (v1.2.0)
**Aenderungen:**
- **Rename:** "Drone Mesh Mapper" → "FlightArc" in allen Dateien
- **Version Bump:** 1.1.0 → 1.2.0
- Aktualisiert: manifest.json, package.json, index.html, MapPage Header, Backend Docstrings/Logger, OGN User-Agent, .env.example, E2E-Tests, CONVERSATION-LOG

**Dateien:**
- `manifest.json` - Name, displayName, description, service name, version
- `frontend/package.json` - name, version
- `frontend/index.html` - Title Tag
- `frontend/src/components/MapPage.tsx` - Header-Text
- `backend/app.py` - Docstring, Logger
- `backend/drone_simulator.py` - Docstring
- `backend/providers/ogn_provider.py` - User-Agent
- `.env.example` - Kommentar
- `frontend/e2e/map-page.spec.ts` - Erwarteter Titel
- `frontend/e2e/drone-detail.spec.ts` - Erwarteter Titel
- `CONVERSATION-LOG.md` - Titel
- `frontend/dist/` - Rebuild

### 2026-03-12 - Custom Flight Zones (v1.3.0)
**Aenderungen:**
- **Custom Flight Zones:** Benutzer koennen eigene Flugzonen per Mausklick auf der Karte definieren
  - Polygon-Zeichenmodus: Punkte per Klick setzen, Vorschau als gestrichelte Linie, Undo/Abbrechen
  - Zonenname und Farbe waehlbar, 8 vordefinierte Farben
  - Zonen werden als farbige halbtransparente Polygone auf der Karte dargestellt
  - Tooltip mit Zonenname bei Hover
- **Drohnen-Zuweisung (n:m):** Mehrere Drohnen koennen mehreren Zonen zugewiesen werden
  - Zuweisungs-Panel mit Drohnen-Liste, Checkbox-Selektion und Suchfilter
  - Drohnen werden ueber ihre Kennung (basic_id) zugewiesen
- **Zonenverletzungs-Alarm:** Warnung wenn nicht-zugewiesene Drohne eine Zone betritt
  - Echtzeit-Pruefung bei jedem Poll-Zyklus (Client-seitige Point-in-Polygon Berechnung)
  - Rotes Alert-Banner am unteren Bildschirmrand mit Pulse-Animation
  - Web Audio API Warnton bei neuen Verletzungen
  - Einzeln oder alle Verletzungen ausblendbar, auto-clear bei Verlassen der Zone
- **Backend:**
  - `flight_zones.py`: FlightZoneManager mit CRUD, Assign/Unassign, Violation Detection
  - JSON-Persistenz in `backend/data/zones/`, Thread-safe mit threading.Lock()
  - Point-in-Polygon Ray-Casting Algorithmus (Python + TypeScript)
  - 8 neue API-Endpoints: GET/POST `/api/zones`, GET/PUT/DELETE `/api/zones/<id>`, POST assign/unassign, GET violations
  - Strukturiertes Logging (`zone_logger`)
- **Frontend:**
  - `useFlightZones.ts`: Custom Hook fuer Zonen-State, Zeichenmodus, Violation Detection
  - `FlightZonesPanel.tsx`: Zonen-Verwaltung mit Zeichenmodus-UI
  - `ZoneAssignPanel.tsx`: Drohnen-Zuweisungs-Modal
  - `ViolationAlert.tsx`: Verletzungs-Alert mit Audio
  - MapComponent: Polygon-Rendering, Drawing-Mode mit Crosshair-Cursor
  - MapPage: Zonen-Button mit Badge-Count und "ZEICHNEN"-Indikator
- **Tests:**
  - Backend: 48 neue Tests (Point-in-Polygon, CRUD, Assign, Violations, Persistence, API)
  - Frontend Unit: 6 neue Tests (pointInPolygon), 10 API-Tests
  - E2E: 22 neue Tests (11 API + 11 UI: Panel, Drawing, Create, Delete, Assign, Badge)
- **Test-Ergebnisse:** 180 Backend, 73 Frontend Unit, 22 Flight Zones E2E — alle bestanden

**Dateien:**
- `backend/flight_zones.py` - NEU: FlightZoneManager mit CRUD + Violations
- `backend/app.py` - 8 neue Zone-API-Endpoints, zone_logger
- `backend/tests/test_flight_zones.py` - NEU: 48 Backend-Tests
- `frontend/src/types/drone.ts` - FlightZone, ZoneViolation Interfaces
- `frontend/src/api.ts` - 7 neue Zone-API-Funktionen
- `frontend/src/useFlightZones.ts` - NEU: Flight Zones Hook
- `frontend/src/useFlightZones.test.ts` - NEU: pointInPolygon Tests
- `frontend/src/components/FlightZonesPanel.tsx` - NEU: Zonen-Panel
- `frontend/src/components/ZoneAssignPanel.tsx` - NEU: Zuweisungs-Modal
- `frontend/src/components/ViolationAlert.tsx` - NEU: Verletzungs-Alert
- `frontend/src/components/MapComponent.tsx` - Polygon + Drawing Mode Rendering
- `frontend/src/components/MapPage.tsx` - Flight Zones Integration
- `frontend/src/index.css` - violationPulse Animation
- `frontend/src/api.test.ts` - 10 neue Zone-API-Tests
- `frontend/src/test/mocks.ts` - createMockFlightZone, createMockZoneViolation
- `frontend/src/components/StatusPanel.test.tsx` - Test-Fix (Speed Regex)
- `frontend/src/components/DroneDetailPage.test.tsx` - Test-Fix (Timer Advancement)
- `frontend/e2e/flight-zones.spec.ts` - NEU: 22 E2E-Tests
- `manifest.json` - Version 1.2.0 → 1.3.0
- `frontend/package.json` - Version 1.2.0 → 1.3.0
- `frontend/dist/` - Rebuild

### 2026-03-12 - Hoehenbereiche AGL, Snap-to-Close Zeichnen, Zonennamen auf Karte
**Aenderungen:**
- **Hoehenbereiche (AGL):** Flugzonen koennen jetzt Min/Max-Hoehe ueber Grund (AGL) zugewiesen werden
  - Neue Felder `minAltitudeAGL` / `maxAltitudeAGL` auf FlightZone (nullable)
  - Violation Check beruecksichtigt AGL: Drohnenhoehe - Gelaendehoehe aus Elevation Grid
  - Backend nutzt `_get_cached_elevation()` fuer serverseitige AGL-Pruefung
  - Frontend nutzt `getElevation()` aus dem vorberechneten Elevation Grid
  - Panel zeigt AGL-Eingabefelder bei Zonenerstellung und AGL-Range in der Zonenliste
- **Snap-to-Close Zeichenmodus:** Polygon-Kette schliessen durch Klick auf ersten Punkt
  - `SNAP_THRESHOLD` (~15m): Wenn Klick nahe dem ersten Punkt, wird Polygon automatisch geschlossen
  - Erster Punkt pulsiert gruen und vergroessert sich wenn Snapping moeglich (>=3 Punkte)
  - `addPoint()` gibt `true` zurueck bei Snap, Panel zeigt "Klicke auf den gruenen Punkt zum Schliessen"
- **Zonennamen auf der Karte:** Permanente Labels am Polygon-Centroid
  - Leaflet `L.tooltip` mit `permanent: true` und `direction: 'center'`
  - CSS-Klasse `zone-label` mit halbtransparentem Hintergrund (dark/light theme)
  - Zeigt Zonenname + AGL-Bereich (wenn definiert)
- **Abwaertskompatibilitaet:** Bestehende Zonen ohne AGL-Felder erhalten `null`-Defaults beim Laden

**Dateien:**
- `frontend/src/types/drone.ts` - minAltitudeAGL, maxAltitudeAGL auf FlightZone
- `frontend/src/useFlightZones.ts` - SNAP_THRESHOLD, snappable, AGL in finishDrawing + checkViolations
- `frontend/src/components/FlightZonesPanel.tsx` - AGL-Inputs, Snap-Hinweis, AGL in Zonenliste
- `frontend/src/components/MapComponent.tsx` - Snap-Indikator, permanente Zone-Labels, snappable prop
- `frontend/src/components/MapPage.tsx` - snappable prop durchreichen
- `frontend/src/api.ts` - AGL-Felder in create/update
- `frontend/src/index.css` - zone-label CSS (dark/light)
- `frontend/src/test/mocks.ts` - AGL-Felder in Mock
- `backend/flight_zones.py` - AGL-Felder in create/update/load, AGL-Check in check_violations
- `backend/app.py` - _get_cached_elevation an check_violations uebergeben
- `frontend/e2e/flight-zones.spec.ts` - Selektoren angepasst fuer permanente Labels
- `frontend/dist/` - Rebuild

### 2026-03-12 - Zone nach Erstellung bearbeiten (ZoneAssignPanel)
**Änderungen:**
- **Zone bearbeiten:** ZoneAssignPanel erweitert um editierbare Zonen-Eigenschaften
  - Name, Farbe, Min/Max AGL direkt im gleichen Modal wie Drohnen-Zuweisung bearbeiten
  - Header geaendert von "Drohnen zuweisen" zu "Zone bearbeiten" mit separater "Drohnen zuweisen" Sektion
  - Neue `onUpdateZone` Prop fuer API-Aufrufe (PUT /api/zones/:id)
  - Speichern-Button sendet sowohl Zonen-Updates als auch Drohnen-Aenderungen
  - Disabled/Loading State waehrend Speichern
- **E2E Tests (+2):** 23 Flight Zone Tests gesamt
  - "assign drones panel opens with edit fields": Prueft ob Editfelder mit Zonendaten vorbefuellt sind
  - "edit zone name via assign panel": Aendert Zonennamen, verifiziert per API und Panel

**Dateien:**
- `frontend/src/components/ZoneAssignPanel.tsx` - Editierbare Name/Farbe/AGL-Felder, onUpdateZone Prop
- `frontend/src/components/MapPage.tsx` - onUpdateZone={flightZones.updateZone} durchgereicht
- `frontend/e2e/flight-zones.spec.ts` - 2 neue E2E-Tests fuer Zone-Bearbeitung
- `frontend/dist/` - Rebuild

### 2026-03-12 - Violations-Tabelle mit Auto-Tracking
**Änderungen:**
- **Violations-Tabelle am unteren Rand:** Ersetzt die alte ViolationAlert-Popup-Anzeige
  - Fixierte Leiste am unteren Bildschirmrand mit collapsible Tabelle
  - Header-Leiste zeigt Anzahl und aktive Verstoesze, klickbar zum Auf-/Zuklappen
  - Tabelle: Status (aktiv/beendet), Drohne, Zone, Beginn (Uhrzeit), Dauer (live-aktualisiert), Trail-Toggle, Loeschen
  - Sortiert nach Startzeitpunkt (neueste zuerst)
  - "Alle loeschen" Button im Header
  - Klick auf Drohnenname oeffnet StatusPanel
- **Violation Records mit Start/End-Zeit:** Neue `ViolationRecord` Datenstruktur
  - Persistente Aufzeichnung mit Startzeit, Endzeit (null = aktiv), Zonenfarbe
  - Erkennt automatisch wann Verstoesze beginnen und enden
  - Gleiche Drohne kann mehrere Verstoesze verursachen (separate Eintraege)
  - Loeschen eines Verstoszes entfernt auch Tracking-Daten (Untrack wenn letzter Verstosz)
- **Auto-Tracking bei Verstosz:** Wenn Drohne in eine Flight Zone eindringt, wird automatisch Tracking gestartet
  - Tracking bleibt aktiv bis manuell deaktiviert oder Drohne verschwindet
  - Trail-Sichtbarkeit per Toggle in der Tabelle steuerbar
  - Filled Circle = Trail sichtbar, Empty Circle = Trail ausgeblendet
- **Neuer Hook `useViolationLog`:** Verwaltet Violation Records
  - Vergleicht aktuelle Verstoesze mit bestehenden Records
  - Erkennt neue Verstoesze und loest Auto-Track + Alarm-Sound aus
  - Erkennt beendete Verstoesze (Drohne verlaesst Zone oder verschwindet)
  - Trail-Visibility pro Record, aggregiert auf Drohnen-Ebene
- **Vereinfachtes useFlightZones:** Dismiss-Logik entfernt (durch Tabelle ersetzt)
- **ViolationAlert entfernt:** Durch ViolationTable ersetzt (Alarm-Sound beibehalten)
- **E2E Tests (+8):** 31 Flight Zone Tests gesamt
  - Violation Table: erscheint bei Verstoesze, collapsible, zeigt Drohne/Zone info
  - Aktive Verstoesze: live Badge, Trail-Toggle, Loeschen, Alle loeschen
  - Klick auf Drohnenname oeffnet StatusPanel

**Dateien:**
- `frontend/src/types/drone.ts` - ViolationRecord Interface
- `frontend/src/useViolationLog.ts` - **NEU** Violation Log Hook mit Auto-Tracking
- `frontend/src/components/ViolationTable.tsx` - **NEU** Collapsible Violations-Tabelle
- `frontend/src/useFlightZones.ts` - Dismiss-Logik entfernt, vereinfacht
- `frontend/src/components/MapPage.tsx` - ViolationTable statt ViolationAlert, Auto-Track Integration, Trail-Filter
- `frontend/src/test/mocks.ts` - createMockViolationRecord hinzugefuegt
- `frontend/e2e/flight-zones.spec.ts` - 8 neue E2E-Tests fuer Violation Table
- `frontend/dist/` - Rebuild

### 2026-03-12 - Violation-Tabelle: Zeilen-Selektion + Trail-Filterung
**Änderungen:**
- **Zeilen-Selektion in Violation-Tabelle:** Klick auf eine Tabellenzeile selektiert den Verstosz visuell
  - Selektierte Zeile wird blau hervorgehoben (outline + background)
  - Wechsel zwischen verschiedenen Verstoessen per Klick moeglich
  - Karte fliegt zur Position der selektierten Drohne (focusPosition)
  - StatusPanel oeffnet sich fuer die selektierte Drohne
- **Trail-Filterung nach Selektion:** Nur der Trail der selektierten Drohne wird auf der Karte angezeigt
  - Wenn ein Verstosz selektiert ist: nur Trail dieser Drohne sichtbar
  - Wenn kein Verstosz selektiert: alle Trails sichtbar (bisheriges Verhalten)
  - Selektion wird automatisch zurueckgesetzt wenn der Record geloescht/gecleart wird
- **ViolationTable Props geaendert:** `onSelectDrone(droneId)` → `onSelectRecord(recordId)` + `selectedRecordId`
  - Klick-Handler auf gesamte Tabellenzeile (nicht nur Drohnenname)
  - Separate `cursor: pointer` auf der ganzen Zeile

**Dateien:**
- `frontend/src/components/ViolationTable.tsx` - selectedRecordId Prop, Zeilen-Highlight, onSelectRecord
- `frontend/src/components/MapPage.tsx` - selectedViolationRecordId State, Trail-Filterung nach Selektion, Record-Cleanup useEffect
- `frontend/dist/` - Rebuild

### 2026-03-12 - Umfassende E2E-Tests: Selektion, Re-detection, Refresh Rate
**Änderungen:**
- **12 neue E2E-Tests** fuer alle neuen Features:
  - **Violation Selection (4):** Zeilen-Highlight, Wechsel zwischen Verstoessen, Trail-Filterung bei Selektion, Trail-Wechsel bei Selektion
  - **Clear & Re-detection (3):** Alle Drohnen nach "Alle loeschen" werden erneut erkannt, einzelne Drohne nach Loeschen wird erneut erkannt, Selektion wird zurueckgesetzt
  - **Refresh Rate (5):** Dropdown sichtbar, Default 2s, alle Preset-Werte vorhanden, localStorage-Persistenz, Pollfrequenz aendert sich
- **Pre-existing Test-Fixes:** map-page.spec.ts Selektoren repariert (ambigue `select`/`text=Alle` Locators, Settings-Button Titel)
- **StatusPanel data-testid:** `data-testid="status-panel"` hinzugefuegt fuer zuverlaessige E2E-Erkennung
- **Test-Ergebnisse:** 113 E2E-Tests (44 Flight Zones, 30 NFZ, 15 Map Page, restliche API/Detail)

**Dateien:**
- `frontend/e2e/flight-zones.spec.ts` - 12 neue Tests (Selection, Re-detection, Refresh Rate)
- `frontend/e2e/map-page.spec.ts` - Locator-Fixes fuer ambigue Selektoren
- `frontend/src/components/StatusPanel.tsx` - data-testid hinzugefuegt
- `frontend/dist/` - Rebuild

### 2026-03-12 - Konfigurierbare Aktualisierungsrate
**Änderungen:**
- **Refresh-Rate Dropdown in der Top-Bar:** Benutzer kann Polling-Intervall anpassen
  - 5 Stufen: 1s (Simulator), 2s (Standard), 5s (Moderat), 10s (API-Cache), 30s (Langsam)
  - Einstellung wird in localStorage gespeichert (persistent)
- **Performance-Guard:** Bei >100 Drohnen wird automatisch mindestens 5s erzwungen
  - Hinweis "min 5s" erscheint wenn User schnellere Rate gewaehlt hat
- **API-Rate konform:** Backend-Provider cachen 10-15s unabhaengig vom Frontend-Polling
  - Schnelleres Polling liefert gecachte Daten, belastet externe APIs nicht zusaetzlich

**Dateien:**
- `frontend/src/components/MapPage.tsx` - REFRESH_RATES Config, refreshRate State, effectiveInterval, Dropdown-UI
- `frontend/dist/` - Rebuild

### 2026-03-12 - Mandantensystem mit Login, Berechtigungen & Datenbank (Phasen 1-8)
**Änderungen:**
- **Phase 1: Datenbank-Layer:** SQLite + SQLAlchemy + Alembic, WAL-Modus, Models (Tenant, User, TenantSettings, FlightZone, TrailArchive), JSON-Speicherung durch DB ersetzt
- **Phase 2: Auth-System:** JWT-basierte Authentifizierung (PyJWT + bcrypt), Login/Refresh/Me Endpoints, `@login_required` und `@role_required` Decorators, 3 Rollen (super_admin, tenant_admin, user)
- **Phase 3: Admin-API:** CRUD für Mandanten und Benutzer, Berechtigungsregeln, Cascade Delete, Passwort-Reset
- **Phase 4: Mandanten-Scoping:** Blueprint-Extraktion aus monolithischer app.py, `@login_required` auf alle Endpoints, Mandanten-gefilterte Daten (Zonen, Trails, Settings), Ownership-Checks
- **Phase 5: Frontend Auth:** LoginPage, AuthContext mit JWT-Management, ProtectedRoute mit Rollen-Hierarchie, authFetch Wrapper mit Token-Refresh, User-Info + Admin-Link + Logout in MapPage Header
- **Phase 6: Frontend Admin-Bereich:** AdminLayout mit Sidebar, AdminDashboard mit Stats, TenantList/UserList CRUD, Inline-Styles passend zum bestehenden Design
- **Phase 7: Frontend Integration + E2E:** localStorage-Namespacing per User (userStorage.ts), Playwright auth setup project mit storageState, loginAs/apiLogin Helpers, 12 Auth E2E-Tests, 19 Admin E2E-Tests, alle bestehenden E2E-Tests mit Auth aktualisiert
- **Phase 8: JSON-zu-DB Migration:** Auto-Migration beim ersten Start, bestehende zones/archives/settings werden in DB importiert
- **Tests:** 280 Backend-Tests, 144 E2E-Tests — alle bestanden

**Dateien (Auswahl):**
- `backend/database.py` - NEU: SQLAlchemy Init + WAL Config
- `backend/models.py` - NEU: Alle SQLAlchemy Models
- `backend/auth.py` - NEU: JWT Auth + Decorators
- `backend/routes/` - NEU: Blueprints (auth, admin, drone, zone, trail, settings, lookup)
- `backend/scripts/migrate_json_to_db.py` - NEU: JSON → DB Migration
- `backend/tests/test_auth.py` - NEU: 30 Auth-Tests
- `backend/tests/test_admin.py` - NEU: 45 Admin-Tests
- `backend/tests/test_models.py` - NEU: 20 Model-Tests
- `backend/tests/test_database.py` - NEU: 10 DB-Tests
- `frontend/src/AuthContext.tsx` - NEU: Auth State Management
- `frontend/src/components/LoginPage.tsx` - NEU: Login-Formular
- `frontend/src/components/ProtectedRoute.tsx` - NEU: Route-Schutz
- `frontend/src/components/admin/` - NEU: AdminLayout, Dashboard, TenantList, UserList
- `frontend/src/userStorage.ts` - NEU: User-scoped localStorage
- `frontend/src/api.ts` - MODIFIZIERT: authFetch, Auth+Admin Endpoints
- `frontend/src/main.tsx` - MODIFIZIERT: AuthProvider
- `frontend/src/App.tsx` - MODIFIZIERT: Login/Admin Routes
- `frontend/e2e/auth.setup.ts` - NEU: Playwright auth setup
- `frontend/e2e/auth.spec.ts` - NEU: 12 Auth E2E-Tests
- `frontend/e2e/admin.spec.ts` - NEU: 19 Admin E2E-Tests
- `frontend/e2e/helpers.ts` - NEU: loginAs, apiLogin Helpers
- `frontend/e2e/flight-zones.spec.ts` - MODIFIZIERT: Auth Headers
- `frontend/e2e/nofly-zones.spec.ts` - MODIFIZIERT: Auth Headers
- `frontend/e2e/api.spec.ts` - MODIFIZIERT: Auth Headers
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
- Test-Abdeckung: 280 Backend-Tests, 73 Frontend Unit-Tests, 144 E2E-Tests (44 Flight Zones, 30 NFZ, 19 Admin, 15 Map Page, 12 Auth, restl. API/Detail/NFZ-Verify)
- Aircraft Lookup Quellen (7): adsbdb.com, OpenSky Network, hexdb.io, OGN DDB, adsbdb Callsign, planespotters.net, airport-data.com
- OGN Aircraft Type Codes: 0=Unknown, 1=Segelflugzeug, 3=Helikopter, 8=Motorflugzeug, 9=Jet, 13=UAV/Drohne, etc.
- OGN Feld 12 = ICAO Hex (Mode-S), Feld 10 = Aircraft Type Code, Feld 13 = OGN/FLARM Device ID
