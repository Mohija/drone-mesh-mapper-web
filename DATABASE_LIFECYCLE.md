# FlightArc — Datenbank-Lebenszyklus & Update-Prozess

> **Verbindliche Regeln für jede Änderung am Schema, an den Migrationen oder am Deployment-Prozess.**
> Hintergrund: Am 2026-04-24 hat ein destruktiver pytest-Fixture den Mandanten „FW Brake" und zwei User aus der Produktions-DB gelöscht. Rettung war nur möglich, weil die `.db`-Datei im Git getrackt war. Die hier beschriebenen Prozesse verhindern das dauerhaft.

---

## 0. Grundprinzipien (nicht verhandelbar)

1. **Additiv nur.** Migrationen fügen Spalten, Tabellen, Indizes hinzu. Sie ändern NIEMALS automatisch Bestandsdaten und führen NIEMALS `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, `ALTER ... DROP COLUMN` aus. Wenn ein solcher Schritt wirklich nötig ist, wird er **manuell unter Supervision** vom Admin gemacht, mit vorherigem manuellem Backup, und in einem eigenen Runbook dokumentiert — nie in der Migrationspipeline.
2. **Idempotent.** Jede Migration darf beliebig oft ausgeführt werden, ohne zu brechen (z. B. `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` wird im `try/except` geschützt).
3. **Versioniert.** Jede Migration hat eine eindeutige Versions-ID (`NNN_beschreibung`) und steht in `backend/migrations.py`. Eine `schema_migrations`-Tabelle trackt, welche Versionen bereits angewendet sind.
4. **Automatisch mit Backup.** Beim App-Start (und vor jeder neuen Migration) wird automatisch ein Snapshot der `.db`-Datei in `backend/data/backups/` abgelegt. Die letzten **30** Backups bleiben, ältere werden rotiert.
5. **Test-isoliert.** Pytest läuft gegen eine temporäre Datei unter `/tmp/flightarc-test-*.db`. Der Override in `backend/tests/conftest.py` erfolgt **vor** dem `from app import app`. Ein Runtime-Hard-Guard bricht mit `pytest.exit(...)` ab, falls die aktive DB-URI auf die Produktions-Datei zeigt.
6. **Git = letzter Rettungsanker.** `backend/data/flightarc.db` wird weiterhin committed — vor Release-Commits `git add backend/data/flightarc.db` nicht vergessen.

---

## 1. Komponenten

| Datei | Aufgabe |
|-------|---------|
| `backend/migrations.py` | Registry aller Migrationen + Runner, liest `schema_migrations` |
| `backend/backup.py` | Snapshot / Restore / Rotation der SQLite-Datei inkl. WAL+SHM |
| `backend/manage.py` | CLI: `backup`, `restore`, `list-backups`, `migrate status`, `migrate run` |
| `backend/data/backups/` | Rotierende Backups, Namensschema `YYYYMMDD-HHMMSS-<grund>.db` |
| `backend/data/backups/.gitignore` | Backups sind lokal, nicht im Git |
| `backend/tests/conftest.py` | Erzwingt Test-DB-Isolation + Hard-Guard |
| `DATABASE_LIFECYCLE.md` | Diese Datei — verbindliche Prozess-Referenz |

---

## 2. Eine neue Migration hinzufügen

1. In `backend/migrations.py` unten einen Eintrag in `MIGRATIONS = [...]` anhängen:
   ```python
   {
       "version": "012_add_firmware_backend_url",
       "description": "Tenant-weite URL für Firmware-Build",
       "statements": [
           "ALTER TABLE tenant_settings ADD COLUMN firmware_backend_url VARCHAR(255)",
       ],
   }
   ```
   - **Niemals** eine existierende Migration editieren (Reihenfolge + Namen sind unveränderlich).
   - Statements sind SQLite-SQL, werden einzeln in `try/except` ausgeführt.
   - Für Python-Logik statt SQL: `"fn": lambda db, logger: ...` statt `"statements"`.
2. In `backend/models.py` das SQLAlchemy-Feld ergänzen (nur zur Laufzeit-Verwendung).
3. Tests laufen lassen (`./venv/bin/python -m pytest tests/ -q`) — die Tests laufen gegen die Temp-DB und rufen die Migration dort auf.
4. Commit: `git add backend/migrations.py backend/models.py && git commit -m "..."`.
5. Auf Deployment: `backend/manage.py migrate status` zeigt die neue Migration als *pending*, beim nächsten App-Start wird sie automatisch angewendet (mit vorherigem Backup).

---

## 3. Update-Prozess (Deployment / Git Pull)

Verbindlicher Ablauf bei jedem FlightArc-Update:

```bash
cd /media/labcore/Daten/Projekte/drone-mesh-mapper-web

# 1. Pre-update snapshot (manuell, zusätzlich zum automatischen Backup beim Start)
./backend/venv/bin/python backend/manage.py backup manual-pre-update

# 2. Code holen
git pull

# 3. Dependencies (falls requirements.txt geändert)
./backend/venv/bin/pip install -r backend/requirements.txt

# 4. Migration-Status prüfen
./backend/venv/bin/python backend/manage.py migrate status

# 5. (Optional) Migrationen explizit vorab anwenden
./backend/venv/bin/python backend/manage.py migrate run

# 6. Frontend bauen
cd frontend && npm install && npm run build && cd ..

# 7. Backend neustarten — der Start erzeugt selbst ein Auto-Backup + wendet
#    ausstehende Migrationen an, falls Schritt 5 übersprungen wurde.
pkill -f "python.*app.py" || true
cd backend && nohup ./venv/bin/python app.py > /tmp/flightarc-backend.log 2>&1 &

# 8. Health-Check
sleep 4
curl -sf http://localhost:3020/health   # erwartet {"status":"ok"}

# 9. Verifizieren, dass Daten noch da sind
./backend/venv/bin/python backend/manage.py verify-data
```

Bei Fehlern in Schritt 7/8: Rollback siehe Abschnitt 4.

---

## 4. Rollback

```bash
# Letzte 10 Backups anzeigen
./backend/venv/bin/python backend/manage.py list-backups

# Restore aus einem bestimmten Backup
./backend/venv/bin/python backend/manage.py restore 20260424-084000-startup.db

# Backend neu starten
pkill -f "python.*app.py" || true
cd backend && nohup ./venv/bin/python app.py > /tmp/flightarc-backend.log 2>&1 &
```

Das `restore` erstellt vorher ein Backup der aktuellen (kaputten) DB unter `pre-restore-<timestamp>.db` — so geht auch der Rollback nichts verloren.

---

## 5. Was ist verboten

| Aktion | Warum | Ersatz |
|--------|-------|--------|
| `db.drop_all()` in App-Code | Löscht alles | Migration mit additiver Änderung |
| `Model.query.delete()` in Pytest-Fixture gegen Prod-DB | Siehe Incident 2026-04-24 | `DATABASE_URL`-Override (bereits erzwungen) |
| ad-hoc `ALTER TABLE` direkt in `app.py` | Kein Tracking, kein Backup | Eintrag in `MIGRATIONS` |
| `git push --force` auf einen DB-Commit | Historie weg = Rettungsanker weg | normaler commit |
| Backups löschen ohne `list-backups` zu prüfen | Letzter Rettungsanker | `manage.py list-backups` + selektiv löschen |

---

## 6. Notfall-Checkliste (Datenverlust)

1. **Sofort Backend stoppen** (`pkill -f "python.*app.py"`) — verhindert weitere Commits der kaputten DB.
2. **Audit-Log prüfen**: `./venv/bin/python3 -c "import sqlite3; [print(r) for r in sqlite3.connect('data/flightarc.db').execute('SELECT timestamp,username,action,resource_type,resource_name FROM audit_logs ORDER BY timestamp DESC LIMIT 20')]"` — zeigt, ob jemand über die UI gelöscht hat.
3. **Backups durchgehen**: `manage.py list-backups` → das neueste Backup *vor* dem Vorfall nehmen.
4. **Git-Fallback**: `git log -- backend/data/flightarc.db` zeigt versionierte Stände. `git checkout <sha> -- backend/data/flightarc.db` holt den betreffenden Stand (inkl. WAL/SHM zurücksetzen).
5. **Restore** wie in Abschnitt 4.
6. **Ursache finden** — Neuer Migrations-Bug? Destruktiver Test? Danach erst wieder starten.

---

## 6b. Datenaufbewahrung (Retention)

Log-Tabellen wachsen bei jedem Heartbeat / Request. Ohne Deckel läuft die DB voll. Das zentrale Modul `backend/retention.py` prunt stündlich im Background-Thread (ab Startup) und ist zusätzlich manuell auslösbar.

| Tabelle | Standard-Retention | Pro-Tenant-Override |
|---------|--------------------|---------------------|
| `system_logs` | 14 Tage (+ Hard-Cap 20.000 Zeilen/Tenant als Fail-Safe) | `tenant_settings.retention_system_logs_days` (1–365) |
| `audit_logs` | 90 Tage (Compliance-Puffer) | `tenant_settings.retention_audit_logs_days` (1–365) |
| `trail_archives` | 7 Tage via `expires_at` (eigener Manager) | — |
| `receiver_nodes`, `tenants`, `users`, `flight_zones`, `service_tokens`, … | Nicht gepruned — Dimension/Config-Tabellen | — |

Konfiguration:
- Admin-UI: **Admin → Einstellungen → Datenaufbewahrung** (Tage eintragen + „Jetzt aufräumen").
- API: `POST /api/settings {"retention_system_logs_days": 7, "retention_audit_logs_days": 180}`.
- CLI: `./backend/venv/bin/python backend/manage.py cleanup` (sofortiger Run) und `db-stats` (Zeilen pro Tabelle + Dateigröße).

Sicherheitsnetze: `_resolve_days()` klemmt eingetragene Werte auf 1–365 (ein fehlkonfiguriertes 0 oder negatives würde sonst alles löschen). Alle destruktiven Löschungen laufen innerhalb der Retention-Fenster — sie rühren nie an Empfänger-Daten, User, Tenants, Zonen oder Tokens.

Monitoring: Der Health-Summary-Endpoint (`/api/receivers/health-summary`, Service-Token-Auth) enthält `db_stats` mit Zeilenzahlen, Dateigröße und effektiven Retention-Tagen. Der scheduled Remote-Agent `flightarc-daily-health` alarmiert bei `system_logs > 50000` (Retention läuft nicht) oder DB-Größe > 500 MB.

## 7. Schutzmaßnahmen zusammengefasst

- ✅ `backend/tests/conftest.py`: Temp-DB + Hard-Guard (bereits aktiv)
- ✅ `backend/migrations.py`: Versionierte, idempotente, additive Migrationen (ab Version 1.8.2)
- ✅ `backend/backup.py`: Auto-Snapshot beim Start + vor jeder Migration (ab Version 1.8.2)
- ✅ `backend/manage.py`: CLI für manuelle Ops
- ✅ `backend/data/backups/`: Rotierende lokale Backups (nicht in Git)
- ✅ Audit-Log in der DB zeichnet jede UI-Operation auf
- ✅ `flightarc.db` bleibt im Git als letzter Notanker

**Wer an diesen Schutzmaßnahmen etwas ändert, muss die Änderung im Commit-Message erklären und dieses Dokument synchron halten.**
