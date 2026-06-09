"use client";

import { cn } from "@/lib/utils";
import * as echarts from "echarts";
import type { ECharts, EChartsOption } from "echarts";
import { AlertCircleIcon } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

export type ChartBlockProps = {
  className?: string;
  option: EChartsOption;
};

export type ChartBlockHandle = {
  getDataURL: () => string | null;
};

function isUsableChartOption(option: unknown): option is EChartsOption {
  if (!option || typeof option !== "object" || Array.isArray(option)) return false;
  const value = option as Record<string, unknown>;
  return Boolean(value.series || value.dataset || value.xAxis || value.yAxis || value.title || value.legend);
}

export function parseChartOption(code: string): EChartsOption | null {
  try {
    const parsed = JSON.parse(code);
    return isUsableChartOption(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const ChartBlock = forwardRef<ChartBlockHandle, ChartBlockProps>(function ChartBlock(
  { className, option },
  ref
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionKey = useMemo(() => JSON.stringify(option), [option]);

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const chart = chartRef.current;
      if (!chart || chart.isDisposed()) return null;
      return chart.getDataURL({
        backgroundColor: "#ffffff",
        excludeComponents: ["toolbox"],
        pixelRatio: 2,
        type: "png",
      });
    },
  }), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const chart = echarts.init(root, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option, true);

    const resize = () => chart.resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(root);
    window.addEventListener("resize", resize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      chart.dispose();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, [optionKey, option]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  if (!isUsableChartOption(option)) {
    return (
      <div className={cn("flex h-full items-center justify-center gap-2 text-muted-foreground text-sm", className)}>
        <AlertCircleIcon className="size-4" />
        <span>图表配置无效</span>
      </div>
    );
  }

  return <div aria-label="AI 生成图表" className={cn("h-full min-h-80 w-full", className)} ref={rootRef} role="img" />;
});
