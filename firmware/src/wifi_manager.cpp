#include "wifi_manager.h"
#include "config.h"

#ifdef ESP32
  #include <Preferences.h>
  static Preferences prefs;
#else
  #include <EEPROM.h>
  #define EEPROM_SIZE 256
  #define EEPROM_SSID_ADDR 0
  #define EEPROM_PASS_ADDR 64
  #define EEPROM_MAGIC_ADDR 192
  #define EEPROM_MAGIC 0xFA
#endif

void WiFiManager::begin(const char* apSsid, const char* staSsid, const char* staPass) {
    _apSsid = String(apSsid);
    _staSsid = String(staSsid);
    _staPass = String(staPass);

    // Load saved credentials (override build-time ones if available)
    _loadCredentials();

    // Start AP (always active)
    _startAp();

    // Connect to STA if configured
    if (_staSsid.length() > 0) {
        _staConfigured = true;
        _connectSta();
    }
}

void WiFiManager::loop() {
    unsigned long now = millis();

    // Auto-reconnect STA
    if (_staConfigured && !isStaConnected() && (now - _lastReconnectAttempt > WIFI_RECONNECT_MS)) {
        _lastReconnectAttempt = now;
        Serial.println("[WiFi] Reconnecting STA...");
        _connectSta();
    }

    // Periodic scan (for captive portal network list)
    if (now - _lastScan > WIFI_SCAN_INTERVAL_MS) {
        _lastScan = now;
        WiFi.scanNetworks(true); // async scan
    }
}

bool WiFiManager::isStaConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

String WiFiManager::getStaIp() const {
    return WiFi.localIP().toString();
}

String WiFiManager::getApIp() const {
    return WiFi.softAPIP().toString();
}

String WiFiManager::getConnectedSsid() const {
    if (isStaConnected()) return WiFi.SSID();
    return "";
}

int WiFiManager::getRssi() const {
    if (isStaConnected()) return WiFi.RSSI();
    return 0;
}

void WiFiManager::setStaCredentials(const String& ssid, const String& pass) {
    _staSsid = ssid;
    _staPass = pass;
    _staConfigured = true;
    _saveCredentials();
    Serial.printf("[WiFi] New credentials saved: %s\n", ssid.c_str());
    _connectSta();
}

String WiFiManager::getScanResultsJson() {
    int n = WiFi.scanComplete();
    if (n < 0) return "[]";

    String json = "[";
    for (int i = 0; i < n; i++) {
        if (i > 0) json += ",";
        json += "{\"ssid\":\"" + WiFi.SSID(i) + "\","
                "\"rssi\":" + String(WiFi.RSSI(i)) + ","
                "\"secure\":" + String(WiFi.encryptionType(i) != 0 ? "true" : "false") + "}";
    }
    json += "]";
    WiFi.scanDelete();
    return json;
}

void WiFiManager::_startAp() {
#ifdef ESP32
    WiFi.mode(WIFI_AP_STA);
#else
    WiFi.mode(WIFI_AP_STA);
#endif
    WiFi.softAP(_apSsid.c_str());
    Serial.printf("[WiFi] AP started: %s (IP: %s)\n", _apSsid.c_str(), getApIp().c_str());
}

void WiFiManager::_connectSta() {
    Serial.printf("[WiFi] Connecting to: %s\n", _staSsid.c_str());
    WiFi.begin(_staSsid.c_str(), _staPass.c_str());
}

void WiFiManager::_saveCredentials() {
#ifdef ESP32
    prefs.begin("wifi", false);
    prefs.putString("ssid", _staSsid);
    prefs.putString("pass", _staPass);
    prefs.end();
#else
    EEPROM.begin(EEPROM_SIZE);
    // Write SSID
    for (unsigned int i = 0; i < 64; i++) {
        EEPROM.write(EEPROM_SSID_ADDR + i, i < _staSsid.length() ? _staSsid[i] : 0);
    }
    // Write password
    for (unsigned int i = 0; i < 64; i++) {
        EEPROM.write(EEPROM_PASS_ADDR + i, i < _staPass.length() ? _staPass[i] : 0);
    }
    EEPROM.write(EEPROM_MAGIC_ADDR, EEPROM_MAGIC);
    EEPROM.commit();
#endif
}

void WiFiManager::_loadCredentials() {
#ifdef ESP32
    prefs.begin("wifi", true);
    String savedSsid = prefs.getString("ssid", "");
    String savedPass = prefs.getString("pass", "");
    prefs.end();
    if (savedSsid.length() > 0) {
        _staSsid = savedSsid;
        _staPass = savedPass;
        _staConfigured = true;
        Serial.printf("[WiFi] Loaded saved credentials: %s\n", _staSsid.c_str());
    }
#else
    EEPROM.begin(EEPROM_SIZE);
    if (EEPROM.read(EEPROM_MAGIC_ADDR) == EEPROM_MAGIC) {
        char ssid[64] = {0};
        char pass[64] = {0};
        for (int i = 0; i < 63; i++) ssid[i] = EEPROM.read(EEPROM_SSID_ADDR + i);
        for (int i = 0; i < 63; i++) pass[i] = EEPROM.read(EEPROM_PASS_ADDR + i);
        if (strlen(ssid) > 0) {
            _staSsid = String(ssid);
            _staPass = String(pass);
            _staConfigured = true;
            Serial.printf("[WiFi] Loaded saved credentials: %s\n", _staSsid.c_str());
        }
    }
#endif
}
