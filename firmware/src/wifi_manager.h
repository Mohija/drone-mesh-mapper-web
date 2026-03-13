#pragma once

#include <Arduino.h>

#ifdef ESP32
  #include <WiFi.h>
#else
  #include <ESP8266WiFi.h>
#endif

class WiFiManager {
public:
    void begin(const char* apSsid, const char* staSsid, const char* staPass);
    void loop();
    bool isStaConnected() const;
    bool isApActive() const { return _apActive; }
    String getStaIp() const;
    String getApIp() const;
    String getApSsid() const { return _apSsid; }
    String getConnectedSsid() const;
    int getRssi() const;

    // Runtime WiFi update (from captive portal)
    void setStaCredentials(const String& ssid, const String& pass);

    // WiFi scan results (for captive portal)
    String getScanResultsJson();

private:
    String _apSsid;
    String _staSsid;
    String _staPass;
    unsigned long _lastReconnectAttempt = 0;
    unsigned long _lastScan = 0;
    bool _staConfigured = false;

    // SoftAP provisioning state
    bool _apActive = false;
    bool _staWasConnected = false;
    unsigned long _staConnectedAt = 0;     // When STA connected (for AP shutdown delay)
    unsigned long _bootTime = 0;           // millis() at begin()
    int _staConnectAttempts = 0;           // Track failed attempts

    void _startAp();
    void _stopAp();
    void _connectSta();
    void _saveCredentials();
    void _loadCredentials();
    void _updateWiFiMode();
};
