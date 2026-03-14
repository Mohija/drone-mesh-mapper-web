#pragma once

#include <Arduino.h>
#include "odid_scanner.h"

class FlightArcClient {
public:
    void begin(const char* backendUrl, const char* apiKey);

    // Send buffered detections to backend
    bool sendIngest(OdidDetection* detections, int count, float nodeLat, float nodeLon);

    // Send heartbeat status
    bool sendHeartbeat(const char* fwVersion, const char* hwType,
                       const char* wifiSsid, int wifiRssi, int wifiChannel,
                       int freeHeap, int uptimeSeconds,
                       int detectionsSinceBoot, bool apActive,
                       float lat, float lon, float accuracy);

    bool isBackendReachable() const { return _lastSuccess; }
    int getRetryCount() const { return _retryCount; }
    int getLastHttpCode() const { return _lastHttpCode; }

private:
    String _backendUrl;
    String _apiKey;
    bool _lastSuccess = false;
    int _retryCount = 0;
    int _lastHttpCode = 0;

    bool _httpPost(const String& path, const String& body);
};
