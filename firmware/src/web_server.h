#pragma once

#include <Arduino.h>
#include "wifi_manager.h"
#include "http_client.h"
#include "odid_scanner.h"

class CaptivePortal {
public:
    void begin(WiFiManager* wifi, FlightArcClient* client, OdidScanner* scanner);
    void loop();

    // Location from browser geolocation
    float getLatitude() const { return _lat; }
    float getLongitude() const { return _lon; }
    float getAccuracy() const { return _accuracy; }
    bool hasLocation() const { return _hasLocation; }

private:
    WiFiManager* _wifi = nullptr;
    FlightArcClient* _client = nullptr;
    OdidScanner* _scanner = nullptr;

    float _lat = 0;
    float _lon = 0;
    float _accuracy = 0;
    bool _hasLocation = false;
};
