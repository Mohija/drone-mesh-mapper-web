#include "led_status.h"

// ESP32-S3 DevKitC has RGB Neopixel on GPIO48
// ESP32-C3 and ESP8266 use built-in LED on GPIO2
#ifdef ESP32
  #if defined(CONFIG_IDF_TARGET_ESP32S3)
    #define USE_NEOPIXEL 1
    #define NEOPIXEL_PIN 48
    // Brightness (0-255), keep low to avoid blinding
    #define NEO_BRIGHT 20
  #else
    #define USE_NEOPIXEL 0
  #endif
#else
  #define USE_NEOPIXEL 0
#endif

void LedStatus::begin() {
#if USE_NEOPIXEL
    pinMode(NEOPIXEL_PIN, OUTPUT);
    _off();
#else
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
#endif
    _state = LED_BOOT;
}

void LedStatus::setState(LedState state) {
    _state = state;
}

void LedStatus::flashDetection() {
    _flashActive = true;
    _flashStart = millis();
    // White flash
    _setColor(NEO_BRIGHT, NEO_BRIGHT, NEO_BRIGHT);
}

void LedStatus::_setColor(uint8_t r, uint8_t g, uint8_t b) {
#if USE_NEOPIXEL
    neopixelWrite(NEOPIXEL_PIN, r, g, b);
#else
    // Single-color LED: on if any color > 0
    digitalWrite(LED_PIN, (r || g || b) ? HIGH : LOW);
#endif
    _on = (r || g || b);
}

void LedStatus::_off() {
    _setColor(0, 0, 0);
}

void LedStatus::loop() {
    unsigned long now = millis();

    // Detection flash: 80ms white, then restore
    if (_flashActive) {
        if (now - _flashStart > 80) {
            _flashActive = false;
        } else {
            return;
        }
    }

    bool on = false;

    switch (_state) {
        case LED_BOOT:
            // Blue fast blink: 100ms on/off
            on = ((now / 100) % 2) == 0;
            if (on != _on) {
                if (on) _setColor(0, 0, NEO_BRIGHT);
                else _off();
            }
            return;

        case LED_NO_WIFI:
            // Yellow slow pulse: 300ms on / 1200ms off
            {
                unsigned long phase = now % 1500;
                on = (phase < 300);
                if (on != _on) {
                    if (on) _setColor(NEO_BRIGHT, NEO_BRIGHT / 2, 0);
                    else _off();
                }
            }
            return;

        case LED_NO_BACKEND:
            // Orange double blink: 2x 200ms on, then pause
            {
                unsigned long phase = (now / 200) % 10;
                on = (phase == 0 || phase == 2);
                if (on != _on) {
                    if (on) _setColor(NEO_BRIGHT, NEO_BRIGHT / 4, 0);
                    else _off();
                }
            }
            return;

        case LED_ONLINE:
            // Green solid
            if (!_on) _setColor(0, NEO_BRIGHT, 0);
            return;

        case LED_ERROR:
            // Red SOS: ···———··· every 3s
            {
                unsigned long phase = (now / 150) % 20;
                if (phase <= 4)
                    on = (phase % 2 == 0);
                else if (phase >= 6 && phase <= 10)
                    on = (phase == 6 || phase == 7 || phase == 8);
                else if (phase >= 12 && phase <= 16)
                    on = ((phase - 12) % 2 == 0);
                else
                    on = false;
                if (on != _on) {
                    if (on) _setColor(NEO_BRIGHT, 0, 0);
                    else _off();
                }
            }
            return;
    }
}
