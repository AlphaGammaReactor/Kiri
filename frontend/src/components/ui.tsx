/**
 * Kiri — Shared UI Components
 *
 * Design system building blocks for the dark-lab aesthetic.
 * Every component follows the Trust Layer pattern:
 * provenance-aware, accessible, bilingual-ready.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import type { Provenance } from "../services/api";

/* ═══════════════════════════
   InfoTooltip
   ═══════════════════════════ */

interface InfoTooltipProps {
  /** i18n key whose value becomes the tooltip text */
  tooltipKey: string;
  /** Optional: override size in px (default 16) */
  size?: number;
}

export function InfoTooltip({ tooltipKey, size = 16 }: InfoTooltipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        tabIndex={0}
        aria-label={t(tooltipKey)}
        className="p-1 rounded-full text-kiri-text-dim hover:text-kiri-accent hover:bg-kiri-accent/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-kiri-accent/50"
      >
        <Info size={size} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 px-4 py-3 rounded-lg border border-kiri-border bg-kiri-surface shadow-lg shadow-black/40 text-xs leading-relaxed text-kiri-text-muted pointer-events-none"
          >
            {/* Arrow */}
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-kiri-surface border-l border-t border-kiri-border" />
            {t(tooltipKey)}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ═══════════════════════════
   DataSourceBadge
   ═══════════════════════════ */

/** Source types whose data comes from local files or bundled databases (not fetched from an API) */
const FILE_SOURCES = new Set(["custom", "scrna"]);

interface DataSourceBadgeProps {
  /** The `source_type` key, e.g. "tcga", "drugbank", "custom" */
  sourceType: string;
  /** ISO timestamp when the source was added (shown for FILE sources) */
  addedAt?: string;
}

export function DataSourceBadge({ sourceType, addedAt }: DataSourceBadgeProps) {
  const { t, i18n } = useTranslation();
  const isFile = FILE_SOURCES.has(sourceType);

  if (isFile) {
    const dateLabel = addedAt
      ? new Date(addedAt).toLocaleDateString(i18n.language === "zh" ? "zh-CN" : "en-US", {
          year: "numeric",
          month: "short",
        })
      : "";
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-px text-[9px] font-semibold rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25 leading-tight whitespace-nowrap">
        {t("trust.file")}
        {dateLabel && <span className="font-normal">· {dateLabel}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px text-[9px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 leading-tight whitespace-nowrap">
      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
      {t("trust.api")}
    </span>
  );
}

/* ═══════════════════════════
   Card
   ═══════════════════════════ */

interface CardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  /** If true, renders the AI-Suggested badge */
  aiGenerated?: boolean;
  /** If true, renders the quarantine warning */
  quarantined?: boolean;
}

export function Card({
  children,
  title,
  className = "",
  aiGenerated,
  quarantined,
}: CardProps) {
  return (
    <div
      className={`
        bg-kiri-surface border rounded-lg overflow-hidden
        ${quarantined ? "border-kiri-error/50" : "border-kiri-border"}
        ${className}
      `}
    >
      {(title || aiGenerated || quarantined) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-kiri-border">
          {title && (
            <h3 className="text-sm font-medium text-kiri-text">{title}</h3>
          )}
          <div className="flex gap-2">
            {aiGenerated && <AiBadge />}
            {quarantined && <QuarantineBadge />}
          </div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ═══════════════════════════
   Badges
   ═══════════════════════════ */

export function AiBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-kiri-ai-badge/15 text-kiri-ai-badge border border-kiri-ai-badge/30">
      <span className="w-1.5 h-1.5 rounded-full bg-kiri-ai-badge animate-pulse" />
      {t("trust.aiSuggested")}
    </span>
  );
}

export function VerifiedBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-kiri-verified/15 text-kiri-verified border border-kiri-verified/30">
      ✓ {t("trust.verified")}
    </span>
  );
}

export function QuarantineBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-kiri-quarantined/15 text-kiri-quarantined border border-kiri-quarantined/30">
      ⚠ {t("trust.quarantined")}
    </span>
  );
}

interface StatusBadgeProps {
  label: string;
  variant?: "success" | "warning" | "error" | "info";
}

export function StatusBadge({ label, variant = "info" }: StatusBadgeProps) {
  const colors = {
    success: "bg-kiri-success/15 text-kiri-success border-kiri-success/30",
    warning: "bg-kiri-warning/15 text-kiri-warning border-kiri-warning/30",
    error: "bg-kiri-error/15 text-kiri-error border-kiri-error/30",
    info: "bg-kiri-info/15 text-kiri-info border-kiri-info/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${colors[variant]}`}
    >
      {label}
    </span>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "error" | "info";
  className?: string;
}

export function Badge({ children, variant = "info", className = "" }: BadgeProps) {
  const colors = {
    success: "bg-kiri-success/15 text-kiri-success border-kiri-success/30",
    warning: "bg-kiri-warning/15 text-kiri-warning border-kiri-warning/30",
    error: "bg-kiri-error/15 text-kiri-error border-kiri-error/30",
    info: "bg-kiri-info/15 text-kiri-info border-kiri-info/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${colors[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ═══════════════════════════
   Provenance Footer
   ═══════════════════════════ */

interface ProvenanceFooterProps {
  provenance: Provenance | null;
  compact?: boolean;
}

export function ProvenanceFooter({
  provenance,
  compact = false,
}: ProvenanceFooterProps) {
  const { t } = useTranslation();

  if (!provenance) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-[10px] text-kiri-text-dim font-mono mt-2 pt-2 border-t border-kiri-border">
        <span>
          {t("trust.source")}: {provenance.source}
        </span>
        {provenance.sample_count && (
          <span>
            {t("trust.samples")} {provenance.sample_count}
          </span>
        )}
        {provenance.cache_hit && <span className="text-kiri-info">cached</span>}
      </div>
    );
  }

  return (
    <div className="bg-kiri-bg/50 rounded px-3 py-2 mt-3 border border-kiri-border">
      <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider mb-1.5">
        {t("trust.provenance")}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-kiri-text-muted">
        <span>
          {t("trust.source")}: {provenance.source}
        </span>
        {provenance.method && (
          <span>
            {t("trust.method")}: {provenance.method}
          </span>
        )}
        {provenance.sample_count && (
          <span>
            {t("trust.samples")} {provenance.sample_count}
          </span>
        )}
        <span>
          {new Date(provenance.timestamp).toLocaleDateString()} · v
          {provenance.version}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════
   Loading Skeleton
   ═══════════════════════════ */

interface SkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = "" }: SkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className="h-4 bg-kiri-surface rounded"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-kiri-surface border border-kiri-border rounded-lg p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <motion.div
          className="h-4 w-32 bg-kiri-bg rounded"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.div
          className="h-3 w-20 bg-kiri-bg rounded"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
        />
      </div>
      <motion.div
        className="h-48 bg-kiri-bg rounded"
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
  );
}

/* ═══════════════════════════
   Stat Display (p-value, CI, n)
   ═══════════════════════════ */

interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
  significant?: boolean;
}

export function Stat({ label, value, unit, significant }: StatProps) {
  return (
    <div className="bg-kiri-bg/50 border border-kiri-border rounded px-3 py-2">
      <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-sm font-mono mt-0.5 ${
          significant ? "text-kiri-accent" : "text-kiri-text"
        }`}
      >
        {value}
        {unit && <span className="text-kiri-text-muted ml-1">{unit}</span>}
      </p>
    </div>
  );
}
