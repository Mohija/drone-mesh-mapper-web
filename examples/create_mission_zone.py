#!/usr/bin/env python3
"""
Beispiel: Einsatz-Zone über die FlightArc API erstellen.

Erstellt eine kreisförmige Flugzone (100m Radius) an einer gegebenen Position.
Funktioniert sowohl lokal als auch über den Live-Proxy.

Verwendung:
    python3 create_mission_zone.py
"""

import requests

# ─── Konfiguration ────────────────────────────────────────────

# Extern über Live-Proxy:
BASE_URL = "https://hub.dasilvafelix.de/api/live/flight-arc/api"

# Lokal (alternativ):
# BASE_URL = "http://localhost:3020/api"

USERNAME = "admin"
PASSWORD = "admin"


def login(base_url: str, username: str, password: str) -> str:
    """Authentifizierung – gibt Access-Token zurück."""
    res = requests.post(
        f"{base_url}/auth/login",
        json={"username": username, "password": password},
    )
    res.raise_for_status()
    token = res.json()["access_token"]
    print(f"Login erfolgreich (User: {username})")
    return token


def create_mission_zone(base_url: str, token: str, name: str, lat: float, lon: float) -> dict:
    """Erstellt eine Einsatz-Zone (100m Radius) an der gegebenen Position."""
    res = requests.post(
        f"{base_url}/zones/mission",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "lat": lat, "lon": lon},
    )
    res.raise_for_status()
    return res.json()


# ─── Hauptprogramm ────────────────────────────────────────────

if __name__ == "__main__":
    # 1. Einloggen
    token = login(BASE_URL, USERNAME, PASSWORD)

    # 2. Einsatz-Zone erstellen: FW Brake (Unterweser)
    zone = create_mission_zone(
        base_url=BASE_URL,
        token=token,
        name="FW Brake",
        lat=52.0165,
        lon=8.5753,
    )

    # 3. Ergebnis ausgeben
    print(f"\nZone erstellt:")
    print(f"  ID:       {zone['id']}")
    print(f"  Name:     {zone['name']}")
    print(f"  Farbe:    {zone['color']}")
    print(f"  Punkte:   {len(zone['polygon'])} (Kreis)")
    print(f"  Zentrum:  {zone['polygon'][0][0]:.4f}, {zone['polygon'][9][1]:.4f}")
