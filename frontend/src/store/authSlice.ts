/**
 * Kiri — Auth Redux Slice
 *
 * Manages authentication state: user, token, login/register/logout/refresh flows.
 * Token is kept in memory (not localStorage) for XSS safety.
 * Refresh token is in an HTTP-only cookie managed by the backend.
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

// ── Types ──

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;     // true during refresh / initial check
  submitting: boolean;  // true only during explicit login/register
  error: string | null;
  initialized: boolean; // true after first refresh attempt
}

// ── Auth-specific axios instance (with cookies) ──

const authClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// ── Async thunks ──

export const login = createAsyncThunk(
  "auth/login",
  async (
    payload: { email: string; password: string },
    { rejectWithValue }
  ) => {
    try {
      const resp = await authClient.post("/v1/auth/login", payload);
      return resp.data as { access_token: string; user: AuthUser };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        return rejectWithValue(err.response.data.detail);
      }
      return rejectWithValue("Login failed");
    }
  }
);

export const register = createAsyncThunk(
  "auth/register",
  async (
    payload: { email: string; password: string; display_name: string; invite_code: string },
    { rejectWithValue }
  ) => {
    try {
      const resp = await authClient.post("/v1/auth/register", payload);
      return resp.data as { access_token: string; user: AuthUser };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        return rejectWithValue(err.response.data.detail);
      }
      return rejectWithValue("Registration failed");
    }
  }
);

export const refreshToken = createAsyncThunk(
  "auth/refresh",
  async (_, { rejectWithValue }) => {
    try {
      const resp = await authClient.post("/v1/auth/refresh");
      return resp.data as { access_token: string; user: AuthUser };
    } catch {
      return rejectWithValue("Session expired");
    }
  }
);

export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    await authClient.post("/v1/auth/logout");
  } catch {
    // Ignore errors — clear local state regardless
  }
});

// ── Slice ──

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  submitting: false,
  error: null,
  initialized: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
  },
  extraReducers: (builder) => {
    // ── Login ──
    builder.addCase(login.pending, (state) => {
      state.submitting = true;
      state.error = null;
    });
    builder.addCase(login.fulfilled, (state, action) => {
      state.submitting = false;
      state.user = action.payload.user;
      state.token = action.payload.access_token;
      state.isAuthenticated = true;
      state.initialized = true;
    });
    builder.addCase(login.rejected, (state, action) => {
      state.submitting = false;
      state.error = action.payload as string;
    });

    // ── Register ──
    builder.addCase(register.pending, (state) => {
      state.submitting = true;
      state.error = null;
    });
    builder.addCase(register.fulfilled, (state, action) => {
      state.submitting = false;
      state.user = action.payload.user;
      state.token = action.payload.access_token;
      state.isAuthenticated = true;
      state.initialized = true;
    });
    builder.addCase(register.rejected, (state, action) => {
      state.submitting = false;
      state.error = action.payload as string;
    });

    // ── Refresh ──
    builder.addCase(refreshToken.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(refreshToken.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.access_token;
      state.isAuthenticated = true;
      state.initialized = true;
    });
    builder.addCase(refreshToken.rejected, (state) => {
      state.loading = false;
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.initialized = true;
    });

    // ── Logout ──
    builder.addCase(logout.fulfilled, (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    });
  },
});

export const { clearError, setToken } = authSlice.actions;
export default authSlice.reducer;
