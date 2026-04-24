#pragma once

#include <Arduino.h>
#include "odid_scanner.h"

struct OtaInfo {
    bool available = false;
    String url;
    String sha256;
    int size = 0;
    String version;
};

/** Optional GPS telemetry bundled into each heartbeat. Always sent on the
 *  esp32-s3-gps build so the backend can show module status even when no
 *  fix has been acquired yet. Nullptr skips the fields. */
struct GpsTelemetry {
    bool present = false;       // firmware was built with GPS support
    bool hasFix = false;        // current NMEA fix valid
    int satellites = 0;         // satellites used in the last fix (GGA field 7)
    float hdop = 0.0f;          // horizontal dilution of precision
    long lastFixAgeSeconds = -1; // -1 = never had a fix since boot
    uint32_t messagesParsed = 0; // checksum-valid NMEA sentences since boot
    long lastMessageAgeSeconds = -1; // -1 = no NMEA ever received
    int satellitesInView = 0;    // sats currently visible (from GSV)
};

class FlightArcClient {
public:
    void begin(const char* backendUrl, const char* apiKey);

    // Send buffered detections to backend
    bool sendIngest(OdidDetection* detections, int count, float nodeLat, float nodeLon);

    // Send heartbeat status — returns OTA info from response
    OtaInfo sendHeartbeat(const char* fwVersion, const char* hwType,
                       const char* wifiSsid, int wifiRssi, int wifiChannel,
                       int freeHeap, int uptimeSeconds,
                       int detectionsSinceBoot, bool apActive,
                       float lat, float lon, float accuracy,
                       const char* wifiIp = "",
                       const GpsTelemetry* gps = nullptr);

    // Perform OTA firmware update (ESP32 only)
    bool performOtaUpdate(const String& otaUrl);

    // Cheap GET /health probe — returns true if backend answered 2xx within timeout
    bool checkHealth(unsigned long timeoutMs = 3000);

    bool isBackendReachable() const { return _lastSuccess; }
    int getRetryCount() const { return _retryCount; }
    int getLastHttpCode() const { return _lastHttpCode; }
    // millis() of last successful POST/probe — 0 if never succeeded since boot.
    // Callers use this for watchdog-style reboot decisions.
    unsigned long getLastSuccessMs() const { return _lastSuccessMs; }

private:
    String _backendUrl;
    String _apiKey;
    bool _lastSuccess = false;
    int _retryCount = 0;
    int _lastHttpCode = 0;
    unsigned long _lastSuccessMs = 0;

    bool _httpPost(const String& path, const String& body);
    String _httpPostWithResponse(const String& path, const String& body);
};
