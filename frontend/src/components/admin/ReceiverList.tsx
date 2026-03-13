import { useState, useEffect, useCallback } from 'react';
import {
  fetchReceivers,
  createReceiver,
  updateReceiver,
  deleteReceiver,
  regenerateReceiverKey,
  fetchReceiverStats,
} from '../../api';
import type { ReceiverNode, ReceiverStats } from '../../api';
import ReceiverFlashWizard from './ReceiverFlashWizard';

const HARDWARE_TYPES = [
  { value: 'esp32-s3', label: 'ESP32-S3', desc: 'BLE + WiFi ODID, HTTPS', recommended: true },
  { value: 'esp32-c3', label: 'ESP32-C3', desc: 'BLE + WiFi ODID, HTTPS' },
  { value: 'esp8266', label: 'ESP8266', desc: 'Nur WiFi-Beacon ODID, kein BLE, kein HTTPS', limited: true },
];

interface ShoppingItem {
  name: string;
  desc: string;
  link?: string;
  price?: string;
  required: boolean;
}

const SHOPPING_LISTS: Record<string, { title: string; note: string; items: ShoppingItem[] }> = {
  'esp32-s3': {
    title: 'ESP32-S3 (Empfohlen)',
    note: 'Voller Funktionsumfang: BLE + WiFi Remote ID, HTTPS, viel RAM. Beste Wahl für stationäre Empfänger.',
    items: [
      { name: 'ESP32-S3-DevKitC-1 (N16R8)', desc: '16 MB Flash, 8 MB PSRAM – Board mit USB-C', price: '~8–12 €', required: true },
      { name: 'USB-C Kabel', desc: 'Für Stromversorgung & erstes Flashen', price: '~3 €', required: true },
      { name: 'USB-Netzteil (5V / min. 1A)', desc: 'Für Dauerbetrieb – USB-C oder Micro-USB je nach Board', price: '~5–8 €', required: true },
      { name: '2,4 GHz WiFi-Antenne (IPEX/U.FL)', desc: 'Externe Antenne für bessere WiFi-Beacon-Reichweite. Nur nötig wenn Board keinen PCB-Antennen-Anschluss hat.', price: '~3 €', required: false },
      { name: 'Gehäuse (z.B. 100×68×50 mm ABS IP65)', desc: 'Wetterfestes Gehäuse für Außenmontage, z.B. Sonoff IP66 oder generisches ABS-Gehäuse', price: '~5–10 €', required: true },
      { name: 'Kabelverschraubung M12/M16', desc: 'Für wasserdichte USB-Kabel-Durchführung ins Gehäuse', price: '~2 €', required: false },
      { name: 'Montagematerial (Kabelbinder, Schrauben, Abstandhalter)', desc: 'Zur Befestigung des Boards im Gehäuse und Montage an Mast/Wand', price: '~3–5 €', required: false },
      { name: 'Outdoor PoE-Splitter (5V Micro-USB/USB-C)', desc: 'Für Stromversorgung über Ethernet-Kabel (spart extra Stromkabel)', price: '~8–12 €', required: false },
    ],
  },
  'esp32-c3': {
    title: 'ESP32-C3 (Kompakt)',
    note: 'BLE + WiFi Remote ID, HTTPS – mit RISC-V Kern. Günstiger und kleiner als S3, aber weniger RAM.',
    items: [
      { name: 'ESP32-C3-DevKitM-1', desc: 'RISC-V Board mit BLE 5.0 + WiFi – USB-C', price: '~5–8 €', required: true },
      { name: 'USB-C Kabel', desc: 'Für Stromversorgung & erstes Flashen', price: '~3 €', required: true },
      { name: 'USB-Netzteil (5V / min. 500mA)', desc: 'Für Dauerbetrieb – geringerer Stromverbrauch als S3', price: '~5–8 €', required: true },
      { name: '2,4 GHz WiFi-Antenne (IPEX/U.FL)', desc: 'Externe Antenne für bessere Reichweite (optional bei PCB-Antenne)', price: '~3 €', required: false },
      { name: 'Gehäuse (z.B. 83×58×33 mm ABS IP65)', desc: 'Kompaktes wetterfestes Gehäuse – C3-Board ist klein genug für Mini-Gehäuse', price: '~4–8 €', required: true },
      { name: 'Kabelverschraubung M12', desc: 'Für wasserdichte Kabel-Durchführung', price: '~2 €', required: false },
      { name: 'Montagematerial (Kabelbinder, Schrauben)', desc: 'Befestigung Board + Gehäuse', price: '~3–5 €', required: false },
    ],
  },
  'esp8266': {
    title: 'ESP8266 / NodeMCU (Budget)',
    note: 'Nur WiFi-Beacon ODID – kein BLE, kein HTTPS. Geeignet als günstige Ergänzung an Standorten mit bekanntem WiFi-Beacon-Verkehr.',
    items: [
      { name: 'NodeMCU v2/v3 (ESP8266)', desc: 'ESP-12E Board mit Micro-USB', price: '~3–5 €', required: true },
      { name: 'Micro-USB Kabel', desc: 'Für Stromversorgung & erstes Flashen', price: '~2 €', required: true },
      { name: 'USB-Netzteil (5V / min. 500mA)', desc: 'Für Dauerbetrieb', price: '~5–8 €', required: true },
      { name: 'Gehäuse (z.B. 70×45×30 mm ABS)', desc: 'Kleines Gehäuse – NodeMCU passt in Standard-Projektboxen', price: '~3–5 €', required: true },
      { name: 'Montagematerial', desc: 'Kabelbinder oder doppelseitiges Klebeband zur Befestigung', price: '~2–3 €', required: false },
    ],
  },
};

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  stale: '#eab308',
  offline: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  stale: 'Verzögert',
  offline: 'Offline',
};

function timeAgo(epoch: number | null): string {
  if (!epoch) return 'Nie';
  const seconds = Math.floor(Date.now() / 1000 - epoch);
  if (seconds < 60) return `vor ${seconds}s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

function formatUptime(seconds: number | null): string {
  if (!seconds) return '-';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function ReceiverList() {
  const [receivers, setReceivers] = useState<ReceiverNode[]>([]);
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('esp32-s3');
  const [creating, setCreating] = useState(false);

  // Newly created key (shown once)
  const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Shopping list toggle
  const [showShopping, setShowShopping] = useState(false);

  // Flash wizard
  const [flashNode, setFlashNode] = useState<ReceiverNode | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([fetchReceivers(), fetchReceiverStats()]);
      setReceivers(r);
      setStats(s);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const node = await createReceiver({ name: newName.trim(), hardware_type: newType });
      setNewKey({ id: node.id, key: node.apiKey! });
      setNewName('');
      setShowCreate(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (node: ReceiverNode) => {
    try {
      await updateReceiver(node.id, { is_active: !node.isActive });
      await loadData();
    } catch { /* silent */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReceiver(id);
      await loadData();
    } catch { /* silent */ }
  };

  const handleRegenKey = async (id: string) => {
    try {
      const node = await regenerateReceiverKey(id);
      setNewKey({ id: node.id, key: node.apiKey! });
      setCopied(false);
    } catch { /* silent */ }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Laden...</div>;
  }

  return (
    <div data-testid="receiver-list">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Empfänger</h1>
        <button
          data-testid="receiver-create-btn"
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Neuer Empfänger
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div data-testid="receiver-stats" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Gesamt', value: stats.total, color: 'var(--text-primary)', tid: 'stat-total' },
            { label: 'Online', value: stats.online, color: '#22c55e', tid: 'stat-online' },
            { label: 'Verzögert', value: stats.stale, color: '#eab308', tid: 'stat-stale' },
            { label: 'Offline', value: stats.offline, color: '#6b7280', tid: 'stat-offline' },
            { label: 'Erkennungen', value: stats.totalDetections, color: '#14b8a6', tid: 'stat-detections' },
          ].map(s => (
            <div key={s.label} data-testid={s.tid} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 16px',
              minWidth: 90,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid var(--status-error)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--status-error)',
        }}>
          {error}
        </div>
      )}

      {/* API Key display (shown once after create/regenerate) */}
      {newKey && (
        <div data-testid="api-key-banner" style={{
          background: 'rgba(20,184,166,0.1)',
          border: '1px solid #14b8a6',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#14b8a6' }}>
            API-Key (wird nur einmal angezeigt!)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code data-testid="api-key-value" style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}>
              {newKey.key}
            </code>
            <button
              data-testid="api-key-copy"
              onClick={() => copyKey(newKey.key)}
              style={{
                padding: '6px 12px',
                background: copied ? '#22c55e' : 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: copied ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Kopiert!' : 'Kopieren'}
            </button>
            <button
              data-testid="api-key-dismiss"
              onClick={() => setNewKey(null)}
              style={{
                padding: '6px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Schliessen
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div data-testid="receiver-create-form" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Neuen Empfänger erstellen</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
              <input
                data-testid="receiver-name-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="z.B. Empfänger Dach-Nord"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hardware-Typ</label>
              <select
                data-testid="receiver-type-select"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {HARDWARE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}{t.recommended ? ' ★ Empfohlen' : ''}{t.limited ? ' (eingeschränkt)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              data-testid="receiver-submit-btn"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating || !newName.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Erstellen...' : 'Erstellen'}
            </button>
          </div>
          {newType === 'esp8266' && (
            <div data-testid="esp8266-warning" style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(234,179,8,0.1)',
              border: '1px solid #eab308',
              borderRadius: 6,
              fontSize: 12,
              color: '#eab308',
            }}>
              ESP8266 ist eine Light-Variante: Kein BLE (nur WiFi-Beacon ODID), kein HTTPS, eingeschränkter RAM.
            </div>
          )}

          {/* Shopping list */}
          {SHOPPING_LISTS[newType] && (
            <div data-testid="shopping-list-section" style={{ marginTop: 12 }}>
              <button
                data-testid="shopping-list-toggle"
                onClick={() => setShowShopping(!showShopping)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ transform: showShopping ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
                Einkaufsliste: {SHOPPING_LISTS[newType].title}
              </button>
              {showShopping && (
                <div data-testid="shopping-list-content" style={{
                  marginTop: 8,
                  padding: '12px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    {SHOPPING_LISTS[newType].note}
                  </div>

                  <table data-testid="shopping-list-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Komponente</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Beschreibung</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ca. Preis</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pflicht</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SHOPPING_LISTS[newType].items.map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {item.name}
                          </td>
                          <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                            {item.desc}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {item.price || '-'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              background: item.required ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                              color: item.required ? '#22c55e' : '#6b7280',
                            }}>
                              {item.required ? 'Ja' : 'Optional'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Total estimate */}
                  <div style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    background: 'rgba(20,184,166,0.08)',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Geschätzte Gesamtkosten (Pflichtteile):
                    </span>
                    <span data-testid="shopping-list-total" style={{ fontWeight: 700, color: '#14b8a6' }}>
                      {newType === 'esp32-s3' ? '~21–35 €' : newType === 'esp32-c3' ? '~17–27 €' : '~13–20 €'}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Preise sind Richtwerte (Stand 2026). Bezugsquellen: AliExpress, Amazon, Berrybase, Mouser.
                  </div>

                  {/* Best choice recommendation */}
                  <div data-testid="shopping-recommendation" style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    lineHeight: 1.5,
                    background: newType === 'esp32-s3'
                      ? 'rgba(34,197,94,0.1)'
                      : newType === 'esp32-c3'
                        ? 'rgba(59,130,246,0.1)'
                        : 'rgba(234,179,8,0.1)',
                    border: `1px solid ${newType === 'esp32-s3' ? '#22c55e' : newType === 'esp32-c3' ? '#3b82f6' : '#eab308'}`,
                    color: newType === 'esp32-s3' ? '#22c55e' : newType === 'esp32-c3' ? '#3b82f6' : '#eab308',
                  }}>
                    {newType === 'esp32-s3' && (
                      <>
                        <strong>★ Beste Wahl für dieses Projekt.</strong> Der ESP32-S3 bietet BLE + WiFi Remote ID Erkennung,
                        HTTPS-Verschlüsselung und genug RAM für gleichzeitiges Scannen und Senden. Ideal als stationärer Empfänger.
                      </>
                    )}
                    {newType === 'esp32-c3' && (
                      <>
                        <strong>Gute Alternative.</strong> Der ESP32-C3 bietet ebenfalls BLE + WiFi und HTTPS,
                        ist aber kleiner und günstiger. Ideal wenn Platz oder Budget begrenzt sind. Etwas weniger RAM als der S3.
                      </>
                    )}
                    {newType === 'esp8266' && (
                      <>
                        <strong>Nur für Spezialfälle.</strong> Der ESP8266 erkennt nur WiFi-Beacon ODID — kein BLE, kein HTTPS.
                        Nur sinnvoll als Budget-Ergänzung an Standorten, wo bekannt WiFi-Beacon-Drohnen fliegen.
                        Für den vollen Funktionsumfang wird <strong>ESP32-S3</strong> empfohlen.
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Receiver table */}
      {receivers.length === 0 ? (
        <div data-testid="receiver-empty" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 32,
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: 14,
        }}>
          Noch keine Empfänger erstellt.
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <table data-testid="receiver-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Name</th>
                <th style={thStyle}>Typ</th>
                <th style={thStyle}>Letzter Kontakt</th>
                <th style={thStyle}>Erkennungen</th>
                <th style={thStyle}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {receivers.map(node => (
                <>
                  <tr
                    key={node.id}
                    data-testid={`receiver-row-${node.id}`}
                    onClick={() => setExpandedId(expandedId === node.id ? null : node.id)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: expandedId === node.id ? 'rgba(59,130,246,0.05)' : 'transparent',
                      opacity: node.isActive ? 1 : 0.5,
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span data-testid={`receiver-status-${node.id}`} style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLORS[node.status],
                        boxShadow: node.status === 'online' ? `0 0 6px ${STATUS_COLORS.online}` : 'none',
                      }} />
                      <div data-testid={`receiver-status-label-${node.id}`} style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {STATUS_LABELS[node.status]}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      {node.name}
                      {!node.isActive && (
                        <span style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(239,68,68,0.15)',
                          color: '#ef4444',
                          marginLeft: 8,
                        }}>
                          Deaktiviert
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ fontSize: 12 }}>{node.hardwareType.toUpperCase()}</span>
                      {node.hardwareType === 'esp8266' && (
                        <span style={{
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(234,179,8,0.15)',
                          color: '#eab308',
                          marginLeft: 4,
                        }}>
                          Light
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12 }}>
                      {timeAgo(node.lastHeartbeat)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ color: '#14b8a6', fontWeight: 600 }}>{node.totalDetections}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                        <button
                          data-testid={`receiver-toggle-${node.id}`}
                          onClick={() => handleToggleActive(node)}
                          title={node.isActive ? 'Deaktivieren' : 'Aktivieren'}
                          style={actionBtnStyle}
                        >
                          {node.isActive ? 'Deakt.' : 'Akt.'}
                        </button>
                        <button
                          data-testid={`receiver-delete-${node.id}`}
                          onClick={() => handleDelete(node.id)}
                          title="Löschen"
                          style={{ ...actionBtnStyle, color: '#ef4444' }}
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === node.id && (
                    <tr key={`${node.id}-detail`} data-testid={`receiver-detail-${node.id}`}>
                      <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--bg-primary)' }}>
                        <div data-testid={`receiver-detail-grid-${node.id}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px', fontSize: 12 }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>ID:</span> <code style={{ fontSize: 11 }}>{node.id}</code></div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Firmware:</span> {node.firmwareVersion || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>IP:</span> {node.lastIp || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>WiFi:</span> {node.wifiSsid || '-'} {node.wifiRssi != null && `(${node.wifiRssi} dBm)`}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Heap:</span> {node.freeHeap != null ? `${(node.freeHeap / 1024).toFixed(0)} KB` : '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Uptime:</span> {formatUptime(node.uptimeSeconds)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Standort:</span> {node.lastLatitude != null ? `${node.lastLatitude.toFixed(5)}, ${node.lastLongitude?.toFixed(5)}` : '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Seit Boot:</span> {node.detectionsSinceBoot}</div>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                          <button
                            data-testid={`receiver-flash-${node.id}`}
                            onClick={() => setFlashNode(node)}
                            style={{
                              padding: '5px 12px',
                              background: '#14b8a6',
                              border: 'none',
                              borderRadius: 6,
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            Firmware flashen
                          </button>
                          <button
                            data-testid={`receiver-regen-key-${node.id}`}
                            onClick={() => handleRegenKey(node.id)}
                            style={{
                              padding: '5px 12px',
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: 11,
                            }}
                          >
                            API-Key regenerieren
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flash Wizard Modal */}
      {flashNode && (
        <ReceiverFlashWizard
          node={flashNode}
          onClose={() => { setFlashNode(null); loadData(); }}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  textAlign: 'center',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
};
