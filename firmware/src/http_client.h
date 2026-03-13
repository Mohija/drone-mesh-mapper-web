#pragma once

#include <Arduino.h>
#include "odid_scanner.h"

class FlightArcClient {
public:
    void begin(const char* backendUrl, const char* apiKey);

    // Send buffered detections to backend
    bool sendIngest(OdidDetection* detections, int count, float nodeLat, float nodeLon);

    // Send heartbeat status
    bool sendHeartbeat(const char* fwVersion, const char* wifiSsid,
                       int wifiRssi, int freeHeap, int uptimeSeconds,
                       float lat, float lon, float accuracy);

    bool isBackendReachable() const { return _lastSuccess; }

private:
    String _backendUrl;
    String _apiKey;
    bool _lastSuccess = false;
    int _retryCount = 0;

    bool _httpPost(const String& path, const String& body);
};
