/**
 * Kiri — Toast Notification System
 *
 * Lightweight toast notifications for API errors, warnings, and success messages.
 * Self-managing — toasts auto-dismiss and stack vertically.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ToastType = 'error' | 'warning' | 'success' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration: number;
}

interface ToastContextValue {
  addToast: (type: ToastType, title: string, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
  removeToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  error:   { bg: '#1c1017', border: '#7f1d1d', icon: '🔴' },
  warning: { bg: '#1c1a10', border: '#78350f', icon: '🟡' },
  success: { bg: '#0f1c10', border: '#14532d', icon: '🟢' },
  info:    { bg: '#101720', border: '#1e3a5f', icon: '🔵' },
};

function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const colors = TOAST_COLORS[toast.type];

  React.useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      style={{
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        maxWidth: '380px',
        minWidth: '280px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onClick={onDismiss}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.9rem', marginTop: '1px' }}>{colors.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f3f4f6', marginBottom: '2px' }}>
            {toast.title}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.4 }}>
            {toast.message}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, title: string, message: string, duration = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { id, type, title, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map(toast => (
            <div key={toast.id} style={{ pointerEvents: 'auto' }}>
              <ToastNotification
                toast={toast}
                onDismiss={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
