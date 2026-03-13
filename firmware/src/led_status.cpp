#include "led_status.h"

void LedStatus::begin() {
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    _state = LED_BOOT;
}

void LedStatus::setState(LedState state) {
    _state = state;
}

void LedStatus::flashDetection() {
    _flashActive = true;
    _flashStart = millis();
    digitalWrite(LED_PIN, LOW); // LED off briefly
}

void LedStatus::loop() {
    unsigned long now = millis();

    // Handle detection flash (brief off)
    if (_flashActive) {
        if (now - _flashStart > 50) {
            _flashActive = false;
            // Restore previous state
        } else {
            return; // Keep LED off during flash
        }
    }

    switch (_state) {
        case LED_BOOT:
            // Fast blink: 100ms on/off
            if (now - _lastToggle > 100) {
                _lastToggle = now;
                _ledOn = !_ledOn;
                digitalWrite(LED_PIN, _ledOn ? HIGH : LOW);
            }
            break;

        case LED_AP_ACTIVE:
            // Triple blink every 2s (AP hotspot active)
            {
                unsigned long phase = (now / 200) % 10;
                bool on = (phase == 0 || phase == 2 || phase == 4);
                if (on != _ledOn) {
                    _ledOn = on;
                    digitalWrite(LED_PIN, _ledOn ? HIGH : LOW);
                }
            }
            break;

        case LED_WIFI_OK:
            // Slow blink: 500ms on/off
            if (now - _lastToggle > 500) {
                _lastToggle = now;
                _ledOn = !_ledOn;
                digitalWrite(LED_PIN, _ledOn ? HIGH : LOW);
            }
            break;

        case LED_ONLINE:
            // Solid on
            if (!_ledOn) {
                _ledOn = true;
                digitalWrite(LED_PIN, HIGH);
            }
            break;

        case LED_DETECTION:
            // Same as online (solid), flash handled above
            if (!_ledOn) {
                _ledOn = true;
                digitalWrite(LED_PIN, HIGH);
            }
            break;

        case LED_ERROR:
            // Double blink every 2s
            {
                unsigned long phase = (now / 200) % 10;
                bool on = (phase == 0 || phase == 2);
                if (on != _ledOn) {
                    _ledOn = on;
                    digitalWrite(LED_PIN, _ledOn ? HIGH : LOW);
                }
            }
            break;
    }
}
