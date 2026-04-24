#pragma once

#include <Arduino.h>
#include "config.h"

#if HAS_RGB_BUTTON

/**
 * RGB push-button driver.
 *
 * One physical switch (GPIO4, INPUT_PULLDOWN, pressed = HIGH) plus three
 * LED cathodes (GPIO5/6/7, common-anode — LOW = on). The same button is
 * both the power switch (long-press → deep sleep; button-rising wakes)
 * and the status LED.
 *
 * Long-press semantics:
 *   - Press for <800ms  → no action (accidental tap)
 *   - Hold 800–1999ms   → red LED lights as "shut-down hint"
 *   - Hold ≥2000ms      → brief white flash then esp_deep_sleep_start()
 *
 * Wake-up is configured via ext0 on GPIO4 == HIGH: as soon as the user
 * releases and presses again, the ESP boots normally.
 */
class RgbButton {
public:
    void begin(bool fromDeepSleep);
    void loop();

    /** Drive the RGB LEDs (0/1 per channel). Ignored while shutdown animation
     *  is running so the animation isn't stomped on by status updates. */
    void setColor(bool r, bool g, bool b);
    void off() { setColor(false, false, false); }

    /** Test whether the driver is currently animating a shutdown → the caller
     *  should skip its own LED updates. */
    bool isShuttingDown() const { return _shutdownActive; }

private:
    bool _pressed = false;
    bool _lastPressed = false;
    unsigned long _pressStart = 0;
    unsigned long _lastEdgeMs = 0;
    unsigned long _ignoreUntilMs = 0;

    bool _shutdownActive = false;
    bool _hintShown = false;

    bool _lastR = false;
    bool _lastG = false;
    bool _lastB = false;

    void _enterDeepSleep();
    void _writeColor(bool r, bool g, bool b);
};

#endif // HAS_RGB_BUTTON
