# Beispiel: Einsatz-Zone über die FlightArc API erstellen (PowerShell)
#
# Erstellt eine kreisförmige Flugzone (100m Radius) an einer gegebenen Position.
# Position kann als Koordinaten (Lat/Lon) ODER als Adresse angegeben werden.
# Funktioniert sowohl lokal als auch über den Live-Proxy.
#
# Verwendung:
#     .\create_mission_zone.ps1 -Name "FW Brake" -Lat 52.0165 -Lon 8.5753 -Tenant "FW Brake"
#     .\create_mission_zone.ps1 -Name "FW Brake" -Address "Musterstraße 1, Brake" -Tenant "FW Brake"
#     .\create_mission_zone.ps1 -BaseUrl "http://localhost:3020/api" -Tenant "Standard"

param(
    [string]$BaseUrl  = "https://hub.dasilvafelix.de/api/live/flight-arc/api",
    [string]$Username = "admin",
    [string]$Password = "admin",
    [string]$Tenant   = "FW Brake",  # Mandanten-Name — muss angegeben werden
    [string]$Name     = "FW Brake",
    [double]$Lat      = 0,
    [double]$Lon      = 0,
    [string]$Address  = ""
)

# Prüfen: Mindestens Koordinaten oder Adresse muss angegeben sein
$HasCoords = ($Lat -ne 0 -or $Lon -ne 0)
$HasAddress = ($Address -ne "")

if (-not $HasCoords -and -not $HasAddress) {
    Write-Host "Fehler: Entweder -Lat/-Lon oder -Address muss angegeben werden." -ForegroundColor Red
    Write-Host "Beispiele:" -ForegroundColor Yellow
    Write-Host "  .\create_mission_zone.ps1 -Name 'FW Brake' -Lat 52.0165 -Lon 8.5753 -Tenant 'FW Brake'"
    Write-Host "  .\create_mission_zone.ps1 -Name 'FW Brake' -Address 'Musterstr. 1, Brake' -Tenant 'FW Brake'"
    exit 1
}

# ─── 1. Mandant ermitteln ─────────────────────────────────────

$TenantId = $null

if ($Tenant) {
    # Verfügbare Mandanten abrufen (öffentlicher Endpoint)
    try {
        $Tenants = Invoke-RestMethod -Uri "$BaseUrl/auth/tenants" -Method Get
    } catch {
        Write-Host "Fehler beim Abrufen der Mandanten: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }

    $Match = $Tenants | Where-Object { $_.display_name -eq $Tenant -or $_.name -eq $Tenant }
    if (-not $Match) {
        Write-Host "Mandant '$Tenant' nicht gefunden. Verfuegbar:" -ForegroundColor Red
        foreach ($t in $Tenants) {
            Write-Host "  - $($t.display_name) ($($t.name))"
        }
        exit 1
    }
    $TenantId = $Match.id
    Write-Host "Mandant: $($Match.display_name) ($TenantId)" -ForegroundColor Cyan
}

# ─── 2. Login ─────────────────────────────────────────────────

$LoginData = @{ username = $Username; password = $Password }
if ($TenantId) {
    $LoginData.tenant_id = $TenantId
}
$LoginBody = $LoginData | ConvertTo-Json

try {
    $LoginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $LoginBody
} catch {
    Write-Host "Login fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$Token = $LoginRes.access_token
$ActiveTenant = $LoginRes.user.tenant_name
Write-Host "Login erfolgreich (User: $Username, Mandant: $ActiveTenant)" -ForegroundColor Green

# ─── 3. Einsatz-Zone erstellen ────────────────────────────────

$Headers = @{ Authorization = "Bearer $Token" }

$ZoneData = @{ name = $Name }

if ($HasCoords) {
    $ZoneData.lat = $Lat
    $ZoneData.lon = $Lon
    Write-Host "Erstelle Zone per Koordinaten: ($Lat, $Lon)" -ForegroundColor Yellow
} else {
    $ZoneData.address = $Address
    Write-Host "Erstelle Zone per Adresse: '$Address' (wird geocodiert)" -ForegroundColor Yellow
}

$ZoneBody = $ZoneData | ConvertTo-Json

try {
    $Zone = Invoke-RestMethod -Uri "$BaseUrl/zones/mission" `
        -Method Post `
        -ContentType "application/json" `
        -Headers $Headers `
        -Body $ZoneBody
} catch {
    Write-Host "Fehler beim Erstellen: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ─── 4. Ergebnis ──────────────────────────────────────────────

Write-Host "`nZone erstellt:" -ForegroundColor Cyan
Write-Host "  ID:      $($Zone.id)"
Write-Host "  Name:    $($Zone.name)"
Write-Host "  Farbe:   $($Zone.color)"
Write-Host "  Punkte:  $($Zone.polygon.Count) (Kreis, 100m Radius)"
if ($Zone.resolved_address) {
    Write-Host "  Adresse: $($Zone.resolved_address)" -ForegroundColor Green
}
Write-Host "  Mandant: $ActiveTenant"

# ─── 5. Alle Zonen im Mandanten auflisten ─────────────────────

$Zones = Invoke-RestMethod -Uri "$BaseUrl/zones" `
    -Method Get `
    -Headers $Headers

Write-Host "`nAlle Zonen in '$ActiveTenant' ($($Zones.Count)):" -ForegroundColor Cyan
foreach ($z in $Zones) {
    $droneCount = $z.assignedDrones.Count
    Write-Host "  [$($z.id.Substring(0,8))] $($z.name) - $($z.polygon.Count) Punkte, $droneCount Drohne(n)"
}
