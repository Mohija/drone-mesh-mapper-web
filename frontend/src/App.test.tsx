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

// Mock AuthContext to bypass auth for routing tests
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', username: 'test', role: 'user', display_name: 'Test', email: 'test@test.com', tenant_id: '1', is_active: true },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
