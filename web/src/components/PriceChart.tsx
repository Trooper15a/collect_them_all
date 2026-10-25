"use client";

import { lazy, Suspense } from "react";

export interface Point { date: string; value: number | null }
export interface PriceChartProps { data: Point[]; currency: string; height?: number; color?: string }
const Plot = lazy(() => import("./PriceChartPlot").then((module) => ({ default: module.PriceChartPlot })));

export function PriceChart({ data, currency, height = 180, color }: PriceChartProps) {
  const points = (data ?? []).filter((point) => point.value != null);
  if (points.length < 2) return <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>
    {points.length === 1 ? "One data point so far. Daily snapshots build this chart over time." : "No price history yet."}
  </div>;
  return <Suspense fallback={<div role="status" aria-label="Loading price chart" className="skeleton rounded-xl" style={{ height }} />}>
    <Plot data={points} currency={currency} height={height} color={color} />
  </Suspense>;
}
