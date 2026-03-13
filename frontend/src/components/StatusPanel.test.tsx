import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StatusPanel from './StatusPanel';
import { createMockDrone } from '../test/mocks';

vi.mock('../elevationGrid', () => ({
  getElevation: vi.fn().mockReturnValue(null),
  onGridReady: vi.fn().mockReturnValue(() => {}),
  isGridReady: vi.fn().mockReturnValue(false),
}));

vi.mock('../lookupCache', () => ({
  getCachedLookup: vi.fn().mockReturnValue(null),
  setCachedLookup: vi.fn(),
  getCachedNfz: vi.fn().mockReturnValue(null),
  setCachedNfz: vi.fn(),
}));

vi.mock('../config/noFlyZones', () => ({
  DIPUL_WMS_URL: 'https://test.wms/wms',
  getWmsLayerString: vi.fn().mockReturnValue(''),
  NFZ_LAYERS: [],
}));

vi.mock('../api', () => ({
  lookupAircraft: vi.fn().mockResolvedValue({ identifier: 'TEST', found: false }),
  reverseGeocode: vi.fn().mockResolvedValue(null),
}));

function renderPanel(droneOverrides = {}, onClose = vi.fn()) {
  const drone = createMockDrone(droneOverrides);
  return {
    drone,
    onClose,
    ...render(
      <MemoryRouter>
        <StatusPanel drone={drone} onClose={onClose} />
      </MemoryRouter>
    ),
  };
}

describe('StatusPanel', () => {
  it('renders drone name and ID', () => {
    renderPanel();
    expect(screen.getByText('Test Drone')).toBeInTheDocument();
    expect(screen.getByText(/TEST001/)).toBeInTheDocument();
  });

  it('shows signal strength', () => {
    renderPanel({ signal_strength: -55 });
    expect(screen.getByText(/-55 dBm/)).toBeInTheDocument();
  });

  it('shows battery percentage', () => {
    renderPanel({ battery: 72.5 });
    expect(screen.getByText('72.5%')).toBeInTheDocument();
  });

  it('shows position data', () => {
    renderPanel({ latitude: 50.123456, longitude: 8.654321 });
    expect(screen.getByText('50.123456')).toBeInTheDocument();
    expect(screen.getByText('8.654321')).toBeInTheDocument();
  });

  it('shows altitude and speed', () => {
    renderPanel({ altitude: 150.3, speed: 18.7 });
    expect(screen.getByText('150.3 m')).toBeInTheDocument();
    expect(screen.getByText(/18\.7 m\/s/)).toBeInTheDocument();
  });

  it('shows flight pattern', () => {
    renderPanel({ flight_pattern: 'circular' });
    expect(screen.getByText('circular')).toBeInTheDocument();
  });

  it('shows FAA data', () => {
    renderPanel();
    expect(screen.getByText('DJI')).toBeInTheDocument();
    expect(screen.getByText('Mavic 3')).toBeInTheDocument();
    expect(screen.getByText('SN00011234')).toBeInTheDocument();
  });

  it('shows status label for active drone', () => {
    renderPanel({ status: 'active' });
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
  });

  it('shows status label for error drone', () => {
    renderPanel({ status: 'error' });
    expect(screen.getByText('Fehler')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    renderPanel({}, onClose);
    const closeBtn = screen.getByText('×');
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has details button', () => {
    renderPanel();
    expect(screen.getByText('Details anzeigen')).toBeInTheDocument();
  });

  it('shows distance when available', () => {
    renderPanel({ distance: 2500 });
    expect(screen.getByText('2.50 km')).toBeInTheDocument();
  });
});
