#pragma once

#include <Arduino.h>
#include "config.h"

#if HAS_GPS

/**
 * Minimal NMEA parser for the ATGM336H module.
 *
 * Only interested in the position/fix fields — we parse $xxGGA (fix + altitude
 * + sat count) and $xxRMC (fix + speed + course). Sentences are validated via
 * their trailing *XX checksum. No external library so the firmware footprint
 * stays small.
 *
 * Usage:
 *   gps.begin();          // setup once in setup()
 *   gps.loop();           // call every iteration of loop()
 *   if (gps.hasFix()) {
 *       double lat = gps.latitude();
 *       double lon = gps.longitude();
 *   }
 */
class GpsModule {
public:
    void begin();
    void loop();

    bool hasFix() const { return _hasFix; }
    /** Seconds since the last NMEA fix. Use to decide whether data is fresh. */
    unsigned long secondsSinceFix() const;
    /** Same as secondsSinceFix() but returns -1 when no fix has ever been
     *  seen since boot — useful as a diagnostic field in the heartbeat. */
    long lastFixAgeSeconds() const;

    /** Number of valid (checksum-ok) NMEA sentences parsed since boot. Any
     *  non-zero value proves the module is wired correctly and talking over
     *  UART, even if it can't get a fix. */
    uint32_t messagesParsed() const { return _messagesParsed; }
    /** Seconds since the last valid NMEA sentence arrived. -1 if none yet. */
    long lastMessageAgeSeconds() const;
    /** Satellites currently visible in the sky (from GSV). Not the same as
     *  `satellites()` which counts sats used in the last fix. */
    int satellitesInView() const { return _satsInView; }

    double latitude() const { return _lat; }
    double longitude() const { return _lon; }
    /** Altitude above mean sea level in metres. 0 if unknown. */
    float altitude() const { return _alt; }
    /** Horizontal dilution of precision (HDOP). 99.0 = unknown. */
    float hdop() const { return _hdop; }
    /** Ground speed in km/h. 0 when stationary or unknown. */
    float speedKmh() const { return _speedKmh; }
    /** Number of satellites used in the fix. */
    int satellites() const { return _sats; }

private:
    bool _started = false;
    bool _hasFix = false;
    unsigned long _lastFixMs = 0;
    unsigned long _lastMessageMs = 0;
    uint32_t _messagesParsed = 0;
    double _lat = 0.0;
    double _lon = 0.0;
    float _alt = 0.0f;
    float _hdop = 99.0f;
    float _speedKmh = 0.0f;
    int _sats = 0;
    int _satsInView = 0;

    char _buf[96];
    uint8_t _bufLen = 0;

    void _handleSentence(char* line);
    void _handleGGA(char* body);
    void _handleRMC(char* body);
    void _handleGSV(char* body);
    static bool _verifyChecksum(const char* line);
    static double _nmeaCoord(const char* value, const char* hemi);
};

#endif // HAS_GPS
