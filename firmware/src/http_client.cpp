#include "http_client.h"
#include "config.h"
#include <ArduinoJson.h>

#ifdef ESP32
  #include <HTTPClient.h>
  #if HAS_TLS
    #include <WiFiClientSecure.h>
  #endif
#else
  #include <ESP8266HTTPClient.h>
  #include <WiFiClient.h>
#endif

void FlightArcClient::begin(const char* backendUrl, const char* apiKey) {
    _backendUrl = String(backendUrl);
    _apiKey = String(apiKey);

    // Remove trailing slash
    if (_backendUrl.endsWith("/")) {
        _backendUrl = _backendUrl.substring(0, _backendUrl.length() - 1);
    }

    Serial.printf("[HTTP] Backend: %s\n", _backendUrl.c_str());
}

bool FlightArcClient::sendIngest(OdidDetection* detections, int count,
                                  float nodeLat, float nodeLon) {
    if (count == 0) return true;

    JsonDocument doc;
    if (nodeLat != 0.0f || nodeLon != 0.0f) {
        doc["node_lat"] = nodeLat;
        doc["node_lon"] = nodeLon;
    }

    JsonArray arr = doc["detections"].to<JsonArray>();
    for (int i = 0; i < count; i++) {
        JsonObject det = arr.add<JsonObject>();
        det["basic_id"] = detections[i].basic_id;
        det["lat"] = detections[i].lat;
        det["lon"] = detections[i].lon;
        det["alt"] = detections[i].alt;
        det["speed"] = detections[i].speed;
        if (detections[i].heading >= 0) {
            det["heading"] = detections[i].heading;
        }
        if (detections[i].height_agl != 0.0f) {
            det["height_agl"] = detections[i].height_agl;
        }
        det["rssi"] = detections[i].rssi;
        if (strlen(detections[i].mac) > 0) {
            det["mac"] = detections[i].mac;
        }
        // Pilot/Operator position (from ODID System message)
        if (detections[i].pilot_lat != 0.0f || detections[i].pilot_lon != 0.0f) {
            det["pilot_lat"] = detections[i].pilot_lat;
            det["pilot_lon"] = detections[i].pilot_lon;
        }
        // Operator ID (from ODID OperatorID message)
        if (strlen(detections[i].operator_id) > 0) {
            det["operator_id"] = detections[i].operator_id;
        }
        // ID type
        if (detections[i].id_type > 0) {
            const char* id_types[] = {"none", "serial", "caa", "utm", "specific_session"};
            int idx = detections[i].id_type;
            if (idx >= 0 && idx <= 4) det["id_type"] = id_types[idx];
        }
        // Self-ID description
        if (strlen(detections[i].self_id_desc) > 0) {
            det["self_id_desc"] = detections[i].self_id_desc;
        }
        // Detection source
        const char* src_names[] = {"wifi_beacon", "wifi_nan", "ble"};
        det["source"] = src_names[detections[i].source];
    }

    String body;
    serializeJson(doc, body);

    bool ok = _httpPost("/api/receivers/ingest", body);
    if (ok) {
        Serial.printf("[HTTP] Ingested %d detections\n", count);
    }
    return ok;
}

OtaInfo FlightArcClient::sendHeartbeat(const char* fwVersion, const char* hwType,
                                     const char* wifiSsid, int wifiRssi, int wifiChannel,
                                     int freeHeap, int uptimeSeconds,
                                     int detectionsSinceBoot, bool apActive,
                                     float lat, float lon, float accuracy) {
    JsonDocument doc;
    doc["firmware_version"] = fwVersion;
    doc["hardware_type"] = hwType;
    doc["wifi_ssid"] = wifiSsid;
    doc["wifi_rssi"] = wifiRssi;
    doc["wifi_channel"] = wifiChannel;
    doc["free_heap"] = freeHeap;
    doc["uptime_seconds"] = uptimeSeconds;
    doc["detections_since_boot"] = detectionsSinceBoot;
    doc["ap_active"] = apActive;

    // Error stats
    if (_retryCount > 0) {
        doc["error_count"] = _retryCount;
        doc["last_http_code"] = _lastHttpCode;
    }

    if (lat != 0.0f || lon != 0.0f) {
        doc["latitude"] = lat;
        doc["longitude"] = lon;
        if (accuracy > 0) {
            doc["accuracy"] = accuracy;
        }
    }

    String body;
    serializeJson(doc, body);

    OtaInfo ota;
    String response = _httpPostWithResponse("/api/receivers/heartbeat", body);

    if (response.length() > 0) {
        JsonDocument respDoc;
        if (deserializeJson(respDoc, response) == DeserializationError::Ok) {
            if (respDoc["firmware_update"]["available"] | false) {
                ota.available = true;
                ota.url = respDoc["firmware_update"]["url"].as<String>();
                ota.sha256 = respDoc["firmware_update"]["sha256"].as<String>();
                ota.size = respDoc["firmware_update"]["size"] | 0;
                ota.version = respDoc["firmware_update"]["version"].as<String>();
            }
        }
    }

    return ota;
}

bool FlightArcClient::_httpPost(const String& path, const String& body) {
    String url = _backendUrl + path;

#ifdef ESP32
  #if HAS_TLS
    // Use HTTPS if URL starts with https
    if (url.startsWith("https")) {
        WiFiClientSecure client;
        client.setInsecure(); // Skip cert validation (use CA bundle in production)
        HTTPClient http;
        http.begin(client, url);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("X-Node-Key", _apiKey);
        http.setTimeout(10000);

        int code = http.POST(body);
        http.end();
        _lastHttpCode = code;
        _lastSuccess = (code >= 200 && code < 300);
        return _lastSuccess;
    }
  #endif
    // Plain HTTP
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Node-Key", _apiKey);
    http.setTimeout(10000);

    int code = http.POST(body);
    http.end();
    _lastHttpCode = code;
    _lastSuccess = (code >= 200 && code < 300);
    if (!_lastSuccess) {
        _retryCount++;
        Serial.printf("[HTTP] POST %s failed: %d (retry %d)\n", path.c_str(), code, _retryCount);
    } else {
        _retryCount = 0;
    }
    return _lastSuccess;
#else
    // ESP8266: HTTP only
    WiFiClient client;
    HTTPClient http;
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Node-Key", _apiKey);
    http.setTimeout(10000);

    int code = http.POST(body);
    http.end();
    _lastHttpCode = code;
    _lastSuccess = (code >= 200 && code < 300);
    if (!_lastSuccess) {
        _retryCount++;
        Serial.printf("[HTTP] POST %s failed: %d (retry %d)\n", path.c_str(), code, _retryCount);
    } else {
        _retryCount = 0;
    }
    return _lastSuccess;
#endif
}

String FlightArcClient::_httpPostWithResponse(const String& path, const String& body) {
    String url = _backendUrl + path;
    String response;

#ifdef ESP32
  #if HAS_TLS
    if (url.startsWith("https")) {
        WiFiClientSecure client;
        client.setInsecure();
        HTTPClient http;
        http.begin(client, url);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("X-Node-Key", _apiKey);
        http.setTimeout(10000);

        int code = http.POST(body);
        _lastHttpCode = code;
        _lastSuccess = (code >= 200 && code < 300);
        if (_lastSuccess) {
            response = http.getString();
            _retryCount = 0;
        } else {
            _retryCount++;
        }
        http.end();
        return response;
    }
  #endif
    {
        HTTPClient http;
        http.begin(url);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("X-Node-Key", _apiKey);
        http.setTimeout(10000);

        int code = http.POST(body);
        _lastHttpCode = code;
        _lastSuccess = (code >= 200 && code < 300);
        if (_lastSuccess) {
            response = http.getString();
            _retryCount = 0;
        } else {
            _retryCount++;
        }
        http.end();
    }
#else
    WiFiClient client;
    HTTPClient http;
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Node-Key", _apiKey);
    http.setTimeout(10000);

    int code = http.POST(body);
    _lastHttpCode = code;
    _lastSuccess = (code >= 200 && code < 300);
    if (_lastSuccess) {
        response = http.getString();
        _retryCount = 0;
    } else {
        _retryCount++;
    }
    http.end();
#endif
    return response;
}

#ifdef ESP32
#include <HTTPUpdate.h>

bool FlightArcClient::performOtaUpdate(const String& otaUrl) {
    // Construct full URL with API key as query parameter
    String fullUrl = _backendUrl + otaUrl + "?key=" + _apiKey;

    Serial.println("[OTA] Starting firmware update...");
    Serial.printf("[OTA] URL: %s\n", (_backendUrl + otaUrl).c_str());

  #if HAS_TLS
    if (fullUrl.startsWith("https")) {
        WiFiClientSecure client;
        client.setInsecure();
        t_httpUpdate_return ret = httpUpdate.update(client, fullUrl);
        switch (ret) {
            case HTTP_UPDATE_FAILED:
                Serial.printf("[OTA] Failed: %s\n", httpUpdate.getLastErrorString().c_str());
                return false;
            case HTTP_UPDATE_NO_UPDATES:
                Serial.println("[OTA] No updates");
                return false;
            case HTTP_UPDATE_OK:
                Serial.println("[OTA] Success, rebooting...");
                return true;
        }
        return false;
    }
  #endif

    WiFiClient client;
    t_httpUpdate_return ret = httpUpdate.update(client, fullUrl);
    switch (ret) {
        case HTTP_UPDATE_FAILED:
            Serial.printf("[OTA] Failed: %s\n", httpUpdate.getLastErrorString().c_str());
            return false;
        case HTTP_UPDATE_NO_UPDATES:
            Serial.println("[OTA] No updates");
            return false;
        case HTTP_UPDATE_OK:
            Serial.println("[OTA] Success, rebooting...");
            return true;
    }
    return false;
}
#else
bool FlightArcClient::performOtaUpdate(const String& otaUrl) {
    Serial.println("[OTA] Not supported on ESP8266");
    return false;
}
#endif
