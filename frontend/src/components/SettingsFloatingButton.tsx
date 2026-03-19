/**
 * Kiri — Floating Settings Button
 *
 * A global floating gear button in the bottom-right corner that
 * expands on hover to reveal settings options:
 *   - Language toggle (EN ↔ 中)
 *   - Theme toggle (☀️ Light / 🌙 Dark)
 *
 * Rendered at the app root so it appears on every page.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../store";
import { setLanguage, setTheme } from "../store";
import type { RootState } from "../store";
import { motion, AnimatePresence } from "framer-motion";

export function SettingsFloatingButton() {
  const { i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const language = useAppSelector((s: RootState) => s.app.language);
  const theme = useAppSelector((s: RootState) => s.app.theme);
  const [isOpen, setIsOpen] = useState(false);

  const toggleLanguage = () => {
    const next = language === "en" ? "zh" : "en";
    dispatch(setLanguage(next));
    i18n.changeLanguage(next);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    dispatch(setTheme(next));
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Expanded options */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex flex-col items-center gap-2"
          >
            {/* Language toggle */}
            <motion.button
              onClick={toggleLanguage}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              title={language === "en" ? "切换中文" : "Switch to English"}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-kiri-surface border border-kiri-border shadow-lg shadow-black/20 text-kiri-text hover:border-kiri-accent hover:text-kiri-accent transition-colors cursor-pointer select-none"
            >
              <span className="text-sm font-semibold tracking-tight">
                {language === "en" ? "中" : "EN"}
              </span>
            </motion.button>

            {/* Theme toggle */}
            <motion.button
              onClick={toggleTheme}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-kiri-surface border border-kiri-border shadow-lg shadow-black/20 text-kiri-text hover:border-kiri-accent hover:text-kiri-accent transition-colors cursor-pointer select-none"
            >
              <span className="text-base">
                {theme === "dark" ? "☀️" : "🌙"}
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main gear button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1, rotate: 45 }}
        whileTap={{ scale: 0.95 }}
        title="Settings"
        className="flex items-center justify-center w-11 h-11 rounded-full bg-kiri-surface border border-kiri-border shadow-lg shadow-black/30 text-kiri-text hover:border-kiri-accent hover:text-kiri-accent transition-colors cursor-pointer select-none"
      >
        <span className="text-base">⚙️</span>
      </motion.button>
    </div>
  );
}
