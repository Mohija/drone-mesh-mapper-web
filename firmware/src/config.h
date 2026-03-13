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

#ifndef NODE_NAME
#define NODE_NAME "FlightArc-Node"
#endif

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.0.0"
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

#define INGEST_INTERVAL_MS      2000    // Send detections every 2 seconds
#define HEARTBEAT_INTERVAL_MS   30000   // Send heartbeat every 30 seconds
#define WIFI_RECONNECT_MS       10000   // Retry WiFi every 10 seconds
#define WIFI_SCAN_INTERVAL_MS   60000   // Scan for networks every 60 seconds
#define MAX_DETECTIONS          50      // Ring buffer size
#define AP_SSID_PREFIX          "FlightArc-"
#define WEB_SERVER_PORT         80
#define LED_PIN                 2       // Built-in LED (GPIO2 on most boards)

// ODID constants
#define ODID_OUI_0              0xFA
#define ODID_OUI_1              0x0B
#define ODID_OUI_2              0xBC
#define ODID_BLE_UUID           0xFFFA
