/**
 * Kiri — Frontend Component Smoke Tests
 *
 * Verifies that core components render without crashing.
 * These are fast "does it blow up?" tests, not full integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { store } from '../store';
import { recordApiError } from '../store/errorSlice';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/ToastProvider';

// Mock framer-motion to avoid animation issues in test
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello Kiri</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Hello Kiri')).toBeInTheDocument();
  });

  it('catches errors and shows fallback UI', () => {
    const ThrowError = () => {
      throw new Error('Test crash');
    };

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Back to Projects')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="toast-child">Content</div>
      </ToastProvider>
    );
    expect(screen.getByTestId('toast-child')).toBeInTheDocument();
  });
});

describe('Redux Store', () => {
  it('initializes with default state', () => {
    const state = store.getState();

    expect(state.app.language).toBe('en');
    expect(state.app.selectedGenes).toEqual([]);
    expect(state.app.activeModule).toBe('atlas');
    expect(state.errors.totalErrors).toBe(0);
    expect(state.errors.errors).toEqual([]);
  });

  it('tracks errors via errorSlice', () => {
    store.dispatch(recordApiError({
      endpoint: '/api/v1/test',
      method: 'GET',
      status: 500,
      message: 'Internal server error',
    }));

    const state = store.getState();
    expect(state.errors.totalErrors).toBe(1);
    expect(state.errors.errors[0].endpoint).toBe('/api/v1/test');
    expect(state.errors.errorCounts['GET /api/v1/test']).toBe(1);
  });
});
