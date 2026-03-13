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
    String getStaIp() const;
    String getApIp() const;
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

    void _startAp();
    void _connectSta();
    void _saveCredentials();
    void _loadCredentials();
};
