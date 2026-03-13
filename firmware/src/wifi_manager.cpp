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

void WiFiManager::begin(const char* apSsid, const char* ssids[], const char* passes[], int count) {
    _apSsid = String(apSsid);
    _bootTime = millis();

    // Add build-time networks (skip empty SSIDs)
    for (int i = 0; i < count && i < MAX_WIFI_NETWORKS; i++) {
        _addNetwork(ssids[i], passes[i]);
    }

    Serial.printf("[WiFi] %d network(s) configured at build-time\n", _networkCount);
    for (int i = 0; i < _networkCount; i++) {
        Serial.printf("[WiFi]   %d: %s\n", i + 1, _networks[i].ssid.c_str());
    }

    // Load saved credentials from captive portal (overrides build-time as primary)
    _loadCredentials();

    if (_activeSsid.length() > 0) {
        _staConfigured = true;
        Serial.printf("[WiFi] STA mode — trying: %s\n", _activeSsid.c_str());
        WiFi.mode(WIFI_STA);
        _connectSta();
    } else if (_networkCount > 0) {
        // No saved credentials, but we have build-time networks — try first one
        _activeSsid = _networks[0].ssid;
        _activePass = _networks[0].pass;
        _staConfigured = true;
        Serial.printf("[WiFi] STA mode — trying first network: %s\n", _activeSsid.c_str());
        WiFi.mode(WIFI_STA);
        _connectSta();
    } else {
        Serial.println("[WiFi] No credentials configured — starting AP for provisioning");
        _startAp();
    }
}

void WiFiManager::_addNetwork(const char* ssid, const char* pass) {
    if (strlen(ssid) == 0) return;
    if (_networkCount >= MAX_WIFI_NETWORKS) return;
    _networks[_networkCount].ssid = String(ssid);
    _networks[_networkCount].pass = String(pass);
    _networkCount++;
}

int WiFiManager::_findBestNetwork() {
    // Synchronous scan to find the best available network
    int n = WiFi.scanComplete();
    if (n <= 0) return -1;

    int bestIdx = -1;
    int bestRssi = -999;

    for (int s = 0; s < n; s++) {
        String scannedSsid = WiFi.SSID(s);
        int rssi = WiFi.RSSI(s);
        for (int c = 0; c < _networkCount; c++) {
            if (scannedSsid == _networks[c].ssid && rssi > bestRssi) {
                bestIdx = c;
                bestRssi = rssi;
            }
        }
    }

    if (bestIdx >= 0) {
        Serial.printf("[WiFi] Best network from scan: %s (RSSI: %d)\n",
                      _networks[bestIdx].ssid.c_str(), bestRssi);
    }
    return bestIdx;
}

void WiFiManager::loop() {
    unsigned long now = millis();

    bool connected = isStaConnected();

    // ── STA just connected ───────────────────────────────────
    if (connected && !_staWasConnected) {
        _staWasConnected = true;
        _staConnectedAt = now;
        _staConnectAttempts = 0;
        Serial.printf("[WiFi] STA connected! IP: %s (SSID: %s, RSSI: %d)\n",
                      getStaIp().c_str(), getConnectedSsid().c_str(), getRssi());
    }

    // ── STA just disconnected ────────────────────────────────
    if (!connected && _staWasConnected) {
        _staWasConnected = false;
        _staConnectedAt = 0;
        Serial.println("[WiFi] STA connection lost!");
    }

    // ── AP shutdown: turn off AP once STA is stable ──────────
    if (connected && _apActive && _staConnectedAt > 0) {
        if (now - _staConnectedAt > WIFI_AP_SHUTDOWN_DELAY) {
            Serial.println("[WiFi] STA stable — shutting down AP");
            _stopAp();
        }
    }

    // ── AP startup: start AP when STA can't connect ──────────
    if (!connected && !_apActive) {
        if (!_staConfigured || (now - _bootTime > WIFI_AP_TIMEOUT_MS)) {
            Serial.println("[WiFi] STA not connected — starting AP for provisioning");
            _startAp();
        }
    }

    // ── STA reconnect attempts ───────────────────────────────
    if (_staConfigured && !connected && (now - _lastReconnectAttempt > WIFI_RECONNECT_MS)) {
        _lastReconnectAttempt = now;
        _staConnectAttempts++;

        // Every 3rd attempt with multiple networks: try scan-based selection
        if (_networkCount > 1 && _staConnectAttempts % 3 == 0) {
            int bestIdx = _findBestNetwork();
            if (bestIdx >= 0) {
                _activeSsid = _networks[bestIdx].ssid;
                _activePass = _networks[bestIdx].pass;
                Serial.printf("[WiFi] Switching to: %s (attempt %d)\n",
                              _activeSsid.c_str(), _staConnectAttempts);
            }
        } else if (_networkCount > 1) {
            // Round-robin through configured networks
            int idx = (_staConnectAttempts - 1) % _networkCount;
            _activeSsid = _networks[idx].ssid;
            _activePass = _networks[idx].pass;
            Serial.printf("[WiFi] Trying network %d/%d: %s (attempt %d)\n",
                          idx + 1, _networkCount, _activeSsid.c_str(), _staConnectAttempts);
        } else {
            Serial.printf("[WiFi] Reconnecting STA (attempt %d)...\n", _staConnectAttempts);
        }
        _connectSta();
    }

    // ── Periodic WiFi scan (for captive portal + network selection) ─
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
    if (_apActive) return WiFi.softAPIP().toString();
    return "";
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
    _activeSsid = ssid;
    _activePass = pass;
    _staConfigured = true;
    _staConnectAttempts = 0;
    _saveCredentials();
    Serial.printf("[WiFi] New credentials saved: %s\n", ssid.c_str());

    if (_apActive) {
        _updateWiFiMode();
    }
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
    if (_apActive) return;

    _updateWiFiMode();
    WiFi.softAP(_apSsid.c_str());
    _apActive = true;
    Serial.printf("[WiFi] AP started: %s (IP: %s)\n", _apSsid.c_str(), WiFi.softAPIP().toString().c_str());
}

void WiFiManager::_stopAp() {
    if (!_apActive) return;

    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    _apActive = false;
    Serial.println("[WiFi] AP stopped");

    if (_staConfigured && !isStaConnected()) {
        _connectSta();
    }
}

void WiFiManager::_updateWiFiMode() {
    if (_apActive || !_staConfigured) {
        WiFi.mode(_staConfigured ? WIFI_AP_STA : WIFI_AP);
    } else {
        WiFi.mode(WIFI_STA);
    }
}

void WiFiManager::_connectSta() {
    Serial.printf("[WiFi] Connecting to: %s\n", _activeSsid.c_str());
    WiFi.begin(_activeSsid.c_str(), _activePass.c_str());
}

void WiFiManager::_saveCredentials() {
#ifdef ESP32
    prefs.begin("wifi", false);
    prefs.putString("ssid", _activeSsid);
    prefs.putString("pass", _activePass);
    prefs.end();
#else
    EEPROM.begin(EEPROM_SIZE);
    for (unsigned int i = 0; i < 64; i++) {
        EEPROM.write(EEPROM_SSID_ADDR + i, i < _activeSsid.length() ? _activeSsid[i] : 0);
    }
    for (unsigned int i = 0; i < 64; i++) {
        EEPROM.write(EEPROM_PASS_ADDR + i, i < _activePass.length() ? _activePass[i] : 0);
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
        _activeSsid = savedSsid;
        _activePass = savedPass;
        _staConfigured = true;
        Serial.printf("[WiFi] Loaded saved credentials: %s\n", _activeSsid.c_str());
    }
#else
    EEPROM.begin(EEPROM_SIZE);
    if (EEPROM.read(EEPROM_MAGIC_ADDR) == EEPROM_MAGIC) {
        char ssid[64] = {0};
        char pass[64] = {0};
        for (int i = 0; i < 63; i++) ssid[i] = EEPROM.read(EEPROM_SSID_ADDR + i);
        for (int i = 0; i < 63; i++) pass[i] = EEPROM.read(EEPROM_PASS_ADDR + i);
        if (strlen(ssid) > 0) {
            _activeSsid = String(ssid);
            _activePass = String(pass);
            _staConfigured = true;
            Serial.printf("[WiFi] Loaded saved credentials: %s\n", _activeSsid.c_str());
        }
    }
#endif
}
