#pragma once

#include <Arduino.h>
#include "config.h"

/**
 * LED Status — visual feedback.
 *
 * ESP32-S3 DevKitC: RGB Neopixel on GPIO48 (neopixelWrite)
 * ESP32-C3 / ESP8266: Built-in LED on GPIO2 (digitalWrite)
 *
 * States:
 *   LED_BOOT        Blue fast blink       — Booting, WLAN-Suche
 *   LED_NO_WIFI     Yellow slow pulse     — Kein WLAN, Hotspot offen
 *   LED_NO_BACKEND  Orange double blink   — WLAN ok, Backend nicht erreichbar
 *   LED_ONLINE      Green solid           — Alles ok
 *   LED_ERROR       Red SOS               — Schwerer Fehler
 *
 * Detection flash: Brief white flash on any state.
 */

enum LedState {
    LED_BOOT,
    LED_NO_WIFI,
    LED_NO_BACKEND,
    LED_ONLINE,
    LED_ERROR
};

#if HAS_RGB_BUTTON
class RgbButton;   // fwd
#endif

class LedStatus {
public:
    void begin();
    void setState(LedState state);
    void flashDetection();
    void loop();

#if HAS_RGB_BUTTON
    /** When the firmware is running on the RGB-taster variant, route every
     *  colour update through the button driver so its shutdown animation
     *  isn't overwritten by status updates. */
    void attachRgbButton(RgbButton* btn) { _rgbBtn = btn; }
#endif

private:
    LedState _state = LED_BOOT;
    bool _on = false;
    bool _flashActive = false;
    unsigned long _flashStart = 0;
#if HAS_RGB_BUTTON
    RgbButton* _rgbBtn = nullptr;
#endif

    void _setColor(uint8_t r, uint8_t g, uint8_t b);
    void _off();
};
