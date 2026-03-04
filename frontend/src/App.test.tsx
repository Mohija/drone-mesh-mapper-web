import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// Mock components that use complex deps (Leaflet, fetch)
vi.mock('./components/MapPage', () => ({
  default: () => <div data-testid="map-page">MapPage</div>,
}));
vi.mock('./components/DroneDetailPage', () => ({
  default: () => <div data-testid="detail-page">DroneDetailPage</div>,
}));

describe('App Routing', () => {
  it('renders MapPage at root', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByTestId('map-page')).toBeInTheDocument();
  });

  it('renders DroneDetailPage at /drone/:id', () => {
    render(
      <MemoryRouter initialEntries={['/drone/TEST001']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByTestId('detail-page')).toBeInTheDocument();
  });

  it('does not render detail page at root', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('detail-page')).not.toBeInTheDocument();
  });
});
