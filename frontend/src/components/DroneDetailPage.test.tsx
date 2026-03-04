import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DroneDetailPage from './DroneDetailPage';
import { createMockDrone, createMockHistory } from '../test/mocks';

const mockFetchDrone = vi.fn();
const mockFetchDroneHistory = vi.fn();

vi.mock('../api', () => ({
  fetchDrone: (...args: unknown[]) => mockFetchDrone(...args),
  fetchDroneHistory: (...args: unknown[]) => mockFetchDroneHistory(...args),
}));

function renderDetailPage(droneId = 'TEST001') {
  return render(
    <MemoryRouter initialEntries={[`/drone/${droneId}`]}>
      <Routes>
        <Route path="/drone/:id" element={<DroneDetailPage />} />
        <Route path="/" element={<div>Map Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockFetchDrone.mockReset();
  mockFetchDroneHistory.mockReset();
});

describe('DroneDetailPage', () => {
  it('shows loading state initially', () => {
    mockFetchDrone.mockReturnValue(new Promise(() => {})); // never resolves
    mockFetchDroneHistory.mockReturnValue(new Promise(() => {}));
    renderDetailPage();
    expect(screen.getByText('Laden...')).toBeInTheDocument();
  });

  it('renders drone details after loading', async () => {
    const drone = createMockDrone({ name: 'Desert Eagle', basic_id: 'AZTEST001' });
    const history = createMockHistory(3);
    mockFetchDrone.mockResolvedValue(drone);
    mockFetchDroneHistory.mockResolvedValue({ drone_id: 'AZTEST001', history });

    renderDetailPage('AZTEST001');

    await waitFor(() => {
      expect(screen.getByText('Desert Eagle')).toBeInTheDocument();
    });
  });

  it('shows drone status', async () => {
    const drone = createMockDrone({ status: 'active' });
    mockFetchDrone.mockResolvedValue(drone);
    mockFetchDroneHistory.mockResolvedValue({ drone_id: 'TEST001', history: [] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });
  });

  it('shows live stats', async () => {
    const drone = createMockDrone({
      signal_strength: -48,
      battery: 75.0,
      altitude: 120.5,
      speed: 15.3,
    });
    mockFetchDrone.mockResolvedValue(drone);
    mockFetchDroneHistory.mockResolvedValue({ drone_id: 'TEST001', history: [] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('-48 dBm')).toBeInTheDocument();
      expect(screen.getByText('75.0%')).toBeInTheDocument();
      // Altitude appears in both Live-Status and Position cards
      expect(screen.getAllByText('120.5 m')).toHaveLength(2);
      expect(screen.getByText('15.3 m/s')).toBeInTheDocument();
    });
  });

  it('shows FAA registration data', async () => {
    const drone = createMockDrone();
    mockFetchDrone.mockResolvedValue(drone);
    mockFetchDroneHistory.mockResolvedValue({ drone_id: 'TEST001', history: [] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('DJI')).toBeInTheDocument();
      expect(screen.getByText('Mavic 3')).toBeInTheDocument();
      expect(screen.getByText('Commercial')).toBeInTheDocument();
    });
  });

  it('shows error state when drone not found', async () => {
    mockFetchDrone.mockRejectedValue(new Error('Not found'));
    mockFetchDroneHistory.mockRejectedValue(new Error('Not found'));

    renderDetailPage('NONEXISTENT');

    await waitFor(() => {
      expect(screen.getByText('Drohne nicht gefunden')).toBeInTheDocument();
    });
  });

  it('has back to map button on error', async () => {
    mockFetchDrone.mockRejectedValue(new Error('Not found'));
    mockFetchDroneHistory.mockRejectedValue(new Error('Not found'));

    renderDetailPage('NONEXISTENT');

    await waitFor(() => {
      expect(screen.getByText('Zur Karte')).toBeInTheDocument();
    });
  });

  it('navigates back to map on back button click', async () => {
    const drone = createMockDrone();
    mockFetchDrone.mockResolvedValue(drone);
    mockFetchDroneHistory.mockResolvedValue({ drone_id: 'TEST001', history: [] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Drone')).toBeInTheDocument();
    });

    const backBtn = screen.getByText(/Karte/);
    await userEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Map Page')).toBeInTheDocument();
    });
  });
});
