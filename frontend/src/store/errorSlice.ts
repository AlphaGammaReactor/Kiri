/**
 * Kiri — Error Tracking Redux Slice
 *
 * Aggregates API errors for trend analysis and debugging.
 * The /status and /audit workflows can query this slice to understand
 * which endpoints are failing most frequently.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface ApiError {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  message: string;
  requestId?: string;
}

export interface ToastItem {
  id: string;
  type: 'error' | 'warning' | 'success' | 'info';
  title?: string;
  message: string;
  duration: number; // ms, 0 = sticky
}

interface ErrorState {
  /** Recent API errors (capped at 50) */
  errors: ApiError[];
  /** Count of errors per endpoint (for trend analysis) */
  errorCounts: Record<string, number>;
  /** Total error count since app start */
  totalErrors: number;
  /** Toast notifications */
  toasts: ToastItem[];
}

let toastIdCounter = 0;

const initialState: ErrorState = {
  errors: [],
  errorCounts: {},
  totalErrors: 0,
  toasts: [],
};

const errorSlice = createSlice({
  name: 'errors',
  initialState,
  reducers: {
    recordApiError(state, action: PayloadAction<Omit<ApiError, 'id' | 'timestamp'>>) {
      const error: ApiError = {
        ...action.payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      };

      // Add to list (cap at 50)
      state.errors = [error, ...state.errors].slice(0, 50);

      // Increment endpoint counter
      const key = `${action.payload.method} ${action.payload.endpoint}`;
      state.errorCounts[key] = (state.errorCounts[key] || 0) + 1;

      // Increment total
      state.totalErrors += 1;
    },

    clearErrors(state) {
      state.errors = [];
      state.errorCounts = {};
      state.totalErrors = 0;
    },

    addToast(state, action: PayloadAction<Omit<ToastItem, 'id'>>) {
      const id = `toast-${++toastIdCounter}-${Date.now()}`;
      state.toasts.push({ ...action.payload, id });
      // Cap at 5 visible toasts
      if (state.toasts.length > 5) {
        state.toasts = state.toasts.slice(-5);
      }
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    clearAllToasts(state) {
      state.toasts = [];
    },
  },
});

export const { recordApiError, clearErrors, addToast, dismissToast, clearAllToasts } = errorSlice.actions;
export default errorSlice.reducer;

// Selectors
export const selectRecentErrors = (state: { errors: ErrorState }) => state.errors.errors;
export const selectErrorCounts = (state: { errors: ErrorState }) => state.errors.errorCounts;
export const selectTotalErrors = (state: { errors: ErrorState }) => state.errors.totalErrors;
export const selectTopFailingEndpoints = (state: { errors: ErrorState }) => {
  const counts = state.errors.errorCounts;
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([endpoint, count]) => ({ endpoint, count }));
};
