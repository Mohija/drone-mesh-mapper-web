#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"

struct OdidDetection {
    char basic_id[32];
    float lat;
    float lon;
    float alt;
    float speed;
    float heading;
    int rssi;
    char mac[18];
    unsigned long timestamp;
    bool valid;
};

class OdidScanner {
public:
    void begin();
    void loop();

    // Get buffered detections and clear buffer
    int getDetections(OdidDetection* out, int maxCount);
    int getDetectionCount() const { return _count; }

private:
    OdidDetection _buffer[MAX_DETECTIONS];
    volatile int _count = 0;

    void _startPromiscuousMode();
    void _addDetection(const OdidDetection& det);

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
