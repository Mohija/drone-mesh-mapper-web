#include "odid_scanner.h"

#ifdef ESP32
  #include "esp_wifi.h"
  #if HAS_BLE
    #include <NimBLEDevice.h>
  #endif
#else
  extern "C" {
    #include "user_interface.h"
  }
#endif

OdidScanner* OdidScanner::_instance = nullptr;

void OdidScanner::begin() {
    _instance = this;
    _count = 0;
    _startPromiscuousMode();

#if HAS_BLE
    _startBleScan();
#endif

    Serial.println("[Scanner] ODID scanner started");
#if HAS_BLE
    Serial.println("[Scanner] BLE scanning enabled");
#else
    Serial.println("[Scanner] BLE not available, WiFi beacon only");
#endif
}

void OdidScanner::loop() {
    // BLE scan is continuous via NimBLE callback, no loop needed
    // Promiscuous mode is event-driven
}

int OdidScanner::getDetections(OdidDetection* out, int maxCount) {
    int copied = ((int)_count < maxCount) ? (int)_count : maxCount;
    if (copied > 0) {
        memcpy(out, _buffer, sizeof(OdidDetection) * copied);
        _count = 0;
    }
    return copied;
}

void OdidScanner::_addDetection(const OdidDetection& det) {
    if (_count >= MAX_DETECTIONS) {
        // Ring buffer: overwrite oldest
        memmove(_buffer, _buffer + 1, sizeof(OdidDetection) * (MAX_DETECTIONS - 1));
        _count = MAX_DETECTIONS - 1;
    }
    _buffer[_count] = det;
    _count++;
}

/**
 * Parse ODID data from raw beacon frame payload.
 * Looks for ODID vendor-specific OUI (FA:0B:BC) in beacon management frames.
 * Returns true if valid ODID data was found.
 */
static bool parseOdidBeacon(const uint8_t* payload, int len, OdidDetection& det) {
    // Search for vendor-specific IE (tag 0xDD) with ODID OUI
    for (int i = 0; i < len - 7; i++) {
        if (payload[i] == 0xDD && i + 2 < len) {
            int ieLen = payload[i + 1];
            if (i + 2 + ieLen > len) continue;

            // Check OUI: FA:0B:BC
            if (ieLen >= 4 &&
                payload[i + 2] == ODID_OUI_0 &&
                payload[i + 3] == ODID_OUI_1 &&
                payload[i + 4] == ODID_OUI_2) {

                // Found ODID payload - parse basic fields
                const uint8_t* odid = &payload[i + 5];
                int odidLen = ieLen - 3;

                if (odidLen < 25) continue; // Minimum ODID message size

                // Message type is in first byte (bits 7-4)
                uint8_t msgType = (odid[0] >> 4) & 0x0F;

                // Type 0: Basic ID
                if (msgType == 0 && odidLen >= 25) {
                    // Extract ID (bytes 1-20, null terminated)
                    memset(det.basic_id, 0, sizeof(det.basic_id));
                    memcpy(det.basic_id, &odid[1], min(20, (int)sizeof(det.basic_id) - 1));
                    // Trim trailing spaces/nulls
                    for (int j = strlen(det.basic_id) - 1; j >= 0 && (det.basic_id[j] == ' ' || det.basic_id[j] == 0); j--) {
                        det.basic_id[j] = 0;
                    }
                    det.valid = strlen(det.basic_id) > 0;
                    return det.valid;
                }

                // Type 1: Location
                if (msgType == 1 && odidLen >= 25) {
                    // Latitude: bytes 4-7 (int32, 1e-7 degrees)
                    int32_t latRaw = (int32_t)(odid[4] | (odid[5] << 8) | (odid[6] << 16) | (odid[7] << 24));
                    det.lat = latRaw * 1e-7f;
                    // Longitude: bytes 8-11
                    int32_t lonRaw = (int32_t)(odid[8] | (odid[9] << 8) | (odid[10] << 16) | (odid[11] << 24));
                    det.lon = lonRaw * 1e-7f;
                    // Altitude: bytes 12-13 (uint16, 0.5m resolution, -1000m offset)
                    uint16_t altRaw = odid[12] | (odid[13] << 8);
                    det.alt = altRaw * 0.5f - 1000.0f;
                    // Speed: byte 16 (0.25 m/s resolution)
                    det.speed = odid[16] * 0.25f;
                    // Heading: bytes 17-18 (uint16, 0.01 degree resolution)
                    uint16_t hdgRaw = odid[17] | (odid[18] << 8);
                    det.heading = hdgRaw * 0.01f;
                    return true;
                }
            }
        }
    }
    return false;
}

#ifdef ESP32

void OdidScanner::_promiscuousCallbackEsp32(void* buf, wifi_promiscuous_pkt_type_t type) {
    if (!_instance) return;
    if (type != WIFI_PKT_MGMT) return;

    const wifi_promiscuous_pkt_t* pkt = (wifi_promiscuous_pkt_t*)buf;
    const uint8_t* payload = pkt->payload;
    int len = pkt->rx_ctrl.sig_len;

    OdidDetection det = {};
    det.rssi = pkt->rx_ctrl.rssi;
    det.timestamp = millis();

    // Extract source MAC
    if (len >= 16) {
        snprintf(det.mac, sizeof(det.mac), "%02X:%02X:%02X:%02X:%02X:%02X",
                 payload[10], payload[11], payload[12], payload[13], payload[14], payload[15]);
    }

    if (parseOdidBeacon(payload, len, det) && det.valid) {
        _instance->_addDetection(det);
    }
}

void OdidScanner::_startPromiscuousMode() {
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_promiscuous_rx_cb(_promiscuousCallbackEsp32);

    // Only listen on management frames (beacons)
    wifi_promiscuous_filter_t filter;
    filter.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT;
    esp_wifi_set_promiscuous_filter(&filter);

    Serial.println("[Scanner] ESP32 promiscuous mode enabled");
}

#else // ESP8266

void OdidScanner::_promiscuousCallback(void* buf, int type) {
    if (!_instance) return;
    // ESP8266: type 0 = management frames
    if (type != 0) return;

    // ESP8266 promiscuous packet structure
    struct RxControl {
        signed rssi:8;
        unsigned rate:4;
        unsigned is_group:1;
        unsigned :1;
        unsigned sig_mode:2;
        unsigned legacy_length:12;
        unsigned damatch0:1;
        unsigned damatch1:1;
        unsigned bssidmatch0:1;
        unsigned bssidmatch1:1;
        unsigned MCS:7;
        unsigned CWB:1;
        unsigned HT_length:16;
        unsigned Smoothing:1;
        unsigned Not_Sounding:1;
        unsigned :1;
        unsigned Aggregation:1;
        unsigned STBC:2;
        unsigned FEC_CODING:1;
        unsigned SGI:1;
        unsigned rxend_state:8;
        unsigned ampdu_cnt:8;
        unsigned channel:4;
        unsigned :12;
    };

    struct SnifferPacket {
        struct RxControl rx_ctrl;
        uint8_t data[];
    };

    SnifferPacket* pkt = (SnifferPacket*)buf;
    const uint8_t* payload = pkt->data;
    int len = 112; // ESP8266 limited frame length

    OdidDetection det = {};
    det.rssi = pkt->rx_ctrl.rssi;
    det.timestamp = millis();

    // Extract source MAC
    if (len >= 16) {
        snprintf(det.mac, sizeof(det.mac), "%02X:%02X:%02X:%02X:%02X:%02X",
                 payload[10], payload[11], payload[12], payload[13], payload[14], payload[15]);
    }

    if (parseOdidBeacon(payload, len, det) && det.valid) {
        _instance->_addDetection(det);
    }
}

void OdidScanner::_startPromiscuousMode() {
    wifi_set_opmode(STATIONAP_MODE);
    wifi_promiscuous_enable(0);
    wifi_set_promiscuous_rx_cb((wifi_promiscuous_cb_t)_promiscuousCallback);
    wifi_promiscuous_enable(1);
    Serial.println("[Scanner] ESP8266 promiscuous mode enabled");
}

#endif

#if HAS_BLE

class OdidBleCallbacks : public NimBLEAdvertisedDeviceCallbacks {
public:
    OdidBleCallbacks(OdidScanner* scanner) : _scanner(scanner) {}

    void onResult(NimBLEAdvertisedDevice* device) override {
        // Look for ODID service UUID 0xFFFA in service data
        if (!device->haveServiceData()) return;

        NimBLEUUID odidUuid((uint16_t)ODID_BLE_UUID);
        std::string serviceData = device->getServiceData(odidUuid);
        if (serviceData.empty()) return;

        OdidDetection det = {};
        det.rssi = device->getRSSI();
        det.timestamp = millis();

        String addr = String(device->getAddress().toString().c_str());
        addr.toCharArray(det.mac, sizeof(det.mac));

        // Parse ODID data from BLE service data
        const uint8_t* data = (const uint8_t*)serviceData.c_str();
        int len = serviceData.length();

        if (len >= 25) {
            uint8_t msgType = (data[0] >> 4) & 0x0F;
            if (msgType == 0) { // Basic ID
                memset(det.basic_id, 0, sizeof(det.basic_id));
                memcpy(det.basic_id, &data[1], min(20, (int)sizeof(det.basic_id) - 1));
                det.valid = strlen(det.basic_id) > 0;
                if (det.valid) {
                    _scanner->_addDetection(det);
                }
            }
        }
    }

private:
    OdidScanner* _scanner;
};

static OdidBleCallbacks* bleCallbacks = nullptr;

void OdidScanner::_startBleScan() {
    NimBLEDevice::init("");
    NimBLEScan* scan = NimBLEDevice::getScan();
    bleCallbacks = new OdidBleCallbacks(this);
    scan->setAdvertisedDeviceCallbacks(bleCallbacks, true);
    scan->setActiveScan(true);
    scan->setInterval(100);
    scan->setWindow(99);
    scan->start(0, nullptr, false); // Continuous scan
    Serial.println("[Scanner] BLE scan started");
}

#endif // HAS_BLE
