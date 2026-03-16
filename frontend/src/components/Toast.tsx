/**
 * Kiri — Toast Notification System
 *
 * Displays transient notifications for API errors, success messages,
 * and warnings. Uses Redux errorSlice for state management.
 */

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAppSelector, useAppDispatch } from "../store";
import { dismissToast, type ToastItem } from "../store/errorSlice";

const ICON_MAP: Record<string, string> = {
  error: "❌",
  warning: "⚠️",
  success: "✅",
  info: "ℹ️",
};

const STYLE_MAP: Record<string, string> = {
  error: "border-rose-500/40 bg-rose-500/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  success: "border-emerald-500/40 bg-emerald-500/10",
  info: "border-blue-500/40 bg-blue-500/10",
};

const TEXT_MAP: Record<string, string> = {
  error: "text-rose-300",
  warning: "text-amber-300",
  success: "text-emerald-300",
  info: "text-blue-300",
};

export function ToastContainer() {
  const { t } = useTranslation();
  const toasts: ToastItem[] = useAppSelector((s) => s.errors.toasts);
  const dispatch = useAppDispatch();

  // Auto-dismiss toasts after their duration
  useEffect(() => {
    toasts.forEach((toast: ToastItem) => {
      if (toast.duration && toast.duration > 0) {
        const timer = setTimeout(() => {
          dispatch(dismissToast(toast.id));
        }, toast.duration);
        return () => clearTimeout(timer);
      }
    });
  }, [toasts, dispatch]);

  const handleDismiss = useCallback(
    (id: string) => {
      dispatch(dismissToast(id));
    },
    [dispatch]
  );

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast: ToastItem) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto rounded-lg border backdrop-blur-md p-4 shadow-lg ${STYLE_MAP[toast.type] || STYLE_MAP.info}`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <span className="text-lg shrink-0 mt-0.5">
                {ICON_MAP[toast.type] || ICON_MAP.info}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className={`text-sm font-semibold mb-0.5 ${TEXT_MAP[toast.type] || TEXT_MAP.info}`}>
                    {toast.title}
                  </p>
                )}
                <p className="text-sm text-kiri-text-muted leading-relaxed">
                  {toast.message}
                </p>
              </div>

              {/* Dismiss button */}
              <button
                onClick={() => handleDismiss(toast.id)}
                className="shrink-0 text-kiri-text-dim hover:text-kiri-text transition-colors text-lg leading-none"
                aria-label={t("common.cancel")}
              >
                ×
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
