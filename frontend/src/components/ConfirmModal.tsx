import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation modal.
 * Replaces browser confirm() with a styled, accessible dialog.
 * Supports Enter to confirm, Escape to cancel.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  // Keyboard: Enter → confirm, Escape → cancel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open || loading) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [open, loading, onConfirm, onCancel]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="relative bg-kiri-surface border border-kiri-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
          >
            <h2 className="text-lg font-semibold text-kiri-text mb-2">
              {title}
            </h2>
            <p className="text-sm text-kiri-text-muted mb-6">{message}</p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 text-sm text-kiri-text-muted hover:text-kiri-text rounded-lg border border-kiri-border hover:border-kiri-border-focus transition-colors disabled:opacity-40"
              >
                {cancelLabel || t("common.cancel") || "Cancel"}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 flex items-center gap-2 ${
                  variant === "danger"
                    ? "bg-red-500/90 text-white hover:bg-red-500"
                    : "bg-kiri-accent text-kiri-bg hover:brightness-110"
                }`}
              >
                {loading && (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {confirmLabel || t("common.confirm") || "Confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
