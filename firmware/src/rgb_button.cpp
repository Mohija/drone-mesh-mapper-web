#include "rgb_button.h"

#if HAS_RGB_BUTTON

#include <esp_sleep.h>

void RgbButton::begin(bool fromDeepSleep) {
    pinMode(RGB_BTN_PIN, INPUT_PULLDOWN);
    pinMode(RGB_LED_R_PIN, OUTPUT);
    pinMode(RGB_LED_G_PIN, OUTPUT);
    pinMode(RGB_LED_B_PIN, OUTPUT);
    // Common-anode: drive HIGH = off.
    digitalWrite(RGB_LED_R_PIN, HIGH);
    digitalWrite(RGB_LED_G_PIN, HIGH);
    digitalWrite(RGB_LED_B_PIN, HIGH);
    _lastR = _lastG = _lastB = false;

    // Configure wake-up even if we're not sleeping yet; this way, when we
    // *do* enter deep sleep later, the setting is already in place.
    esp_sleep_enable_ext0_wakeup((gpio_num_t) RGB_BTN_PIN, 1);

    if (fromDeepSleep) {
        // Right after waking: user is likely still holding the button — ignore
        // it briefly so we don't immediately interpret the same press as a new
        // long-press and power back off.
        _ignoreUntilMs = millis() + RGB_BTN_WAKE_LOCKOUT_MS;
        Serial.println("[RGBBtn] Wake from deep sleep — button locked out for 3s");
    }
}

void RgbButton::loop() {
    if (_shutdownActive) return;

    unsigned long now = millis();
    int raw = digitalRead(RGB_BTN_PIN);
    bool pressedNow = (raw == HIGH);

    // Debounce: require RGB_BTN_DEBOUNCE_MS of stable state before acting.
    if (pressedNow != _lastPressed) {
        _lastEdgeMs = now;
        _lastPressed = pressedNow;
    }
    if ((now - _lastEdgeMs) < RGB_BTN_DEBOUNCE_MS) return;

    if (now < _ignoreUntilMs) {
        _pressed = false;
        return;
    }

    if (pressedNow && !_pressed) {
        _pressed = true;
        _pressStart = now;
        _hintShown = false;
    } else if (!pressedNow && _pressed) {
        _pressed = false;
        _hintShown = false;
    }

    if (_pressed) {
        unsigned long held = now - _pressStart;
        if (!_hintShown && held >= RGB_BTN_POWEROFF_HINT_MS) {
            _hintShown = true;
            // Hint: solid red to tell the user they're about to shut down.
            _writeColor(true, false, false);
        }
        if (held >= RGB_BTN_LONG_PRESS_MS) {
            _enterDeepSleep();
        }
    } else if (_hintShown) {
        // User let go in the hint window → cancel and restore status colour.
        _hintShown = false;
        _writeColor(_lastR, _lastG, _lastB);
    }
}

void RgbButton::setColor(bool r, bool g, bool b) {
    _lastR = r;
    _lastG = g;
    _lastB = b;
    if (_shutdownActive || _hintShown) return;
    _writeColor(r, g, b);
}

void RgbButton::_writeColor(bool r, bool g, bool b) {
    // Common-anode: LOW = LED on.
    digitalWrite(RGB_LED_R_PIN, r ? LOW : HIGH);
    digitalWrite(RGB_LED_G_PIN, g ? LOW : HIGH);
    digitalWrite(RGB_LED_B_PIN, b ? LOW : HIGH);
}

void RgbButton::_enterDeepSleep() {
    _shutdownActive = true;
    Serial.println("[RGBBtn] Long-press → deep sleep");

    // Brief white flash so the user sees the shutdown commit.
    _writeColor(true, true, true);
    delay(180);
    _writeColor(false, false, false);
    delay(80);
    _writeColor(true, true, true);
    delay(180);
    _writeColor(false, false, false);

    // Wake source stays configured from begin(). Sleep until the button goes
    // HIGH again — user lets go, presses, device powers back up.
    esp_deep_sleep_start();
}

#endif // HAS_RGB_BUTTON
