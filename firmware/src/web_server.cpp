#include "web_server.h"
#include "config.h"

#ifdef ESP32
  #include <WebServer.h>
  static WebServer server(WEB_SERVER_PORT);
#else
  #include <ESP8266WebServer.h>
  static ESP8266WebServer server(WEB_SERVER_PORT);
#endif

static CaptivePortal* _portal = nullptr;

// Captive Portal HTML (inline to avoid SPIFFS)
static const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlightArc Receiver</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:16px;max-width:480px;margin:0 auto}
h1{font-size:20px;margin-bottom:16px;color:#14b8a6}
.card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:12px}
.card h2{font-size:14px;color:#94a3b8;margin-bottom:10px}
label{display:block;font-size:12px;color:#94a3b8;margin-bottom:4px}
input,select{width:100%;padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px;margin-bottom:10px}
button{padding:10px 20px;background:#14b8a6;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%}
button:disabled{opacity:0.5}
.status{font-size:12px;padding:6px 10px;border-radius:6px;margin-bottom:8px}
.ok{background:rgba(34,197,94,0.15);color:#22c55e}
.err{background:rgba(239,68,68,0.15);color:#ef4444}
.warn{background:rgba(234,179,8,0.15);color:#eab308}
.net{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #334155;font-size:13px;cursor:pointer}
.net:hover{background:#334155;border-radius:4px}
#msg{margin-top:10px;font-size:13px}
</style>
</head>
<body>
<h1>FlightArc Receiver</h1>

<div class="card">
<h2>Status</h2>
<div id="st">Laden...</div>
</div>

<div class="card">
<h2>WiFi-Verbindung</h2>
<div id="nets">Scanne...</div>
<label>SSID</label>
<input id="ssid" placeholder="WiFi-Name">
<label>Passwort</label>
<input id="pass" type="password" placeholder="WiFi-Passwort">
<button onclick="doConnect()">Verbinden</button>
<div id="msg"></div>
</div>

<div class="card">
<h2>Standort</h2>
<p style="font-size:12px;color:#94a3b8;margin-bottom:10px">
GPS-Standort vom Handy an den Empfaenger uebermitteln.
</p>
<button onclick="sendLocation()" id="locBtn">Standort senden</button>
<div id="loc" style="margin-top:8px;font-size:12px"></div>
</div>

<script>
function $(id){return document.getElementById(id)}
function load(){
  fetch('/status').then(r=>r.json()).then(d=>{
    let h='';
    h+='<div class="status '+(d.wifi_connected?'ok':'err')+'">WiFi: '+(d.wifi_connected?d.wifi_ssid+' ('+d.wifi_rssi+' dBm)':'Nicht verbunden')+'</div>';
    if(d.ap_active)h+='<div class="status warn">Hotspot aktiv: '+d.ap_ssid+' (IP: '+d.ap_ip+')</div>';
    h+='<div class="status '+(d.backend_ok?'ok':'warn')+'">Backend: '+(d.backend_ok?'Erreichbar':'Nicht erreichbar')+'</div>';
    h+='<div class="status ok">Erkennungen: '+d.detections+'</div>';
    h+='<div class="status">Uptime: '+Math.floor(d.uptime/60)+'min | Heap: '+Math.floor(d.free_heap/1024)+'KB</div>';
    $('st').innerHTML=h;
  }).catch(()=>{$('st').innerHTML='<div class="status err">Fehler</div>'});

  fetch('/scan').then(r=>r.json()).then(nets=>{
    if(!nets.length){$('nets').innerHTML='<div style="font-size:12px;color:#64748b">Keine Netzwerke</div>';return}
    $('nets').innerHTML=nets.map(n=>
      '<div class="net" onclick="$(\'ssid\').value=\''+n.ssid+'\'">'+
      '<span>'+n.ssid+'</span><span style="color:#64748b">'+n.rssi+' dBm</span></div>'
    ).join('');
  }).catch(()=>{});
}
function doConnect(){
  let s=$('ssid').value,p=$('pass').value;
  if(!s){$('msg').innerHTML='<span style="color:#ef4444">SSID eingeben</span>';return}
  $('msg').innerHTML='Verbinde...';
  fetch('/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:s,password:p})})
    .then(r=>r.json()).then(d=>{
      $('msg').innerHTML='<span style="color:#22c55e">'+d.message+'</span>';
      setTimeout(load,3000);
    }).catch(()=>{$('msg').innerHTML='<span style="color:#ef4444">Fehler</span>'});
}
function sendLocation(){
  $('locBtn').disabled=true;
  $('loc').innerHTML='GPS wird abgerufen...';
  navigator.geolocation.getCurrentPosition(pos=>{
    fetch('/location',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy})})
      .then(r=>r.json()).then(d=>{
        $('loc').innerHTML='<span style="color:#22c55e">'+d.message+'</span>';
        $('locBtn').disabled=false;
      });
  },err=>{
    $('loc').innerHTML='<span style="color:#ef4444">GPS-Fehler: '+err.message+'</span>';
    $('locBtn').disabled=false;
  },{enableHighAccuracy:true,timeout:15000});
}
load();setInterval(load,10000);
</script>
</body>
</html>
)rawliteral";

void CaptivePortal::begin(WiFiManager* wifi, FlightArcClient* client, OdidScanner* scanner) {
    _wifi = wifi;
    _client = client;
    _scanner = scanner;
    _portal = this;

    // Main page
    server.on("/", HTTP_GET, []() {
        server.send_P(200, "text/html", PORTAL_HTML);
    });

    // Captive portal detection (Android/Apple/Windows)
    server.on("/generate_204", HTTP_GET, []() { server.send_P(200, "text/html", PORTAL_HTML); });
    server.on("/hotspot-detect.html", HTTP_GET, []() { server.send_P(200, "text/html", PORTAL_HTML); });
    server.on("/connecttest.txt", HTTP_GET, []() { server.send_P(200, "text/html", PORTAL_HTML); });

    // WiFi scan results
    server.on("/scan", HTTP_GET, []() {
        if (_portal && _portal->_wifi) {
            server.send(200, "application/json", _portal->_wifi->getScanResultsJson());
        } else {
            server.send(200, "application/json", "[]");
        }
    });

    // Connect to WiFi
    server.on("/connect", HTTP_POST, []() {
        if (!_portal || !_portal->_wifi) {
            server.send(500, "application/json", "{\"error\":\"Not ready\"}");
            return;
        }
        String body = server.arg("plain");
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, body);
        if (err) {
            server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }
        String ssid = doc["ssid"] | "";
        String pass = doc["password"] | "";
        if (ssid.isEmpty()) {
            server.send(400, "application/json", "{\"error\":\"SSID required\"}");
            return;
        }
        _portal->_wifi->setStaCredentials(ssid, pass);
        server.send(200, "application/json", "{\"message\":\"Verbinde mit " + ssid + "...\"}");
    });

    // Receive GPS location from browser
    server.on("/location", HTTP_POST, []() {
        if (!_portal) {
            server.send(500, "application/json", "{\"error\":\"Not ready\"}");
            return;
        }
        String body = server.arg("plain");
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, body);
        if (err) {
            server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }
        _portal->_lat = doc["latitude"] | 0.0f;
        _portal->_lon = doc["longitude"] | 0.0f;
        _portal->_accuracy = doc["accuracy"] | 0.0f;
        _portal->_hasLocation = true;
        Serial.printf("[Portal] Location received: %.6f, %.6f (acc: %.1fm)\n",
                      _portal->_lat, _portal->_lon, _portal->_accuracy);
        server.send(200, "application/json",
                     "{\"message\":\"Standort gespeichert: " +
                     String(_portal->_lat, 5) + ", " + String(_portal->_lon, 5) + "\"}");
    });

    // Status endpoint
    server.on("/status", HTTP_GET, []() {
        if (!_portal) {
            server.send(500, "application/json", "{}");
            return;
        }
        JsonDocument doc;
        doc["wifi_connected"] = _portal->_wifi->isStaConnected();
        doc["wifi_ssid"] = _portal->_wifi->getConnectedSsid();
        doc["wifi_rssi"] = _portal->_wifi->getRssi();
        doc["ap_active"] = _portal->_wifi->isApActive();
        doc["ap_ssid"] = _portal->_wifi->isApActive() ? _portal->_wifi->getApSsid() : "";
        doc["ap_ip"] = _portal->_wifi->getApIp();
        doc["backend_ok"] = _portal->_client->isBackendReachable();
        doc["detections"] = _portal->_scanner->getDetectionCount();
        doc["uptime"] = millis() / 1000;
        doc["free_heap"] = ESP.getFreeHeap();
        doc["has_location"] = _portal->_hasLocation;
        if (_portal->_hasLocation) {
            doc["latitude"] = _portal->_lat;
            doc["longitude"] = _portal->_lon;
        }
        String out;
        serializeJson(doc, out);
        server.send(200, "application/json", out);
    });

    server.begin();
    Serial.printf("[Portal] Web server started on port %d\n", WEB_SERVER_PORT);
}

void CaptivePortal::loop() {
    server.handleClient();
}
