<#
.SYNOPSIS
    FlightArc Uninstaller (PowerShell)

.DESCRIPTION
    Removes FlightArc installation while preserving the database by default.

.PARAMETER DeleteDB
    Also delete the database (WARNING: deletes all users and data!)

.PARAMETER Full
    Remove the entire project directory (including source code)

.EXAMPLE
    .\uninstall.ps1                # Remove install, keep database
    .\uninstall.ps1 -DeleteDB      # Remove everything including database
    .\uninstall.ps1 -Full           # Remove entire project directory
#>

param(
    [switch]$DeleteDB,
    [switch]$Full
)

$ErrorActionPreference = "Stop"

# ─── Constants ────────────────────────────────────────────

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Venv = Join-Path $Backend "venv"
$NodeModules = Join-Path $Frontend "node_modules"
$Dist = Join-Path $Frontend "dist"
$DbFile = Join-Path $Backend "data" "flightarc.db"
$DbShm = Join-Path $Backend "data" "flightarc.db-shm"
$DbWal = Join-Path $Backend "data" "flightarc.db-wal"
$EnvFile = Join-Path $Root ".env"

# ─── Helpers ──────────────────────────────────────────────

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $colors = @{ "INFO" = "Cyan"; "OK" = "Green"; "WARN" = "Yellow"; "ERROR" = "Red" }
    $color = if ($colors.ContainsKey($Level)) { $colors[$Level] } else { "White" }
    Write-Host "[$Level] " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

function Remove-DirSafe {
    param([string]$Path, [string]$Name)
    if (Test-Path $Path) {
        Remove-Item $Path -Recurse -Force
        Write-Log "$Name entfernt: $Path" "OK"
    } else {
        Write-Log "$Name nicht vorhanden - uebersprungen." "OK"
    }
}

function Remove-FileSafe {
    param([string]$Path, [string]$Name)
    if (Test-Path $Path) {
        Remove-Item $Path -Force
        Write-Log "$Name entfernt: $Path" "OK"
    }
}

# ─── Main ─────────────────────────────────────────────────

Write-Host ""
Write-Host ("=" * 60)
Write-Host "  FlightArc - DEINSTALLATION"
Write-Host ("=" * 60)
Write-Host ""

# Full removal
if ($Full) {
    Write-Log "--Full: Das gesamte Projektverzeichnis wird geloescht!" "WARN"
    $confirm = Read-Host "  Wirklich ALLES loeschen? (ja/nein)"
    if ($confirm -notmatch "^(ja|j|yes|y)$") {
        Write-Log "Abgebrochen." "OK"
        exit 0
    }
    Set-Location (Split-Path -Parent $Root)
    Remove-Item $Root -Recurse -Force
    Write-Log "FlightArc vollstaendig deinstalliert." "OK"
    exit 0
}

# Confirm DB deletion
if ($DeleteDB) {
    Write-Log "--DeleteDB: Datenbank wird ebenfalls geloescht!" "WARN"
    $confirm = Read-Host "  Alle Benutzer und Daten werden geloescht. Fortfahren? (ja/nein)"
    if ($confirm -notmatch "^(ja|j|yes|y)$") {
        Write-Log "Datenbank-Loeschung abgebrochen. Fahre ohne DB-Loeschung fort." "OK"
        $DeleteDB = $false
    }
}

Write-Log "Entferne installierte Komponenten..."
Write-Host ""

# Remove components
Remove-DirSafe $Venv "Python venv"
Remove-DirSafe $NodeModules "node_modules"
Remove-DirSafe $Dist "Frontend dist"
Remove-FileSafe $EnvFile ".env"

# Remove __pycache__
$caches = Get-ChildItem -Path $Root -Directory -Filter "__pycache__" -Recurse -ErrorAction SilentlyContinue
if ($caches) {
    foreach ($cache in $caches) {
        Remove-Item $cache.FullName -Recurse -Force
    }
    Write-Log "$($caches.Count) __pycache__-Verzeichnisse entfernt." "OK"
}

# Database
if ($DeleteDB) {
    $deleted = $false
    foreach ($f in @($DbFile, $DbShm, $DbWal)) {
        if (Test-Path $f) {
            Remove-Item $f -Force
            $deleted = $true
        }
    }
    if ($deleted) {
        Write-Log "Datenbank-Dateien entfernt." "OK"
    } else {
        Write-Log "Keine Datenbank-Dateien vorhanden." "OK"
    }
} else {
    Write-Log "Datenbank wird beibehalten (-DeleteDB zum Loeschen)." "OK"
}

Write-Host ""
Write-Host ("=" * 60)
Write-Log "Deinstallation abgeschlossen!" "OK"
if (-not $DeleteDB) {
    Write-Log "Datenbank wurde beibehalten: backend\data\flightarc.db" "OK"
    Write-Log "Neuinstallation mit: .\install.ps1" "INFO"
}
Write-Host ("=" * 60)
Write-Host ""
