/**
 * Kiri — Floating Language Toggle Button
 *
 * A global floating button in the bottom-right corner that toggles
 * between English and Chinese. Rendered at the app root so it appears
 * on every page including project pages, dashboard, and wizard.
 */

import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../store";
import { setLanguage } from "../store";
import type { RootState } from "../store";
import { motion } from "framer-motion";

export function LanguageFloatingButton() {
  const { i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const language = useAppSelector((s: RootState) => s.app.language);

  const toggleLanguage = () => {
    const next = language === "en" ? "zh" : "en";
    dispatch(setLanguage(next));
    i18n.changeLanguage(next);
  };

  return (
    <motion.button
      onClick={toggleLanguage}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      title={language === "en" ? "切换中文" : "Switch to English"}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-kiri-surface border border-kiri-border shadow-lg shadow-black/30 text-kiri-text hover:border-kiri-accent hover:text-kiri-accent transition-colors cursor-pointer select-none"
    >
      <span className="text-sm font-semibold tracking-tight">
        {language === "en" ? "中" : "EN"}
      </span>
    </motion.button>
  );
}
