/**
 * ODID Scanner — Full OpenDroneID implementation
 *
 * Based on colonelpanichacks/drone-mesh-mapper (remoteid-mesh-dualcore)
 * Extended with FlightArc HTTP backend, WiFi Manager, Captive Portal.
 *
 * Supports:
 *   - WiFi Beacon frames (OUI FA:0B:BC and 90:3A:E6)
 *   - WiFi NAN Action frames (DJI and others)
 *   - BLE advertisements (ODID UUID 0xFFFA) via NimBLE
 *   - All ODID message types: BasicID, Location, System, OperatorID, Auth, SelfID
 *   - MessagePack (multiple messages in single frame)
 *   - Dual-core FreeRTOS on ESP32-S3 (BLE core 1, WiFi core 0)
 */

#include "odid_scanner.h"

extern "C" {
#include "opendroneid.h"
#include "odid_wifi.h"
}

#ifdef ESP32
  #include "esp_wifi.h"
  #include <nvs_flash.h>
  #if HAS_BLE
    #include <NimBLEDevice.h>
  #endif
  #if defined(CONFIG_IDF_TARGET_ESP32S3) || defined(ARDUINO_ESP32S3_DEV)
    #include <freertos/FreeRTOS.h>
    #include <freertos/task.h>
    #include <freertos/queue.h>
    #define USE_DUAL_CORE 1
  #else
    #define USE_DUAL_CORE 0
  #endif
#else
  extern "C" {
    #include "user_interface.h"
  }
  #define USE_DUAL_CORE 0
#endif

// ─── Static state ──────────────────────────────────────────

OdidScanner* OdidScanner::_instance = nullptr;
static ODID_UAS_Data UAS_data;

#if USE_DUAL_CORE
static QueueHandle_t detectionQueue = nullptr;
#endif

// ─── Helpers ───────────────────────────────────────────────

/**
 * Extract all available ODID fields from parsed UAS_data into detection.
 */
static void extractOdidFields(ODID_UAS_Data* uas, OdidDetection& det) {
    // BasicID (use first valid slot)
    for (int i = 0; i < ODID_BASIC_ID_MAX_MESSAGES; i++) {
        if (uas->BasicIDValid[i] && strlen((char*)uas->BasicID[i].UASID) > 0) {
            strncpy(det.basic_id, (char*)uas->BasicID[i].UASID, FLIGHTARC_ID_SIZE);
            det.basic_id[FLIGHTARC_ID_SIZE] = '\0';
            det.id_type = (uint8_t)uas->BasicID[i].IDType;
            det.valid = true;
            break;
        }
    }

    // Location
    if (uas->LocationValid) {
        det.lat = (float)uas->Location.Latitude;
        det.lon = (float)uas->Location.Longitude;
        det.alt = (float)uas->Location.AltitudeGeo;
        det.height_agl = (float)uas->Location.Height;
        det.speed = (float)uas->Location.SpeedHorizontal;
        det.heading = (float)uas->Location.Direction;
    }

    // System (operator/pilot position)
    if (uas->SystemValid) {
        det.pilot_lat = (float)uas->System.OperatorLatitude;
        det.pilot_lon = (float)uas->System.OperatorLongitude;
    }

    // Operator ID
    if (uas->OperatorIDValid) {
        strncpy(det.operator_id, (char*)uas->OperatorID.OperatorId, FLIGHTARC_ID_SIZE);
        det.operator_id[FLIGHTARC_ID_SIZE] = '\0';
    }

    // Self ID (description)
    if (uas->SelfIDValid) {
        strncpy(det.self_id_desc, (char*)uas->SelfID.Desc, FLIGHTARC_STR_SIZE);
        det.self_id_desc[FLIGHTARC_STR_SIZE] = '\0';
    }
}

/**
 * Process a single ODID message byte sequence.
 * Handles individual messages and message packs.
 */
static void processOdidPayload(const uint8_t* odid_data, int odid_len,
                                OdidDetection& det) {
    if (odid_len < ODID_MESSAGE_SIZE) return;

    ODID_UAS_Data uas;
    memset(&uas, 0, sizeof(uas));

    // Try MessagePack first (type 0xF)
    uint8_t msgType = (odid_data[0] >> 4) & 0x0F;
    if (msgType == 0x0F) {
        // MessagePack — contains multiple messages
        if (odid_message_process_pack(&uas, (uint8_t*)odid_data, odid_len) == 0) {
            extractOdidFields(&uas, det);
        }
    } else {
        // Single message — decode directly
        decodeOpenDroneID(&uas, (uint8_t*)odid_data);
        extractOdidFields(&uas, det);
    }
}

// ─── Scanner implementation ────────────────────────────────

void OdidScanner::begin() {
    _instance = this;
    _count = 0;

#if USE_DUAL_CORE
    detectionQueue = xQueueCreate(MAX_DETECTIONS, sizeof(OdidDetection));
#endif

    _startPromiscuousMode();

#if HAS_BLE
    _startBleScan();
#endif

    Serial.println("[Scanner] ODID scanner started (opendroneid library)");
#if HAS_BLE
    Serial.println("[Scanner] BLE scanning enabled (NimBLE)");
#else
    Serial.println("[Scanner] BLE not available, WiFi only");
#endif
#if USE_DUAL_CORE
    Serial.println("[Scanner] Dual-core mode active (ESP32-S3)");
#endif
}

void OdidScanner::loop() {
#if USE_DUAL_CORE
    // Drain queue from ISR/other core into main buffer
    OdidDetection det;
    while (xQueueReceive(detectionQueue, &det, 0) == pdTRUE) {
        _addOrUpdateDetection(det);
    }
#endif
}

int OdidScanner::getDetections(OdidDetection* out, int maxCount) {
    int copied = ((int)_count < maxCount) ? (int)_count : maxCount;
    if (copied > 0) {
        memcpy(out, _buffer, sizeof(OdidDetection) * copied);
        _count = 0;
    }
    return copied;
}

void OdidScanner::_addOrUpdateDetection(const OdidDetection& det) {
    // Try to merge with existing detection (same MAC or basic_id)
    for (int i = 0; i < _count; i++) {
        bool sameDevice = false;
        if (strlen(det.basic_id) > 0 && strlen(_buffer[i].basic_id) > 0) {
            sameDevice = (strcmp(det.basic_id, _buffer[i].basic_id) == 0);
        } else if (strlen(det.mac) > 0 && strlen(_buffer[i].mac) > 0) {
            sameDevice = (strcmp(det.mac, _buffer[i].mac) == 0);
        }

        if (sameDevice) {
            // Merge: update fields that are set in new detection
            if (strlen(det.basic_id) > 0) {
                strncpy(_buffer[i].basic_id, det.basic_id, sizeof(_buffer[i].basic_id));
                _buffer[i].id_type = det.id_type;
            }
            if (det.lat != 0.0f || det.lon != 0.0f) {
                _buffer[i].lat = det.lat;
                _buffer[i].lon = det.lon;
                _buffer[i].alt = det.alt;
                _buffer[i].height_agl = det.height_agl;
                _buffer[i].speed = det.speed;
                _buffer[i].heading = det.heading;
            }
            if (det.pilot_lat != 0.0f || det.pilot_lon != 0.0f) {
                _buffer[i].pilot_lat = det.pilot_lat;
                _buffer[i].pilot_lon = det.pilot_lon;
            }
            if (strlen(det.operator_id) > 0)
                strncpy(_buffer[i].operator_id, det.operator_id, sizeof(_buffer[i].operator_id));
            if (strlen(det.self_id_desc) > 0)
                strncpy(_buffer[i].self_id_desc, det.self_id_desc, sizeof(_buffer[i].self_id_desc));

            _buffer[i].rssi = det.rssi;
            _buffer[i].timestamp = det.timestamp;
            _buffer[i].valid = true;
            return;
        }
    }

    // New detection — add to buffer
    if (_count >= MAX_DETECTIONS) {
        memmove(_buffer, _buffer + 1, sizeof(OdidDetection) * (MAX_DETECTIONS - 1));
        _count = MAX_DETECTIONS - 1;
    }
    _buffer[_count] = det;
    _count++;
}

// ─── WiFi Promiscuous Mode (ESP32) ────────────────────────

#ifdef ESP32

void OdidScanner::_promiscuousCallbackEsp32(void* buf, wifi_promiscuous_pkt_type_t type) {
    if (!_instance) return;
    if (type != WIFI_PKT_MGMT) return;

    const wifi_promiscuous_pkt_t* pkt = (wifi_promiscuous_pkt_t*)buf;
    const uint8_t* payload = pkt->payload;
    int length = pkt->rx_ctrl.sig_len;
    if (length < 36) return;

    OdidDetection det = {};
    det.rssi = pkt->rx_ctrl.rssi;
    det.timestamp = millis();

    // Extract source MAC (offset 10)
    snprintf(det.mac, sizeof(det.mac), "%02x:%02x:%02x:%02x:%02x:%02x",
             payload[10], payload[11], payload[12], payload[13], payload[14], payload[15]);

    // ─── Check 1: WiFi NAN Action Frame ───
    // NAN destination MAC: 51:6f:9a:01:00:00
    static const uint8_t nan_dest[6] = {0x51, 0x6f, 0x9a, 0x01, 0x00, 0x00};
    if (memcmp(nan_dest, &payload[4], 6) == 0) {
        ODID_UAS_Data uas;
        memset(&uas, 0, sizeof(uas));
        if (odid_wifi_receive_message_pack_nan_action_frame(&uas, nullptr, (uint8_t*)payload, length) == 0) {
            extractOdidFields(&uas, det);
            det.source = OdidDetection::SRC_WIFI_NAN;
            if (det.valid) {
#if USE_DUAL_CORE
                BaseType_t woken = pdFALSE;
                xQueueSendFromISR(detectionQueue, &det, &woken);
                if (woken) portYIELD_FROM_ISR();
#else
                _instance->_addOrUpdateDetection(det);
#endif
            }
        }
        return;
    }

    // ─── Check 2: WiFi Beacon Frame (subtype 0x80) ───
    if (payload[0] == 0x80) {
        int offset = 36; // Skip fixed beacon header
        while (offset + 2 < length) {
            uint8_t ie_type = payload[offset];
            uint8_t ie_len = payload[offset + 1];
            if (offset + 2 + ie_len > length) break;

            // Vendor-specific IE (tag 0xDD) with ODID OUI
            if (ie_type == 0xDD && ie_len >= 4) {
                bool is_odid_oui =
                    // Standard ODID OUI: FA:0B:BC
                    (payload[offset + 2] == 0xFA &&
                     payload[offset + 3] == 0x0B &&
                     payload[offset + 4] == 0xBC) ||
                    // Alternative OUI: 90:3A:E6 (some manufacturers)
                    (payload[offset + 2] == 0x90 &&
                     payload[offset + 3] == 0x3A &&
                     payload[offset + 4] == 0xE6);

                if (is_odid_oui) {
                    int odid_offset = offset + 7; // Skip IE header + OUI + type
                    int odid_len = ie_len - 5;

                    if (odid_offset < length && odid_len >= ODID_MESSAGE_SIZE) {
                        // Use opendroneid library for full message parsing
                        ODID_UAS_Data uas;
                        memset(&uas, 0, sizeof(uas));
                        odid_message_process_pack(&uas, (uint8_t*)&payload[odid_offset], odid_len);
                        extractOdidFields(&uas, det);
                        det.source = OdidDetection::SRC_WIFI_BEACON;

                        if (det.valid) {
#if USE_DUAL_CORE
                            BaseType_t woken = pdFALSE;
                            xQueueSendFromISR(detectionQueue, &det, &woken);
                            if (woken) portYIELD_FROM_ISR();
#else
                            _instance->_addOrUpdateDetection(det);
#endif
                        }
                    }
                }
            }
            offset += ie_len + 2;
        }
    }
}

void OdidScanner::_startPromiscuousMode() {
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_promiscuous_rx_cb(_promiscuousCallbackEsp32);

    // Listen on management frames (beacons + action frames)
    wifi_promiscuous_filter_t filter;
    filter.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT;
    esp_wifi_set_promiscuous_filter(&filter);

    // Channel hopping would improve coverage but conflicts with STA mode
    // For now, stay on the STA-connected channel

    Serial.println("[Scanner] ESP32 promiscuous mode enabled (beacon + NAN)");
}

#else // ESP8266

void OdidScanner::_promiscuousCallback(void* buf, int type) {
    if (!_instance) return;
    if (type != 0) return; // ESP8266: type 0 = management frames

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
    det.source = OdidDetection::SRC_WIFI_BEACON;

    // Extract source MAC
    if (len >= 16) {
        snprintf(det.mac, sizeof(det.mac), "%02x:%02x:%02x:%02x:%02x:%02x",
                 payload[10], payload[11], payload[12], payload[13], payload[14], payload[15]);
    }

    // Parse beacon frame for ODID vendor IEs
    if (payload[0] == 0x80 && len > 36) {
        int offset = 36;
        while (offset + 2 < len) {
            uint8_t ie_type = payload[offset];
            uint8_t ie_len = payload[offset + 1];
            if (offset + 2 + ie_len > len) break;

            if (ie_type == 0xDD && ie_len >= 4) {
                bool is_odid_oui =
                    (payload[offset + 2] == 0xFA &&
                     payload[offset + 3] == 0x0B &&
                     payload[offset + 4] == 0xBC) ||
                    (payload[offset + 2] == 0x90 &&
                     payload[offset + 3] == 0x3A &&
                     payload[offset + 4] == 0xE6);

                if (is_odid_oui) {
                    int odid_offset = offset + 7;
                    int odid_len = ie_len - 5;
                    if (odid_offset < len && odid_len >= ODID_MESSAGE_SIZE) {
                        processOdidPayload(&payload[odid_offset], odid_len, det);
                        if (det.valid) {
                            _instance->_addOrUpdateDetection(det);
                        }
                    }
                }
            }
            offset += ie_len + 2;
        }
    }
}

void OdidScanner::_startPromiscuousMode() {
    wifi_set_opmode(STATIONAP_MODE);
    wifi_promiscuous_enable(0);
    wifi_set_promiscuous_rx_cb((wifi_promiscuous_cb_t)_promiscuousCallback);
    wifi_promiscuous_enable(1);
    Serial.println("[Scanner] ESP8266 promiscuous mode enabled (beacon only)");
}

#endif // ESP32 vs ESP8266

// ─── BLE Scanner (NimBLE, ESP32 only) ──────────────────────

#if HAS_BLE

class OdidBleCallbacks : public NimBLEAdvertisedDeviceCallbacks {
public:
    OdidBleCallbacks(OdidScanner* scanner) : _scanner(scanner) {}

    void onResult(NimBLEAdvertisedDevice* device) override {
        if (!device->haveServiceData()) return;

        // Look for ODID service UUID 0xFFFA
        NimBLEUUID odidUuid((uint16_t)ODID_BLE_UUID);
        std::string serviceData = device->getServiceData(odidUuid);
        if (serviceData.empty()) return;

        const uint8_t* data = (const uint8_t*)serviceData.c_str();
        int len = serviceData.length();
        if (len < ODID_MESSAGE_SIZE) return;

        OdidDetection det = {};
        det.rssi = device->getRSSI();
        det.timestamp = millis();
        det.source = OdidDetection::SRC_BLE;

        String addr = String(device->getAddress().toString().c_str());
        addr.toCharArray(det.mac, sizeof(det.mac));

        // Use opendroneid library for full message parsing
        // BLE can carry single messages or message packs
        uint8_t msgType = (data[0] >> 4) & 0x0F;

        if (msgType == 0x0F && len >= ODID_MESSAGE_SIZE) {
            // MessagePack
            ODID_UAS_Data uas;
            memset(&uas, 0, sizeof(uas));
            if (odid_message_process_pack(&uas, (uint8_t*)data, len) == 0) {
                extractOdidFields(&uas, det);
            }
        } else {
            // Single ODID message
            ODID_UAS_Data uas;
            memset(&uas, 0, sizeof(uas));
            decodeOpenDroneID(&uas, (uint8_t*)data);
            extractOdidFields(&uas, det);
        }

        if (det.valid) {
#if USE_DUAL_CORE
            if (detectionQueue) {
                xQueueSend(detectionQueue, &det, 0);
            }
#else
            _scanner->_addOrUpdateDetection(det);
#endif
        }
    }

private:
    OdidScanner* _scanner;
};

static OdidBleCallbacks* bleCallbacks = nullptr;

#if USE_DUAL_CORE
// BLE scan task runs on core 1
static void bleScanTask(void* param) {
    NimBLEScan* scan = NimBLEDevice::getScan();
    for (;;) {
        scan->start(1, false);
        scan->clearResults();
        delay(100);
    }
}
#endif

void OdidScanner::_startBleScan() {
    NimBLEDevice::init("");
    NimBLEScan* scan = NimBLEDevice::getScan();
    bleCallbacks = new OdidBleCallbacks(this);
    scan->setAdvertisedDeviceCallbacks(bleCallbacks, true);
    scan->setActiveScan(true);
    scan->setInterval(100);
    scan->setWindow(99);

#if USE_DUAL_CORE
    // Run BLE scan on core 1 (WiFi runs on core 0)
    xTaskCreatePinnedToCore(bleScanTask, "BLEScanTask", 8192, nullptr, 1, nullptr, 1);
    Serial.println("[Scanner] BLE scan task started on core 1");
#else
    scan->start(0, nullptr, false); // Continuous scan
    Serial.println("[Scanner] BLE scan started (single core)");
#endif
}

#endif // HAS_BLE
