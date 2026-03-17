/**
 * FlightArc Hardware Receiver Firmware
 *
 * Detects drones via Open Drone ID (WiFi Beacon + BLE on ESP32)
 * and reports them to the FlightArc backend.
 *
 * Supports: ESP32-S3, ESP32-C3, ESP8266 (Light variant)
 */

#include <Arduino.h>
#include "config.h"
#include "wifi_manager.h"
#include "web_server.h"
#include "odid_scanner.h"
#include "http_client.h"
#include "led_status.h"

#ifdef ESP32
#include <esp_task_wdt.h>
#if HAS_BLE
#include <NimBLEDevice.h>
#endif
#endif

WiFiManager wifiMgr;
CaptivePortal portal;
OdidScanner scanner;
FlightArcClient client;
LedStatus led;

unsigned long lastIngest = 0;
unsigned long lastHeartbeat = 0;
int detectionsSinceBoot = 0;

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("================================");
    Serial.printf("FlightArc Receiver v%s\n", FIRMWARE_VERSION);
    Serial.printf("Hardware: %s\n", HARDWARE_TYPE);
#if HAS_BLE
    Serial.println("BLE: enabled");
#else
    Serial.println("BLE: disabled");
#endif
#if HAS_TLS
    Serial.println("TLS: enabled");
#else
    Serial.println("TLS: disabled");
#endif
    Serial.println("================================");

    // 1. LED
    led.begin();
    led.setState(LED_BOOT);

    // 2. WiFi (SoftAP provisioning: AP starts only when STA fails)
    String apSsid = String(AP_SSID_PREFIX) + String(NODE_NAME).substring(0, 8);
    const char* ssids[] = { WIFI_SSID, WIFI_SSID_2, WIFI_SSID_3 };
    const char* passes[] = { WIFI_PASS, WIFI_PASS_2, WIFI_PASS_3 };
    wifiMgr.begin(apSsid.c_str(), ssids, passes, MAX_WIFI_NETWORKS);

    // 3. Captive Portal web server
    portal.begin(&wifiMgr, &client, &scanner);

    // 4. ODID Scanner
    scanner.begin();

    // 5. HTTP Client
    client.begin(BACKEND_URL, API_KEY);

    Serial.println("[Main] Setup complete");
}

void loop() {
    unsigned long now = millis();

    // Captive portal FIRST — DNS must respond fast for captive portal detection
    portal.loop();

    // WiFi manager (reconnect logic)
    wifiMgr.loop();

    // LED state based on connectivity
    if (!wifiMgr.isStaConnected()) {
        if (millis() - lastIngest < 15000 && !wifiMgr.isApActive()) {
            // First 15s after boot: still searching
            led.setState(LED_BOOT);
        } else {
            // No WiFi for a while — slow pulse, AP should be open
            led.setState(LED_NO_WIFI);
        }
    } else if (!client.isBackendReachable()) {
        led.setState(LED_NO_BACKEND);
    } else {
        led.setState(LED_ONLINE);
    }

    // ODID scanner: only active when STA connected and AP off
    // Promiscuous mode blocks AP beacon transmission
    if (wifiMgr.isStaConnected() && !wifiMgr.isApActive()) {
        if (scanner.isWifiScanPaused()) {
            scanner.resumeWifiScan();
        }
    } else if (!scanner.isWifiScanPaused()) {
        scanner.pauseWifiScan();
    }

    // Scanner loop (mostly event-driven, BLE runs independently)
    scanner.loop();

    // Event-based ingest: send immediately when new detections arrive
    // (min INGEST_MIN_INTERVAL_MS between sends to prevent HTTP flooding)
    if (wifiMgr.isStaConnected() && scanner.getDetectionCount() > 0
        && (now - lastIngest >= INGEST_MIN_INTERVAL_MS)) {
        lastIngest = now;

        static OdidDetection detections[MAX_DETECTIONS];
        int count = scanner.getDetections(detections, MAX_DETECTIONS);

        if (count > 0) {
            float nodeLat = portal.hasLocation() ? portal.getLatitude() : 0;
            float nodeLon = portal.hasLocation() ? portal.getLongitude() : 0;

            if (client.sendIngest(detections, count, nodeLat, nodeLon)) {
                detectionsSinceBoot += count;
                led.flashDetection();
            }
        }
    }

    // Send heartbeat every HEARTBEAT_INTERVAL_MS
    if (wifiMgr.isStaConnected() && (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)) {
        lastHeartbeat = now;

        float lat = portal.hasLocation() ? portal.getLatitude() : 0;
        float lon = portal.hasLocation() ? portal.getLongitude() : 0;
        float acc = portal.hasLocation() ? portal.getAccuracy() : 0;

        OtaInfo ota = client.sendHeartbeat(
            FIRMWARE_VERSION,
            HARDWARE_TYPE,
            wifiMgr.getConnectedSsid().c_str(),
            wifiMgr.getRssi(),
            wifiMgr.getChannel(),
            ESP.getFreeHeap(),
            now / 1000,
            detectionsSinceBoot,
            wifiMgr.isApActive(),
            lat, lon, acc,
            wifiMgr.getStaIp().c_str()
        );

        // OTA update available?
        if (ota.available && ota.url.length() > 0) {
            Serial.printf("[Main] OTA update available: %s (%d bytes)\n",
                          ota.version.c_str(), ota.size);

            // Free as much heap as possible before OTA download
            scanner.pauseWifiScan();
#if HAS_BLE
            // Safely stop BLE task + deinit (avoids heap corruption on ESP32-S3)
            scanner.stopBleForOta();
            Serial.printf("[Main] BLE stopped for OTA. Free heap: %d\n", ESP.getFreeHeap());
#endif
            led.setState(LED_BOOT);  // Blink during OTA

            // Set a watchdog: if OTA hangs >60s, reboot
            esp_task_wdt_init(60, true);
            esp_task_wdt_add(NULL);

            if (client.performOtaUpdate(ota.url)) {
                // Won't reach here — ESP reboots on success
            } else {
                Serial.println("[Main] OTA failed, rebooting to restore BLE...");
                delay(500);
                ESP.restart();  // Reboot to re-init BLE cleanly
            }
        }
    }

    // LED update
    led.loop();

    // Small yield for background tasks
    delay(1);
}
