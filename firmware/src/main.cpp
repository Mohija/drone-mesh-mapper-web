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

    // WiFi manager (reconnect logic)
    wifiMgr.loop();

    // Captive portal
    portal.loop();

    // LED state based on connectivity
    if (!wifiMgr.isStaConnected()) {
        if (wifiMgr.isApActive()) {
            led.setState(LED_AP_ACTIVE);  // AP mode — waiting for provisioning
        } else {
            led.setState(LED_BOOT);       // Trying to connect
        }
    } else if (!client.isBackendReachable()) {
        led.setState(LED_WIFI_OK);
    } else {
        led.setState(LED_ONLINE);
    }

    // Scanner loop (mostly event-driven)
    scanner.loop();

    // Send detections every INGEST_INTERVAL_MS
    if (wifiMgr.isStaConnected() && (now - lastIngest >= INGEST_INTERVAL_MS)) {
        lastIngest = now;

        OdidDetection detections[MAX_DETECTIONS];
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

        client.sendHeartbeat(
            FIRMWARE_VERSION,
            wifiMgr.getConnectedSsid().c_str(),
            wifiMgr.getRssi(),
            ESP.getFreeHeap(),
            now / 1000,
            lat, lon, acc
        );
    }

    // LED update
    led.loop();

    // Small yield for background tasks
    delay(1);
}
