/**
 * Shared dimensions for the top dashboard row (time series + hour + weekday)
 * so plot height, y-axis width, and x-axis band line up visually.
 */
export const TOP_ROW_CHART = {
  /** Short strip for x ticks only — tall bands left a dead zone above the labels. */
  xAxisClass: "h-9",
  /** Left column for y tick labels (matches SVG padL). */
  yAxisClass: "w-10",
  gapClass: "gap-1.5",
} as const;

/**
 * SVG viewBox: padB is only ~tick band under the plot (not a huge gutter).
 * x labels sit at baseline + xLabelOffsetY.
 */
export const TIME_SERIES_VIEW = {
  w: 420,
  h: 168,
  padL: 40,
  padR: 8,
  padT: 8,
  /** Space reserved under plot baseline for date ticks (keep small to avoid a “floating” axis). */
  padB: 20,
  /** Pixels below plot bottom (padT + innerH) for x text anchor. */
  xLabelOffsetY: 11,
} as const;
