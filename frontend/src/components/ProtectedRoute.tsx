/**
 * Kiri — Protected Route
 *
 * Wraps routes that require authentication.
 * Redirects to /login if user is not authenticated.
 * Shows a loading spinner while the initial refresh check is in progress.
 */

import { Navigate } from "react-router-dom";
import { useAppSelector } from "../store";
import type { RootState } from "../store";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, initialized, loading } = useAppSelector(
    (s: RootState) => s.auth
  );

  // Still checking if we have a valid session via refresh token
  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-kiri-bg flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
