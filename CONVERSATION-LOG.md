# Conversation Log: FlightArc (ehem. Drone Mesh Mapper)
> Automatisch gepflegtes Log aller Änderungen

## Metadaten
- **Erstellt:** 2026-03-04 | **Letzte Änderung:** 2026-04-25 (PayloadBuilder UX-Fix: Mittelbereich war zu eng + Überlappungen)
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
- [x] Empfänger-Datenübertragung: Event-basiert statt 2s-Batch. Firmware v1.1.0, min 100ms zwischen Sends.
- [x] Logging-System: Per-Mandant DB-Logging mit konfigurierbaren Levels. Admin-Tab "Logs" mit Filterung, Suche, Auto-Refresh.
- [x] E2E-Tests für Mobile-Ansichten: 28 Playwright-Tests mit Mobile-Viewport (375x667) für alle Mobile-Layouts.
- [x] Benutzerhandbuch: Mobile-Ansichten, Einsatz-Zonen Einstellungen, Adress-Prüfung, Log-Viewer dokumentiert.
- [x] Alarmierung Phase 1: Schnittstellen-Editor + Alarmverwaltung (Webhook-Push, Pull-Out, Pull-In, Auth-Methoden, JSON-Template-Builder, Lieferungs-Log)
- [x] Alarmierung Phase 2: Drag-and-Drop JSON-Builder mit @dnd-kit (Tree-Editor, Variable-Palette, Live-Preview, Toggle Builder/Raw)
- [x] Alarmierung Phase 3+4+5: Templates (6), Subscription-Channel (Pub/Sub mit API-Key + HMAC), Beispiel-Code (curl/Python/JS), Stats + 7d-Sparkline, bidirektionales Monitoring, Mobile-Layout, Drag-Drop-Import
- [x] Alarmierung Phase 6: Multi-Sprachen (Go/Rust/Ruby), pro-Subscriber-Lieferungs-Log, Pull-Out-Response-Mapping (JSON-Path, Fehler-Pfad), Pentest-Hardening (SSRF, Timing, Sub-Cap, Rate-Limit)
- [ ] WebSocket-Integration für echte Push-Updates statt Polling
- [ ] ESP 8266 MicroPython-Anpassung
- [ ] Integration mit echtem drone-mesh-mapper Hardware-Setup
- [ ] Docker Deployment Package

## Änderungshistorie

### 2026-04-25 - HelpLink-Konsistenz: Symbol an JEDER Top-Level-Seite, einheitliche Position
**Anlass:** User-Audit-Frage „prüfe das die Hilfesymbole bei allen Seiten an der gleichen Position sind". Subagent-Audit ergab: 6 von ~15 Seiten hatten ein HelpLink, der Rest nicht; MapPage Mobile hatte 18px statt 20px.

**Etablierte Konsistenzregel (jetzt überall angewandt):**
- Top-Level-Page-Headline (`<h1>`): `<HelpLink size={20} />` als letztes Kind im h1, h1-Style um `display:flex, alignItems:center, gap:10` ergänzt.
- Side-Panel-Header (z.B. FlightZonesPanel, NoFlyZonesPanel): `size={16}` — anderer visueller Kontext, bleibt.
- Section-/Sub-Mapping in HelpPage: top-level Pages haben eigene Sektion (`map`, `receivers`, `simulation`, `interfaces`, `alarms`, `settings`, `drones`); Admin-Subtabs nutzen `section="admin"` + `sub="<id>"` (z.B. `dashboard`, `mandanten-verwaltung`, `benutzer-verwaltung`, `log-viewer`, `sicherheits-audit`).

**Geänderte Dateien (Import + h1-Style + HelpLink hinzugefügt):**
- `admin/AdminDashboard.tsx` → `admin/dashboard`
- `admin/TenantList.tsx` → `admin/mandanten-verwaltung`
- `admin/UserList.tsx` → `admin/benutzer-verwaltung`
- `admin/LogViewerTab.tsx` → `admin/log-viewer`
- `admin/AuditLogTab.tsx` → `admin/sicherheits-audit`
- `admin/SettingsTab.tsx` → `settings`
- `admin/ReceiverList.tsx` → `receivers`
- `admin/SimulationTab.tsx` → `simulation`
- `admin/PlanningTab.tsx` → `receivers/empfaenger-planung`
- `DroneDetailPage.tsx` → `drones`
- `SettingsPage.tsx` → `settings`
- `MapPage.tsx`: Mobile-HelpLink von size=18 auf size=20 angeglichen.

**Ergebnis:** 17 HelpLinks an konsistenten Positionen — 15× size=20 an Page-Headlines, 2× size=16 an Side-Panel-Headern.

**Build:** `npm run build` ✓ (4.78s).

### 2026-04-25 - PayloadBuilder UX Round 2: Tooltips, sicheres Leeren, JSON-Import
**Anlass:** User-Feedback nach Tests des überarbeiteten Builders:
1. Tooltips fehlen an den Bedienelementen.
2. Die obigen „Objekt"/„Array"-Buttons löschten den gesamten Tree, statt etwas hinzuzufügen.
3. Es soll eine Import-Funktion geben, die ein bestehendes JSON-Template als Bauklotz-Struktur anlegt.

**Fixes (`frontend/src/components/admin/payloadBuilder/PayloadBuilder.tsx`):**
- Top-Buttons komplett überarbeitet: statt der zwei destruktiven „Objekt"/„Array"-Tasten gibt es jetzt **„📥 JSON importieren"** (öffnet ein Inline-Panel mit Textarea) und **„🗑️ Leeren"** (mit confirm-Dialog wenn der Tree nicht leer ist). Beide Aktionen tooltipped.
- **JSON-Import-Panel**: Textarea mit Vorbefüllung des aktuellen Trees als Startpunkt. Buttons „Importieren" (parst und ersetzt Tree via `fromJson`), „Aus Zwischenablage einfügen" (`navigator.clipboard.readText`), „Abbrechen". Mustache-Tokens (`{{...}}`, `${{...}}`) werden korrekt als Variablen-Bausteine erkannt — der bestehende `fromJson()`-Parser kennt das Format.
- Helper `isTreeEmpty(node)` für die Confirm-Logik (object: keine entries · array: keine items · null/leer-string: leer).
- KIND_BUTTONS-Tupel auf 3-stellig erweitert: `[kind, label, tooltip]`. Beide Render-Stellen (Object-View „+ neuer Eintrag", Array-View „+ neues Element") geben jetzt einen sprechenden `title` an die Buttons weiter.
- Tooltips an den restlichen Bedienelementen: Variablen-Such-Input, Key-Input von Object-Entries, alle Leaf-Inputs (string/number/boolean/null/variable). Bestehende Tooltips an Sortier-/Lösch-Buttons + KindSwap blieben.

**Build:** `npm run build` ✓ (4.95s), 12/12 Payload-Builder-Unit-Tests grün.

### 2026-04-25 - Vorschau & Senden + breitere Live-View
**Anlass:** Im InterfaceEditor-Tab „Vorschau & Senden" gab es nur die Vorschau, keine Senden-Option. Außerdem war die Live-Vorschau im Payload-Tab zu schmal für komplexe Payloads.

**Fixes (`frontend/src/components/admin/InterfaceEditor.tsx`):**
- `submit()` gibt jetzt das gespeicherte Interface zurück (`Promise<AlarmInterface | null>`) und akzeptiert `closeAfter` zum Steuern, ob nach Save geschlossen wird.
- Neue Funktionen `runTest({ useLatestViolation })` und `saveAndTest()` — letzteres speichert zuerst (nötig für neue, ungespeicherte Schnittstellen).
- Preview-Tab um Senden-Block erweitert: zwei Buttons („Test mit Beispielkontext" / „Test mit letztem Verstoß"), context-spezifischer Hinweis je Schnittstellen-Typ (Pull-In / Pull-Out / Subscription / Webhook), Hinweis bei neuen Schnittstellen dass zuerst gespeichert wird, Result-Panel mit grün/rot Status, HTTP-Code, Body und Fehlerausgabe.

**Fixes (`frontend/src/components/admin/payloadBuilder/PayloadBuilder.tsx`):**
- Grid-Spalten von `210px minmax(0, 1fr) 280px` auf `200px minmax(0, 1.1fr) minmax(360px, 1fr)` — Live-Vorschau bekommt jetzt min. 360px und wächst mit dem Tree mit. Auf einem 1320px-Modal: Tree ≈ 553px, Preview ≈ 503px (vorher 280px fix).

**Build:** `npm run build` ✓.

### 2026-04-25 - Postman-Beispiele für Schnittstellen-Beispiele
**Anlass:** User möchte sehen, wie der Wire-Format-Request aussieht, um ihn z.B. in Postman zu importieren/nachzustellen.

**Fixes (`backend/services/alarm_dispatcher.py`):**
- Helper `_format_raw_http(method, url, headers, body)` baut einen HTTP/1.1-Wire-Format-Request, der direkt in Postmans „Import → Raw text" passt (ableitet Pfad + Host aus URL, formatiert Header, fügt `Content-Length` bei Body, bewahrt Konventionen).
- Helper `_postman_collection(name, items)` baut eine Postman Collection v2.1 JSON, importierbar in Postman.
- Pull-In: zwei neue Beispiele — Raw HTTP-Request + Postman-Collection (1 Request: GET violations).
- Subscription: zwei neue Beispiele — Raw HTTP für Register-POST + Postman-Collection mit drei Requests (Register / List / Delete).
- Webhook (& Subscription Empfangsseite): Raw HTTP mit Beispiel-Drohnen-Event-Payload — zeigt was FlightArc sendet (incl. `X-FlightArc-Signature` bei Subscriptions). User kann das in Postman als Mock-Server nutzen, um den eigenen Empfangs-Endpoint zu testen.

**Tests:** 74/74 alarm-Tests grün.

### 2026-04-25 - HelpLink-Symbole bei Schnittstellen + Alarmverwaltung
**Anlass:** Die kreisförmigen "?"-Hilfe-Symbole, die im Rest der App neben Headlines die passenden Handbuch-Sektion öffnen, fehlten in den Admin-Tabs „Schnittstellen" und „Alarmverwaltung".

**Fixes:**
- `frontend/src/components/admin/InterfacesManager.tsx`: `<HelpLink section="interfaces" size={20} />` neben dem `<h1>Schnittstellen</h1>`. Subline um „Subscription (Pub/Sub)" ergänzt, war veraltet.
- `frontend/src/components/admin/AlarmRulesManager.tsx`: `<HelpLink section="alarms" size={20} />` neben dem `<h1>Alarmverwaltung</h1>`.

Beide Symbole nutzen denselben Hash-Routing-Mechanismus wie der Rest der App (`/help#interfaces` bzw. `/help#alarms`), Browser-Back kehrt zurück zur Admin-Seite.

**Build:** `npm run build` ✓ (4.91s).

### 2026-04-25 - Doku-Audit: Lücken in HelpPage & README geschlossen
**Anlass:** User wollte sicherstellen, dass alle Features (auch die neuen aus Alarmierung Phase 3-6 und der DB-Lifecycle-Initiative vom 2026-04-24) vollständig dokumentiert sind.

**Audit-Ergebnis (Subagent-Analyse):** 4 echte Lücken — Sicherheits-Härtung der Subscription-Channels (SSRF, Rate-Limit, Subscriber-Cap), Datenbank-Lifecycle / `manage.py` CLI, fehlender Subscription-Typ in der README-Alarmierung-Sektion, fehlende Multi-Sprachen-/Per-Sub-Log-/Pull-Out-Mapping-Hinweise im README.

**Ergänzungen:**
- `frontend/src/components/HelpPage.tsx` SectionInterfaces: neue Subsection „Sicherheits-Härtung (Subscription & Webhook)" mit SSRF-Schutz (DNS-Resolve + Blacklist Loopback/RFC1918/Link-Local/Multicast), Rate-Limit (20 Reg/Min/Channel, HTTP 429), Subscriber-Cap (50/Channel, HTTP 409), Timing-safe HMAC-Verifikation in 4 Sprachen, hmac.compare_digest auf API-Key-Hash. Audit-Trail-Verweis.
- `frontend/src/components/HelpPage.tsx` SectionAdmin: neue Subsection „Datenbank-Verwaltung & Backups" mit Auto-Backup (Start + Pre-Migration, Rotation 30), additiven Migrationen + `schema_migrations`-Tracking, `manage.py`-CLI-Tabelle (backup/list-backups/restore/migrate status/migrate run/verify-data), Test-Isolation-Hinweis (DATABASE_URL-Override + Hard-Guard, Bezug auf 2026-04-24-Incident), Notfall-Checkliste bei Datenverlust.
- HelpPage TOC erweitert um `datenbank-verwaltung` unter `admin`.
- `README.md` Alarmierung-Sektion: Subscription-Typ ergänzt, Drag-and-Drop-Builder beschrieben, sechs-Sprachen-Snippet-Generator, Pull-Out Response-Mapping (Status-Allowlist + JSON-Path + Fehler-Pfad), Per-Subscriber-Lieferungs-Log, Health-Monitoring, Sicherheits-Härtung (Phase 6 Pentest).
- `README.md` neue Sektion „Datenbank & Lifecycle" mit Auto-Backup, Migrationen, Management-CLI, Test-Isolation, Verweis auf `DATABASE_LIFECYCLE.md`.

**Build/Verify:** `npm run build` ✓ (4.52s).

### 2026-04-25 - PayloadBuilder UX-Überarbeitung (Mittelbereich + Überlappungen)
**Anlass:** User-Feedback — die Tree-Spalte (Mittelbereich des Schnittstellen-Builders) war zu schmal, Inhalte überlagerten sich bei verschachtelten Objekten/Arrays.

**Ursachen:** Modal `min(900px, 100%)` + Grid `220px 1fr 280px` ließ ~340px für die Tree-Spalte. Innerhalb dieser engen Spalte zwangen feste Inputs (`width: 140` Key-Input, `width: 120/100` Number/Boolean) plus Sortier-/Lösch-Buttons + KindSwap eine horizontale Überlappung; Container-Indent (`marginLeft: 6` pro Level) verschärfte das bei Tiefe.

**Fixes:**
- `frontend/src/components/admin/InterfaceEditor.tsx`: Modal-Breite konditional auf `min(1320px, 100%)` für Payload-Tab, sonst `min(960px, 100%)`.
- `frontend/src/components/admin/payloadBuilder/PayloadBuilder.tsx`: Grid auf `210px minmax(0,1fr) 280px` (`minmax(0, …)` verhindert das Sprengen der Spalte durch lange Inhalte). Höhen auf `min(70vh, 640px)`. `minWidth: 0` an allen drei Boxen.
- ObjectView/ArrayView: Wenn ein Eintrag selbst Container (Objekt/Array) ist, rückt das Kind in eine **eigene Zeile unter** den Header — vorher nebeneinander, was den Großteil der Überlappung verursachte. `entryRow` ist jetzt `flexDirection: column`, neuer `entryHeader` mit `flexWrap: wrap`.
- Key-Input flexibel: `flex: '1 1 120px', minWidth: 80, maxWidth: 200` statt fix 140.
- LeafView: `flexWrap: wrap` + alle Inputs mit `flex: 1 1 …px` + `minWidth: 0` — schrumpfen sauber, brechen um statt zu überlappen.
- `containerStyle`: `marginLeft` über alle Level auf 0, stattdessen Hintergrund leicht abgehoben (`rgba(255,255,255,0.02)`) für Tiefen-Differenzierung ohne Platzverlust.
- Live-Preview-Pre nutzt `flex: 1` im Container statt eigener `maxHeight: 360`.

**Build/Tests:** `npm run build` ✓ (4.97s), 12/12 PayloadBuilder-Unit-Tests grün.


**Anlass:** User wollte nach Phase 5 alle vier offenen Punkte zusammen umgesetzt haben — mehr Sprachen, granulare Subscriber-Logs, intelligente Pull-Out-Antwort-Auswertung, plus expliziten Pentest-Pass auf das Subscription-Modell.

**Multi-Sprachen-Snippets** (Punkt 1):
- `services/alarm_dispatcher.build_usage_examples` um Go (net/http), Rust (reqwest + axum), Ruby (Net::HTTP + Sinatra) erweitert für alle drei Sektionen (oneShot / subscribe / webhook).
- Frontend: keine Änderung nötig — der `language`-Tag wird bereits durchgereicht und im Code-Block-Header gerendert. Sechs Sprachen pro relevanter Sektion.

**Per-Subscriber-Lieferungs-Log** (Punkt 2):
- Migration `017_alarm_subscription_link`: Spalte `subscription_id` auf `alarm_deliveries` + Index. Dispatcher setzt sie beim Push (statt vorher den Subscriber-ID nur in `trigger_type` zu hängen).
- Neuer Endpoint `GET /api/admin/interfaces/<id>/subscriptions/<sid>/deliveries` mit `tenant_admin`-Role.
- Frontend: jeder Subscriber im Tab „Abonnenten" hat einen „Lieferungen anzeigen"-Knopf, der inline die letzten 30 Versuche des Subscribers mit Status, Trigger, HTTP-Code, Response-Body zeigt.

**Pull-Out-Response-Mapping** (Punkt 3):
- Migration `018_alarm_response_mapping`: Spalte `response_mapping` (JSON) auf `alarm_interfaces`.
- `services/alarm_dispatcher.evaluate_response_mapping(mapping, status, body)` — Status-Code-Allowlist, JSON-Pfad mit Punkt-Notation und Array-Index, `expected_value`-Vergleich, `fail_on_path` (truthy → Fehler). Default ohne Mapping: 2xx = success.
- `send_request` nutzt das Mapping nur für `pull_out`. Lieferung speichert die exakte Begründung als `error`/`reason` ("json_path acknowledged=False, expected True").
- Frontend: `ResponseMappingEditor` als `<fieldset>` im Verbindung-Tab des `InterfaceEditor`, sichtbar nur für `interfaceType === 'pull_out'`. Vier Felder: Status-Codes (kommagetrennt), JSON-Pfad, erwarteter Wert (JSON-Literal-Parser mit String-Fallback), Fehler-Pfad.

**Pentest-Pass** (Punkt 4) — drei kritische Findings, alle gefixt:
- **SSRF in `callback_url`**: vorher nur Schema-Check (`http://` / `https://`). Drittsystem konnte `http://127.0.0.1:6379/`, `http://169.254.169.254/...`, `http://10.0.0.5/...` registrieren → FlightArc-Server hätte interne Services angerufen. **Fix:** `_is_callback_url_safe` nutzt `socket.getaddrinfo` + `ipaddress.ip_address` und blockt loopback / private / link-local / multicast / reserved / unspecified. ENV-Override `FLIGHTARC_ALLOW_PRIVATE_CALLBACKS=1` für Test-/Dev-Setups.
- **Timing-Attacke beim API-Key-Vergleich**: `==` auf Hex-String (selbst nach SHA-256) leakt Prefix-Länge. **Fix:** `hmac.compare_digest`.
- **Kein Subscriber-Limit**: kompromittierter API-Key → unbegrenzte Subscriber → DB- und Push-DoS. **Fix:** `_MAX_SUBSCRIBERS_PER_CHANNEL = 50` Hard-Cap, 409 bei Überlauf. Plus Sliding-Window Rate-Limit `_REGISTER_RATE_PER_CHANNEL_PER_MIN = 20` mit 429.
- Findings sind als projektübergreifende Regel in `~/.claude/rules/gotchas.md` (neuer Block „Subscription / Webhook-Push-Endpoints") dokumentiert.

**Tests:** 387 Backend-pytest grün (74 alarm-spezifisch, +21 neu): TestSSRFProtection (4), TestApiKeyTimingConstantCompare (2), TestSubscriberCap (1), TestRegisterRateLimit (1), TestPerSubscriptionDeliveries (2), TestResponseMapping (8), TestUsageExamplesLanguages (3). 10/10 E2E grün. Live-verifiziert: SSRF-Block für 127.0.0.1 und 169.254.169.254 mit korrekter Fehlermeldung, öffentliche URL passes.

**Dateien:** `backend/{models.py,migrations.py,routes/alarm_routes.py,services/alarm_dispatcher.py,tests/{conftest,test_alarms}.py}`, `frontend/src/{api.ts,components/HelpPage.tsx,components/admin/{InterfaceEditor,InterfaceSubscribersTab}.tsx}`, `frontend/e2e/interfaces.spec.ts`, `~/.claude/rules/gotchas.md`, `CONVERSATION-LOG.md`, `manifest.json`.

### 2026-04-25 - Alarmierung Phase 3+4+5: Templates, Subscription, Beispiel-Code, Health-Stats
**Anlass:** User wollte Phase 3 (Templates) und Phase 4 (Stats + Mobile) zusammen, plus eine **neue Anforderung**: Drittsysteme sollen sich mit API-Key bei einem Channel anmelden und Events automatisch gepusht bekommen — mit Beispiel-Code zum Kopieren und bidirektionalem Monitoring.

**Architektur — neuer 4. Schnittstellen-Typ `subscription` (Pub/Sub):**
- Backend: Spalten `api_key_hash` + `api_key_prefix` auf `alarm_interfaces`. Neue Tabelle `alarm_subscriptions` (id, interface_id, callback_url, secret, last_success_at, last_attempt_at, last_error, fail_count, revoked_at). Migration `016_alarm_subscriptions`.
- Drittsystem registriert sich mit `X-API-Key` an `POST /api/integrations/subscriptions/<channel>/register` mit `{callback_url, name?}` → bekommt `id` + `secret` zurück (einmalig). Listen + Unsubscribe stehen am gleichen Pfad.
- Beim Verstoß rendert der Dispatcher das Payload einmal und pusht parallel an alle aktiven Subscriber. Jeder Push hat einen `X-FlightArc-Signature: sha256=<hmac>`-Header — Empfänger verifiziert mit dem `secret`.
- Admin-Tab „Abonnenten" im InterfaceEditor: API-Key generieren / rotieren (alter Key wird sofort ungültig), Subscriber-Liste mit Last-Success / Fehlerzähler / Test-Push pro Subscriber, Admin-Override-Revoke.

**Templates** (Phase 3):
- `services/alarm_templates.py` — 6 vorgegebene Vorlagen: Alamos FE2 (mit JSON-UTF-8-Header und units[].address), Slack (text + blocks), Discord (embed), MS Teams (Adaptive Card), Generic (vendor-neutral mit Bearer-Auth) und Subscription-Starter.
- `GET /api/admin/interfaces/templates` + `POST /api/admin/interfaces/from-template` — neue Schnittstelle wird deaktiviert angelegt, der Admin trägt URL/Auth nach.
- Frontend: `TemplatePicker`-Modal mit Karten-Layout, Kategorie-Badges (Alarmierung/Chat/Allgemein) und Typ-Badges. Im InterfacesManager neuer „Aus Vorlage…"-Button.
- Drag-and-Drop von JSON-Dateien direkt auf die Schnittstellen-Liste (zusätzlich zum Click-Import).

**Beispiel-Code im UI** (neue Anforderung):
- `GET /api/admin/interfaces/<id>/usage-examples` generiert pro Schnittstellen-Typ fertige Snippets:
  - **Pull-In**: curl, Python (requests), JavaScript (fetch) — alle mit `X-Service-Token`
  - **Subscription**: 4 Schritte (Registrieren in curl + Python, Empfangshandler in Flask mit HMAC-Verifikation, Listen, Unsubscribe) + Express.js-Empfangshandler
  - **Webhook**: Express.js-Empfangshandler mit optionaler Signatur-Verifikation
- Pre-rendered URLs nutzen `request.host_url` — Beispiele zeigen die echte öffentliche URL der Installation.
- Frontend: neuer Tab „Beispiele" im InterfaceEditor mit Sprach-Badges, Copy-Button mit Bestätigungs-Feedback.

**Stats + bidirektionales Monitoring** (Phase 4):
- `GET /api/admin/interfaces/<id>/stats` — 24h Total/Success/Rate, letzte Lieferung, 7-Tage Daily-Buckets, Subscriber-Count (für subscription), letzter Pull-Zeitpunkt aus `ServiceToken.last_used_at` (für pull_in).
- `InterfaceStatsBadge`-Komponente in den Schnittstellen-Karten: kompakte Stats („47/50", „zuletzt 12s"), 7-Tage-Sparkline mit gradient-fill (Anteil grün=success vs. rot=failed pro Tag), Live-Refresh.
- Pro Subscriber: eigener Health-Dot (grün wenn last_success und fail_count==0, rot wenn fail_count≥3), Last-Attempt + Last-Error.

**Mobile-Polish** (Phase 4): PayloadBuilder-3-Spalten-Layout wird auf `useIsMobile` zu 1-Spalte gestackt. Touch-Targets in den neuen UIs auf 32-44px.

**API-Key-Rotation**: `POST /api/admin/interfaces/<id>/api-key/rotate` regeneriert den Channel-Key, alter Key wird sofort beim ersten Use 401-blockiert. Admin sieht den neuen Key einmalig mit Copy-Button.

**Tests**: 366 Backend-pytest grün (53 alarm-spezifisch, 18 neu). 10 Playwright-E2E grün (Templates, Subscription-Lifecycle, Usage-Examples, Stats). Live verifiziert gegen httpbin.org (Channel-Anlage, Drittsystem-Registrierung, signierter Push, Listing aus Drittsystem-Sicht).

**Hinweis:** Auf Phase-4-Pull-Out-Response-Mapping bewusst verzichtet — bringt geringen Wert in einem Push-orientierten System, kann später nachgereicht werden falls relevant.

**Dateien:** `backend/{models.py,migrations.py,routes/alarm_routes.py,services/{alarm_dispatcher,alarm_templates}.py,tests/{conftest,test_alarms}.py}`, `frontend/src/{api.ts,components/HelpPage.tsx,components/admin/{InterfacesManager,InterfaceEditor,TemplatePicker,InterfaceStatsBadge,InterfaceSubscribersTab,InterfaceExamplesTab}.tsx,components/admin/payloadBuilder/PayloadBuilder.tsx}`, `frontend/e2e/interfaces.spec.ts`, `CONVERSATION-LOG.md`, `manifest.json`.

### 2026-04-25 - Alarmierung Phase 2: Drag-and-Drop JSON-Builder
**Anlass:** Phase 1 lieferte einen funktionierenden JSON-Texteditor mit Variablen-Picker. Der User wollte explizit „mit drag and drop machen können" — Phase 2 setzt das mit `@dnd-kit/core` um.

**Umfang:**
- **`@dnd-kit/core` + `@dnd-kit/sortable`** als neue npm-Dependencies (≈14 KB gzipped, accessible, framework-agnostic).
- **`payloadBuilder/types.ts`** — interne Tree-Repräsentation als diskriminierte Union (`object | array | string | number | boolean | null | variable`), `fromJson`/`toJson`-Round-Trip, immutable Mutationen (`addObjectEntry`, `addArrayItem`, `removeObjectEntry`, `removeArrayItem`, `reorderObjectEntries`, `reorderArrayItems`, `replaceNode`, `updateObjectEntry`). Stable IDs pro Node für React-Keys und @dnd-kit/sortable.
- **`payloadBuilder/PayloadBuilder.tsx`** — dreispaltige Oberfläche:
  - **Links**: Variable-Palette mit Suche + Kategorie-Farbcodierung (drone/zone/violation/tenant/system in 5 distinkten Akzentfarben). Jeder Chip ist `useDraggable`.
  - **Mitte**: Rekursiver Tree-Editor mit Knoten-spezifischen Drop-Zonen (Object → neue Property; Array → neues Item; String → Token-Append; primitive → typisierte Variable als Replacement). Pro Knoten ein Kind-Wechsel-Dropdown (string ↔ variable behält Inhalt). ↑/↓-Sortierpfeile ohne DnD (einfache UX-Wahl).
  - **Rechts**: Live-Vorschau, gerendert clientseitig gegen den Beispielkontext aus `/api/admin/interfaces/variables`.
  - DragOverlay zeigt das gegrabbte Variable-Chip in Akzentfarbe.
- **InterfaceEditor**: Toggle „Builder ↔ Raw JSON" über dem Payload-Tab. Beide Modi teilen sich `payloadJson`-State, sind verlustfrei umschaltbar.
- **Tests**: 12 neue Vitest-Unit-Tests (Round-Trip Primitives + typed-variable + mixed Mustache + realistisches Alamos-Payload, alle Tree-Mutationen, eindeutige-Key-Logik, Reorder). Alle grün. Eine zusätzliche Playwright-E2E-Spec, die das Toggle live verifiziert (6/6 grün).
- **HelpPage**: Abschnitt „Payload-Builder" um Drag-and-Drop-Verhalten erweitert (Drop auf Objekt/Array/String/Primitive).

**Hinweis Phase 3:** System-Templates (Alamos FE2 vollständig, Slack, Discord, MS Teams) als Marketplace-ähnliche Bibliothek + per-Tenant „Als Template speichern". Phase 4: Pull-Out-Response-Mapping, Stats, Mobile-Polishing.

**Dateien:** `frontend/src/components/admin/payloadBuilder/{types,types.test,PayloadBuilder}.{ts,tsx}`, `frontend/src/components/admin/InterfaceEditor.tsx`, `frontend/e2e/interfaces.spec.ts`, `frontend/src/components/HelpPage.tsx`, `frontend/package.json`, `CONVERSATION-LOG.md`.

### 2026-04-25 - Alarmierung Phase 1: Schnittstellen-Editor + Alarmverwaltung
**Anlass:** Bisher gab es keinen Outbound-Kanal — Verstöße wurden nur intern angezeigt und beep-acoustisch signalisiert. Externe Drittsysteme (Alamos FE2, Slack, Teams, eigene Alarmserver) konnten nicht angebunden werden.

**Phase-1-Umfang (umgesetzt, alle Tests grün, live verifiziert gegen httpbin.org):**

- **Backend** — drei neue Modelle (`AlarmInterface`, `AlarmRule`, `AlarmDelivery`), Migration `015_alarm_interfaces` (additiv mit Auto-Backup), neuer Service `services/alarm_dispatcher.py`:
  - Mustache-Renderer (`chevron`) mit `${{path}}`-Syntax für typisierte Werte
  - Auth-Anwender für Bearer / Basic / API-Key (Header oder Query) — Geheimnisse mit Fernet aus `JWT_SECRET` verschlüsselt, im Response mit `••••••••` maskiert
  - Async Dispatch via `ThreadPoolExecutor(4)`, Retry mit Backoff, jede Lieferung in `alarm_deliveries` auditiert
  - Pull-Out-Worker als Background-Thread (alle 30 s), Pull-In als Service-Token-geschützter Read-Only-Endpoint `/api/integrations/violations` (aktive + 24 h beendete Verstöße)
  - Hook in `flight_zones.update_violations`: `created_events` / `ended_events` werden gesammelt und nach Commit ans Dispatcher-System übergeben (failures isoliert, Tracking nicht blockiert)
- **Routes** (`backend/routes/alarm_routes.py`): 17 neue Endpunkte unter `/api/admin/interfaces`, `/api/admin/alarm-rules`, `/api/admin/alarm-deliveries` (alle mit `@role_required("tenant_admin")`) plus `/api/integrations/violations` (Service-Token, neuer Scope `alarm_pull` zu `ServiceToken.VALID_SCOPES`).
- **Frontend** — fünf neue Komponenten + zwei neue Admin-Tabs:
  - `InterfacesManager.tsx`: Card-Liste mit Test / Bearbeiten / Duplizieren / Export / Löschen / Lieferungen-Buttons + JSON-Datei-Import + einmalige Pull-In-Token-Anzeige
  - `InterfaceEditor.tsx`: Modal mit 5 Tabs (Allgemein, Verbindung, Auth, Payload, Vorschau & Senden), Variablen-Picker links zum Click-to-insert, Live-Preview rechts mit Beispielkontext, Sample-Templates (Alamos FE2, Slack, Generic)
  - `AlarmRulesManager.tsx` + Inline-Editor: Zone × Schnittstelle × Trigger, Aktiv-Toggle, Test-Button
  - `AlarmDeliveryLog.tsx`: Per-Schnittstelle-Tabelle mit expandierbaren Request/Response
  - 16 neue API-Funktionen + TypeScript-Interfaces in `api.ts`
- **Tests**: 35 neue Backend-pytest-Tests (Encryption-Round-Trip, Auth-Anwendung aller 4 Methoden, Mustache-Render mit `${{}}`-Coercion, CRUD inkl. Auth-Maskierung beim Update, Dispatch-Retry mit Mock, Pull-In Auth+Scope) — alle grün. 5 neue Playwright E2E (versionierte Liste, Variable-Pool, CRUD inkl. Auth-Maskierung, Pull-In One-Shot-Token, UI-Render der beiden neuen Tabs) — alle grün. Conftest-Cleanup um neue Tabellen erweitert.
- **Live-Verifikation**: Webhook gegen httpbin.org/post — Bearer-Header korrekt übergeben, Mustache + `${{}}` lieferten korrekt typisierte Werte (`drone.altitude` als Zahl 120.5), Delivery-Log zeigte `success 200 manual_test`.
- **Doku**: `README.md` neuer Abschnitt „Alarmierung an externe Systeme", `HelpPage.tsx` zwei neue Sektionen (`interfaces`, `alarms`) mit Beispiel-Payloads (Slack, Alamos FE2). `requirements.txt` ergänzt um `chevron` und `cryptography`. Phase 2-4 als offene Aufgaben markiert.

**Hinweis:** Phase 2 (Drag-and-Drop-Tree-Editor mit @dnd-kit), Phase 3 (System-Templates + Import/Export-Polish) und Phase 4 (Pull-Out-Response-Mapper, Stats, Mobile) folgen iterativ — Phase 1 liefert das vollständige funktionale Fundament.

**Dateien:** `backend/{models.py,migrations.py,flight_zones.py,app.py,requirements.txt,routes/__init__.py,routes/alarm_routes.py,services/alarm_dispatcher.py,tests/conftest.py,tests/test_alarms.py}`, `frontend/src/{api.ts,App.tsx,components/HelpPage.tsx,components/admin/{AdminLayout,InterfacesManager,InterfaceEditor,AlarmRulesManager,AlarmDeliveryLog}.tsx}`, `frontend/e2e/interfaces.spec.ts`, `README.md`, `CONVERSATION-LOG.md`, `manifest.json`.

### 2026-04-25 - Doku-Sweep: README.md auf aktuellen Funktionsumfang gehoben
**Anlass:** README.md zeigte nur 4 API-Endpunkte und v1.0.0-Feature-Liste, obwohl manifest.json bei v1.9.0 steht und Backend tatsächlich 80+ Endpunkte hat (Receivers, Zones, Violations, Trails, Admin, Logs, Audit, Service-Tokens, Addressbook).

**Erweitert:**
- Feature-Liste komplett überarbeitet — eigene Abschnitte für Karte, Datenquellen, Flugzonen, Hardware-Empfänger, Multi-Mandant, Verwaltung, Frontend.
- API-Übersicht in Architektur-Block: alle Endpunkte gruppiert (Auth, Drohnen, Empfänger, Zonen, Verstöße, Trails, Geo/NoFly, Settings, Adressbuch, Verwaltung).
- Frontend-Routen-Tabelle (alle 9 Admin-Tabs + 6 Public-Pages).
- Hintergrund-Jobs-Tabelle (Simulator 2 s, Retention 1 h, Violation-Throttle 2 s/Tenant).
- Push-Mechanismus dokumentiert (HTTP-Polling + Versionszähler, kein WebSocket — Reverse-Proxy-Kompatibilität).
- Datenmodelle-Tabelle (12 SQLAlchemy-Modelle mit Zweck).
- Tech-Stack aktualisiert: ESP8266 entfernt, ESP32-S3-GPS hinzugefügt, Firmware v1.6.3 referenziert.
- Tests-Block: pytest, Vitest, Playwright (~100+ Tests in 11 Spec-Dateien) mit Befehlen.
- Firmware-Build-Befehle für PlatformIO.
- `JWT_SECRET` und `DATABASE_URL` zu Umgebungsvariablen-Tabelle.

**Dateien:** `README.md`, `CONVERSATION-LOG.md`, `manifest.json` (lastModified).

### 2026-04-24 - PlanningTab: Drag-and-Drop + Doppelklick-Remove für Polygon-Punkte (5953e6a)
**Änderungen:**
- `components/admin/PlanningTab.tsx`: Statisches `L.circleMarker` → interaktives `L.marker` mit `draggable: true` und `L.divIcon`-Dot (cyan + white ring + soft shadow).
- **Drag-live-Update**: während des Drags wird `polygon.setLatLngs()` direkt aufgerufen (kein React re-render pro Frame) — 60 fps. State-Sync nur bei `dragend`.
- **Punkt entfernen**: `dblclick` (Desktop), `contextmenu` (Long-press auf Mobile, rechter Mausklick Desktop) — beide rufen denselben Handler auf, da synthesized-dblclick auf Touch unreliabel ist.
- UI-Text erweitert: Hinweis auf Drag/Doppelklick/Long-press im Info-Paragraphen. Neuer „✕ Alle löschen"-Button neben „↶ Letzten Punkt". Grüner Badge „✓ genug für Polygon" ab 3 Punkten.
- `index.css`: `.planning-vertex` + Wrapper mit Hover-Scale + cyan glow. `touch-action: none` auf dem Drag-Target (Leaflet bekommt die Geste statt Browser).

**Dateien:** `frontend/src/components/admin/PlanningTab.tsx`, `frontend/src/index.css`.

### 2026-04-24 - ReceiverList: sichtbarer Auto-Refresh + 15s Polling + Refresh-Button (0ebdf37)
**Änderungen:**
- Poll-Intervall von 30s → **15s** (ein Heartbeat-Zyklus + ein Poll = max. 135s zwischen „offline" in DB und „offline" in UI).
- Neuer Refresh-Indikator in der Header-Zeile (rechts vom „Remote-ID · Mesh"-Subtitle):
  - **Pulsierender cyan Dot** wenn ein Poll läuft
  - **Grüner Dot** wenn letzter Refresh < 20s her, grauer sonst
  - **„vor Xs" / „vor X min"** Counter zählt jede Sekunde hoch (1-Sekunden-`ageTick`-State)
  - Klickbar für sofortigen Refresh, während laufendem Request deaktiviert
- Mobile-tauglich: 40px min-height, `touch-action: manipulation`, Whitespace-nowrap.

**Dateien:** `frontend/src/components/admin/ReceiverList.tsx`.

### 2026-04-24 - Fix: OTA-Flow akzeptierte stale LAN-URL aus last_build_config (8e7c115)
**Anlass:** OTA-Update auf dev-Phil scheiterte mit „Backend-URL ist eine lokale Adresse", obwohl die TenantSettings korrekt die externe Live-View-URL enthielt.

**Ursache:** `handleOtaFlow` nahm `backend_url: buildConfig?.backend_url || window.location.origin`. dev-Phil hatte im `last_build_config` noch die alte `http://192.168.120.85:3020` vom manuellen Flash (vor Einführung der Settings-Zentrale). Der Server-seitige LAN-Guard hat das korrekt abgelehnt.

**Fix:** OTA-Flow sendet jetzt `backend_url: firmwareBackendUrl || ''` — leer triggert den Server-Fallback auf `TenantSettings.firmware_backend_url`. Zusätzlich One-Off-SQL-Cleanup der stale `backend_url`-Keys in allen `last_build_config`-Zeilen mit LAN-IP (nur dev-Phil betroffen).

**Dateien:** `frontend/src/components/admin/ReceiverList.tsx`, `backend/data/flightarc.db`.

### 2026-04-24 - UX-Polish-Pass: Hierarchie, Workflow, Touch-Targets (ef3b9f6)
Basierend auf dem Frontend-Audit (drei Reibungspunkte + Nebenbefunde) in einem kombinierten Commit umgesetzt:

**MapPage Top-Bar — visuelle Hierarchie:**
- Drohnen-Counter als **Hero** (accent-border, tabular-figure in Signal-Cyan, FlightArc-Wortmarke + Version + „Live Tracking"-Micro-Label, Divider zur Zahl). Sekundäre Controls bleiben flach.
- Desktop + Mobile identisches Treatment, Mobile-Hero flex-1 zwischen Hamburger und Admin-Button.

**StatusPanel — Mobile-Informationsdichte:**
- `Section`-Komponente collapsible über native `<details>`/`<summary>` mit rotierendem Chevron + `.fa-micro`-Label.
- Desktop: alles open (back-compat via `defaultOpen=true`). Mobile: Signal + Position + NFZ offen, Sekundär-Blöcke (Batterie, Pilot, FAA, OGN, Flugroute) collapsed via `defaultOpen={!isMobile}`.

**OTA-Flow — Abbrechen + Signal-Cyan Progress:**
- Neuer **Abbrechen-Button** während `building / triggering / waiting` (mit Confirm-Dialog, ruft existierenden `cancelOtaUpdate`, schließt Modal). 44px min-height.
- Step-Circles in Brand-Palette: active = Signal-Cyan mit Outer-Glow (`box-shadow`-Ring), past = `var(--status-active)`, error = rot, pending = `bg-tertiary`. Labels via `.fa-micro`.
- Close-X ebenfalls auf 44px min-height.

**NoFly-Zones-Panel — Touch-Target-Fixes:**
- „Alle an/aus"-Button: 36 → 40px min-height, dunkler Text auf Signal-Cyan wenn active.
- Kategorie-Reihen: 44px Tap-Area mit `touch-action: manipulation`.
- Toggle-Switches: 28×16 → 36×20 (Knob 12→16), iOS-Look mit Knob-Shadow.
- Layer-Checkboxen: 14 → 18px mit Brand-Tick (`✓` in dark).

**ReceiverList-Create — Inline-Validation:**
- Live-Feedback unter Namen-Input: „Mindestens 2 Zeichen" → „⚠ Zu kurz" → „⚠ Name bereits vergeben" → „✓ Name verfügbar". Border-Color folgt dem Status.

**Empty-States:**
- `ReceiverList` leer: `.fa-card--hero` mit 📡-Icon, Erklärung, CTA-Button + Handbuch-Link.
- `FlightZonesPanel` leer: dashed-cyan Card mit ✦ + Draw-Hint statt muted-gray.

**LoginPage — disambiguierte Fehler:**
- Pattern-Match auf raw error → fünf konkrete Cases (missing field, network, bad creds, tenant nicht gefunden, user deaktiviert) mit nutzbaren Handlungsanweisungen.

**Dateien:** `frontend/src/index.css`, `frontend/src/components/{MapPage,StatusPanel,NoFlyZonesPanel,LoginPage,FlightZonesPanel,admin/ReceiverList}.tsx`.

### 2026-04-24 - gitignore: WAL/SHM aus Git tracken (e6cc072)
`backend/data/*.db-wal` und `*.db-shm` sind transient (werden beim Backend-Restart neu erzeugt) und zeigten sich nach jedem `git status` als „dirty". Jetzt ignoriert. Die Haupt-`.db` bleibt weiter im Git als Rettungsanker (siehe `DATABASE_LIFECYCLE.md`).

### 2026-04-24 - Mobile + Tablet Responsive-Fixes für den Redesign (5d2e438)
**Änderungen in `index.css`:**
- `@media (max-width: 768px)`: `background-attachment: scroll` (iOS Safari Scroll-Lag-Fix), `.fa-btn-primary` padding 12×20 mit `min-height: 44px`, `.fa-micro` letter-spacing 0.14em → 0.10em.
- `@media (max-width: 480px)`: `.fa-display` `font-size: clamp(20px, 6vw, 26px) !important` (überschreibt inline fontSize 32 auf iPhones). `.fa-card` borderRadius 12 → 10, `::before` left/right 16 → 10.

**Inline-Fixes:**
- `SettingsTab` + `ReceiverList` Admin-Hero: auf Mobile `flexDirection: column`, Micro-Label mit horizontal top-border-Accent statt vertikalem left-border, fontSize 32 → 24.
- `ReceiverList` Mobile-Card-Header: `min-height: 44`, `touch-action: manipulation` (HIG-Tap-Target + 300ms double-tap-delay-Fix).

**Dateien:** `frontend/src/index.css`, `frontend/src/components/admin/{SettingsTab,ReceiverList}.tsx`.

### 2026-04-24 - Frontend-Redesign: Space Grotesk + Signal Cyan (1fa3c81)
Basierend auf dem Frontend-Design-Audit (SKILL: `frontend-design@claude-plugins-official`) vom AI-Slop-System-Font zu einer eigenständigen visuellen Identität.

**Typografie:**
- Self-hosted **Space Grotesk** via `@fontsource/space-grotesk` (DSGVO-konform, 32 WOFF/WOFF2-Dateien in `dist/assets/`). Body-Font-Stack `'Space Grotesk', -apple-system, …`.
- Drei neue Utility-Klassen in `index.css`: `.fa-display` (tight tracking −0.02em, weight 700), `.fa-micro` (uppercase, 0.14em tracking, 10px), `.fa-tabular` (`tnum`).
- Hero-Headings umgestellt: SettingsPage (28px), SettingsTab (32px mit accent-divided Untertitel), ReceiverList („Empfänger" mit „Remote-ID · Mesh" Micro-Label), alle h3-Section-Titel in SettingsTab (17px). ReceiverHealthPanel-Panels (Verbindung / Laufzeit / Backend-Kommunikation / Checks) mit `.fa-micro`.

**Farbidentität:**
- `--accent` von Tailwind sky-500 `#3b82f6` → **Signal Cyan** `#00d4aa` (dark) / `#00a887` (light).
- Zusätzlich `--accent-dim`, `--accent-hot`, `--gradient-accent` (135° linear), `--gradient-hero` (radial dual-gradient auf body-background).
- Funktionale Status-Farben (green/red/yellow) unverändert.

**Tiefe + Motion:**
- Shadow-Variablen `--shadow-{sm,md,lg,elevated,accent-glow}`.
- `.fa-card` mit layered Shadow + accent-tintetem 1px top-highlight (`::before`-Pseudo-Element).
- Primary-Buttons zu `.fa-btn-primary`: dunkler Text auf Cyan mit Accent-Glow, Hover lift via `translateY(-1px)` + brighter Cyan.
- Status-Pill im ReceiverHealthPanel: concentric box-shadow glow + inner LED-Dot-Shadow.

**Dateien:** `frontend/package.json` (+ `@fontsource/space-grotesk`), `frontend/src/index.css`, `frontend/src/components/{SettingsPage,admin/SettingsTab,admin/ReceiverList,admin/ReceiverHealthPanel}.tsx`.

### 2026-04-24 - Frontend: Health-Panel pro Controller (Klick-to-Expand)
**Ziel:** Dedicated Health-Ansicht beim Klick auf einzelnen Controller in der Admin-Empfänger-Liste — dieselben Regeln wie der Remote-Agent, visuell aufbereitet.

**Änderungen:**
- **`frontend/src/components/admin/ReceiverHealthPanel.tsx`** (neu): Kapselt die gesamte Health-Darstellung für einen einzelnen Controller.
  - **Status-Pill** (online/stale/offline) mit Heartbeat-Alter (Sekunden → Minuten → Stunden → Tage).
  - **Alert-Banner** (rot bei Fehlern, gelb bei Warnungen) listet nur dann auf, wenn Checks anschlagen.
  - **3 Panels**: Verbindung (SSID, Kanal, IP, RSSI-Bar) · Laufzeit (FW, Uptime, Erkennungen, Heap-Bar mit Hardware-spezifischer Kapazität 80k/200k/320k KB) · Backend-Kommunikation (Fehlerzähler, HTTP-Code, OTA, AP-Modus).
  - **Checks-Liste** mit ✓/⚠/✗-Icons — dieselben Schwellen wie der Scheduled Remote Agent (RSSI, Heap, Error-Counter, Firmware-Abweichung, AP-Modus, Heartbeat-Status, OTA).
  - **Auxiliary-Row** (ID, Hardware, Standort, Abdeckung).
- **`frontend/src/components/admin/ReceiverList.tsx`**: Alte Feldliste im Desktop-Expand und neu im Mobile-Card-Layout durch `<ReceiverHealthPanel node={node} />` ersetzt. Mobile-Card-Header wurde klickbar gemacht (toggelt Expand mit ▸/▾-Chevron), damit die Regel „bei isMobile-Weichen IMMER beide Layouts" erfüllt ist.
- **Tests** `ReceiverHealthPanel.test.tsx`: 10 neue Vitest-Tests — healthy baseline, low RSSI warnung, very low RSSI error, AP-Modus, niedriger Heap, hoher Fehlerzähler, veraltete Firmware, offline-Status, nie-gesehen-Fall, Auxiliary-Info.

**Test-Status:** 10/10 neue Vitest-Tests grün. Keine Regression in 81/83 übriger Tests (2 failing Tests in `noFlyZones.test.ts` waren bereits vorher kaputt, unabhängig).

**Dateien:** `frontend/src/components/admin/ReceiverHealthPanel.tsx` (neu), `frontend/src/components/admin/ReceiverHealthPanel.test.tsx` (neu), `frontend/src/components/admin/ReceiverList.tsx`.

### 2026-04-24 - Data-Retention Framework: Auto-Prune von system_logs + audit_logs
**Anlass:** `system_logs` waren bei 20.000 Zeilen / 35 Tagen und wuchsen unkontrolliert (der vorhandene 10.000-Count-Limit im `DatabaseLogHandler` lief nicht zuverlässig, nur count-basiert, nicht zeitbasiert). `audit_logs`-Cleanup lief bisher nur via 2%-Random-Chance pro Audit-Call (ebenfalls unzuverlässig).

**Änderungen:**
- **`backend/retention.py`** (neu): zentrales `run_retention(app)` + `start_retention_thread(app)` (stündliches Prune + sofort beim Startup) + `db_stats(app)` (Zeilen + Dateigröße). Retention sowohl zeitbasiert (Tage) als auch count-basiert (Fail-Safe `SYSTEM_LOG_HARD_CAP=20000`).
- **Migration 012** (`tenant_settings`): neue Spalten `retention_system_logs_days` (default 14 Tage), `retention_audit_logs_days` (default 90 Tage). Per-Tenant-Overrides möglich (1–365 Tage, clamp gegen 0/negative).
- `backend/app.py`: Retention-Thread wird bei jedem Start gekickt. `settings.py`: `_read_from_db` + `_write_to_db` unterstützen die neuen Felder mit Validierung.
- `backend/routes/admin_routes.py`: neue Endpoints `POST /api/admin/retention/run` (manueller Trigger) + `GET /api/admin/db-stats`.
- `backend/routes/receiver_routes.py`: `/api/receivers/health-summary` liefert zusätzlich `db_stats` (Tabellen-Zeilen, Dateigröße, effektive Retention-Tage).
- `backend/manage.py`: neue Subcommands `cleanup` (sofortiger Prune) und `db-stats` (Snapshot-Anzeige).
- **Frontend `SettingsTab.tsx`**: neuer Block "Datenaufbewahrung" mit zwei Eingabefeldern (System-Logs, Audit-Logs, jeweils 1–365 Tage) + „Jetzt aufräumen"-Button.
- **`DATABASE_LIFECYCLE.md`**: Abschnitt 6b "Datenaufbewahrung" ergänzt.
- **Remote-Agent**-Prompt erweitert um DB-Size + system_logs-Counter-Alerts (FEHLER ab >50.000 system_logs oder DB >500 MB, WARNUNG ab >20.000 oder +50 MB Wachstum).
- Tests: `test_retention.py` mit 7 neuen Tests (Zeit-Prune, Per-Tenant-Override, Audit-Prune, Hard-Count-Cap, 0-Tage-Clamp, db_stats, Health-Summary-Integration).
- **Sofortiger Effekt beim ersten Migration-Run:** 19.722 alte `system_logs` in 0.087 s gelöscht, DB blieb 2.2 MB.

**Test-Status:** 313/313 Backend-Tests grün.

**Dateien:** `backend/retention.py`, `backend/migrations.py`, `backend/models.py`, `backend/app.py`, `backend/settings.py`, `backend/manage.py`, `backend/routes/admin_routes.py`, `backend/routes/receiver_routes.py`, `backend/tests/test_retention.py`, `frontend/src/types/drone.ts`, `frontend/src/components/admin/SettingsTab.tsx`, `DATABASE_LIFECYCLE.md`.

### 2026-04-24 - Service-Tokens + /health-summary + Remote-Health-Agent
**Ziel:** Täglicher externer Health-Check aller Controller (inkl. vollständiger Telemetrie) via Scheduled Remote Agent — ohne User-JWT, ohne lokalen Zugriff auf den Host.

**Änderungen:**
- Migration **010_receiver_full_telemetry**: neue Spalten `wifi_channel`, `ap_active`, `last_error_count`, `last_http_code_reported`, `last_telemetry_at` — persistieren jetzt ALLE Heartbeat-Felder, die der Controller sendet (vorher nur in-memory im Connection-Log).
- Migration **011_service_tokens**: neue Tabelle `service_tokens` (tenant-scoped API-Keys mit Scope `health_read`, SHA-256 Hash statt Plaintext, revoke/delete separat).
- `models.py`: `ReceiverNode` + neue Felder + `ServiceToken` Model.
- `routes/receiver_routes.py`: `heartbeat()` speichert alle Telemetrie-Felder, neuer Endpoint `GET /api/receivers/health-summary` mit vollständigem JSON (Counts, Controller-Telemetrie, Audit-Snapshot 24 h, Backup-Rotation).
- `auth.py`: neuer Decorator `service_token_required(scope)` akzeptiert `X-Service-Token` Header + `Authorization: Bearer` (Live-View-Proxy-kompatibel) + `?service_token=` (debug).
- `routes/admin_routes.py`: CRUD für Service-Tokens (`GET/POST /api/admin/service-tokens`, `POST .../revoke`, `DELETE`).
- Frontend:
  - `api.ts`: neue Funktionen `fetchServiceTokens`/`createServiceToken`/`revokeServiceToken`/`deleteServiceToken`, `ReceiverNode` Typ um neue Telemetrie-Felder erweitert.
  - `SettingsTab.tsx`: neuer Block "Service-Tokens" mit Liste/Erstellen (Wert wird nur einmalig angezeigt)/Widerrufen/Löschen.
  - `ReceiverList.tsx`: Detail-View zeigt jetzt zusätzlich `wifi_channel`, `ap_active`, `last_error_count`, `last_http_code_reported`, `last_telemetry_at`, `total_detections`.
  - `HelpPage.tsx`: Troubleshooting-Tabelle um Zeile für "Tägliche Health-Checks extern" erweitert.
- Tests: neue Datei `test_health_summary.py` mit 9 Tests (Auth-Matrix: missing/wrong/revoked/wrong-scope/X-header/Bearer/non-service-bearer + Schema-Vollständigkeit + Heartbeat-Persistenz).
- Scheduled Remote Agent `flightarc-daily-health` (Routine-ID `trig_01S4joJEyHXf6LR4CTzuBKjm`, Cron `0 7 * * *` = täglich 09:00 Europe/Berlin): ruft `/api/receivers/health-summary` über die Live-View-URL ab, analysiert Zustand (Watchdog-Reboot-Detektion, WiFi-Qualität, Fehlerzähler, Audit-Anomalien, Backup-Rotation), meldet OK/Warnung/Fehler.
- Initial-Token `flightarc-daily-health-remote` für den Agenten in der DB (tenant `daba457f`).
- 306/306 Backend-Tests grün.

**Dateien:** `backend/migrations.py`, `backend/models.py`, `backend/auth.py`, `backend/routes/admin_routes.py`, `backend/routes/receiver_routes.py`, `backend/tests/test_health_summary.py`, `frontend/src/api.ts`, `frontend/src/components/admin/SettingsTab.tsx`, `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/HelpPage.tsx`.

### 2026-04-24 - DB-Lifecycle: versionierte Migrationen, Auto-Backup, Management-CLI, Test-Isolation
**Anlass:** Destruktiver pytest-Fixture in `conftest.py` löschte am selben Tag den Mandanten „FW Brake" und zwei User aus der Produktions-DB. Rettung durch `git checkout HEAD -- backend/data/flightarc.db`. Als Folge wurde ein vollständiges DB-Lifecycle-Konzept eingeführt, damit sich der Incident nicht wiederholt.

**Änderungen:**
- **`DATABASE_LIFECYCLE.md`** (neu, Projekt-Root) — verbindlicher Prozess: Grundprinzipien, Migrationen hinzufügen, Update-Prozess, Rollback, Notfall-Checkliste, Verbotene Muster.
- **`backend/backup.py`** — `create_backup(reason)`, `list_backups()`, `restore_backup(name)`, `rotate_backups(max=30)`. Snapshots inkl. WAL+SHM unter `backend/data/backups/YYYYMMDD-HHMMSS-<reason>.db`.
- **`backend/migrations.py`** — Registry + Runner. 9 Migrationen (alle bestehenden ad-hoc-ALTERs aus `app.py` überführt + `schema_migrations`-Tabelle). Additiv, idempotent, automatisch mit Pre-Migration-Backup.
- **`backend/manage.py`** — CLI: `backup`, `list-backups`, `restore --confirm`, `migrate status|run`, `verify-data`.
- **`backend/app.py`** — alle inline-ALTER-Statements entfernt, durch `run_migrations()` ersetzt; zusätzlicher Startup-Backup bei jedem Start.
- **`backend/data/backups/.gitignore`** — Backups bleiben lokal.
- **`backend/tests/conftest.py`** — `DATABASE_URL`-Override vor jedem App-Import, `atexit`-Cleanup der Temp-DB, Runtime-Hard-Guard `pytest.exit(...)` gegen Production-DB-Zugriff.
- **`backend/tests/test_lifecycle.py`** — 7 neue Tests: Backup-Erstellung, Rotation, Skip-when-empty, Migration-Applied-Tracking, Idempotenz, Refuse-without-backup, Conftest-Guard.
- **`README.md`** — neuer Abschnitt "Update- und Backup-Prozess".
- **`~/.claude/rules/database-lifecycle.md`** (global) — projektübergreifende Regel für alle LabCore-Projekte mit DB.
- Memory: `feedback_db_lifecycle.md`, `gotcha_tests_production_db.md`.

**Test-Status:** 297/297 Backend-Tests grün (7 neue Lifecycle-Tests).

**Dateien:** `DATABASE_LIFECYCLE.md`, `backend/backup.py`, `backend/migrations.py`, `backend/manage.py`, `backend/app.py`, `backend/data/backups/.gitignore`, `backend/tests/conftest.py`, `backend/tests/test_lifecycle.py`, `README.md`, `~/.claude/rules/database-lifecycle.md`, `~/.claude/CLAUDE.md`.

### 2026-04-24 - Firmware Backend-URL zentral in Einstellungen + Anzeige
**Änderungen:**
- Neues Feld `TenantSettings.firmware_backend_url` (String, via Migration in `app.py`) — einzige Quelle für die URL, die beim Firmware-Build in Controller eingebrannt wird.
- Backend `routes/receiver_routes.py`: Neuer `_resolve_backend_url()`-Helper; alle drei Build-Endpoints (`build_firmware`, `build_firmware_stream`, `build_firmware_async`) nehmen die URL primär aus TenantSettings (mit Request-Override-Option). LAN-IPs (192.168.*, 10.*, 127.*, localhost) werden abgewiesen, damit Controller nie mit einer nur lokal erreichbaren URL gebaut werden.
- Frontend `SettingsPage.tsx`: Neues URL-Input-Feld „Firmware Backend-URL" mit Hilfetext und Beispiel-URL.
- Frontend `ReceiverList.tsx`: Banner im Empfänger-Bereich zeigt die aktuell gesetzte URL (rot wenn leer).
- Frontend `ReceiverFlashWizard.tsx`: URL ist jetzt read-only (nur Anzeige), da zentral in Einstellungen gepflegt.
- 4 neue Backend-Tests in `test_models.py` für `_resolve_backend_url` (Request-Override, Fallback auf Settings, Fehler bei Fehlen, Ablehnung lokaler IPs).
- Seed-Wert für Default-Tenant gesetzt: `https://hub.dasilvafelix.de/api/live/flight-arc`.

**Dateien:** `backend/app.py`, `backend/models.py`, `backend/settings.py`, `backend/routes/receiver_routes.py`, `backend/tests/test_models.py`, `frontend/src/types/drone.ts`, `frontend/src/components/SettingsPage.tsx`, `frontend/src/components/admin/ReceiverList.tsx`, `frontend/src/components/admin/ReceiverFlashWizard.tsx`.

### 2026-04-24 - Firmware 1.5.3: Backend-Watchdog, WiFi-Reconnect-Fix, ONLINE_THRESHOLD 120s
**Änderungen:**
- **Root Cause:** Controller fielen nach Tagen Laufzeit dauerhaft aus der Online-Anzeige. Zwei Ursachen: (1) `wifi_manager.cpp` stoppte den STA-Reconnect komplett sobald der AP aktiv war → Controller hing nach einem WiFi-Ausfall für immer im AP-Modus. (2) Kein Recovery-Pfad wenn WiFi steht, aber Backend nicht erreichbar ist.
- **Fix A (WiFi-Reconnect bei aktivem AP):** `wifi_manager.cpp` retry alle 30s STA-Verbindung auch bei aktivem AP; bei Erfolg wird AP vom Haupt-Loop geordnet heruntergefahren.
- **Fix B (Backend-Watchdog):** `main.cpp` + `http_client.h/cpp` — `_lastSuccessMs` wird bei jedem erfolgreichen POST/Probe gesetzt. Nach 10 min ohne erfolgreichen Kontakt trotz WiFi oder nach 20 aufeinanderfolgenden Fehlern ruft die Firmware `ESP.restart()` auf.
- **Fix C (Health-Probe):** `checkHealth()` in `FlightArcClient` führt vor jedem Heartbeat einen `GET /health` (3s Timeout) aus — LED_NO_BACKEND erscheint sofort statt erst nach 10s HTTP-Timeout.
- **Fix D (ONLINE_THRESHOLD):** `models.py` 90s → 120s. Vier Heartbeat-Perioden Toleranz statt drei — absorbiert einen einzelnen Timeout + einen Retry ohne Flackern.
- `firmware/changelog.json` auf 1.5.3 hochgezählt. `dummy_receiver.py` + `simulation_manager.py` mit analogem Verhalten synchronisiert. `HelpPage.tsx` Troubleshooting-Tabelle + Status-Fenster-Schwelle aktualisiert. 5 neue Tests in `test_models.py` für `ReceiverNode.status`-Schwellen.

**Dateien:** `firmware/src/config.h`, `firmware/src/wifi_manager.{h,cpp}`, `firmware/src/http_client.{h,cpp}`, `firmware/src/main.cpp`, `firmware/changelog.json`, `backend/models.py`, `backend/services/simulation_manager.py`, `backend/tests/test_models.py`, `examples/dummy_receiver.py`, `frontend/src/components/HelpPage.tsx`, `manifest.json`.

### 2026-03-23 - Install/Update/Uninstall-Skripte + Dokumentation
- **Install-Skripte** (`install.py`, `install.ps1`): Automatische Neuinstallation oder Update. Erkennt bestehende Installation, zieht Git-Updates, aktualisiert Dependencies, baut Frontend. Datenbank bleibt bei Update IMMER erhalten, optional `--reset-db` für expliziten Reset mit Sicherheitsabfrage.
- **Deinstallations-Skripte** (`uninstall.py`, `uninstall.ps1`): Entfernt venv, node_modules, dist, .env. Datenbank bleibt standardmäßig erhalten. Optionen: `--delete-db` (DB auch löschen) und `--full` (gesamtes Verzeichnis löschen).
- **Handbuch**: Neue Section "Installation & Update" in HelpPage.tsx (admin-only) mit Voraussetzungen, Neuinstallation, Update, Deinstallation und Skript-Referenz.
- **README.md**: Komplett überarbeitet mit Installation, Update, Deinstallation und Skript-Referenztabelle.
- **Dateien**: `install.py`, `install.ps1`, `uninstall.py`, `uninstall.ps1`, `README.md`, `frontend/src/components/HelpPage.tsx`

### 2026-03-20 - Automatische Einstellungsspeicherung + rollenbasierte Hilfe
- **Alle Anzeigeeinstellungen** werden jetzt automatisch per User im localStorage gespeichert und beim nächsten Besuch wiederhergestellt
- **Neu persistiert**: NFZ ein/aus, Höhenfilter, Radius ein/aus + Wert, NFZ-Radius ein/aus + Wert, Empfänger-Abdeckung, Violation-Tabelle collapsed
- **Bereits persistiert** (unverändert): Aktualisierungsrate, NFZ-Layer-Auswahl, Tracked Drones, Theme, Violation Sound
- **Rollenbasierte Hilfe**: HelpPage zeigt nur relevante Sektionen basierend auf User-Rolle. Admin-only: Administration, Empfänger, Simulation, Hardware, OTA. Auch Suche (Ctrl+K) und Sidebar filtern nach Rolle.
- **Dateien**: `frontend/src/components/MapPage.tsx`, `frontend/src/useViolationLog.ts`, `frontend/src/components/HelpPage.tsx`

### 2026-03-17 - Drohnen-Adressbuch (pro Mandant)
- **Adressbuch-Feature**: Drohnen-Kennungen (basic_id/ICAO) auf benutzerdefinierte Namen mappen
- **Backend**: Neues `DroneAddressBookEntry` Model, CRUD-API + Suggestions-Endpoint, Version-Counter
- **Frontend**: Neuer Admin-Tab "Adressbuch" mit Tabelle/Karten (Desktop/Mobile), Add/Edit-Dialog mit Vorschlägen aus gescannten Drohnen
- **Zone-Integration**: Adressbuch-Drohnen erscheinen in der Zonen-Zuweisung auch wenn offline, mit Online/Offline-Badge
- **Name-Resolution**: `/api/drones` liefert `address_book_name` Feld für Drohnen aus dem Adressbuch
- **Dateien:** `backend/models.py`, `backend/routes/addressbook_routes.py` (neu), `backend/routes/__init__.py`, `backend/app.py`, `frontend/src/types/drone.ts`, `frontend/src/api.ts`, `frontend/src/components/admin/DroneAddressBook.tsx` (neu), `frontend/src/components/ZoneAssignPanel.tsx`, `frontend/src/App.tsx`, `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/components/HelpPage.tsx`

### 2026-03-17 - Firmware 1.5.0: WiFi-IP im Heartbeat + Boot-Optimierung
- **WiFi-IP Fix:** Empfänger sendet jetzt `wifi_ip` im Heartbeat (behebt 127.0.0.1 bei Proxy/Localhost)
- **Backend**: `receiver_routes.py` bevorzugt `wifi_ip` aus Payload, Fallback auf `remote_addr`
- **Simulation**: Realistische IPs (`192.168.1.1xx`) statt 127.0.0.1
- **Boot-Optimierung**: WiFi-Scan 200ms/Kanal (war 500ms, ~2.6s statt ~6.5s), Connect-Timeout 3s (war 5s), blockierender Scan bei AP-Start übersprungen wenn Credentials vorhanden, Stabilisierungs-Delay 100ms (war 500ms)
- **Dateien:** `firmware/src/http_client.cpp`, `firmware/src/http_client.h`, `firmware/src/main.cpp`, `firmware/src/config.h`, `firmware/src/wifi_manager.cpp`, `firmware/changelog.json`, `backend/routes/receiver_routes.py`, `backend/services/simulation_manager.py`, `examples/dummy_receiver.py`

### 2026-03-16 - Sicherheits-Audit, WiFi-Verwaltung, Captive Portal Optimierung
- **Sicherheits-Audit**: Neuer Admin-Tab "Sicherheit" mit Audit-Log für alle Benutzeraktionen (21 Audit-Punkte: Login, Zonen-CRUD, Empfänger-CRUD, OTA, Firmware-Build, Benutzer-CRUD, Einstellungen)
- **Audit Toggle**: Pro Mandant ein/ausschaltbar in den Einstellungen. 48h-Ringspeicher, CSV/JSON-Export
- **Mandant-WiFi-Verwaltung**: WiFi-Netzwerke pro Mandant in Einstellungen (max 3), automatische Vorausfüllung im Flash-Wizard mit "MANDANT"-Badge
- **OTA WiFi-Update**: Optionale WiFi-Credential-Aktualisierung beim OTA-Update (Config-Schritt vor dem Build)
- **Captive Portal**: 302-Redirects für alle OS, kein "Success" im HTML (iOS CNA Fix), DNS TTL=0, Erfolgsbildschirm mit Countdown
- **WiFi-Manager**: Boot-Scan probiert alle konfigurierten Netzwerke (stärkstes zuerst, 5s Timeout pro Netzwerk). Reconnect auch bei aktivem AP wenn kein Portal-Client verbunden
- **AP-Optimierung**: Timeout 8s (war 15s), kein WiFi.begin() bei Portal-Clients, Hotspot bleibt max 20s nach STA-Connect
- **2,4-GHz-Hinweise**: Dokumentation und UI-Warnungen für 5GHz-Inkompatibilität, iPhone-Hotspot "Kompatibilität maximieren" Anleitung
- **UI-Verbesserungen**: "Firmware erstellen" statt "Neu bauen", API-Key-Regeneration als optionale Checkbox
- **HTTPS Error-Logging**: Firmware loggt HTTPS-Fehler mit HTTP-Statuscodes
- **OTA Heap-Management**: BLE wird vor OTA gestoppt, 60s Watchdog-Timeout
- **nginx Receiver-Proxy**: /api/receivers/ direkt an Port 3020 für externe Empfänger-Kommunikation
- **Dateien**: backend/ (app.py, models.py, routes/, services/audit.py), firmware/src/ (wifi_manager, web_server, http_client, main, config), frontend/src/ (api.ts, HelpPage, ReceiverList, ReceiverFlashWizard, SettingsTab, AuditLogTab, AdminLayout, App.tsx), firmware/changelog.json

### 2026-03-16 - Firmware Changelog & Versionsverwaltung
- **Firmware Changelog**: `firmware/changelog.json` mit semantischer Versionierung (1.0.0 → 1.1.0 → 1.2.0), Datum, Hardware-Typen und Änderungsliste pro Version
- **Automatische Update-Erkennung**: Vergleich der Empfänger-Firmware mit aktueller Changelog-Version per Semver. Oranges ⚠️-Badge bei veralteter Firmware, blaues Badge bei vorhandenem aber nicht geflashtem Build
- **Firmware-Verlauf**: Pro Empfänger wird jeder Versionswechsel protokolliert (Build/OTA/Heartbeat) mit Zeitstempel, sichtbar in der erweiterten Ansicht
- **Changelog-Viewer**: Aufklappbar in der Empfänger-Verwaltung mit allen Versionen und Änderungen
- **Build-Versionen aus Changelog**: Builds verwenden jetzt die Version aus dem Changelog statt Timestamp-basierter Versionen
- **HTTPS Error-Logging**: Firmware loggt jetzt auch HTTPS-Fehler mit HTTP-Statuscodes (war vorher stumm)
- **nginx Receiver-Proxy**: `/api/receivers/` wird direkt an FlightArc-Backend (Port 3020) geleitet, ermöglicht externe Empfänger-Kommunikation über Cloudflare Tunnel
- **Dateien**: firmware/changelog.json (neu), backend/routes/receiver_routes.py, backend/models.py, backend/app.py, frontend/src/api.ts, frontend/src/components/admin/ReceiverList.tsx, frontend/src/components/HelpPage.tsx, firmware/src/http_client.cpp, /etc/nginx/sites-available/labcore-hub

### 2026-03-16 - Empfänger-Planungstool: Automatische Abdeckungsberechnung
- **Planungstool**: Neuer Admin-Tab "Planung" berechnet optimale Empfänger-Positionen für ein Polygon
- **Hex-Grid-Algorithmus**: Mathematisch optimale Kreisabdeckung mit minimaler Empfänger-Anzahl. Empfänger werden nur innerhalb des Polygons platziert.
- **4-Schritt-Wizard**: Zone zeichnen/wählen → Antenne konfigurieren → Berechnen → Empfänger erstellen
- **Batch-Create**: Erstellt bis zu 100 Empfänger auf einmal mit API-Keys und GPS-Positionen
- **APIs**: POST /api/receivers/plan-coverage (Berechnung), POST /api/receivers/batch-create (Erstellung)
- **Shared Antenna Presets**: Gemeinsame Konfiguration in antennaPresets.ts
- **Dateien:** backend/routes/receiver_routes.py, frontend/src/config/antennaPresets.ts (neu), frontend/src/components/admin/PlanningTab.tsx (neu), frontend/src/api.ts, frontend/src/App.tsx, frontend/src/components/admin/AdminLayout.tsx

### 2026-03-16 - Empfänger-Abdeckung: Karten-Layer mit Antennen-Presets
- **Receiver Coverage Layer**: Neuer 📡-Toggle in der Kopfleiste zeigt Empfänger-Positionen und Erkennungsradius auf der Karte
- **Antennen-Presets**: 5 Typen (PCB 1km, Dipol 5dBi 2km, Omni 9dBi 3km, Panel 12dBi 5km, Yagi 15dBi 10km) mit konfigurierbarem Radius
- **Coverage API**: GET /api/receivers/coverage liefert aktive Empfänger mit GPS-Position und Radius
- **Admin-UI**: Antennentyp-Dropdown und Radius-Eingabe in Empfänger-Details
- **Darstellung**: Farbcodierte Kreise (grün/gelb/grau nach Status), Hover-Tooltips, 30s Auto-Refresh
- **Dateien:** backend/models.py, backend/app.py, backend/routes/receiver_routes.py, frontend/src/api.ts, frontend/src/components/MapComponent.tsx, frontend/src/components/MapPage.tsx, frontend/src/components/admin/ReceiverList.tsx

### 2026-03-16 - DIPUL WMS: Alle 34 Layer integriert
- **Vollständige DIPUL-Integration**: Alle 34 verfügbaren WMS-Layer jetzt konfiguriert (vorher nur 17)
- **2 neue Kategorien**: "Gewässer & Schifffahrt" (Binnenwasserstraßen, Seewasserstraßen, Schifffahrtsanlagen) und "Wohn- & Freizeitgebiete" (Wohngrundstücke, Freibäder)
- **17 neue Layer**: Bahnanlagen, Bundesstraßen, Industrieanlagen, Umspannwerke, Polizei, Behörden, Diplomatische Vertretungen, Internationale Organisationen, Sicherheitsbehörden, BSL-4-Labore, Hängegleiter, Inaktive temporäre Einschränkungen, Binnenwasserstraßen, Seewasserstraßen, Schifffahrtsanlagen, Wohngrundstücke, Freibäder
- **HelpPage**: NFZ-Kategorien-Tabelle auf 7 Kategorien mit allen Layern aktualisiert
- **Dateien:** frontend/src/config/noFlyZones.ts, frontend/src/components/NoFlyZonesPanel.tsx, frontend/src/components/HelpPage.tsx, frontend/e2e/nofly-zones.spec.ts

### 2026-03-16 - v1.6.1: Event-basierte Datenübertragung, Logging-System, Mobile E2E-Tests, Handbuch
- **Event-basierte Datenübertragung**: Firmware v1.1.0 sendet Detections sofort bei Erkennung (min 100ms zwischen Sends statt fixer 2s-Batch). Simulation (0.5s) und Dummy-Receiver synchron angepasst.
- **Bug-Fix**: tenant_admin konnte andere tenant_admin erstellen (Berechtigungsprüfung in admin_routes.py)
- **Bug-Fix**: Backend-Tests schlugen fehl weil Center-Koordinaten in DB (München) nicht zur Fleet-Position (Bielefeld) passten
- **Logging-System**: SystemLog DB-Modell, DatabaseLogHandler mit Buffering (2s Flush), per-Mandant Log-Levels, Auto-Prune (10k Einträge max)
- **Admin Log-Viewer**: Neuer Tab "Logs" mit Level/Modul/Freitext-Filter, Auto-Refresh (5s), Pagination, Löschen
- **Log API**: GET/DELETE /api/admin/logs, GET/POST /api/admin/logs/levels, GET /api/admin/logs/modules
- **Mobile E2E-Tests**: 28 neue Tests (mobile.spec.ts) mit 375x667 Viewport: Map Page, Admin Drawer, Receiver Cards, UserList, Login, Settings, Log Viewer, Logs API
- **Benutzerhandbuch**: Mobile-Ansichten, Einsatz-Zonen Einstellungen, Adress-Prüfung, Log-Viewer dokumentiert
- **OTA-Workflow verbessert**: OTA-Button baut jetzt automatisch Firmware vor dem Senden (Build→Trigger→Monitor). Progress-Modal mit 4-Schritt-Anzeige und Live-Log. WiFi-Credentials werden in `last_build_config` gespeichert und bei OTA-Rebuilds wiederverwendet.
- **WiFi NVS-Persistenz**: ESP speichert WiFi-Credentials bei erfolgreicher Verbindung im NVS. Überlebt OTA-Updates — ESP verbindet sich immer mit dem letzten bekannten WiFi.
- **Auto-Request-Logging**: Flask `after_request`-Hook loggt automatisch alle authentifizierten Requests. Root-Logger auf DEBUG, Console auf INFO (kein Spam). Tenant-ID wird aus Flask `g`-Context aufgelöst.
- **Dateien:** firmware/src/config.h, firmware/src/main.cpp, firmware/inject_build_flags.py, backend/models.py, backend/settings.py, backend/services/db_logger.py (neu), backend/routes/log_routes.py (neu), backend/routes/admin_routes.py, backend/routes/receiver_routes.py, backend/services/simulation_manager.py, backend/tests/conftest.py, backend/app.py, examples/dummy_receiver.py, frontend/src/api.ts, frontend/src/App.tsx, frontend/src/components/admin/AdminLayout.tsx, frontend/src/components/admin/LogViewerTab.tsx (neu), frontend/src/components/admin/ReceiverList.tsx, frontend/src/components/HelpPage.tsx, frontend/e2e/mobile.spec.ts (neu)

### 2026-03-16 - v1.6.0: Mobile UX, Admin Tooltips, HelpPage UX, Einsatz-Zonen Einstellungen
- **Admin Tooltips**: Zweistufiges Tooltip-System (0,3s Kurz-Info + 2s Detail-Tooltip) für alle Admin-Buttons
- **HelpPage UX-Refactoring**: Ctrl+K Suche, Deep-Linking, Collapsible Sections (nur Hardware/Empfänger/OTA), Mini-TOC, CodeBlock mit Copy, Scroll-Progress, Back-to-Top, Mobile Drawer
- **Mobile Kartenansicht**: Kompakte Top-Bar + Controls-Drawer, Panels als Bottom-Sheets, Floating Zone-Drawing-Toolbar
- **Mobile Admin**: Hamburger-Sidebar, Empfänger als Karten mit prominentem GPS-Button, UserList Karten-Layout, Touch-freundliche Buttons (44px+)
- **Mobile App-weit**: Login/Settings/DroneDetail/FlightReport responsive, ViolationTable Touch-Buttons, Leaflet Zoom ausgeblendet
- **Tablet-Erkennung**: Zentraler `useIsMobile` Hook mit iPad/Android/Samsung Tablet-Detection (5 Signale)
- **Einsatz-Zonen**: 2-Schritt-Adressprüfung (Geocoding → Bestätigung → Erstellen), Koordinaten-Eingabe statt Kartenmitte
- **Einsatz-Zonen Einstellungen (pro Mandant)**: Neuer Admin-Tab für Radius, Farbe, Höhengrenzen. Backend-API + DB-Migration.
- **Berechtigungen**: Audit bestätigt korrekte Umsetzung aller Rollen (User/Admin/Super-Admin)

### 2026-03-15 - App-weite Mobile-Optimierung (Runde 2)
- **MapComponent.tsx**: Leaflet Zoom-Controls auf Mobile ausgeblendet (pinch-to-zoom)
- **LoginPage.tsx**: Responsive Formularbreite (100% mit maxWidth 360)
- **SettingsPage.tsx**: Größere Toggle-Switches (48x28), Touch-freundliche Buttons (minHeight 40)
- **DroneDetailPage.tsx**: Grid-Karten schrumpfen unter 300px, kompaktere Paddings
- **FlightReportView.tsx**: Stacked Layout (Karte 50vh oben, Panel volle Breite unten), Touch-Controls
- **AdminLayout.tsx**: Sidebar öffnet automatisch auf Mobile beim ersten Laden
- **index.css**: Mobile Media-Query `@media (max-width: 768px)` für Leaflet-Controls
- **Dateien:** MapComponent.tsx, LoginPage.tsx, SettingsPage.tsx, DroneDetailPage.tsx, FlightReportView.tsx, AdminLayout.tsx, index.css

### 2026-03-15 - Mobile-Optimierung ViolationTable
- **ViolationTable.tsx**: Mobile-responsive Anpassungen
  - `useIsMobile` Hook hinzugefügt (768px Breakpoint)
  - "Beginn"-Spalte auf Mobile ausgeblendet (Platzersparnis)
  - Tabelle horizontal scrollbar auf Mobile (`overflowX: auto` Wrapper)
  - Trail/Bericht/Löschen-Buttons: größeres Padding auf Mobile (8px 12px statt 2px 6px)
  - "Alle löschen"-Button: größeres Padding auf Mobile (6px 12px)
  - Header-Bar: minHeight 44px auf Mobile (Touch-freundlich)
  - maxHeight reduziert auf Mobile (180px statt 250px) für mehr Kartenfläche
- **Dateien:** ViolationTable.tsx

### 2026-03-15 - Mobile-Optimierung Kartenansicht: Kompakte Toolbar, Controls-Drawer, Status-Panel
- **MapPage.tsx**: Mobile Kartenansicht komplett überarbeitet
  - Kompakte Top-Bar: Hamburger + Logo/Drohnen-Count + Admin-Button (klar getrennt von Logout)
  - Controls-Drawer: Alle Filter (Refresh, Radius, Höhe) + Panel-Buttons (NFZ, Tracking, Zonen) + Navigation (Settings, Hilfe, Admin) + Abmelden (rot, unten, klar getrennt)
  - Touch-freundliche Buttons: 44px Hamburger, 48px Nav-Buttons, 36px Selects
  - Desktop-Toolbar bleibt unverändert
- **StatusPanel.tsx**: Volle Breite auf Mobile (<768px) statt feste 350px
- **Dateien:** MapPage.tsx, StatusPanel.tsx

### 2026-03-15 - Mobile-Optimierung Admin-Bereich: Responsive Sidebar, Empfänger-Karten, GPS-Standort
- **AdminLayout.tsx**: Mobile Hamburger-Sidebar (Drawer mit Backdrop auf <768px), Touch-freundliche Navigation
- **ReceiverList.tsx**: Mobile Karten-Layout statt Tabelle mit prominentem "Standort setzen"-Button (48px hoch, volle Breite, Teal-Farbe)
  - Touch-freundliche Buttons (min 40px Höhe) statt 8px-Minibuttons
  - Empfänger als Karten mit Status-Border, Kurzinfo, GPS-Feedback
  - Sekundäre Aktionen (Deakt., Firmware, OTA, Löschen) als Flex-Row
- **ReceiverFlashWizard.tsx**: Responsive Modal (maxWidth statt fixed width, margin für Mobile)
- **Dateien:** AdminLayout.tsx, ReceiverList.tsx, ReceiverFlashWizard.tsx

### 2026-03-15 - HelpPage UX-Refactoring: Mobile, Suche, Collapsible Sections, Mini-TOC
- **Mobile Responsive Sidebar**: Hamburger-Button auf <768px, Sidebar als Overlay-Drawer
- **Ctrl+K Suchmodul**: SearchModal mit Section+Subsection-Suche, Pfeiltasten-Navigation, Enter/Escape
- **Deep Linking**: URL-Hash (#section--subsection), Direktlinks auf Subsektionen teilbar
- **62 Collapsible Subsections**: Alle H3-Headings als <details>/<summary> mit Caret-Animation, erste Sektion offen
- **"Alle aufklappen/zuklappen"**: Buttons für Sektionen mit >3 Subsections
- **Mini-TOC (rechte Sidebar)**: "Auf dieser Seite"-Navigation mit IntersectionObserver Scroll-Spy, ab 1100px Breite
- **CodeBlock mit Copy-Button**: 2 Code-Blöcke konvertiert (esptool, merged binary), "Kopieren"/"Kopiert"-Feedback
- **Scroll-Fortschrittsbalken**: 3px Teal-Bar am oberen Rand des Content-Bereichs
- **Back-to-Top Button**: Floating-Button nach 300px Scroll
- **InfoBox erweitert**: Neue Typen "tip" (grün) und "danger" (rot) neben info/warning
- **SECTION_SUBS Metadaten**: 15 Sektionen, 62 Subsection-IDs für Suche und Mini-TOC
- **CSS**: help-sub Details/Summary-Styles, helpSearchIn Animation
- **Dateien:** HelpPage.tsx (komplett überarbeitet), index.css

### 2026-03-15 - Erweiterte zweistufige Tooltips im Admin-Bereich
- **Neue Komponente `AdminTooltip.tsx`**: Zweistufiges Tooltip-System mit Portal-Rendering
  - Stufe 1 (nach 0,3s): Kurzbeschreibung + Hinweis "Hover halten für Details..."
  - Stufe 2 (nach 2s): Ausführliche Erklärung mit Voraussetzungen, Ablauf und Tipps
  - CSS-Animation `adminTooltipIn` in index.css
- **ReceiverList.tsx**: Tooltips für alle 12 Buttons (+ Neuer Empfänger, Log-Toggle, Log anzeigen, Einkaufsliste, Deakt./Akt., Löschen, OTA Update, OTA Abbrechen, App-Firmware, Full-Flash Merged, Firmware bauen, Kommunikations-Log, Standort setzen)
- **SimulationTab.tsx**: Tooltips für 5 Buttons (Alle stoppen, + Neuer Simulator, Starten, Stoppen, Löschen)
- **UserList.tsx**: Tooltips für 4 Buttons (Neuer Benutzer, Bearbeiten, PW Reset, Löschen)
- **TenantList.tsx**: Tooltips für 2 Buttons (Neuer Mandant, Löschen)
- **HelpPage.tsx**: Neue Sektion "Erweiterte Tooltips" im Admin-Kapitel
- **Dateien:** AdminTooltip.tsx (neu), ReceiverList.tsx, SimulationTab.tsx, UserList.tsx, TenantList.tsx, HelpPage.tsx, index.css

### 2026-03-15 - Benutzerhandbuch: OTA, Merged Binary, LED-Farben, Versionierung
- **Neue Sektion "OTA-Updates & Merged Binary"** im Benutzerhandbuch (HelpPage.tsx):
  - OTA-Updates: Voraussetzungen, Ablauf (Trigger → Heartbeat → Download → Reboot → Auto-Detect), Abbrechen, Status-Anzeige
  - Merged Binary: Wann verwenden, Download, Flash-Befehl, NVS-Hinweis
  - Build-Versionierung: Format 1.0.XXXXX, Heartbeat-Vergleich, OTA-Erkennung
  - Vergleichstabelle: App-Firmware vs. Merged Binary vs. OTA
- **Version v1.4 → v1.5** in allen Referenzen aktualisiert (SVG-Diagramme, Texte, Footer)
- **LED-Tabellen** um Farbspalte erweitert (Blau, Gelb, Orange, Grün, Weiß, Rot für ESP32-S3 Neopixel)
- **LED-Hinweisbox** ergänzt: ESP32-S3 = RGB Neopixel GPIO48, ESP32-C3/ESP8266 = GPIO2 an/aus
- **Hardware-Vergleichstabelle** um OTA-Update, Merged Binary und LED-Farben erweitert
- **Empfänger-Tabelle** um OTA-Update, Full-Flash (Merged) und Firmware-Versionierung ergänzt
- **Troubleshooting** aktualisiert: SHA-256 Boot-Loop → Merged Binary Hinweis, neuer OTA-Fehler Eintrag, Hotspot-Timeout 15s (statt 30s), Doppelblinken-Beschreibung präzisiert
- **WiFi-Scanner Pause**: Hinweis in Erstinbetriebnahme, dass ODID-Scanner während AP-Modus pausiert (Hardware-Limitation)
- **Dateien:** `frontend/src/components/HelpPage.tsx`, `frontend/dist/`

### 2026-03-15 - v1.5.4: Merged Binary + OTA Updates

**Merged Binary (Full-Flash)**
- Nach jedem Firmware-Build wird automatisch ein Merged Binary erzeugt (Bootloader + Partitions + boot_app0 + App)
- Löst das SHA-256 Boot-Loop Problem bei Web-Flashern (web.esphome.io etc.)
- Download über `?type=merged` Parameter oder "Full-Flash (Merged)" Button in der Empfänger-Liste
- Nur für ESP32-S3 und ESP32-C3 (nicht ESP8266)

**OTA (Over-The-Air) Updates**
- Firmware prüft bei jedem Heartbeat ob ein Update verfügbar ist
- Backend signalisiert Update im Heartbeat-Response (`firmware_update.available`)
- Firmware lädt Update über HTTPS, schreibt in inaktiven OTA-Slot, rebootet
- Admin UI: "OTA Update senden" Button in Empfänger-Details
- Kein Brick-Risiko dank Dual-Slot Partition (app0/app1 + Rollback)
- Einmalig muss die OTA-fähige Firmware per USB geflasht werden

**Build-Versioning**
- Jeder Build erhält eine unique Version (`1.0.{timestamp}`)
- Heartbeat-Response vergleicht Firmware-Version mit Build-Version
- OTA-Flag wird automatisch cleared wenn Update erfolgreich war

### 2026-03-15 - Benutzerhandbuch aktualisiert (Captive Portal, Standort setzen, Simulation, LED)
- Hardware-Inbetriebnahme: Captive Portal zeigt nun gecachte Netzwerkliste (vor Hotspot-Start gescannt), manuelle SSID-Eingabe, Hinweis auf Standort-Setzen über Web-App statt GPS im Portal
- Empfänger-Verwaltung: Neue Sektion "Standort setzen" dokumentiert (Browser Geolocation API, Handy-GPS)
- Simulation: Alle 8 Flugmuster dokumentiert (linear, circular, waypoint, search_pattern, hover, figure_eight, spiral, random_walk)
- LED-Anzeige: Zweite LED-Tabelle an tatsächliche Firmware-Zustände angepasst (langsames Pulsieren, Doppelblinken, SOS)
- **Dateien:** `frontend/src/components/HelpPage.tsx`, `frontend/dist/`

### 2026-03-15 - v1.5.3: Firmware v1.0.8, Simulation-Tab, Standort über Web-App

**Firmware v1.0.8: Vollständig getesteter Hardware-Betrieb (ESP32-S3 DevKitC)**
- RGB Neopixel LED (GPIO48) statt GPIO2 — farbige Statusanzeige:
  - Blau blinken = Boot/WLAN-Suche
  - Gelb pulsieren = Kein WLAN, Hotspot offen
  - Orange doppelblinken = WLAN ok, Backend nicht erreichbar
  - Grün dauerhaft = Online, alles ok
  - Weiß flash = Drohne erkannt
  - Rot SOS = Fehler
- Captive Portal: Netzwerke werden VOR dem Hotspot-Start gescannt und gecacht
- WiFi-Scanner (Promiscuous Mode) + BLE pausieren im AP-Modus (Hotspot sonst unsichtbar)
- Scanner startet erst wenn STA verbunden (nicht beim Boot)
- DNS-Server für automatisches Captive Portal Popup
- Manuelles SSID-Feld falls Netzwerk nicht in der Liste
- Live-Verbindungsstatus nach WLAN-Auswahl

**Empfänger-Standort über Web-App (statt Captive Portal)**
- Neuer Button "Standort setzen" in der Empfänger-Detail-Ansicht
- Nutzt Browser Geolocation API (Handy-GPS)
- Speichert Koordinaten + Genauigkeit am Empfänger
- Backend: `POST /api/receivers/<id>/location`
- Captive Portal: GPS-Sektion entfernt, Hinweis auf Web-App

### 2026-03-15 - v1.0.1: LED-Feedback, Boot-Mode Anleitung, Firmware-Fixes, Simulation-Tab

**Firmware v1.0.1: Überarbeitetes LED-Feedback**
- 5 klare LED-Zustände statt 7 unklare:
  - Schnelles Blinken (100ms) = Boot/WLAN-Suche
  - Langsames Pulsieren (300ms an, 1200ms aus) = Kein WLAN, Hotspot offen
  - Doppelblinken (2x kurz, Pause) = WLAN ok, Backend nicht erreichbar
  - Dauerhaft an = Alles ok, online
  - SOS-Muster = Schwerer Fehler
- Detection-Flash: 80ms Aus-Blitz bei jeder Erkennung
- AP-Timeout von 30s auf 15s reduziert
- AP startet auch bei verlorenem WLAN nach 3 Versuchen (~30s)

**Flash-Wizard: Board-spezifische Boot-Mode Anleitung**
- Jeder Board-Typ (ESP32-S3, ESP32-C3, ESP8266) zeigt die passende Anleitung zum Versetzen in den Download-Modus
- Intro-Step: Ausführliche Anleitung mit Tasten, Auto-Reset-Info, Port-Hinweisen
- Download-Step: Kompakte Kurzanleitung als Erinnerung beim Flashen
- HelpPage: Neue Tabelle mit allen Board-Typen und Boot-Mode Schritten

**Firmware-Fixes (aus realem Hardware-Test mit ESP32-S3)**
- `inject_build_flags.py` (NEU): PlatformIO Extra-Script für space-safe Build-Flags (WiFi SSIDs mit Leerzeichen)
- `platformio.ini`: Umstellung von `-D` sysenv auf `extra_scripts` mit `CPPDEFINES`
- `main.cpp`: Stack-Overflow Fix — `OdidDetection[50]` von Stack zu `static` (9KB war zu groß für 8KB loopTask)
- `ARDUINO_USB_CDC_ON_BOOT=1` für ESP32-S3 serielle Ausgabe über nativen USB-Port

### 2026-03-15 - Simulation-Tab mit Dummy-Empfängern

**Neues Feature: Admin → Simulation Tab**
- Erstellen, Starten, Stoppen und Löschen von Dummy-Empfängern direkt in der Admin-UI
- Jeder Simulator erzeugt einen echten ReceiverNode in der DB (mit [SIM]-Prefix)
- Drohnen fliegen in realistischen Kreisbahnen (verschiedene Modelle, Quellen, RSSI)
- In-Process Threads (kein subprocess) — direkte Calls an ReceiverProvider.ingest()
- Stats: Laufzeit, Detections, aktive Drohnen — alles live aktualisiert (3s Polling)
- "Alle stoppen" Button für schnelles Cleanup

**Bug Fix: Empfänger-Quelle ließ sich nicht aktivieren**
- `backend/settings.py` `_write_to_db()`: Neue Source-Typen wurden beim Speichern ignoriert wenn sie noch nicht in der DB existierten. Fix: Merge immer zuerst mit DEFAULT_SOURCES.

**Dateien:**
- `backend/services/simulation_manager.py` (NEU) — SimulationManager + SimulatedDrone
- `backend/routes/simulation_routes.py` (NEU) — REST API für Simulatoren
- `backend/routes/__init__.py` — Blueprint registriert
- `backend/app.py` — SimulationManager initialisiert + atexit Cleanup
- `backend/settings.py` — Bug Fix für Source-Toggle
- `frontend/src/api.ts` — Simulation API-Funktionen
- `frontend/src/components/admin/SimulationTab.tsx` (NEU) — UI-Komponente
- `frontend/src/components/admin/AdminLayout.tsx` — Nav-Item hinzugefügt
- `frontend/src/App.tsx` — Route hinzugefügt
- `frontend/src/components/HelpPage.tsx` — Dokumentation ergänzt
- `examples/dummy_receiver.py` — Standalone Dummy (Default: Bielefeld)

## Wichtige Hinweise

### ⚠️ KRITISCH: Firmware ↔ Dummy-Synchronisation
**Bei JEDER Änderung an der Firmware (firmware/src/) MUSS auch der Dummy-Receiver angepasst werden:**
- `backend/services/simulation_manager.py` — In-Process Simulator (SimulatedDrone, to_detection_dict)
- `examples/dummy_receiver.py` — Standalone Python Dummy (OdidDetection, FlightArcClient)

Beide müssen exakt die gleichen Payloads, Felder, Timing und Logik haben wie die echte Firmware,
damit man die erwarteten Ergebnisse und Logs vergleichen kann.

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
- DIPUL WMS: Alle 34 Layer konfiguriert in 7 Kategorien, Daten von DFS Deutsche Flugsicherung, aktualisiert im AIRAC-Zyklus (28 Tage)
- DIPUL WMS CORS erlaubt (`Access-Control-Allow-Origin: *`) - GetFeatureInfo direkt vom Frontend moeglich
- DIPUL WMS rendert in dunklen Farben → CSS `filter: invert(1) hue-rotate(180deg) brightness(1.3)` nur im Dark Theme, Light Theme zeigt Originalfarben
- Hover-Tooltip: Zeigt Zonenname, Typ, Hoehengrenzen, Rechtsgrundlage. Klick-Popup: Vollstaendige Details inkl. Referenz
- FFH-Gebiete: WMS-Layer heisst `dipul:ffh-gebiete` (Bindestrich!), nicht `dipul:ffh_gebiete`
- Test-Abdeckung: 280 Backend-Tests, 73 Frontend Unit-Tests, 144 E2E-Tests (44 Flight Zones, 30 NFZ, 19 Admin, 15 Map Page, 12 Auth, restl. API/Detail/NFZ-Verify)
- Aircraft Lookup Quellen (7): adsbdb.com, OpenSky Network, hexdb.io, OGN DDB, adsbdb Callsign, planespotters.net, airport-data.com
- OGN Aircraft Type Codes: 0=Unknown, 1=Segelflugzeug, 3=Helikopter, 8=Motorflugzeug, 9=Jet, 13=UAV/Drohne, etc.
- OGN Feld 12 = ICAO Hex (Mode-S), Feld 10 = Aircraft Type Code, Feld 13 = OGN/FLARM Device ID
