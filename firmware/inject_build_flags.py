"""
PlatformIO extra script — Inject build flags from environment variables.

Handles values with spaces (e.g. WiFi SSIDs like "Da Silva LAB")
by using CPPDEFINES tuples instead of raw -D flags.
This avoids shell/compiler quoting issues with spaces in values.
"""

Import("env")
import os


def inject_str(name, default=""):
    """Inject a string #define from an environment variable, space-safe."""
    val = os.environ.get(name, default)
    if val:
        env.Append(CPPDEFINES=[(name, env.StringifyMacro(val))])


# Backend connection
inject_str("BACKEND_URL", "http://localhost:3020")
inject_str("API_KEY")

# WiFi credentials (up to 3 networks, may contain spaces)
inject_str("WIFI_SSID")
inject_str("WIFI_PASS")
inject_str("WIFI_SSID_2")
inject_str("WIFI_PASS_2")
inject_str("WIFI_SSID_3")
inject_str("WIFI_PASS_3")

# Node identity
inject_str("NODE_NAME", "FlightArc-Node")
inject_str("FIRMWARE_VERSION", "1.0.0")
