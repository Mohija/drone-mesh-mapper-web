#include "gps_module.h"

#if HAS_GPS

#include <HardwareSerial.h>
#include <cstdlib>
#include <cstring>

// UART1 on ESP32-S3 — UART0 is the USB-serial debug console.
static HardwareSerial gpsSerial(1);

void GpsModule::begin() {
    gpsSerial.begin(GPS_UART_BAUD, SERIAL_8N1, GPS_UART_RX, GPS_UART_TX);
    _started = true;
    _bufLen = 0;
    Serial.printf("[GPS] UART1 rx=%d tx=%d @ %d baud\n",
                  GPS_UART_RX, GPS_UART_TX, GPS_UART_BAUD);
}

void GpsModule::loop() {
    if (!_started) return;

    while (gpsSerial.available()) {
        char c = (char) gpsSerial.read();
        if (c == '\r') continue;
        if (c == '\n') {
            if (_bufLen > 0) {
                _buf[_bufLen] = '\0';
                _handleSentence(_buf);
            }
            _bufLen = 0;
            continue;
        }
        if (_bufLen < sizeof(_buf) - 1) {
            _buf[_bufLen++] = c;
        } else {
            // Overflow — reset and keep reading; the module occasionally
            // prints non-NMEA noise that we discard.
            _bufLen = 0;
        }
    }
}

unsigned long GpsModule::secondsSinceFix() const {
    if (_lastFixMs == 0) return ULONG_MAX / 1000;
    return (millis() - _lastFixMs) / 1000;
}

long GpsModule::lastFixAgeSeconds() const {
    if (_lastFixMs == 0) return -1;
    return (long)((millis() - _lastFixMs) / 1000);
}

long GpsModule::lastMessageAgeSeconds() const {
    if (_lastMessageMs == 0) return -1;
    return (long)((millis() - _lastMessageMs) / 1000);
}

void GpsModule::_handleSentence(char* line) {
    if (line[0] != '$') return;
    if (!_verifyChecksum(line)) return;

    // Activity heartbeat: a passing checksum proves the module is alive on
    // the UART line even if we don't recognise the sentence type.
    _lastMessageMs = millis();
    _messagesParsed++;

    // Drop the checksum suffix so strtok_r can tokenise cleanly.
    char* star = strchr(line, '*');
    if (star) *star = '\0';

    // Talker ID is chars 1–2, sentence type 3–5 (e.g. "GNGGA", "GPRMC").
    if (strlen(line) < 6) return;
    const char* type = line + 3;

    if (strncmp(type, "GGA", 3) == 0) {
        _handleGGA(line + 7);
    } else if (strncmp(type, "RMC", 3) == 0) {
        _handleRMC(line + 7);
    } else if (strncmp(type, "GSV", 3) == 0) {
        _handleGSV(line + 7);
    }
}

// $xxGGA,time,lat,N/S,lon,E/W,fixQuality,sats,hdop,alt,M,geoid,M,...
void GpsModule::_handleGGA(char* body) {
    char* save = nullptr;
    char* tokens[12] = { nullptr };
    int i = 0;
    for (char* tok = strtok_r(body, ",", &save); tok && i < 12; tok = strtok_r(nullptr, ",", &save)) {
        tokens[i++] = tok;
    }
    // time(0) lat(1) N/S(2) lon(3) E/W(4) fix(5) sats(6) hdop(7) alt(8) unit(9)
    if (i < 10) return;
    int fix = tokens[5] ? atoi(tokens[5]) : 0;
    if (fix <= 0) {
        _hasFix = false;
        return;
    }
    _hasFix = true;
    _lastFixMs = millis();
    _lat = _nmeaCoord(tokens[1], tokens[2]);
    _lon = _nmeaCoord(tokens[3], tokens[4]);
    _sats = tokens[6] ? atoi(tokens[6]) : 0;
    _hdop = tokens[7] ? (float) atof(tokens[7]) : 99.0f;
    _alt = tokens[8] ? (float) atof(tokens[8]) : 0.0f;
}

// $xxRMC,time,status(A/V),lat,N/S,lon,E/W,speedKnots,course,date,...
void GpsModule::_handleRMC(char* body) {
    char* save = nullptr;
    char* tokens[12] = { nullptr };
    int i = 0;
    for (char* tok = strtok_r(body, ",", &save); tok && i < 12; tok = strtok_r(nullptr, ",", &save)) {
        tokens[i++] = tok;
    }
    if (i < 8) return;
    bool valid = tokens[1] && tokens[1][0] == 'A';
    if (!valid) return;
    float knots = tokens[6] ? (float) atof(tokens[6]) : 0.0f;
    _speedKmh = knots * 1.852f;
    // RMC also carries lat/lon but GGA already updated them — keep GGA as the
    // authority since it also gives altitude + sats.
}

// $xxGSV,totalMsgs,msgNum,satsInView,[sv1,elev,az,cno,...]*CC
// We only need the third field — the rest describes individual satellites.
// ATGM336H sends multiple talker-IDs (GP/GL/BD); we take the max across
// them so the total reflects all constellations the chip is tracking.
void GpsModule::_handleGSV(char* body) {
    char* save = nullptr;
    char* tokens[4] = { nullptr };
    int i = 0;
    for (char* tok = strtok_r(body, ",", &save); tok && i < 4; tok = strtok_r(nullptr, ",", &save)) {
        tokens[i++] = tok;
    }
    if (i < 3) return;
    int sats = tokens[2] ? atoi(tokens[2]) : 0;
    // First GSV in a burst: reset the view count; subsequent talkers during
    // the same 1s NMEA cycle accumulate via max(). Cheap approximation —
    // using "max seen in last 2s" so the counter doesn't zero out between
    // bursts.
    if (sats > _satsInView || (millis() - _lastMessageMs) > 2000) {
        _satsInView = sats;
    }
}

bool GpsModule::_verifyChecksum(const char* line) {
    const char* star = strchr(line, '*');
    if (!star || strlen(star) < 3) return false;
    uint8_t calc = 0;
    for (const char* p = line + 1; p < star; ++p) calc ^= (uint8_t) *p;
    auto hex = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
        if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
        return -1;
    };
    int hi = hex(star[1]);
    int lo = hex(star[2]);
    if (hi < 0 || lo < 0) return false;
    return ((hi << 4) | lo) == calc;
}

double GpsModule::_nmeaCoord(const char* value, const char* hemi) {
    if (!value || !hemi || value[0] == '\0') return 0.0;
    // NMEA ddmm.mmmm / dddmm.mmmm — locate the dot, back two digits for minutes.
    const char* dot = strchr(value, '.');
    if (!dot) return 0.0;
    int mmStart = (int)(dot - value) - 2;
    if (mmStart < 0) return 0.0;
    char degStr[8] = { 0 };
    strncpy(degStr, value, mmStart);
    double degrees = atof(degStr);
    double minutes = atof(value + mmStart);
    double result = degrees + minutes / 60.0;
    if (hemi[0] == 'S' || hemi[0] == 'W') result = -result;
    return result;
}

#endif // HAS_GPS
