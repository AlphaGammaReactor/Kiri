/**
 * Kiri — useChartLocale hook
 *
 * Forces ECharts instances to re-render when the i18n locale changes.
 * Uses a revision counter that increments on every locale switch,
 * which can be passed as a key prop or dependency to trigger re-renders
 * WITHOUT refetching data from the backend.
 *
 * Also provides locale-aware label formatters for common chart elements.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface ChartLocale {
  /** Current locale code ('en' | 'zh') */
  locale: string;
  /** Revision counter — increments on every locale switch. Use as a React key. */
  revision: number;
  /** Stable key string combining locale + revision for chart instance keys */
  chartKey: string;
  /** Format a p-value for display */
  formatPValue: (p: number) => string;
  /** Translate common axis labels */
  axisLabel: (key: string, fallback?: string) => string;
  /** Get locale-aware number formatter */
  formatNumber: (n: number, decimals?: number) => string;
}

export function useChartLocale(): ChartLocale {
  const { t, i18n } = useTranslation();
  const [revision, setRevision] = useState(0);

  // Listen for language changes
  useEffect(() => {
    const handleChange = () => {
      setRevision((r) => r + 1);
    };

    i18n.on("languageChanged", handleChange);
    return () => {
      i18n.off("languageChanged", handleChange);
    };
  }, [i18n]);

  const locale = i18n.language;

  const chartKey = useMemo(
    () => `chart-${locale}-${revision}`,
    [locale, revision]
  );

  const formatPValue = useCallback(
    (p: number): string => {
      if (p < 0.001) return "p < 0.001";
      if (p < 0.01) return `p = ${p.toFixed(3)}`;
      if (p < 0.05) return `p = ${p.toFixed(3)}`;
      return `p = ${p.toFixed(3)} (${t("common.ns", "ns")})`;
    },
    [t]
  );

  const axisLabel = useCallback(
    (key: string, fallback?: string): string => {
      return t(`chart.axes.${key}`, fallback || key);
    },
    [t]
  );

  const formatNumber = useCallback(
    (n: number, decimals = 2): string => {
      return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0,
      }).format(n);
    },
    [locale]
  );

  return {
    locale,
    revision,
    chartKey,
    formatPValue,
    axisLabel,
    formatNumber,
  };
}
