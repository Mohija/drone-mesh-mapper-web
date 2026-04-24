import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReceiverHealthPanel from './ReceiverHealthPanel';
import type { ReceiverNode } from '../../api';

function makeNode(overrides: Partial<ReceiverNode> = {}): ReceiverNode {
  const now = Date.now() / 1000;
  return {
    id: 'abc12345',
    tenantId: 'tid',
    name: 'test-node',
    hardwareType: 'esp32-s3',
    firmwareVersion: '1.5.3',
    isActive: true,
    lastLatitude: null,
    lastLongitude: null,
    lastLocationAccuracy: null,
    lastHeartbeat: now - 30,
    lastIp: '192.168.1.50',
    wifiSsid: 'TestAP',
    wifiRssi: -55,
    freeHeap: 180000,
    uptimeSeconds: 3600,
    wifiChannel: 6,
    apActive: false,
    lastErrorCount: 0,
    lastHttpCodeReported: 200,
    lastTelemetryAt: now - 30,
    gpsPresent: null,
    gpsHasFix: null,
    gpsSatellites: null,
    gpsHdop: null,
    gpsLastFixAgeSeconds: null,
    gpsMessagesParsed: null,
    gpsLastMessageAgeSeconds: null,
    gpsSatsInView: null,
    totalDetections: 42,
    detectionsSinceBoot: 10,
    coverageRadius: 1000,
    antennaType: 'pcb',
    status: 'online',
    createdAt: now - 86400,
    updatedAt: now - 30,
    lastBuildAt: null,
    lastBuildSize: null,
    lastBuildSha256: null,
    lastBuildVersion: null,
    lastBuildMergedSize: null,
    otaUpdatePending: false,
    otaLastAttempt: null,
    otaLastResult: null,
    firmwareHistory: [],
    ...overrides,
  };
}

describe('ReceiverHealthPanel', () => {
  it('renders status pill + all three panels for a healthy node', () => {
    render(<ReceiverHealthPanel node={makeNode()} />);
    expect(screen.getByTestId('receiver-health-abc12345')).toBeInTheDocument();
    expect(screen.getAllByText(/online/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Verbindung/i)).toBeInTheDocument();
    expect(screen.getByText(/Laufzeit/i)).toBeInTheDocument();
    expect(screen.getByText(/Backend-Kommunikation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/TestAP/).length).toBeGreaterThan(0);
  });

  it('raises a warning for weak RSSI (between -65 and -80)', () => {
    render(<ReceiverHealthPanel node={makeNode({ wifiRssi: -75 })} />);
    expect(screen.getByText(/Warnungen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/-75 dBm/).length).toBeGreaterThan(0);
  });

  it('raises an error for very weak RSSI (<= -80)', () => {
    render(<ReceiverHealthPanel node={makeNode({ wifiRssi: -85 })} />);
    expect(screen.getByText(/^Fehler$/)).toBeInTheDocument();
  });

  it('raises an error for AP mode (captive portal)', () => {
    render(<ReceiverHealthPanel node={makeNode({ apActive: true })} />);
    expect(screen.getAllByText(/AP-Modus/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Captive-Portal aktiv/i).length).toBeGreaterThan(0);
  });

  it('raises an error for dangerously low heap', () => {
    render(<ReceiverHealthPanel node={makeNode({ freeHeap: 30000 })} />);
    expect(screen.getAllByText(/Fehler/i).length).toBeGreaterThan(0);
  });

  it('raises an error for high error counter', () => {
    render(<ReceiverHealthPanel node={makeNode({ lastErrorCount: 15, lastHttpCodeReported: 502 })} />);
    expect(screen.getAllByText(/Fehlerzähler 15/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/502/).length).toBeGreaterThan(0);
  });

  it('flags outdated firmware as warning', () => {
    render(<ReceiverHealthPanel node={makeNode({ firmwareVersion: '1.4.0' })} />);
    expect(screen.getAllByText(/1\.4\.0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Warnungen/i)).toBeInTheDocument();
  });

  it('shows offline status + high heartbeat-age', () => {
    const now = Date.now() / 1000;
    render(<ReceiverHealthPanel node={makeNode({ status: 'offline', lastHeartbeat: now - 86400 })} />);
    expect(screen.getAllByText(/offline/i).length).toBeGreaterThan(0);
    // 1 day old
    expect(screen.getAllByText(/1 Tag/).length).toBeGreaterThan(0);
  });

  it('shows "nie" when the node never reported', () => {
    render(<ReceiverHealthPanel node={makeNode({ lastHeartbeat: null, status: 'offline' })} />);
    expect(screen.getAllByText(/nie/).length).toBeGreaterThan(0);
  });

  it('renders auxiliary info row with id and hardware type', () => {
    render(<ReceiverHealthPanel node={makeNode()} />);
    expect(screen.getAllByText(/abc12345/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/esp32-s3/).length).toBeGreaterThan(0);
  });
});
