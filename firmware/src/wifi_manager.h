#pragma once

#include <Arduino.h>
#include "config.h"

#ifdef ESP32
  #include <WiFi.h>
#else
  #include <ESP8266WiFi.h>
#endif

struct WiFiCredential {
    String ssid;
    String pass;
};

class WiFiManager {
public:
    void begin(const char* apSsid, const char* ssids[], const char* passes[], int count);
    void loop();
    bool isStaConnected() const;
    bool isApActive() const { return _apActive; }
    String getStaIp() const;
    String getApIp() const;
    String getApSsid() const { return _apSsid; }
    String getConnectedSsid() const;
    int getRssi() const;
    int getChannel() const;

    // Runtime WiFi update (from captive portal)
    void setStaCredentials(const String& ssid, const String& pass);

    // WiFi scan results (for captive portal)
    String getScanResultsJson();

private:
    String _apSsid;

    // Multi-network credentials (build-time)
    WiFiCredential _networks[MAX_WIFI_NETWORKS];
    int _networkCount = 0;

    // Currently active credential (from portal or best match)
    String _activeSsid;
    String _activePass;

    unsigned long _lastReconnectAttempt = 0;
    unsigned long _lastScan = 0;
    bool _staConfigured = false;

    // SoftAP provisioning state
    bool _apActive = false;
    bool _staWasConnected = false;
    unsigned long _staConnectedAt = 0;
    unsigned long _bootTime = 0;
    int _staConnectAttempts = 0;

    void _addNetwork(const char* ssid, const char* pass);
    int _findBestNetwork();  // Scan-based: returns index of best matching network
    void _startAp();
    void _stopAp();
    void _connectSta();
    void _saveCredentials();
    void _loadCredentials();
    void _updateWiFiMode();
    void _scanAndCache();    // Scan networks and cache results before AP starts

    // Cached scan results (JSON string, populated before AP starts)
    String _cachedScanJson = "[]";
};
