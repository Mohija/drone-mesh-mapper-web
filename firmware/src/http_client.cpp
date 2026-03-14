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

bool FlightArcClient::sendHeartbeat(const char* fwVersion, const char* wifiSsid,
                                     int wifiRssi, int freeHeap, int uptimeSeconds,
                                     float lat, float lon, float accuracy) {
    JsonDocument doc;
    doc["firmware_version"] = fwVersion;
    doc["wifi_ssid"] = wifiSsid;
    doc["wifi_rssi"] = wifiRssi;
    doc["free_heap"] = freeHeap;
    doc["uptime_seconds"] = uptimeSeconds;
    if (lat != 0.0f || lon != 0.0f) {
        doc["latitude"] = lat;
        doc["longitude"] = lon;
        if (accuracy > 0) {
            doc["accuracy"] = accuracy;
        }
    }

    String body;
    serializeJson(doc, body);

    return _httpPost("/api/receivers/heartbeat", body);
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
