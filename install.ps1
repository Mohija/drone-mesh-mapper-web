<#
.SYNOPSIS
    FlightArc Installer / Updater (PowerShell)

.DESCRIPTION
    - Fresh install: sets up Python venv, Node dependencies, builds frontend, creates .env
    - Update: pulls latest code, updates dependencies, rebuilds frontend
    - Database is NEVER deleted unless -ResetDB is explicitly passed

.PARAMETER ResetDB
    Reset the database (WARNING: deletes all users and data!)

.PARAMETER Port
    Set a custom server port (default: 3020)

.EXAMPLE
    .\install.ps1                  # Install or update
    .\install.ps1 -ResetDB         # Install/update AND reset database
    .\install.ps1 -Port 8080       # Install with custom port
#>

param(
    [switch]$ResetDB,
    [int]$Port = 0
)

$ErrorActionPreference = "Stop"

# ─── Constants ────────────────────────────────────────────

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Venv = Join-Path $Backend "venv"
$DbFile = Join-Path $Backend "data" "flightarc.db"
$DbShm = Join-Path $Backend "data" "flightarc.db-shm"
$DbWal = Join-Path $Backend "data" "flightarc.db-wal"
$EnvFile = Join-Path $Root ".env"
$EnvExample = Join-Path $Root ".env.example"
$PythonExe = Join-Path $Venv "Scripts" "python.exe"
$PipExe = Join-Path $Venv "Scripts" "pip.exe"

# ─── Helpers ──────────────────────────────────────────────

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $colors = @{ "INFO" = "Cyan"; "OK" = "Green"; "WARN" = "Yellow"; "ERROR" = "Red" }
    $color = if ($colors.ContainsKey($Level)) { $colors[$Level] } else { "White" }
    Write-Host "[$Level] " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

function Invoke-Step {
    param([string]$Command, [string]$WorkDir = $null)
    Write-Log "  $ $Command"
    $params = @{ FilePath = "cmd.exe"; ArgumentList = "/c $Command"; NoNewWindow = $true; Wait = $true; PassThru = $true }
    if ($WorkDir) { $params.WorkingDirectory = $WorkDir }
    $proc = Start-Process @params
    if ($proc.ExitCode -ne 0) {
        throw "Command failed with exit code $($proc.ExitCode): $Command"
    }
}

function Test-Installed {
    return (Test-Path $Venv) -and (Test-Path (Join-Path $Frontend "node_modules")) -and (Test-Path (Join-Path $Frontend "dist"))
}

# ─── Prerequisite Checks ─────────────────────────────────

function Test-Prerequisites {
    $ok = $true

    # Python
    try {
        $pyVer = & python --version 2>&1
        Write-Log "Python gefunden: $pyVer" "OK"
    } catch {
        Write-Log "Python nicht gefunden. Bitte installieren: https://python.org/" "ERROR"
        $ok = $false
    }

    # Node.js
    try {
        $nodeVer = & node --version 2>&1
        Write-Log "Node.js gefunden: $nodeVer" "OK"
    } catch {
        Write-Log "Node.js nicht gefunden. Bitte installieren: https://nodejs.org/" "ERROR"
        $ok = $false
    }

    # npm
    try {
        $npmVer = & npm --version 2>&1
        Write-Log "npm gefunden: $npmVer" "OK"
    } catch {
        Write-Log "npm nicht gefunden." "ERROR"
        $ok = $false
    }

    return $ok
}

# ─── Installation Steps ──────────────────────────────────

function Install-Venv {
    if (-not (Test-Path $Venv)) {
        Write-Log "Erstelle Python Virtual Environment..."
        Invoke-Step "python -m venv `"$Venv`""
    } else {
        Write-Log "Python Virtual Environment existiert bereits." "OK"
    }

    Write-Log "Installiere/aktualisiere Python-Abhaengigkeiten..."
    Invoke-Step "`"$PipExe`" install --upgrade pip" $Backend
    Invoke-Step "`"$PipExe`" install -r requirements.txt" $Backend
    Write-Log "Python-Abhaengigkeiten installiert." "OK"
}

function Install-Frontend {
    Write-Log "Installiere/aktualisiere Node.js-Abhaengigkeiten..."
    Invoke-Step "npm install --include=dev" $Frontend
    Write-Log "Node.js-Abhaengigkeiten installiert." "OK"

    Write-Log "Baue Frontend (Production Build)..."
    Invoke-Step "npm run build" $Frontend
    Write-Log "Frontend erfolgreich gebaut." "OK"
}

function Install-Env {
    param([int]$CustomPort = 0)

    if (-not (Test-Path $EnvFile)) {
        if (Test-Path $EnvExample) {
            Copy-Item $EnvExample $EnvFile
            Write-Log ".env erstellt aus .env.example" "OK"
        } else {
            @"
DRONE_PORT=3020
DEFAULT_LAT=52.0302
DEFAULT_LON=8.5325
DEFAULT_RADIUS=50000
"@ | Set-Content $EnvFile -Encoding UTF8
            Write-Log ".env mit Standardwerten erstellt." "OK"
        }
    } else {
        Write-Log ".env existiert bereits - wird nicht ueberschrieben." "OK"
    }

    if ($CustomPort -gt 0) {
        $content = Get-Content $EnvFile
        $portSet = $false
        $newContent = @()
        foreach ($line in $content) {
            if ($line -match "^DRONE_PORT=") {
                $newContent += "DRONE_PORT=$CustomPort"
                $portSet = $true
            } else {
                $newContent += $line
            }
        }
        if (-not $portSet) {
            $newContent += "DRONE_PORT=$CustomPort"
        }
        $newContent | Set-Content $EnvFile -Encoding UTF8
        Write-Log "Port auf $CustomPort gesetzt." "OK"
    }
}

function Install-DataDir {
    $dataDir = Join-Path $Backend "data"
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $dataDir "firmware") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $dataDir "archives") -Force | Out-Null
}

function Reset-Database {
    $deleted = $false
    foreach ($f in @($DbFile, $DbShm, $DbWal)) {
        if (Test-Path $f) {
            Remove-Item $f -Force
            $deleted = $true
        }
    }
    if ($deleted) {
        Write-Log "Datenbank wurde zurueckgesetzt. Beim naechsten Start wird eine neue erstellt." "WARN"
    } else {
        Write-Log "Keine Datenbank-Dateien zum Loeschen gefunden." "OK"
    }
}

function Update-Git {
    $gitDir = Join-Path $Root ".git"
    if (Test-Path $gitDir) {
        Write-Log "Ziehe aktuelle Aenderungen von Git..."
        try {
            Invoke-Step "git pull --ff-only" $Root
            Write-Log "Git-Updates erfolgreich geladen." "OK"
        } catch {
            Write-Log "Git pull fehlgeschlagen. Bitte manuell pruefen." "WARN"
        }
    } else {
        Write-Log "Kein Git-Repository - ueberspringe Git pull." "WARN"
    }
}

# ─── Main ─────────────────────────────────────────────────

$updating = Test-Installed
$mode = if ($updating) { "UPDATE" } else { "INSTALLATION" }

Write-Host ""
Write-Host ("=" * 60)
Write-Host "  FlightArc - $mode"
Write-Host ("=" * 60)
Write-Host ""

# 1. Check prerequisites
if (-not (Test-Prerequisites)) {
    Write-Log "Fehlende Voraussetzungen. Bitte installieren und erneut versuchen." "ERROR"
    exit 1
}

# 2. Git pull (only on update)
if ($updating) {
    Update-Git
}

# 3. Database reset (only if explicitly requested)
if ($ResetDB) {
    Write-Log "--ResetDB angegeben: Datenbank wird zurueckgesetzt!" "WARN"
    $confirm = Read-Host "  Alle Benutzer und Daten werden geloescht. Fortfahren? (ja/nein)"
    if ($confirm -match "^(ja|j|yes|y)$") {
        Reset-Database
    } else {
        Write-Log "Datenbank-Reset abgebrochen." "OK"
    }
}

# 4. Setup
Install-DataDir
Install-Venv
Install-Frontend
Install-Env -CustomPort $Port

# 5. Done
Write-Host ""
Write-Host ("=" * 60)
if ($updating) {
    Write-Log "Update erfolgreich abgeschlossen!" "OK"
    Write-Log "Datenbank und Benutzer wurden beibehalten." "OK"
} else {
    Write-Log "Installation erfolgreich abgeschlossen!" "OK"
}

# Read port from .env
$serverPort = 3020
if (Test-Path $EnvFile) {
    foreach ($line in (Get-Content $EnvFile)) {
        if ($line -match "^DRONE_PORT=(\d+)") {
            $serverPort = [int]$Matches[1]
        }
    }
}

Write-Host ""
Write-Log "Server starten mit:"
Write-Log "  cd backend; .\venv\Scripts\python.exe app.py"
Write-Log "  Dann oeffnen: http://localhost:$serverPort"
Write-Host ("=" * 60)
Write-Host ""
