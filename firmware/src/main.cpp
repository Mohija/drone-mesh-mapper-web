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
#if HAS_GPS
#include "gps_module.h"
#endif
#if HAS_RGB_BUTTON
#include "rgb_button.h"
#include <esp_sleep.h>
#endif

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
#if HAS_GPS
GpsModule gps;
#endif
#if HAS_RGB_BUTTON
RgbButton rgbBtn;
#endif

unsigned long lastIngest = 0;
unsigned long lastHeartbeat = 0;
int detectionsSinceBoot = 0;
// Watchdog: how long we've been connected to WiFi without ever reaching the backend.
// If WiFi stays up but heartbeats never land, the backend URL is likely wrong/dead —
// a reboot re-resolves DNS and resets TLS/socket state.
unsigned long staReachableSinceMs = 0;

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
#if HAS_GPS
    Serial.println("GPS: enabled (ATGM336H on UART1)");
#endif
#if HAS_RGB_BUTTON
    Serial.println("RGB-Button: enabled (GPIO4 = power, GPIO5/6/7 = RGB)");
#endif
    Serial.println("================================");

#if HAS_RGB_BUTTON
    // RGB button before LED so LedStatus can route colours through it.
    bool fromDeepSleep = (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT0);
    rgbBtn.begin(fromDeepSleep);
#endif

    // 1. LED
    led.begin();
#if HAS_RGB_BUTTON
    led.attachRgbButton(&rgbBtn);
#endif
    led.setState(LED_BOOT);

#if HAS_GPS
    gps.begin();
#endif

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

#if HAS_RGB_BUTTON
    // Handle the button first; a long-press may call esp_deep_sleep_start()
    // and never return.
    rgbBtn.loop();
#endif

#if HAS_GPS
    gps.loop();
#endif

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
#if HAS_GPS
            // GPS fix overrides the portal-configured location so the receiver
            // follows its real position without manual calibration.
            if (gps.hasFix()) {
                nodeLat = (float) gps.latitude();
                nodeLon = (float) gps.longitude();
            }
#endif

            if (client.sendIngest(detections, count, nodeLat, nodeLon)) {
                detectionsSinceBoot += count;
                led.flashDetection();
            }
        }
    }

    // Track when WiFi became available — used by the watchdog below
    if (wifiMgr.isStaConnected() && staReachableSinceMs == 0) {
        staReachableSinceMs = now;
    } else if (!wifiMgr.isStaConnected()) {
        staReachableSinceMs = 0;
    }

    // ── Backend watchdog ───────────────────────────────────────
    // If WiFi has been up for longer than BACKEND_DEAD_REBOOT_MS without a single
    // successful request, the backend is unreachable (DNS, TLS, wrong URL, dead host).
    // Reboot so DNS/TLS/sockets are fully reinitialized — no manual intervention
    // needed. Gate on staReachableSinceMs so we never reboot during boot before
    // WiFi even had a chance to come up.
    if (wifiMgr.isStaConnected() && staReachableSinceMs > 0
        && (now - staReachableSinceMs > BACKEND_DEAD_REBOOT_MS)
        && client.getLastSuccessMs() == 0) {
        Serial.println("[Watchdog] Backend unreachable > 10 min since boot — rebooting");
        delay(500);
        ESP.restart();
    }
    // Or: we had contact once, but it broke down for > BACKEND_DEAD_REBOOT_MS
    if (wifiMgr.isStaConnected() && client.getLastSuccessMs() > 0
        && (now - client.getLastSuccessMs() > BACKEND_DEAD_REBOOT_MS)) {
        Serial.println("[Watchdog] No successful backend contact for 10 min — rebooting");
        delay(500);
        ESP.restart();
    }
    // Retry-count based reboot (catches rapid-fire failures before 10 min elapse)
    if (client.getRetryCount() >= BACKEND_RETRY_REBOOT) {
        Serial.printf("[Watchdog] %d consecutive backend failures — rebooting\n",
                      client.getRetryCount());
        delay(500);
        ESP.restart();
    }

    // Send heartbeat every HEARTBEAT_INTERVAL_MS
    if (wifiMgr.isStaConnected() && (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)) {
        lastHeartbeat = now;

        // Pre-flight health probe so a dead backend surfaces on the LED immediately
        // instead of waiting for the 10s heartbeat POST timeout.
        client.checkHealth(BACKEND_HEALTH_PROBE_MS);

        float lat = portal.hasLocation() ? portal.getLatitude() : 0;
        float lon = portal.hasLocation() ? portal.getLongitude() : 0;
        float acc = portal.hasLocation() ? portal.getAccuracy() : 0;
#if HAS_GPS
        if (gps.hasFix()) {
            lat = (float) gps.latitude();
            lon = (float) gps.longitude();
            // Approximate horizontal accuracy in metres from HDOP (1 HDOP ≈ 3m
            // with a decent module). Clamp to something sane if HDOP is huge.
            float h = gps.hdop();
            acc = (h > 0 && h < 20.0f) ? h * 3.0f : 30.0f;
        }
#endif

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
