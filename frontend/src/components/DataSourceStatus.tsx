/**
 * Kiri — Data Source Status Indicator
 *
 * Shared component showing the hydration progress of a data source.
 * States: idle, connecting, downloading, loaded, error
 */

import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, CloudDownload, Plug } from "lucide-react";
import type { HydrationStatus } from "../store/dataSourceSlice";

interface DataSourceStatusProps {
  status: HydrationStatus | string;
  onRetry?: () => void;
  compact?: boolean;
}

export default function DataSourceStatus({ status, onRetry, compact }: DataSourceStatusProps) {
  const { t } = useTranslation();

  if (status === "idle" || status === "pending") return null;

  const configs: Record<string, {
    icon: React.ReactNode;
    text: string;
    className: string;
  }> = {
    connecting: {
      icon: <Plug className={`${compact ? "w-3 h-3" : "w-4 h-4"} animate-pulse text-blue-400`} />,
      text: t("dataSource.connecting", "Connecting…"),
      className: "text-blue-400",
    },
    downloading: {
      icon: <CloudDownload className={`${compact ? "w-3 h-3" : "w-4 h-4"} animate-bounce text-amber-400`} />,
      text: t("dataSource.downloading", "Downloading data…"),
      className: "text-amber-400",
    },
    loaded: {
      icon: <CheckCircle2 className={`${compact ? "w-3 h-3" : "w-4 h-4"} text-emerald-400`} />,
      text: t("dataSource.loaded", "Loaded"),
      className: "text-emerald-400",
    },
    error: {
      icon: <XCircle className={`${compact ? "w-3 h-3" : "w-4 h-4"} text-rose-400`} />,
      text: t("dataSource.error", "Failed to load"),
      className: "text-rose-400",
    },
  };

  const config = configs[status];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? "text-[10px]" : "text-xs"} ${config.className}`}>
      {config.icon}
      <span>{config.text}</span>
      {status === "error" && onRetry && (
        <button
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          className="ml-1 underline hover:no-underline opacity-80 hover:opacity-100 transition"
        >
          {t("dataSource.retry", "Retry")}
        </button>
      )}
    </span>
  );
}
