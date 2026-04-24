#pragma once

// ─── Build-time configuration (injected via PlatformIO build flags) ─────

#ifndef BACKEND_URL
#define BACKEND_URL "http://localhost:3020"
#endif

#ifndef API_KEY
#define API_KEY ""
#endif

#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASS
#define WIFI_PASS ""
#endif

#ifndef WIFI_SSID_2
#define WIFI_SSID_2 ""
#endif
#ifndef WIFI_PASS_2
#define WIFI_PASS_2 ""
#endif

#ifndef WIFI_SSID_3
#define WIFI_SSID_3 ""
#endif
#ifndef WIFI_PASS_3
#define WIFI_PASS_3 ""
#endif

#define MAX_WIFI_NETWORKS 3

#ifndef NODE_NAME
#define NODE_NAME "FlightArc-Node"
#endif

#ifndef NODE_ID
#define NODE_ID ""
#endif

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.5.0"
#endif

#ifndef HARDWARE_TYPE
#define HARDWARE_TYPE "unknown"
#endif

#ifndef HAS_BLE
#define HAS_BLE 0
#endif

#ifndef HAS_TLS
#define HAS_TLS 0
#endif

// ─── Runtime constants ──────────────────────────────────────

#define INGEST_MIN_INTERVAL_MS  100     // Min 100ms between ingest sends (event-based)
#define INGEST_MAX_INTERVAL_MS  2000    // Max 2s — heartbeat-like fallback (unused if no detections)
#define HEARTBEAT_INTERVAL_MS   30000   // Send heartbeat every 30 seconds
#define WIFI_RECONNECT_MS       10000   // Retry WiFi every 10 seconds
#define WIFI_SCAN_INTERVAL_MS   60000   // Scan for networks every 60 seconds
#define WIFI_AP_TIMEOUT_MS      8000    // Start AP after 8s without STA connection
#define WIFI_AP_SHUTDOWN_DELAY  5000    // Min grace period: wait 5s after STA connects before checking clients
#define WIFI_AP_MAX_LINGER_MS   20000   // Max 20s AP alive after STA connected (even with clients)
#define WIFI_AP_STA_RETRY_MS    30000   // While AP active: retry STA connection every 30s (stops AP-dead-end after signal loss)
#define BACKEND_HEALTH_PROBE_MS 3000    // Timeout for GET /health pre-heartbeat probe
#define BACKEND_DEAD_REBOOT_MS  600000  // Reboot if no successful heartbeat for 10 min despite WiFi
#define BACKEND_RETRY_REBOOT    20      // Reboot after 20 consecutive failed heartbeats
#define MAX_DETECTIONS          50      // Ring buffer size
#define AP_SSID_PREFIX          "FlightArc-"
#define WEB_SERVER_PORT         80
#define LED_PIN                 2       // Built-in LED (GPIO2 on most boards)

// ODID constants (ODID_ID_SIZE, ODID_STR_SIZE, ODID_MESSAGE_SIZE from opendroneid.h)
#define ODID_BLE_UUID           0xFFFA
