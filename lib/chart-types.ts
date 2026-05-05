/**
 * Capital-style chart type ids for the premium trading chart.
 * Each id maps to a lightweight-charts series and/or a data transform in `chart-transforms.ts`.
 */
export const CHART_TYPE_GROUPS = [
  {
    label: "Bars & candles",
    items: [
      { id: "bars", label: "Bars" },
      { id: "candles", label: "Candles" },
      { id: "hollowCandles", label: "Hollow candles" },
      { id: "volumeCandles", label: "Volume candles" },
      { id: "hlcBars", label: "HLC bars" },
    ],
  },
  {
    label: "Lines & areas",
    items: [
      { id: "line", label: "Line" },
      { id: "lineMarkers", label: "Line with markers" },
      { id: "stepLine", label: "Step line" },
      { id: "area", label: "Area" },
      { id: "hlcArea", label: "HLC area" },
      { id: "baseline", label: "Baseline" },
    ],
  },
  {
    label: "Columns & range",
    items: [
      { id: "columns", label: "Columns" },
      { id: "highLow", label: "High–Low" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { id: "heikinAshi", label: "Heikin Ashi" },
      { id: "renko", label: "Renko" },
      { id: "lineBreak", label: "Line break" },
      { id: "kagi", label: "Kagi" },
    ],
  },
] as const

export type ChartTypeId = (typeof CHART_TYPE_GROUPS)[number]["items"][number]["id"]

export const DEFAULT_CHART_TYPE: ChartTypeId = "candles"

export function findChartTypeLabel(id: ChartTypeId): string {
  for (const g of CHART_TYPE_GROUPS) {
    const hit = g.items.find((x) => x.id === id)
    if (hit) return hit.label
  }
  return id
}

export function formatChartTypeIndicator(
  id: ChartTypeId,
  opts: { lineBreakLines: number }
): string {
  if (id === "lineBreak") return `Line break [${opts.lineBreakLines}]`
  return findChartTypeLabel(id)
}
