# FlightArc Docker Deployment — Implementierungsplan

> **Status:** Plan, noch nicht umgesetzt. Erstellt am 2026-04-26 als Antwort auf
> die User-Frage „Ist es möglich den FlightArc als Docker zu packen damit ich es
> auf einem neuen Server installieren kann — DB und User-Infos persistent, mit
> automatischer Migration beim Upgrade?"
>
> Verbindlich für die spätere Umsetzung. Bei Abweichungen: Plan zuerst hier
> aktualisieren, dann implementieren.

---

## TL;DR — Antwort auf die Kernfrage

**Ja, FlightArc als Docker-Image ist gut umsetzbar — die kritischen Bausteine
sind alle schon im Code.**

1. **Persistente Daten:** Ein Named Volume auf `/data` deckt alles ab (SQLite-DB
   inkl. WAL, 30 rotierende Auto-Backups, Firmware-Binaries, Legacy-JSON).
   Externes nächtliches Backup via `tar` ist Pflicht.
2. **Auto-Migration:** Funktioniert sofort. `backend/migrations.py` ist schon
   versioniert, idempotent, additiv-only mit Pre-Migration-Backup. Ein kleines
   `docker-entrypoint.sh` ruft beim Start `manage.py migrate run` — alle pending
   Migrationen werden sequentiell angewendet, auch über Versionssprünge hinweg.
3. **Bei Migration-Fehler:** Crash-Loop mit klarem Logging, KEIN Auto-Rollback.
   Die 30 Backups im Volume erlauben einen 1-Befehl-Rollback per
   `manage.py restore <pre-migration-XYZ.db> --confirm`.
4. **Image-Größe:** ~150–200 MB. Multi-stage (Node→Python-slim). **PlatformIO
   kommt NICHT ins Image** (würde auf 3,5 GB aufblähen) — OTA-Build-Endpoints
   liefern 503 in dieser Variante; Firmware flasht der Admin wie bisher von
   seinem Dev-Notebook. PIO-Sidecar ist optional in Phase 5.

---

## Teil A — Architektur-Plan

### 1. Image-Strategie

**Empfehlung: Multi-stage Build, `python:3.12-slim` als Final-Stage, OHNE PlatformIO im Image.**

```
Stage 1: frontend-builder (node:20-alpine)
  → COPY frontend/package*.json
  → npm ci
  → COPY frontend/
  → npm run build  → frontend/dist/

Stage 2: runtime (python:3.12-slim)
  → apt-get install: tini, curl, ca-certificates
  → COPY backend/requirements.txt + pip install --no-cache-dir
  → COPY backend/ → /app/backend/
  → COPY --from=frontend-builder /build/frontend/dist → /app/frontend/dist/
  → COPY docker-entrypoint.sh + chmod +x
  → ENTRYPOINT ["tini","--","/app/docker-entrypoint.sh"]
  → CMD ["python","-u","/app/backend/app.py"]
```

Resultierende Größe: ~150–200 MB.

#### PlatformIO: NICHT ins Image

**Argumente DAGEGEN (entscheidend):**
- ESP32-Toolchain belegt 2,5–3,5 GB → Image-Pull dauert Minuten statt Sekunden
- Build-Cache (~600 MB) muss persistent sein oder bei jedem Start neu laden
- Builds dauern 30–120 s, blockieren Worker-Thread → das ist ein
  „Build-Service"-Use-Case, kein „Web-Server"-Use-Case
- Riesige Angriffsfläche durch C-Compiler/Linker im Web-Container

**Lösung: PlatformIO als optionaler Sidecar-Container** (`flightarc-firmware-builder`,
`--profile firmware`). Beide Container teilen sich `/data/firmware` als Volume.
Web-Container ruft den Sidecar via Docker-DNS (`http://firmware-builder:8080/build`).

**Pragmatische erste Iteration:** PIO-Sidecar weglassen, OTA-Build-Endpoints
liefern HTTP 503. Sidecar in Phase 5 nachziehen.

---

### 2. Volume-Layout

**Ein Named Volume** für alle persistenten Daten unter `/data` im Container.

| Im Container | Im Volume | Was | Pflicht |
|---|---|---|---|
| `/data/flightarc.db` (+ `-wal`, `-shm`) | `flightarc_data:/data/flightarc.db*` | SQLite DB inkl. WAL | JA |
| `/data/backups/` | `flightarc_data:/data/backups/` | Auto-Snapshots vor jeder Migration | JA |
| `/data/firmware/` | `flightarc_data:/data/firmware/` | Compiled `.bin` per Empfänger | JA |
| `/data/zones/` | `flightarc_data:/data/zones/` | Legacy JSON-Zonen | optional |
| `/data/archives/` | `flightarc_data:/data/archives/` | Legacy Trail-Archive | optional |

**NICHT persistent:**
- `/app/backend/venv/` — wird nicht erstellt (System-Python im Container)
- `/app/frontend/dist/` — Build-Artefakt aus Stage 1, gehört zum Image
- `/app/firmware/.pio/` — bei aktivem PIO: separates Cache-Volume `flightarc_pio_cache:/root/.platformio`

**Pfad-Override per ENV** — minimale Code-Änderung in:
- `backend/database.py:16-18`
- `backend/backup.py:25-27`
- `backend/routes/receiver_routes.py:663-664`
- `backend/models.py:802`
- optional: `backend/scripts/migrate_json_to_db.py:27-28`

Drei ENV-Variablen:
- `FLIGHTARC_DATA_DIR=/data` (neu)
- `DATABASE_URL=sqlite:////data/flightarc.db` (existiert)
- `FLIGHTARC_DB_PATH=/data/flightarc.db` (existiert in `manage.py:29`)

**Sicherheit:** Volume-Verlust = alles weg. Externes Backup ist Pflicht.
Empfehlung: `backup`-Service in Compose (BusyBox-Cron) tart das Volume täglich
03:00 nach `/host-backups/flightarc-YYYYMMDD.tar.gz`, rotiert nach 14 Tagen.
Alternativ Restic/Borg.

---

### 3. Auto-Migration beim Upgrade — KRITISCH

#### Workflow auf dem Zielserver

```
docker compose pull           # neues Image holen
docker compose up -d          # Container neu starten
  └─ entrypoint.sh läuft:
     1. pre-flight: Volume gemountet? DB-Pfad schreibbar?
     2. python /app/backend/manage.py backup pre-upgrade-$(IMAGE_VERSION)
     3. python /app/backend/manage.py migrate run
        └─ run_migrations() macht intern selbst pre-migration-<version>-Backup
     4. python /app/backend/manage.py verify-data → exit 2 wenn 0 Tenants
     5. exec python -u /app/backend/app.py
        └─ Startup-Backup ("startup") + erneut run_migrations() (no-op)
```

Migration **explizit im Entrypoint** (nicht erst beim Flask-Start), damit:
- Migration-Logs in `docker logs` sauber separiert sind
- App nicht startet, wenn Migration scheitert (Container-Exit ≠ 0)
- Pre-upgrade-Backup eindeutig benannt ist (Image-Version eingebrannt)

`run_migrations()` in `migrations.py:363` wendet **alle** pending Migrationen
sequentiell an. Major-Version-Sprung über mehrere Versionen funktioniert
trivial — verifiziert in `migrations.py:389-393`.

#### Migration-Failure-Strategie

**Crash-Loop mit klarem Logging, KEIN Auto-Rollback.**

Begründung:
- Auto-Rollback würde lebende DB überschreiben — bei teilweise gelaufener
  Migration ist DB-Zustand unklar
- Crash-Loop ist sicher: User merkt es sofort, kann manuell
  `docker compose run --entrypoint bash flightarc` rein → `manage.py list-backups` →
  `restore <pre-migration-XYZ.db> --confirm` → `docker compose up -d`
- Die letzten 30 Backups liegen im selben Volume

Konkret: `migrate run` exit ≠ 0 → entrypoint exit ≠ 0 → Container exit →
`restart: unless-stopped` versucht es nochmal → schlägt wieder fehl. Logs zeigen
Stacktrace + Hinweis „restore from backups/<file>".

#### Datenformat-Änderungen jenseits Schema

JSON-Feld bekommt neue Struktur (z. B. `tenant_settings.wifi_networks` mit
`is_global`-Flag): Migration mit `"fn": lambda db, logger: ...` registrieren.
`_apply_one()` in `migrations.py:354-357` ruft `fn(db, logger)` auf, danach
commit + record. `fn` muss idempotent sein
(z. B. `if "newField" not in payload: payload["newField"] = default`).

#### Versionierung

- **Image-Version** = `manifest.json:5` `"version"`. Build-Tag `flightarc:1.13.0` und `flightarc:latest`.
- **Schema-Version** = letzter Eintrag in `schema_migrations`-Tabelle.
- **App-Version im Container** via Build-Arg eingebrannt:
  ```dockerfile
  ARG APP_VERSION
  ENV FLIGHTARC_VERSION=$APP_VERSION
  ```
- `/health` erweitern um `{"status":"ok","version":"1.13.0","schema_head":"018_alarm_response_mapping"}`.
- Kompatibilitätsmatrix App-Code ↔ Schema: **immer compatible**, weil
  „additive only"-Regel (DATABASE_LIFECYCLE.md §0.1) garantiert, dass alte App
  mit neuem Schema läuft.

---

### 4. Container-Healthcheck + Crash-Recovery

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3020/health || exit 1
```

`start-period=60s` für pending Migrationen + Auto-Backup einer ~50-MB-DB.

Im Compose:
```yaml
restart: unless-stopped
```

Migration-Failure: Container exit ≠ 0 vor Flask-Start → in `docker ps` als
„Restarting (1)" sichtbar. KEIN Half-Open-State. `/health` unerreichbar →
Monitoring (Uptime Kuma) alarmiert sofort.

---

### 5. Konfiguration via ENV

**Aus dem Code extrahierte ENV-Variablen:**

| Variable | Default | Wo benutzt | Beschreibung |
|---|---|---|---|
| `DRONE_PORT` | 3020 | `app.py:47` | HTTP-Port |
| `DEFAULT_LAT` | 52.0302 | `app.py:44` | Default-Map-Center |
| `DEFAULT_LON` | 8.5325 | `app.py:45` | Default-Map-Center |
| `DEFAULT_RADIUS` | 50000 | `app.py:46` | Default-Radius (m) |
| `DATABASE_URL` | `sqlite:///.../flightarc.db` | `database.py:38` | DB-Connection-String |
| `FLIGHTARC_DB_PATH` | (leer → DEFAULT) | `manage.py:29` | DB-Pfad für CLI |
| `JWT_SECRET` | `dev-secret-change-in-production` | `auth.py:17`, `services/alarm_dispatcher.py:46` | JWT signing key — **PFLICHT** |
| `ADMIN_PASSWORD` | `admin` | `auth.py:253` | Initial-Passwort des Super-Admins |
| `FLIGHTARC_ALLOW_PRIVATE_CALLBACKS` | (leer) | `routes/alarm_routes.py:220` | Webhook-Callbacks an private IPs (Dev) |

**Neu für Docker (vorgeschlagen):**

| Variable | Default | Beschreibung |
|---|---|---|
| `FLIGHTARC_DATA_DIR` | `/data` | Wurzel für DB, backups/, firmware/, zones/, archives/ |
| `FLIGHTARC_PUBLIC_URL` | (leer) | Externe URL inkl. Schema — wird in `TenantSettings.firmware_backend_url` als Default eingespielt |
| `FLIGHTARC_VERSION` | (vom Build-Arg) | Eingebrannte App-Version |
| `FLIGHTARC_TRUST_PROXY` | `0` | ProxyFix für `X-Forwarded-*` (für nginx/Traefik davor) |

**`.env.example` für Docker:**

```bash
# === FlightArc Docker Configuration ===

# Public URL — MUSS gesetzt werden, sonst funktionieren OTA-Updates nicht
FLIGHTARC_PUBLIC_URL=https://flightarc.example.com

# JWT signing secret — generiere mit: openssl rand -hex 32
JWT_SECRET=CHANGE-ME-openssl-rand-hex-32

# Erstes Admin-Passwort (nur beim ersten Start verwendet)
ADMIN_PASSWORD=changeme

# Map-Defaults (Bielefeld)
DEFAULT_LAT=52.0302
DEFAULT_LON=8.5325
DEFAULT_RADIUS=50000

# Port-Mapping auf dem Host (innerhalb des Containers IMMER 3020)
HOST_PORT=3020

# Hinter Reverse-Proxy?
FLIGHTARC_TRUST_PROXY=1
```

---

### 6. Update-Workflow für den User

**Erstinstallation:**
```bash
mkdir flightarc && cd flightarc
curl -O https://hub.dasilvafelix.de/flightarc/docker-compose.yml
curl -O https://hub.dasilvafelix.de/flightarc/.env.example
mv .env.example .env && nano .env   # JWT_SECRET, ADMIN_PASSWORD, PUBLIC_URL setzen
docker compose up -d
docker compose logs -f flightarc    # warten auf "FlightArc starting on port 3020"
```
Erstes Login: `admin` / `<ADMIN_PASSWORD>` → sofort ändern.

**Update:**
```bash
cd flightarc
docker compose pull
docker compose up -d   # Migration läuft automatisch im entrypoint
docker compose logs --tail 100 flightarc | grep -E "migration|backup"
```

**Backup-Strategie (täglich) — `/etc/cron.daily/flightarc-backup`:**
```bash
docker run --rm \
  -v flightarc_data:/data:ro \
  -v /backup/flightarc:/backup \
  alpine tar czf /backup/flightarc-$(date +%F).tar.gz -C /data .
find /backup/flightarc -name "*.tar.gz" -mtime +14 -delete
```

**Disaster Recovery aus Volume-Backup:**
```bash
docker compose down
docker volume rm flightarc_flightarc_data
docker volume create flightarc_flightarc_data
docker run --rm -v flightarc_flightarc_data:/data -v /backup/flightarc:/backup \
  alpine sh -c "cd /data && tar xzf /backup/flightarc-2026-04-25.tar.gz"
docker compose up -d
```

**Disaster Recovery innerhalb laufender DB (defekte Migration):**
```bash
docker compose exec flightarc python /app/backend/manage.py list-backups
docker compose exec flightarc python /app/backend/manage.py restore 20260425-031200-pre-migration-019.db --confirm
docker compose restart flightarc
```

---

### 7. Frontend-Build-Strategie

`frontend/dist/` ist im Repo committed (1,9 MB). Trotzdem **im Image neu bauen**:

**Pro Re-Build:**
- Reproduzierbar: Image-Version 1.13.0 hat garantiert das Frontend von 1.13.0
- Keine versteckte Abhängigkeit auf vorher gemachten lokalen Build
- Build-Artefakt-Drift ist bekannte Quelle für „beim Release vergessen `npm run build`"

**Contra:** Build-Stage zieht node_modules (~250 MB temporär) — 30–60 s beim
Image-Build, schlägt sich nicht in Final-Image-Größe nieder.

**Production-Server-Pattern** ist bereits implementiert (`app.py:1429-1442`) —
Backend serviert `dist/` via `send_from_directory`, mit SPA-Fallback auf
`index.html`. Kein nginx, kein Vite-Server nötig. Ein Port (3020) für alles.

---

### 8. Risiken + offene Fragen

1. **PlatformIO im Image:** Bewusst weggelassen → Firmware-Build-Endpoints
   (`/api/receivers/<id>/build`, `/api/receivers/<id>/build-merged`) liefern
   HTTP 503. **Maßnahme:** README-Hinweis + späterer Sidecar.

2. **Subscription-Callbacks:** Container muss extern erreichbar sein, damit
   Drittsysteme Push-Webhooks einliefern können. Lösung: Reverse-Proxy
   (Traefik/Caddy/nginx) vor dem Container mit TLS. Compose-Variante mit
   Traefik-Labels möglich. Hinweis im README.

3. **`TenantSettings.firmware_backend_url`:** Bei Server-Umzug muss diese URL
   aktualisiert werden — sonst senden ESP32 weiter an die alte URL.
   **Maßnahme:** Migration `019_default_firmware_backend_url` mit `fn`, die auf
   NULL-Felder den ENV-Wert `FLIGHTARC_PUBLIC_URL` setzt. Nicht zwangsweise
   überschreiben — Admin behält Kontrolle.

4. **WAL-Safety beim Container-Stop:** `docker compose down` sendet SIGTERM →
   10 s grace → SIGKILL. WAL-Mode toleriert SIGKILL technisch, aber sauber wäre
   `PRAGMA wal_checkpoint(TRUNCATE)` beim Shutdown. **Maßnahme:** Signal-Handler
   im `app.py` für SIGTERM. Optional, denn WAL-Recovery beim Start funktioniert
   automatisch.

5. **Logs:** `services/db_logger.py` schreibt Logs in `system_logs`-Tabelle
   (DB). Console-Output via `docker logs` ist redundant aber nützlich.
   Retention via `retention.py` schon geregelt (14 Tage default).

6. **CORS-Origins:** Hardcoded auf `https://*.dasilvafelix.de` (`app.py:59`).
   **Sollte** ENV-konfigurierbar werden
   (`FLIGHTARC_CORS_ORIGINS=https://flightarc.kunde.de`). Optional in dieser
   Iteration; im README dokumentieren.

7. **Time-Zone:** Container hat default UTC. Für Audit-Log-Lesbarkeit:
   `TZ=Europe/Berlin` im Compose. Nicht kritisch, aber Logs werden lokal lesbar.

---

## Teil B — Implementierungs-TODO (geordnet)

### Phase 1 — Path-Konfigurierbarkeit (Code)

1. **`FLIGHTARC_DATA_DIR`-Override** in DB-, Backup-, Firmware-Pfaden
   - **Warum:** Hardcoded `backend/data/` muss auf `/data/` umlenkbar sein
   - **Dateien:** `backend/database.py:16-18`, `backend/backup.py:25-27`,
     `backend/routes/receiver_routes.py:663-664`, `backend/models.py:802`,
     optional `backend/scripts/migrate_json_to_db.py:27-28`
   - **Test:** `FLIGHTARC_DATA_DIR=/tmp/test-data ./venv/bin/python backend/app.py`
     — DB landet in `/tmp/test-data/`. Default-Verhalten unverändert.

2. **`/health` um Versions-Info erweitern**
   - **Warum:** Image-Version + schema head zur Fern-Diagnose
   - **Dateien:** `backend/app.py:553-556`
   - **Test:** `curl /health` liefert `{"status":"ok","version":"1.13.0","schema_head":"018"}`

3. **Migration `019_default_firmware_backend_url`**
   - **Warum:** Auf neuem Server ohne Migration funktionieren OTA-Updates erst
     nach manuellem UI-Edit
   - **Dateien:** `backend/migrations.py` (neuer Eintrag mit `fn`)
   - **Test:** `FLIGHTARC_PUBLIC_URL=https://x.test` setzen, Migration läuft,
     alle TenantSettings haben den Wert; zweiter Run ist no-op

4. **SIGTERM-Handler für sauberen WAL-Checkpoint**
   - **Warum:** Sauberer Container-Stop
   - **Dateien:** `backend/app.py` (Block am Ende vor `app.run`)
   - **Test:** `docker stop` → in den Logs „WAL checkpoint completed"

### Phase 2 — Docker-Artefakte

5. **`Dockerfile` (Multi-stage)** — `/Dockerfile` (neu)
   - **Test:** `docker build -t flightarc:test .` erfolgreich, Image < 250 MB

6. **`.dockerignore`** — `/.dockerignore` (neu)
   - **Inhalt:** `backend/venv/`, `frontend/node_modules/`, `**/__pycache__/`,
     `backend/data/`, `backend/instance/`, `firmware/.pio/`, `.git/`, `*.log`
   - **Test:** Image-Size mit/ohne dockerignore vergleichen

7. **`docker-entrypoint.sh`** — `/docker-entrypoint.sh` (neu, executable)
   ```bash
   #!/bin/sh
   set -e
   echo "[entrypoint] FlightArc ${FLIGHTARC_VERSION} starting"
   echo "[entrypoint] Data dir: ${FLIGHTARC_DATA_DIR}"
   mkdir -p "${FLIGHTARC_DATA_DIR}/backups" "${FLIGHTARC_DATA_DIR}/firmware"
   cd /app/backend
   echo "[entrypoint] Pre-upgrade backup"
   python manage.py backup "pre-upgrade-${FLIGHTARC_VERSION}" || true
   echo "[entrypoint] Running migrations"
   python manage.py migrate run
   echo "[entrypoint] Verifying data"
   python manage.py verify-data
   echo "[entrypoint] Starting server"
   exec "$@"
   ```
   - **Test:** Container start gegen leere DB → 001-018 laufen durch; zweiter Start no-op

8. **`docker-compose.yml`** — `/docker-compose.yml` (neu)
   ```yaml
   services:
     flightarc:
       image: flightarc:${FLIGHTARC_VERSION:-latest}
       restart: unless-stopped
       env_file: .env
       environment:
         FLIGHTARC_DATA_DIR: /data
         DATABASE_URL: sqlite:////data/flightarc.db
         FLIGHTARC_DB_PATH: /data/flightarc.db
         TZ: Europe/Berlin
       ports:
         - "${HOST_PORT:-3020}:3020"
       volumes:
         - flightarc_data:/data
       healthcheck:
         test: ["CMD","curl","-fsS","http://127.0.0.1:3020/health"]
         interval: 30s
         timeout: 5s
         start_period: 60s
         retries: 3
   volumes:
     flightarc_data:
   ```
   - **Test:** `docker compose up -d` → Container nach ~10 s healthy

9. **`.env.example` für Docker** — `/.env.example` (Update)
   - **Test:** `cp .env.example .env && docker compose config` zeigt korrekte Werte

### Phase 3 — Verifikation

10. **Migration-Round-Trip-Test** — `backend/tests/test_docker_migration.py` (neu)
    - **Inhalt:** Init DB mit nur 001-005, ruft `run_migrations()`, asserts dass
      006-018 alle in `schema_migrations` landen, kein Datenverlust
    - **Test:** `pytest tests/test_docker_migration.py -v` grün

11. **Smoke-Test-Skript** — `/scripts/docker-smoke-test.sh` (neu)
    ```bash
    docker compose down -v
    docker compose up -d
    sleep 30
    curl -fsS http://localhost:3020/health | jq .version
    docker compose exec -T flightarc python /app/backend/manage.py verify-data
    docker compose exec -T flightarc python /app/backend/manage.py migrate status
    ```

### Phase 4 — Doku & Release

12. **`DOCKER.md`** — Onboarding-Sektion
    - **Test:** Reviewer kommt von 0 nach „Login als admin" in < 5 Minuten

13. **`DATABASE_LIFECYCLE.md`** — Container-Sektion
    - Update-Workflow im Container, Restore aus Volume-Tar

14. **`manifest.json` `docker-package`-Action**
    - Pflicht-Standard für LabCore-Docker-Projekte
    - **Test:** Action läuft, ZIP landet in `/media/labcore/Daten/Downloads/`

### Phase 5 (optional, später) — PlatformIO-Sidecar

15. Eigenes Image `flightarc-firmware-builder:1.13.0` mit PlatformIO + ESP-Toolchains, FastAPI-Wrapper
16. Compose-Profile `firmware` mit Sidecar + geteiltem `firmware/`-Volume + PIO-Cache-Volume
17. `receiver_routes.py` per ENV `FLIGHTARC_FIRMWARE_BUILDER_URL` umstellen — wenn gesetzt: HTTP-Call statt lokales `subprocess.run()`. Wenn nicht: 503 mit Hilfetext.

---

## Critical Files for Implementation

- `backend/app.py`
- `backend/migrations.py`
- `backend/backup.py`
- `backend/database.py`
- `backend/routes/receiver_routes.py`
- `backend/models.py`
- `backend/manage.py`

Plus die noch zu erstellenden:
- `/Dockerfile`
- `/docker-compose.yml`
- `/docker-entrypoint.sh`
- `/.dockerignore`
- `/.env.example` (Update)
- `/DOCKER.md`
- `/scripts/docker-smoke-test.sh`
- `/backend/tests/test_docker_migration.py`

---

## Reihenfolge zur Umsetzung

**Phase 1 → 2 → 3 → 4** in der genannten Reihenfolge. Phase 5 (PIO-Sidecar) ist
optional und kann nachträglich. Phase 1 ist nicht-invasiv (nur ENV-Overrides
hinzufügen, Defaults bleiben), gibt nach Phase 2 ein lauffähiges Docker-Setup.
