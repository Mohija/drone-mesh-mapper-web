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

    if (_activeSsid.length() > 0 || _networkCount > 0) {
        _staConfigured = true;
        WiFi.mode(WIFI_STA);

        // ALWAYS scan at boot and cache results for the captive portal.
        // If WiFi credentials are wrong, the portal needs to show available networks.
        Serial.printf("[WiFi] Scanning available networks...\n");
        int n = WiFi.scanNetworks(false, false, false, 200);

        // Build list of available configured networks sorted by RSSI
        struct Match { int netIdx; int rssi; };
        Match matches[MAX_WIFI_NETWORKS];
        int matchCount = 0;

        if (n > 0) {
            // Cache scan results for captive portal
            String json = "[";
            for (int s = 0; s < n; s++) {
                Serial.printf("[WiFi]   Scan %d: \"%s\" (%d dBm)\n", s + 1, WiFi.SSID(s).c_str(), WiFi.RSSI(s));
                String ssid = WiFi.SSID(s);
                if (ssid.isEmpty()) continue;
                ssid.replace("\\", "\\\\");
                ssid.replace("\"", "\\\"");
                if (json.length() > 1) json += ",";
                json += "{\"ssid\":\"" + ssid + "\","
                        "\"rssi\":" + String(WiFi.RSSI(s)) + ","
                        "\"secure\":" + String(WiFi.encryptionType(s) != 0 ? "true" : "false") + "}";
            }
            json += "]";
            _cachedScanJson = json;
            Serial.printf("[WiFi] Cached %d networks for portal\n", n);

            // Match configured networks against scan results (for multi-network priority)
            if (_networkCount > 1) {
                for (int s = 0; s < n; s++) {
                    String scanned = WiFi.SSID(s);
                    int rssi = WiFi.RSSI(s);
                    for (int c = 0; c < _networkCount; c++) {
                        if (scanned == _networks[c].ssid) {
                            bool found = false;
                            for (int m = 0; m < matchCount; m++) {
                                if (matches[m].netIdx == c) { found = true; break; }
                            }
                            if (!found && matchCount < MAX_WIFI_NETWORKS) {
                                matches[matchCount++] = { c, rssi };
                            }
                        }
                    }
                }
                // Sort by RSSI descending
                for (int i = 0; i < matchCount - 1; i++) {
                    for (int j = i + 1; j < matchCount; j++) {
                        if (matches[j].rssi > matches[i].rssi) {
                            Match tmp = matches[i]; matches[i] = matches[j]; matches[j] = tmp;
                        }
                    }
                }
            }
            WiFi.scanDelete();
        } else {
            Serial.println("[WiFi] No networks found in scan");
        }

        // If we have NVS-saved credentials, try those first
        if (_activeSsid.length() > 0) {
            Serial.printf("[WiFi] Trying saved credentials: %s\n", _activeSsid.c_str());
            WiFi.begin(_activeSsid.c_str(), _activePass.c_str());
            unsigned long start = millis();
            while (millis() - start < 5000) {
                if (WiFi.status() == WL_CONNECTED) {
                    Serial.printf("[WiFi] Connected to saved: %s\n", _activeSsid.c_str());
                    return;
                }
                delay(100);
            }
            Serial.printf("[WiFi] Failed: %s (saved credentials timeout)\n", _activeSsid.c_str());
        }

        // Try each matched network by signal strength (multi-network mode)
        for (int m = 0; m < matchCount; m++) {
            int idx = matches[m].netIdx;
            // Skip if already tried via saved credentials
            if (_activeSsid == _networks[idx].ssid) continue;
            Serial.printf("[WiFi] Trying %d/%d: %s (RSSI: %d)...\n",
                m + 1, matchCount, _networks[idx].ssid.c_str(), matches[m].rssi);

            WiFi.disconnect(false);
            WiFi.begin(_networks[idx].ssid.c_str(), _networks[idx].pass.c_str());

            unsigned long start = millis();
            while (millis() - start < 5000) {
                if (WiFi.status() == WL_CONNECTED) {
                    _activeSsid = _networks[idx].ssid;
                    _activePass = _networks[idx].pass;
                    Serial.printf("[WiFi] Connected to: %s\n", _activeSsid.c_str());
                    return;
                }
                delay(100);
            }
            Serial.printf("[WiFi] Failed: %s (timeout)\n", _networks[idx].ssid.c_str());
        }

        // Fallback: try first build-time network if not already tried
        if (_networkCount > 0 && _activeSsid != _networks[0].ssid) {
            _activeSsid = _networks[0].ssid;
            _activePass = _networks[0].pass;
        } else if (_networkCount > 0) {
            _activeSsid = _networks[0].ssid;
            _activePass = _networks[0].pass;
        }
        Serial.printf("[WiFi] STA mode — trying: %s\n", _activeSsid.c_str());
        _connectSta();
    } else {
        Serial.println("[WiFi] No credentials configured — starting AP for provisioning");
        _scanAndCache();
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
        // Persist active credentials to NVS — survives OTA updates
        _saveCredentials();
    }

    // ── STA just disconnected ────────────────────────────────
    if (!connected && _staWasConnected) {
        _staWasConnected = false;
        _staConnectedAt = 0;
        Serial.println("[WiFi] STA connection lost!");
    }

    // ── AP shutdown: turn off AP once STA is stable AND no portal clients ──
    if (connected && _apActive && _staConnectedAt > 0) {
        unsigned long apAge = now - _staConnectedAt;
        if (apAge > WIFI_AP_SHUTDOWN_DELAY) {
#ifdef ESP32
            int clients = WiFi.softAPgetStationNum();
#else
            int clients = wifi_softap_get_station_num();
#endif
            if (clients > 0 && apAge < WIFI_AP_MAX_LINGER_MS) {
                // Portal still in use — keep AP alive but log periodically
                static unsigned long lastLog = 0;
                if (now - lastLog > 10000) {
                    Serial.printf("[WiFi] AP still has %d client(s) — keeping alive\n", clients);
                    lastLog = now;
                }
            } else {
                if (clients > 0) {
                    Serial.printf("[WiFi] AP max linger reached — shutting down (%d clients)\n", clients);
                } else {
                    Serial.println("[WiFi] STA stable, no AP clients — shutting down AP");
                }
                _stopAp();
            }
        }
    }

    // ── AP startup: start AP when STA can't connect ──────────
    // After boot timeout OR when WiFi was previously connected but lost
    if (!connected && !_apActive) {
        bool bootTimeout = (now - _bootTime > WIFI_AP_TIMEOUT_MS);
        bool wifiLost = (_staConnectAttempts >= 2);  // 2 failed retries = 20s
        if (!_staConfigured || bootTimeout || wifiLost) {
            // Scan networks for captive portal list if cache has no results.
            // _cachedScanJson is initialized as "[]", so check for <= 2 (empty array).
            // Boot-scan in begin() should have populated it, this is a fallback.
            if (_cachedScanJson.length() <= 2) {
                _scanAndCache();
            }
            Serial.println("[WiFi] Starting AP for provisioning");
            _startAp();
        }
    }

    // ── STA reconnect attempts ───────────────────────────────
    // Do NOT call WiFi.begin() while a client is connected to the AP —
    // it disrupts the WiFi stack and breaks the captive portal.
    // But if no clients are connected, we MUST try to reconnect to known networks.
    if (_apActive) {
#ifdef ESP32
        int apClients = WiFi.softAPgetStationNum();
#else
        int apClients = wifi_softap_get_station_num();
#endif
        if (apClients > 0) return;  // Someone is using the portal — don't disrupt
    }

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

    // ── Periodic WiFi scan (only when not in AP mode) ─
    if (!_apActive && (now - _lastScan > WIFI_SCAN_INTERVAL_MS)) {
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

int WiFiManager::getChannel() const {
    if (isStaConnected()) return WiFi.channel();
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
    // When AP is active, return cached results (can't scan while AP runs)
    if (_apActive) {
        return _cachedScanJson;
    }

    int n = WiFi.scanComplete();
    if (n < 0) return _cachedScanJson;  // Return cache if no fresh results

    String json = "[";
    for (int i = 0; i < n; i++) {
        if (i > 0) json += ",";
        json += "{\"ssid\":\"" + WiFi.SSID(i) + "\","
                "\"rssi\":" + String(WiFi.RSSI(i)) + ","
                "\"secure\":" + String(WiFi.encryptionType(i) != 0 ? "true" : "false") + "}";
    }
    json += "]";
    WiFi.scanDelete();

    // Update cache
    _cachedScanJson = json;
    return json;
}

void WiFiManager::_scanAndCache() {
    Serial.println("[WiFi] Scanning networks...");

    // Stop any active connection attempt so scan can run
    WiFi.disconnect(true);
    WiFi.mode(WIFI_STA);
    delay(500);  // Stabilization after disconnect — ESP32-S3 needs time after failed connects

    // Sync scan: 200ms per channel (~2.6s total)
    int n = WiFi.scanNetworks(false, false, false, 200);
    Serial.printf("[WiFi] Found %d networks\n", n);

    if (n > 0) {
        String json = "[";
        for (int i = 0; i < n; i++) {
            String ssid = WiFi.SSID(i);
            if (ssid.isEmpty()) continue;  // Skip hidden networks

            // Escape special JSON characters in SSID
            ssid.replace("\\", "\\\\");
            ssid.replace("\"", "\\\"");

            if (json.length() > 1) json += ",";
            json += "{\"ssid\":\"" + ssid + "\","
                    "\"rssi\":" + String(WiFi.RSSI(i)) + ","
                    "\"secure\":" + String(WiFi.encryptionType(i) != 0 ? "true" : "false") + "}";
        }
        json += "]";
        _cachedScanJson = json;
        Serial.printf("[WiFi] Cached %d networks for portal\n", n);
    } else {
        Serial.println("[WiFi] No networks found — portal will show empty list");
    }
    WiFi.scanDelete();
}

void WiFiManager::_startAp() {
    if (_apActive) return;

    // Set mode to AP (or AP+STA if STA configured)
    WiFi.mode(_staConfigured ? WIFI_AP_STA : WIFI_AP);
    delay(100);

    // Start AP on channel 6, open network, max 4 clients
    WiFi.softAP(_apSsid.c_str(), nullptr, 6, 0, 4);
    _apActive = true;

    delay(100);
    Serial.printf("[WiFi] AP started: %s (IP: %s, ch: 6)\n", _apSsid.c_str(), WiFi.softAPIP().toString().c_str());
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
