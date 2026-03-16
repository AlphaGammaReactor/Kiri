/**
 * Kiri — Login Page
 *
 * Premium dark-themed login/register form with:
 * - Email + password authentication
 * - Login ↔ Register mode toggle
 * - Animated transitions (framer-motion)
 * - Bilingual i18n support (en/zh)
 * - Error state handling
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store";
import type { RootState } from "../store";
import { login, register, clearError } from "../store/authSlice";
import { LanguageFloatingButton } from "../components/LanguageFloatingButton";

export default function LoginPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, submitting, error } = useAppSelector(
    (s: RootState) => s.auth
  );

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/projects", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearError());

    if (mode === "login") {
      dispatch(login({ email, password }));
    } else {
      dispatch(
        register({
          email,
          password,
          display_name: displayName || email.split("@")[0],
          invite_code: inviteCode,
        })
      );
    }
  };

  const toggleMode = () => {
    dispatch(clearError());
    setMode((m) => (m === "login" ? "register" : "login"));
  };

  return (
    <div className="min-h-screen bg-kiri-bg flex items-center justify-center relative overflow-hidden">
      <LanguageFloatingButton />

      {/* ── Background glow effects ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background:
              "radial-gradient(circle, hsl(160, 80%, 50%) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-60 -right-60 w-[800px] h-[800px] rounded-full opacity-[0.05]"
          style={{
            background:
              "radial-gradient(circle, hsl(200, 80%, 50%) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Login Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div
          className="rounded-2xl border border-kiri-border bg-kiri-surface/80 backdrop-blur-xl shadow-2xl p-8"
          style={{
            boxShadow:
              "0 0 60px rgba(52, 211, 153, 0.06), 0 25px 50px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* ── Branding ── */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <h1 className="text-4xl font-bold tracking-tight font-mono mb-1">
                <span className="text-kiri-accent">桐</span>
                <span className="text-kiri-text ml-2">Kiri</span>
              </h1>
              <p className="text-sm text-kiri-text-dim tracking-widest uppercase">
                {t("app.subtitle")}
              </p>
            </motion.div>
          </div>

          {/* ── Mode title ── */}
          <AnimatePresence mode="wait">
            <motion.h2
              key={mode}
              initial={{ opacity: 0, x: mode === "login" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "login" ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              className="text-xl font-semibold text-kiri-text mb-6 text-center"
            >
              {mode === "login" ? t("auth.login_title") : t("auth.register_title")}
            </motion.h2>
          </AnimatePresence>

          {/* ── Error display ── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display name (register only) */}
            <AnimatePresence>
              {mode === "register" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label
                    htmlFor="display-name"
                    className="block text-xs text-kiri-text-dim uppercase tracking-wider mb-1.5"
                  >
                    {t("auth.display_name")}
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("auth.display_name_placeholder")}
                    className="w-full px-4 py-3 rounded-xl bg-kiri-bg border border-kiri-border text-kiri-text placeholder-kiri-text-dim/50 focus:outline-none focus:ring-2 focus:ring-kiri-accent/40 focus:border-kiri-accent transition-all"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Invite code (register only) */}
            <AnimatePresence>
              {mode === "register" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label
                    htmlFor="invite-code"
                    className="block text-xs text-kiri-text-dim uppercase tracking-wider mb-1.5"
                  >
                    {t("auth.invite_code")}
                  </label>
                  <input
                    id="invite-code"
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder={t("auth.invite_code_placeholder")}
                    className="w-full px-4 py-3 rounded-xl bg-kiri-bg border border-kiri-border text-kiri-text placeholder-kiri-text-dim/50 focus:outline-none focus:ring-2 focus:ring-kiri-accent/40 focus:border-kiri-accent transition-all font-mono tracking-wider"
                    autoComplete="off"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs text-kiri-text-dim uppercase tracking-wider mb-1.5"
              >
                {t("auth.email")}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email_placeholder")}
                className="w-full px-4 py-3 rounded-xl bg-kiri-bg border border-kiri-border text-kiri-text placeholder-kiri-text-dim/50 focus:outline-none focus:ring-2 focus:ring-kiri-accent/40 focus:border-kiri-accent transition-all"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs text-kiri-text-dim uppercase tracking-wider mb-1.5"
              >
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password_placeholder")}
                className="w-full px-4 py-3 rounded-xl bg-kiri-bg border border-kiri-border text-kiri-text placeholder-kiri-text-dim/50 focus:outline-none focus:ring-2 focus:ring-kiri-accent/40 focus:border-kiri-accent transition-all"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ scale: submitting ? 1 : 1.01 }}
              whileTap={{ scale: submitting ? 1 : 0.98 }}
              className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: submitting
                  ? "hsl(160, 20%, 25%)"
                  : "linear-gradient(135deg, hsl(160, 70%, 40%), hsl(170, 60%, 35%))",
                color: "white",
                boxShadow: submitting
                  ? "none"
                  : "0 4px 15px rgba(52, 211, 153, 0.25)",
              }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-r-white animate-spin" />
                  {t("common.loading")}
                </span>
              ) : mode === "login" ? (
                t("auth.login_button")
              ) : (
                t("auth.register_button")
              )}
            </motion.button>
          </form>

          {/* ── Toggle login/register ── */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-kiri-text-dim hover:text-kiri-accent transition-colors"
            >
              {mode === "login"
                ? t("auth.no_account")
                : t("auth.have_account")}
            </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <p className="mt-6 text-center text-xs text-kiri-text-dim/50">
          {t("app.title")} · {t("app.subtitle")}
        </p>
      </motion.div>
    </div>
  );
}
