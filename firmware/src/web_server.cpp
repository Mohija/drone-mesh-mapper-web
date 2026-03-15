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
h1{font-size:20px;margin-bottom:4px;color:#14b8a6}
.sub{font-size:11px;color:#64748b;margin-bottom:16px}
.card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:12px}
.card h2{font-size:14px;color:#94a3b8;margin-bottom:10px}
label{display:block;font-size:12px;color:#94a3b8;margin-bottom:4px}
input{width:100%;padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px;margin-bottom:10px}
button{padding:10px 20px;background:#14b8a6;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%}
button:disabled{opacity:0.5}
.s{font-size:12px;padding:6px 10px;border-radius:6px;margin-bottom:6px}
.ok{background:rgba(34,197,94,0.15);color:#22c55e}
.err{background:rgba(239,68,68,0.15);color:#ef4444}
.warn{background:rgba(234,179,8,0.15);color:#eab308}
.info{background:rgba(59,130,246,0.15);color:#60a5fa}
.net{display:flex;align-items:center;padding:10px;border-bottom:1px solid #334155;font-size:13px;cursor:pointer;gap:8px}
.net:hover{background:#334155;border-radius:4px}
.net.sel{background:rgba(20,184,166,0.15);border:1px solid #14b8a6;border-radius:6px}
.bar{width:40px;height:4px;background:#334155;border-radius:2px;overflow:hidden}
.bar>div{height:100%;border-radius:2px}
.scan-btn{padding:6px 12px;font-size:11px;background:#334155;border:1px solid #475569;border-radius:6px;color:#94a3b8;cursor:pointer;width:auto;margin-top:8px}
</style>
</head>
<body>
<h1>FlightArc Receiver</h1>
<div class="sub" id="ver"></div>

<div class="card">
<h2>Status</h2>
<div id="st">Laden...</div>
</div>

<div class="card">
<h2>WLAN-Netzwerk waehlen</h2>
<div id="nets">Suche Netzwerke...</div>
<div style="font-size:11px;color:#64748b;margin-top:6px">Netzwerke wurden vor dem Hotspot-Start gescannt. Nicht gefunden? SSID unten manuell eingeben.</div>
</div>

<div class="card" id="pw-card" style="display:none">
<h2>Passwort fuer <span id="sel-name" style="color:#14b8a6"></span></h2>
<input id="pass" type="password" placeholder="WLAN-Passwort eingeben" autofocus>
<button onclick="doConnect()" id="con-btn">Verbinden</button>
<div id="msg" style="margin-top:10px;font-size:13px"></div>
</div>

<div class="card">
<h2>Netzwerk nicht gefunden?</h2>
<label>SSID manuell eingeben</label>
<input id="man-ssid" placeholder="WLAN-Name">
<label>Passwort</label>
<input id="man-pass" type="password" placeholder="WLAN-Passwort">
<button onclick="doManual()">Manuell verbinden</button>
<div id="man-msg" style="margin-top:10px;font-size:13px"></div>
</div>

<div class="card" style="background:rgba(20,184,166,0.05);border-color:rgba(20,184,166,0.2)">
<p style="font-size:11px;color:#94a3b8;line-height:1.5">
Standort des Empfaengers kannst du ueber die FlightArc Web-App setzen:
<strong>Administration → Empfaenger → Standort setzen</strong>
</p>
</div>

<script>
var sel='',connecting=false,checkTimer=null;
function $(id){return document.getElementById(id)}

function sigBar(rssi){
  var p=Math.min(100,Math.max(0,(rssi+90)*2.5));
  var c=p>60?'#22c55e':p>30?'#eab308':'#ef4444';
  return '<div class="bar"><div style="width:'+p+'%;background:'+c+'"></div></div>';
}

function pick(ssid){
  sel=ssid;
  $('sel-name').textContent=ssid;
  $('pw-card').style.display='block';
  $('pass').value='';
  $('pass').focus();
  $('msg').innerHTML='';
  // Highlight selected
  document.querySelectorAll('.net').forEach(function(el){
    el.classList.toggle('sel',el.dataset.ssid===ssid);
  });
}

function loadStatus(){
  fetch('/status').then(function(r){return r.json()}).then(function(d){
    var h='';
    if(d.wifi_connected){
      h+='<div class="s ok">WiFi: '+d.wifi_ssid+' ('+d.wifi_rssi+' dBm)</div>';
    } else {
      h+='<div class="s err">WiFi: Nicht verbunden</div>';
    }
    if(d.ap_active) h+='<div class="s warn">Hotspot: '+d.ap_ssid+'</div>';
    h+='<div class="s '+(d.backend_ok?'ok':'warn')+'">Backend: '+(d.backend_ok?'Verbunden':'Nicht erreichbar')+'</div>';
    if(d.detections>0) h+='<div class="s info">Erkennungen: '+d.detections+'</div>';
    h+='<div class="s" style="background:#1e293b;color:#64748b">Uptime: '+Math.floor(d.uptime/60)+'min | Heap: '+Math.floor(d.free_heap/1024)+'KB</div>';
    $('st').innerHTML=h;
    $('ver').textContent='Firmware v'+(d.firmware_version||'?')+' | '+(d.hardware_type||'?');

    // If we were connecting, check result
    if(connecting && d.wifi_connected){
      connecting=false;
      if(checkTimer){clearInterval(checkTimer);checkTimer=null;}
      $('msg').innerHTML='<div class="s ok" style="margin:0">Verbunden mit '+d.wifi_ssid+'!</div>';
      $('con-btn').disabled=false;
    }
  }).catch(function(){});
}

function loadNets(){
  fetch('/scan').then(function(r){return r.json()}).then(function(nets){
    if(!nets.length){
      $('nets').innerHTML='<div style="font-size:12px;color:#64748b;padding:8px 0">Keine Netzwerke gefunden. Erneut scannen.</div>';
      return;
    }
    // Sort by signal strength
    nets.sort(function(a,b){return b.rssi-a.rssi});
    // Remove duplicates (same SSID, keep strongest)
    var seen={},unique=[];
    nets.forEach(function(n){
      if(n.ssid && !seen[n.ssid]){seen[n.ssid]=1;unique.push(n)}
    });
    $('nets').innerHTML=unique.map(function(n){
      var lock=n.secure?'&#x1f512;':'';
      return '<div class="net'+(n.ssid===sel?' sel':'')+'" data-ssid="'+n.ssid+'" onclick="pick(\''+n.ssid.replace(/'/g,"\\'")+'\')">'+
        '<span style="flex:1">'+lock+' '+n.ssid+'</span>'+
        sigBar(n.rssi)+
        '<span style="color:#64748b;font-size:11px;min-width:50px;text-align:right">'+n.rssi+' dBm</span></div>';
    }).join('');
  }).catch(function(){
    $('nets').innerHTML='<div style="font-size:12px;color:#64748b">Scan laeuft...</div>';
  });
}

function doManual(){
  var s=$('man-ssid').value,p=$('man-pass').value;
  if(!s){$('man-msg').innerHTML='<div class="s err" style="margin:0">SSID eingeben</div>';return}
  sel=s;
  connecting=true;
  $('man-msg').innerHTML='<div class="s info" style="margin:0">Verbinde mit '+s+'...</div>';
  fetch('/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:s,password:p})})
    .then(function(r){return r.json()}).then(function(){
      var checks=0;
      checkTimer=setInterval(function(){
        checks++;loadStatus();
        if(checks>=3&&connecting){
          $('man-msg').innerHTML='<div class="s err" style="margin:0">Verbindung fehlgeschlagen. Passwort pruefen.</div>';
          connecting=false;clearInterval(checkTimer);checkTimer=null;
        }
      },5000);
    }).catch(function(){$('man-msg').innerHTML='<div class="s err" style="margin:0">Fehler</div>';connecting=false;});
}

function doConnect(){
  if(!sel){$('msg').innerHTML='<div class="s err" style="margin:0">Zuerst ein Netzwerk waehlen</div>';return}
  var p=$('pass').value;
  connecting=true;
  $('con-btn').disabled=true;
  $('msg').innerHTML='<div class="s info" style="margin:0">Verbinde mit '+sel+'...</div>';

  fetch('/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:sel,password:p})})
    .then(function(r){return r.json()}).then(function(d){
      // Start polling for connection result
      var checks=0;
      checkTimer=setInterval(function(){
        checks++;
        loadStatus();
        if(checks>=3 && connecting){
          // Still not connected after 15s
          $('msg').innerHTML='<div class="s err" style="margin:0">Verbindung fehlgeschlagen. Passwort pruefen und erneut versuchen.</div>';
          connecting=false;
          $('con-btn').disabled=false;
          clearInterval(checkTimer);checkTimer=null;
        }
      },5000);
    }).catch(function(){
      $('msg').innerHTML='<div class="s err" style="margin:0">Fehler beim Senden</div>';
      connecting=false;$('con-btn').disabled=false;
    });
}

// Handle Enter key in password field
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&document.activeElement===$('pass'))doConnect()});

loadStatus();loadNets();
setInterval(loadStatus,5000);
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
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["hardware_type"] = HARDWARE_TYPE;
        doc["has_location"] = _portal->_hasLocation;
        if (_portal->_hasLocation) {
            doc["latitude"] = _portal->_lat;
            doc["longitude"] = _portal->_lon;
        }
        String out;
        serializeJson(doc, out);
        server.send(200, "application/json", out);
    });

    // Catch-all: redirect any unknown URL to the portal page
    // Required for captive portal detection on Android/Windows/iOS
    server.onNotFound([]() {
        server.sendHeader("Location", "http://192.168.4.1/", true);
        server.send(302, "text/plain", "");
    });

    server.begin();
    Serial.printf("[Portal] Web server started on port %d\n", WEB_SERVER_PORT);
}

void CaptivePortal::loop() {
    // Start/stop DNS based on AP state
    bool apActive = _wifi && _wifi->isApActive();
    if (apActive && !_dnsRunning) {
        // Captive DNS: redirect ALL domains to the ESP's AP IP
        _dns.setErrorReplyCode(DNSReplyCode::NoError);
        _dns.start(53, "*", WiFi.softAPIP());
        _dnsRunning = true;
        Serial.printf("[Portal] DNS started — all domains → %s\n", WiFi.softAPIP().toString().c_str());
    } else if (!apActive && _dnsRunning) {
        _dns.stop();
        _dnsRunning = false;
        Serial.println("[Portal] DNS stopped");
    }

    if (_dnsRunning) {
        _dns.processNextRequest();
    }
    server.handleClient();
}
