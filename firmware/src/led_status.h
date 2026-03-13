#pragma once

#include <Arduino.h>
#include "config.h"

enum LedState {
    LED_BOOT,           // Fast blink (100ms) - no WiFi
    LED_WIFI_OK,        // Slow blink (500ms) - WiFi OK, no backend
    LED_ONLINE,         // Solid on - heartbeat OK
    LED_DETECTION,      // Brief flash off (50ms) - detection received
    LED_ERROR           // Double blink every 2s - error
};

class LedStatus {
public:
    void begin();
    void setState(LedState state);
    void flashDetection();
    void loop();

private:
    LedState _state = LED_BOOT;
    unsigned long _lastToggle = 0;
    bool _ledOn = false;
    bool _flashActive = false;
    unsigned long _flashStart = 0;
    int _blinkPhase = 0;
};
