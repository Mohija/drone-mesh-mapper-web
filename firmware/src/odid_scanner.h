#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"

// ODID size constants (must match opendroneid.h)
#define FLIGHTARC_ID_SIZE   20
#define FLIGHTARC_STR_SIZE  23

struct OdidDetection {
    // Basic ID
    char basic_id[FLIGHTARC_ID_SIZE + 1];
    uint8_t id_type;        // 0=None, 1=Serial, 2=CAA, 3=UTM, 4=SpecificSession

    // Location
    float lat;
    float lon;
    float alt;              // Altitude MSL (geodetic)
    float height_agl;       // Height above ground
    float speed;
    float heading;

    // System (Operator/Pilot position)
    float pilot_lat;
    float pilot_lon;

    // Operator ID
    char operator_id[FLIGHTARC_ID_SIZE + 1];

    // Self ID
    char self_id_desc[FLIGHTARC_STR_SIZE + 1];

    // Meta
    int rssi;
    char mac[18];
    unsigned long timestamp;
    bool valid;

    // Source tracking
    enum Source { SRC_WIFI_BEACON, SRC_WIFI_NAN, SRC_BLE } source;
};

class OdidScanner {
public:
    void begin();
    void loop();

    // Pause/resume promiscuous mode (needed when AP is active)
    void pauseWifiScan();
    void resumeWifiScan();
    bool isWifiScanPaused() const { return _wifiPaused; }

    // Get buffered detections and clear buffer
    int getDetections(OdidDetection* out, int maxCount);
    int getDetectionCount() const { return _count; }

#if HAS_BLE
    friend class OdidBleCallbacks;
#endif

private:
    OdidDetection _buffer[MAX_DETECTIONS];
    volatile int _count = 0;

    void _startPromiscuousMode();
    bool _wifiPaused = false;
    void _addOrUpdateDetection(const OdidDetection& det);

#if HAS_BLE
    void _startBleScan();
#endif

    // Promiscuous mode callback needs static access
    static OdidScanner* _instance;
    static void _promiscuousCallback(void* buf, int type);

#ifdef ESP32
    static void _promiscuousCallbackEsp32(void* buf, wifi_promiscuous_pkt_type_t type);
#endif
};
