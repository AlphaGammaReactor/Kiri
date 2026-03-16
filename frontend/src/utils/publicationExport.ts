/**
 * Kiri — Publication Export Utilities
 *
 * Shared helpers for exporting ECharts instances with
 * publication-ready white backgrounds and dark text.
 */

import type * as echarts from "echarts/core";

/** Dark-on-white theme overrides for publication export */
const PUBLICATION_THEME = {
  backgroundColor: "#ffffff",
  textStyle: { color: "#1a1a2e" },
  title: { textStyle: { color: "#1a1a2e" }, subtextStyle: { color: "#4b5563" } },
};

const PUBLICATION_AXIS = {
  axisLabel: { color: "#374151" },
  nameTextStyle: { color: "#374151" },
  axisLine: { lineStyle: { color: "#d1d5db" } },
  splitLine: { lineStyle: { color: "#e5e7eb" } },
};

/**
 * Export an ECharts instance as a publication-ready PNG data URL.
 *
 * Temporarily applies a white-bg / dark-text theme, captures the image,
 * then restores the original dark-mode options.
 */
export function getPublicationDataURL(
  instance: echarts.ECharts,
  originalOption: Record<string, unknown>,
  opts?: { pixelRatio?: number }
): string {
  const pixelRatio = opts?.pixelRatio ?? 3;

  // Apply publication overrides
  instance.setOption({
    ...PUBLICATION_THEME,
    xAxis: PUBLICATION_AXIS,
    yAxis: PUBLICATION_AXIS,
  });

  const dataUrl = instance.getDataURL({
    type: "png",
    pixelRatio,
    backgroundColor: "#ffffff",
  });

  // Restore original dark-mode options
  instance.setOption(originalOption, true);

  return dataUrl;
}
