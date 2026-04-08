"use client";

import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import {
  AiResponse,
  Candle,
  DashboardData,
  getAiAnalysis,
  getDashboardBootstrapStatus,
  getDashboardData,
  getInfoCard,
  getMarketDetail,
  getMarkets,
  InfoResponse,
  MarketDetail,
  MarketsResponse,
  refreshBuySignalsCache
} from "../lib/api";
import {
  formatCompactUsd,
  formatNumber,
  formatPercent,
  formatPrice
} from "../lib/format";

type Props = {
  initialDashboard: DashboardData | null;
  dashboardError: string | null;
  initialMarkets: MarketsResponse | null;
  marketsError: string | null;
  initialSelectedSymbol: string;
  initialDetail: MarketDetail | null;
  detailError: string | null;
};

type IndicatorKey =
  | "ema20"
  | "ema50"
  | "rsi"
  | "macd"
  | "range"
  | "supports"
  | "tradePlan"
  | "confirmation";

type SidePanelMode = "summary" | "history" | "analytics";
type BuyMode = "soft" | "hard";
type ChartInterval = "1H" | "4H" | "1D";
type ChartWindow = "1D" | "1W" | "1M";

const INDICATORS: Array<{ key: IndicatorKey; label: string }> = [
  { key: "ema20", label: "EMA 20" },
  { key: "ema50", label: "EMA 50" },
  { key: "rsi", label: "RSI 14" },
  { key: "macd", label: "MACD" },
  { key: "range", label: "High / Low 30d" },
  { key: "supports", label: "Support / Resistance" },
  { key: "tradePlan", label: "Entry / TP / SL" },
  { key: "confirmation", label: "1H confirmation" }
];

function signalClassName(signal: "BUY" | "HOLD" | "SELL") {
  if (signal === "BUY") return "pill signal-buy";
  if (signal === "SELL") return "pill signal-sell";
  return "pill signal-hold";
}

function normalizeTextBlock(text: string | null | undefined): string[] {
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDateTime(value: string | number | null | undefined): string {
  if (!value) return "—";

  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAxisTime(value: string | number | null | undefined, interval: ChartInterval): string {
  if (!value) return "—";

  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  if (interval === "1D") {
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit"
    });
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildSummaryLines(detail: MarketDetail | null, dashboard: DashboardData | null): string[] {
  if (!detail) {
    return normalizeTextBlock(
      dashboard?.summary.explanation ||
        "Сейчас BUY-сигналов нет. Рынок находится в режиме наблюдения."
    );
  }

  const signal = detail.signal;

  return [
    `Пара: ${signal.pair}`,
    `Сигнал: ${signal.signal}`,
    `Причина: ${signal.reason}`,
    signal.entryConfirmationText
      ? `Подтверждение входа: ${signal.entryConfirmationText}`
      : null,
    signal.entryZoneLow !== null && signal.entryZoneHigh !== null
      ? `Зона входа: ${formatPrice(signal.entryZoneLow)} - ${formatPrice(signal.entryZoneHigh)}`
      : null,
    signal.breakEvenActivationPrice !== null
      ? `Перевод в безубыток после: ${formatPrice(signal.breakEvenActivationPrice)}`
      : null,
    signal.nearestResistance !== null
      ? `Ближайшее сопротивление: ${formatPrice(signal.nearestResistance)}`
      : null,
    signal.nearestSupport !== null
      ? `Ближайшая поддержка: ${formatPrice(signal.nearestSupport)}`
      : null,
    signal.atr1hPercent !== null ? `ATR 1H: ${formatNumber(signal.atr1hPercent)}%` : null
  ].filter((item): item is string => Boolean(item));
}

function buildManagementLines(
  detail: MarketDetail | null,
  dashboard: DashboardData | null,
  selectedSymbol: string
): string[] {
  const buyItem = dashboard?.topBuys.find((item) => item.symbol === selectedSymbol);

  if (buyItem?.managementPlan?.length) {
    return buyItem.managementPlan;
  }

  if (!detail) {
    return normalizeTextBlock(
      dashboard?.summary.explanation ||
        "BUY-сценарий не найден. Следи за рынком и дождись нового подтверждения."
    );
  }

  const lines = [
    detail.signal.entryConfirmationText
      ? `Действовать только после подтверждения: ${detail.signal.entryConfirmationText}.`
      : null,
    detail.signal.entryZoneLow !== null && detail.signal.entryZoneHigh !== null
      ? `Рабочая зона набора позиции: ${formatPrice(detail.signal.entryZoneLow)} - ${formatPrice(detail.signal.entryZoneHigh)}.`
      : null,
    detail.signal.invalidationLevel !== null
      ? `Сценарий отменяется ниже ${formatPrice(detail.signal.invalidationLevel)}.`
      : null,
    detail.signal.breakEvenActivationPrice !== null
      ? `После движения к ${formatPrice(detail.signal.breakEvenActivationPrice)} риск логично переводить в безубыток.`
      : null,
    detail.signal.target1DistancePercent !== null
      ? `Первую фиксацию можно оценивать после движения примерно на ${formatNumber(detail.signal.target1DistancePercent)}%.`
      : null
  ].filter((item): item is string => Boolean(item));

  return lines.length
    ? lines
    : [
        "Для этой пары отдельный buy-план сейчас отсутствует, отображается только summary из анализа."
      ];
}

function calculateEMA(values: number[], period: number): Array<number | null> {
  if (!values.length) return [];

  const result: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (values.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  result[period - 1] = ema;

  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
    result[index] = ema;
  }

  return result;
}

function calculateRSI(values: number[], period = 14): Array<number | null> {
  const result: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

function calculateMACD(values: number[]) {
  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);

  const macdLine: Array<number | null> = values.map((_, index) => {
    if (ema12[index] === null || ema26[index] === null) return null;
    return (ema12[index] ?? 0) - (ema26[index] ?? 0);
  });

  const compactMacd = macdLine.filter((value): value is number => value !== null);
  const signalCompact = calculateEMA(compactMacd, 9);

  const signalLine: Array<number | null> = Array.from({ length: values.length }, () => null);
  let compactIndex = 0;

  for (let index = 0; index < macdLine.length; index += 1) {
    if (macdLine[index] === null) continue;
    signalLine[index] = signalCompact[compactIndex] ?? null;
    compactIndex += 1;
  }

  const histogram = macdLine.map((value, index) => {
    if (value === null || signalLine[index] === null) return null;
    return value - (signalLine[index] ?? 0);
  });

  return {
    macdLine,
    signalLine,
    histogram
  };
}

function lineY(value: number, min: number, max: number, top: number, height: number) {
  if (max === min) return top + height / 2;
  const ratio = (value - min) / (max - min);
  return top + height - ratio * height;
}

function getChartCandles(detail: MarketDetail | null, interval: ChartInterval): Candle[] {
  if (!detail) return [];

  if (interval === "1H") {
    return detail.market.technicals.intraday1h?.candles ?? [];
  }

  if (interval === "4H") {
    return detail.market.technicals.intraday4h?.candles ?? [];
  }

  return detail.market.technicals.candles ?? [];
}

function getWindowCount(interval: ChartInterval, windowValue: ChartWindow): number {
  if (interval === "1H") {
    if (windowValue === "1D") return 24;
    if (windowValue === "1W") return 140;
    return 140;
  }

  if (interval === "4H") {
    if (windowValue === "1D") return 6;
    if (windowValue === "1W") return 42;
    return 140;
  }

  if (windowValue === "1D") return 1;
  if (windowValue === "1W") return 7;
  return 30;
}

function useSelectedMarket(initialDetail: MarketDetail | null, initialSelectedSymbol: string) {
  const [selectedSymbol, setSelectedSymbol] = useState(initialSelectedSymbol);
  const [detail, setDetail] = useState<MarketDetail | null>(initialDetail);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadDetail(symbol: string) {
    setDetailLoading(true);
    setDetailError(null);

    try {
      const nextDetail = await getMarketDetail(symbol);
      setDetail(nextDetail);
      return nextDetail;
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Не удалось загрузить данные по паре");
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    setSelectedSymbol(initialSelectedSymbol);
  }, [initialSelectedSymbol]);

  useEffect(() => {
    if (selectedSymbol === initialSelectedSymbol && initialDetail) {
      setDetail(initialDetail);
      setDetailError(null);
      return;
    }

    if (!selectedSymbol) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    void loadDetail(selectedSymbol);
  }, [initialDetail, initialSelectedSymbol, selectedSymbol]);

  return {
    selectedSymbol,
    setSelectedSymbol,
    detail,
    detailLoading,
    detailError,
    reloadDetail: async () => loadDetail(selectedSymbol)
  };
}

async function waitUntilBuySignalsCacheReady(mode: BuyMode) {
  const maxAttempts = 120;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getDashboardBootstrapStatus(mode);

    if (status.buySignalsCacheReady) {
      return status;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Кеш BUY-сигналов не успел прогреться. Повтори обновление через несколько секунд.");
}

function TradingChart({
  detail,
  activeIndicators
}: {
  detail: MarketDetail | null;
  activeIndicators: Record<IndicatorKey, boolean>;
}) {
  const [interval, setIntervalValue] = useState<ChartInterval>("1H");
  const [windowValue, setWindowValue] = useState<ChartWindow>("1W");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [startIndex, setStartIndex] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const allCandles = useMemo(() => getChartCandles(detail, interval), [detail, interval]);
  const baseVisibleCount = getWindowCount(interval, windowValue);

  useEffect(() => {
    setZoomFactor(1);
  }, [interval, windowValue, detail?.market.asset.symbol]);

  const visibleCount = useMemo(() => {
    if (!allCandles.length) return 0;
    const rawCount = Math.round(baseVisibleCount / zoomFactor);
    return Math.max(12, Math.min(allCandles.length, rawCount));
  }, [allCandles.length, baseVisibleCount, zoomFactor]);

  const maxStartIndex = Math.max(0, allCandles.length - visibleCount);

  useEffect(() => {
    setStartIndex(maxStartIndex);
  }, [maxStartIndex, interval, windowValue, detail?.market.asset.symbol]);

  useEffect(() => {
    setStartIndex((current) => Math.max(0, Math.min(maxStartIndex, current)));
  }, [maxStartIndex]);

  const candles = useMemo(
    () => allCandles.slice(startIndex, startIndex + visibleCount),
    [allCandles, startIndex, visibleCount]
  );

  const closes = candles.map((item) => item.close);
  const volumes = candles.map((item) => item.volumeTo ?? item.volumeFrom ?? 0);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);

  const width = 1200;
  const left = 18;
  const right = 86;
  const top = 18;
  const priceHeight = 390;
  const volumeHeight = 90;
  const rsiHeight = activeIndicators.rsi ? 90 : 0;
  const macdHeight = activeIndicators.macd ? 96 : 0;
  const gap = 16;
  const bottomAxisHeight = 34;

  const totalHeight =
    top +
    priceHeight +
    gap +
    volumeHeight +
    (rsiHeight ? gap + rsiHeight : 0) +
    (macdHeight ? gap + macdHeight : 0) +
    bottomAxisHeight;

  if (!candles.length) {
    return <div className="chart-empty">Свечи временно недоступны.</div>;
  }

  const chartWidth = width - left - right;
  const candleStep = chartWidth / candles.length;
  const candleBodyWidth = Math.max(1.6, candleStep * 0.28);

  const overlayLevels = [
    activeIndicators.range ? detail?.signal.low30d : null,
    activeIndicators.range ? detail?.signal.high30d : null,
    activeIndicators.supports ? detail?.signal.nearestSupport : null,
    activeIndicators.supports ? detail?.signal.nearestResistance : null,
    activeIndicators.tradePlan ? detail?.signal.entryZoneLow : null,
    activeIndicators.tradePlan ? detail?.signal.entryZoneHigh : null,
    activeIndicators.tradePlan ? detail?.signal.protectiveStop : null,
    activeIndicators.tradePlan ? detail?.signal.breakEvenActivationPrice : null,
    activeIndicators.confirmation ? detail?.signal.confirmationLevel : null
  ].filter((value): value is number => value !== null && Number.isFinite(value));

  const minPrice = Math.min(...candles.map((item) => item.low), ...overlayLevels) * 0.992;
  const maxPrice = Math.max(...candles.map((item) => item.high), ...overlayLevels) * 1.008;
  const maxVolume = Math.max(...volumes, 1);

  const volumeTop = top + priceHeight + gap;
  const rsiTop = volumeTop + volumeHeight + gap;
  const macdTop = rsiTop + (rsiHeight ? rsiHeight + gap : 0);
  const chartBottom = totalHeight - bottomAxisHeight;

  const macdValues = [
    0,
    ...macd.macdLine.filter((value): value is number => value !== null),
    ...macd.signalLine.filter((value): value is number => value !== null),
    ...macd.histogram.filter((value): value is number => value !== null)
  ];

  const minMacd = Math.min(...macdValues) * 1.1;
  const maxMacd = Math.max(...macdValues) * 1.1;

  function x(index: number) {
    return left + candleStep * index + candleStep / 2;
  }

  const hoveredIndex =
    hoverIndex === null ? candles.length - 1 : Math.max(0, Math.min(candles.length - 1, hoverIndex));
  const hoveredCandle = candles[hoveredIndex];
  const hoveredPriceY = lineY(hoveredCandle.close, minPrice, maxPrice, top, priceHeight);

  function buildPolyline(
    points: Array<number | null>,
    min: number,
    max: number,
    chartTop: number,
    chartHeight: number
  ) {
    return candles
      .map((_, index) => {
        const value = points[index];
        return value === null ? null : `${x(index)},${lineY(value, min, max, chartTop, chartHeight)}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  const ema20Points = buildPolyline(ema20, minPrice, maxPrice, top, priceHeight);
  const ema50Points = buildPolyline(ema50, minPrice, maxPrice, top, priceHeight);
  const rsiPoints = buildPolyline(rsi14, 0, 100, rsiTop, rsiHeight);
  const macdPoints = buildPolyline(macd.macdLine, minMacd, maxMacd, macdTop, macdHeight);
  const macdSignalPoints = buildPolyline(macd.signalLine, minMacd, maxMacd, macdTop, macdHeight);

  function renderHorizontalLevel(value: number | null, label: string, className: string) {
    if (value === null || !Number.isFinite(value)) return null;
    const y = lineY(value, minPrice, maxPrice, top, priceHeight);

    return (
      <g key={`${label}-${value}`}>
        <line x1={left} y1={y} x2={width - right} y2={y} className={className} />
        <text x={width - right + 8} y={y + 4} className="tv-axis-label">
          {formatPrice(value)}
        </text>
      </g>
    );
  }

  function getHoverIndexFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return candles.length - 1;

    const rect = svg.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const normalizedX = (relativeX / rect.width) * width;
    return Math.round((normalizedX - left - candleStep / 2) / candleStep);
  }

  function handleChartWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();

    const direction = event.deltaY > 0 ? 1 : -1;

    if (event.ctrlKey) {
      const anchorIndex = getHoverIndexFromClientX(event.clientX);
      const anchorRatio = candles.length > 1 ? anchorIndex / Math.max(1, candles.length - 1) : 1;

      setZoomFactor((current) => {
        const next = direction > 0 ? current / 1.15 : current * 1.15;
        const clampedZoom = Math.max(0.35, Math.min(12, next));
        const nextVisible = Math.max(12, Math.min(allCandles.length, Math.round(baseVisibleCount / clampedZoom)));
        const absoluteAnchor = startIndex + Math.max(0, Math.min(candles.length - 1, anchorIndex));
        const projectedStart = Math.round(absoluteAnchor - anchorRatio * Math.max(0, nextVisible - 1));
        const nextMaxStart = Math.max(0, allCandles.length - nextVisible);
        setStartIndex(Math.max(0, Math.min(nextMaxStart, projectedStart)));
        return clampedZoom;
      });

      return;
    }

    const shiftSteps = Math.max(1, Math.round(Math.abs((event.deltaX || event.deltaY) / 48)));
    setStartIndex((current) => {
      const next = current + direction * shiftSteps;
      return Math.max(0, Math.min(maxStartIndex, next));
    });
  }

  const bottomAxisTicks = Array.from({ length: Math.min(6, candles.length) }, (_, tickIndex) => {
    if (candles.length === 1) return 0;
    return Math.round((tickIndex / Math.max(1, Math.min(5, candles.length - 1))) * (candles.length - 1));
  }).filter((value, index, list) => list.indexOf(value) === index);

  return (
    <div className="chart-shell">
      <div className="tv-topbar">
        <div className="tv-symbol-group">
          <div className="tv-symbol">{detail?.market.pair.display ?? "BTC/USDT"}</div>
          <div className="tv-symbol-price">{formatPrice(detail?.market.spot.priceUsd ?? null)}</div>
          <div className="tv-symbol-meta">
            24H {formatPercent(detail?.market.spot.change24h ?? null)} · 30D{" "}
            {formatPercent(detail?.market.technicals.change30d ?? null)}
          </div>
        </div>

        <div className="tv-badges">
          <span className={signalClassName(detail?.signal.signal ?? "HOLD")}>
            {detail?.signal.signal ?? "HOLD"}
          </span>
          <span className="tv-mini-chip">PIONEX</span>
        </div>
      </div>

      <div className="tv-controls">
        <div className="tv-control-group">
          {(["1H", "4H", "1D"] as ChartInterval[]).map((item) => (
            <button
              key={item}
              type="button"
              className={item === interval ? "tv-control active" : "tv-control"}
              onClick={() => setIntervalValue(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="tv-control-group">
          {(["1D", "1W", "1M"] as ChartWindow[]).map((item) => (
            <button
              key={item}
              type="button"
              className={item === windowValue ? "tv-control active" : "tv-control"}
              onClick={() => setWindowValue(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="tv-hover-card">
        <span>{formatDateTime(hoveredCandle?.time)}</span>
        <span>O {formatPrice(hoveredCandle?.open ?? null)}</span>
        <span>H {formatPrice(hoveredCandle?.high ?? null)}</span>
        <span>L {formatPrice(hoveredCandle?.low ?? null)}</span>
        <span>C {formatPrice(hoveredCandle?.close ?? null)}</span>
        <span className="tv-hover-hint">Ctrl + колесо: zoom · колесо: прокрутка по времени</span>
      </div>

      <div className="chart-svg-wrap tradingview-shell">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="chart-svg"
          role="img"
          aria-label="market chart"
          onWheel={handleChartWheel}
          onMouseMove={(event) => {
            const nextIndex = getHoverIndexFromClientX(event.clientX);
            setHoverIndex(nextIndex);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <rect x="0" y="0" width={width} height={totalHeight} rx="18" className="tv-bg" />

          {Array.from({ length: 6 }).map((_, index) => {
            const value = minPrice + ((maxPrice - minPrice) / 5) * index;
            const y = lineY(value, minPrice, maxPrice, top, priceHeight);

            return (
              <g key={`price-grid-${index}`}>
                <line x1={left} y1={y} x2={width - right} y2={y} className="tv-grid" />
                <text x={width - right + 8} y={y + 4} className="tv-axis-label">
                  {formatPrice(value)}
                </text>
              </g>
            );
          })}

          {bottomAxisTicks.map((tickIndex) => {
            const tickX = x(tickIndex);
            const candle = candles[tickIndex];

            return (
              <g key={`time-tick-${tickIndex}`}>
                <line x1={tickX} y1={top} x2={tickX} y2={chartBottom} className="tv-grid tv-grid-vertical" />
                <text x={tickX} y={totalHeight - 10} textAnchor="middle" className="tv-axis-label tv-time-axis-label">
                  {formatAxisTime(candle?.time, interval)}
                </text>
              </g>
            );
          })}

          <line x1={left} y1={chartBottom} x2={width - right} y2={chartBottom} className="tv-axis-line" />

          {candles.map((candle, index) => {
            const cx = x(index);
            const openY = lineY(candle.open, minPrice, maxPrice, top, priceHeight);
            const closeY = lineY(candle.close, minPrice, maxPrice, top, priceHeight);
            const highY = lineY(candle.high, minPrice, maxPrice, top, priceHeight);
            const lowY = lineY(candle.low, minPrice, maxPrice, top, priceHeight);
            const candleClass = candle.close >= candle.open ? "tv-candle-up" : "tv-candle-down";
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(1.2, Math.abs(closeY - openY));

            return (
              <g key={candle.time}>
                <line x1={cx} y1={highY} x2={cx} y2={lowY} className={candleClass} />
                <rect
                  x={cx - candleBodyWidth / 2}
                  y={bodyY}
                  width={candleBodyWidth}
                  height={bodyHeight}
                  className={candleClass}
                />
              </g>
            );
          })}

          {activeIndicators.ema20 && ema20Points ? (
            <polyline fill="none" className="tv-line-ema20" strokeWidth="1.5" points={ema20Points} />
          ) : null}

          {activeIndicators.ema50 && ema50Points ? (
            <polyline fill="none" className="tv-line-ema50" strokeWidth="1.5" points={ema50Points} />
          ) : null}

          {activeIndicators.range ? (
            <>
              {renderHorizontalLevel(detail?.signal.low30d ?? null, "Low", "tv-level tv-level-muted")}
              {renderHorizontalLevel(detail?.signal.high30d ?? null, "High", "tv-level tv-level-muted")}
            </>
          ) : null}

          {activeIndicators.supports ? (
            <>
              {renderHorizontalLevel(detail?.signal.nearestSupport ?? null, "Support", "tv-level tv-level-support")}
              {renderHorizontalLevel(detail?.signal.nearestResistance ?? null, "Resistance", "tv-level tv-level-resistance")}
            </>
          ) : null}

          {activeIndicators.tradePlan ? (
            <>
              {renderHorizontalLevel(detail?.signal.entryZoneLow ?? null, "Entry low", "tv-level tv-level-entry")}
              {renderHorizontalLevel(detail?.signal.entryZoneHigh ?? null, "Entry high", "tv-level tv-level-entry")}
              {renderHorizontalLevel(detail?.signal.protectiveStop ?? null, "Stop", "tv-level tv-level-stop")}
              {renderHorizontalLevel(detail?.signal.breakEvenActivationPrice ?? null, "BE", "tv-level tv-level-be")}
            </>
          ) : null}

          {activeIndicators.confirmation
            ? renderHorizontalLevel(detail?.signal.confirmationLevel ?? null, "Confirm", "tv-level tv-level-confirm")
            : null}

          {candles.map((candle, index) => {
            const volume = candle.volumeTo ?? candle.volumeFrom ?? 0;
            const barHeight = (volume / maxVolume) * volumeHeight;
            const barY = volumeTop + volumeHeight - barHeight;
            const cx = x(index);
            const widthValue = Math.max(1.2, candleBodyWidth);
            const className = candle.close >= candle.open ? "tv-volume-up" : "tv-volume-down";

            return (
              <rect
                key={`vol-${candle.time}`}
                x={cx - widthValue / 2}
                y={barY}
                width={widthValue}
                height={barHeight}
                className={className}
              />
            );
          })}

          {activeIndicators.rsi ? (
            <>
              <rect x={left} y={rsiTop} width={chartWidth} height={rsiHeight} className="tv-pane-box" />
              <line x1={left} y1={lineY(70, 0, 100, rsiTop, rsiHeight)} x2={width - right} y2={lineY(70, 0, 100, rsiTop, rsiHeight)} className="tv-pane-guide danger" />
              <line x1={left} y1={lineY(30, 0, 100, rsiTop, rsiHeight)} x2={width - right} y2={lineY(30, 0, 100, rsiTop, rsiHeight)} className="tv-pane-guide info" />
              {rsiPoints ? <polyline fill="none" className="tv-line-rsi" strokeWidth="1.4" points={rsiPoints} /> : null}
            </>
          ) : null}

          {activeIndicators.macd ? (
            <>
              <rect x={left} y={macdTop} width={chartWidth} height={macdHeight} className="tv-pane-box" />
              <line x1={left} y1={lineY(0, minMacd, maxMacd, macdTop, macdHeight)} x2={width - right} y2={lineY(0, minMacd, maxMacd, macdTop, macdHeight)} className="tv-pane-guide" />

              {candles.map((_, index) => {
                const value = macd.histogram[index];
                if (value === null) return null;

                const zeroY = lineY(0, minMacd, maxMacd, macdTop, macdHeight);
                const valueY = lineY(value, minMacd, maxMacd, macdTop, macdHeight);
                const y = value >= 0 ? valueY : zeroY;
                const height = Math.max(1.2, Math.abs(valueY - zeroY));

                return (
                  <rect
                    key={`macd-${index}`}
                    x={x(index) - Math.max(1.2, candleBodyWidth / 2)}
                    y={y}
                    width={Math.max(1.8, candleBodyWidth)}
                    height={height}
                    className={value >= 0 ? "tv-macd-pos" : "tv-macd-neg"}
                  />
                );
              })}

              {macdPoints ? <polyline fill="none" className="tv-line-macd" strokeWidth="1.3" points={macdPoints} /> : null}
              {macdSignalPoints ? <polyline fill="none" className="tv-line-macd-signal" strokeWidth="1.3" points={macdSignalPoints} /> : null}
            </>
          ) : null}

          <line x1={x(hoveredIndex)} y1={top} x2={x(hoveredIndex)} y2={chartBottom} className="tv-crosshair" />

          <line x1={left} y1={hoveredPriceY} x2={width - right} y2={hoveredPriceY} className="tv-crosshair" />

          <g className="tv-axis-box-group">
            <rect x={width - right + 6} y={hoveredPriceY - 11} width={74} height={22} rx={6} className="tv-axis-box" />
            <text x={width - right + 43} y={hoveredPriceY + 4} textAnchor="middle" className="tv-axis-box-text">
              {formatPrice(hoveredCandle.close)}
            </text>
          </g>

          <g className="tv-axis-box-group">
            <rect x={Math.max(left, Math.min(width - right - 118, x(hoveredIndex) - 59))} y={chartBottom + 6} width={118} height={22} rx={6} className="tv-axis-box" />
            <text x={Math.max(left + 59, Math.min(width - right - 59, x(hoveredIndex)))} y={chartBottom + 21} textAnchor="middle" className="tv-axis-box-text">
              {formatAxisTime(hoveredCandle.time, interval)}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}


export default function DashboardClient({
  initialDashboard,
  dashboardError,
  initialMarkets,
  marketsError,
  initialSelectedSymbol,
  initialDetail,
  detailError: initialDetailError
}: Props) {
  const [buyMode, setBuyMode] = useState<BuyMode>("soft");
  const [dashboard, setDashboard] = useState<DashboardData | null>(initialDashboard);
  const [markets, setMarkets] = useState<MarketsResponse | null>(initialMarkets);
  const [selectedSymbolSeed, setSelectedSymbolSeed] = useState(initialSelectedSymbol || "BTC");
  const [detailSeed, setDetailSeed] = useState<MarketDetail | null>(initialDetail);
  const [bootstrapLoading, setBootstrapLoading] = useState(
    !initialDashboard || !initialMarkets || !initialDetail
  );
  const [bootstrapError, setBootstrapError] = useState<string | null>(
    dashboardError ?? marketsError ?? initialDetailError ?? null
  );
  const [loaderMessage, setLoaderMessage] = useState(
    "Проверяем прогрев кеша BUY-сигналов и ждём первые данные."
  );
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);

  const {
    selectedSymbol,
    setSelectedSymbol,
    detail,
    detailLoading,
    detailError,
    reloadDetail
  } = useSelectedMarket(detailSeed, selectedSymbolSeed);

  const [panelMode, setPanelMode] = useState<SidePanelMode>("summary");
  const [infoData, setInfoData] = useState<InfoResponse | null>(null);
  const [aiData, setAiData] = useState<AiResponse | null>(null);
  const [sideLoading, setSideLoading] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Record<IndicatorKey, boolean>>({
    ema20: false,
    ema50: false,
    rsi: false,
    macd: false,
    range: false,
    supports: false,
    tradePlan: false,
    confirmation: false
  });

  const topBuys = dashboard?.topBuys ?? [];

  const buySymbols = useMemo(
    () => new Set(topBuys.map((item) => item.symbol)),
    [topBuys]
  );

  const fullList = useMemo(
    () => (markets?.items ?? []).filter((item) => !buySymbols.has(item.symbol)),
    [buySymbols, markets]
  );

  const selectedListItem = useMemo(() => {
    return (
      topBuys.find((item) => item.symbol === selectedSymbol) ??
      (markets?.items ?? []).find((item) => item.symbol === selectedSymbol) ??
      null
    );
  }, [topBuys, markets, selectedSymbol]);

  useEffect(() => {
    setSideError(null);
  }, [selectedSymbol]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setBootstrapLoading(true);
      setBootstrapError(null);
      setLoaderMessage(`Ждём, пока backend положит BUY-сигналы (${buyMode}) в кеш.`);

      try {
        await waitUntilBuySignalsCacheReady(buyMode);

        if (cancelled) return;

        setLoaderMessage("Кеш готов. Загружаем dashboard, рынок и выбранную пару.");

        const [dashboardResponse, marketsResponse] = await Promise.all([
          getDashboardData(buyMode),
          getMarkets(30)
        ]);

        if (cancelled) return;

        setDashboard(dashboardResponse);
        setMarkets(marketsResponse);

        const nextSymbol =
          dashboardResponse.topBuys[0]?.symbol ??
          marketsResponse.items.find((item) => item.symbol === "BTC")?.symbol ??
          marketsResponse.items[0]?.symbol ??
          initialSelectedSymbol ??
          "BTC";

        setSelectedSymbolSeed(nextSymbol);
        setSelectedSymbol(nextSymbol);

        const detailResponse = await getMarketDetail(nextSymbol);

        if (cancelled) return;
        setDetailSeed(detailResponse);
      } catch (error) {
        if (cancelled) return;
        setBootstrapError(error instanceof Error ? error.message : "Не удалось загрузить dashboard");
      } finally {
        if (!cancelled) {
          setBootstrapLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [buyMode, initialSelectedSymbol, setSelectedSymbol]);

  async function handleLoadInfo() {
    setPanelMode("history");
    setSideLoading(true);
    setSideError(null);

    try {
      const response = await getInfoCard(selectedSymbol);
      setInfoData(response);
    } catch (error) {
      setSideError(error instanceof Error ? error.message : "Не удалось загрузить справку");
    } finally {
      setSideLoading(false);
    }
  }

  async function handleLoadAi() {
    setPanelMode("analytics");
    setSideLoading(true);
    setSideError(null);

    try {
      const response = await getAiAnalysis(selectedSymbol);
      setAiData(response);
    } catch (error) {
      setSideError(error instanceof Error ? error.message : "Не удалось загрузить аналитику");
    } finally {
      setSideLoading(false);
    }
  }

  async function handleRefreshSignal() {
    setPanelMode("summary");
    setSideError(null);
    setBootstrapError(null);
    setBootstrapLoading(true);
    setLoaderMessage(
      `Принудительно обновляем кеш BUY-сигналов (${buyMode}) по кнопке «Получить сигналы».`
    );

    try {
      await refreshBuySignalsCache(buyMode);

      const [dashboardResponse, marketsResponse] = await Promise.all([
        getDashboardData(buyMode),
        getMarkets(30)
      ]);

      setDashboard(dashboardResponse);
      setMarkets(marketsResponse);

      const nextSymbol =
        dashboardResponse.topBuys[0]?.symbol ??
        selectedSymbol ??
        marketsResponse.items.find((item) => item.symbol === "BTC")?.symbol ??
        marketsResponse.items[0]?.symbol ??
        "BTC";

      setSelectedSymbolSeed(nextSymbol);
      setSelectedSymbol(nextSymbol);

      const detailResponse = await getMarketDetail(nextSymbol);
      setDetailSeed(detailResponse);
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : "Не удалось обновить кеш сигналов");
      await reloadDetail();
    } finally {
      setBootstrapLoading(false);
    }
  }

  const summaryLines = buildSummaryLines(detail, dashboard);
  const managementLines = buildManagementLines(detail, dashboard, selectedSymbol);

  const sideTextLines =
    panelMode === "summary"
      ? [...summaryLines, "", "Как сопровождать сделку:", ...managementLines]
      : panelMode === "history"
        ? normalizeTextBlock(infoData?.text)
        : normalizeTextBlock(aiData?.text);

  const buyCommandLines = normalizeTextBlock(dashboard?.buyCommandText);

  const topError = bootstrapError ?? detailError;

  return (
    <>
      {bootstrapLoading ? (
        <div className="loader-overlay">
          <div className="loader-card">
            <div className="loader-spinner" />
            <h3>Прогреваем кеш сигналов</h3>
            <p>{loaderMessage}</p>
            <p className="loader-note">
              Лоадер не скрывается, пока backend не завершит scan и не положит BUY-данные в кеш.
            </p>
          </div>
        </div>
      ) : null}

      {topError ? (
        <section className="section section-tight">
          <div className="card warning-card">
            <h3>Часть данных недоступна</h3>
            <p>Dashboard продолжает работать в деградированном режиме и не падает целиком.</p>
            <p style={{ marginTop: 12 }}>{topError}</p>
          </div>
        </section>
      ) : null}

      <section className="section section-tight dashboard-grid" aria-busy={bootstrapLoading}>
        <div className="dashboard-left-stack">
          <div className="card dashboard-chart-card">
            <TradingChart detail={detail} activeIndicators={activeIndicators} />
          </div>

          <div className={indicatorsOpen ? "card dashboard-indicators-card indicators-open" : "card dashboard-indicators-card"}>
            <div className="list-title-row">
              <h3>Индикаторы</h3>
              <button
                type="button"
                className="collapse-button"
                onClick={() => setIndicatorsOpen((value) => !value)}
              >
                {indicatorsOpen ? "Скрыть" : "Показать"}
              </button>
            </div>

            {indicatorsOpen ? (
              <div className="indicator-dropdown-panel">
                <div className="indicator-grid">
                  {INDICATORS.map((indicator) => {
                    const enabled = activeIndicators[indicator.key];

                    return (
                      <button
                        key={indicator.key}
                        type="button"
                        className={enabled ? "indicator-toggle active" : "indicator-toggle"}
                        onClick={() =>
                          setActiveIndicators((current) => ({
                            ...current,
                            [indicator.key]: !current[indicator.key]
                          }))
                        }
                      >
                        <span className="indicator-check" />
                        <span>{indicator.label}</span>
                      </button>
                    );
                  })}
                </div>

                {detail ? (
                  <div className="indicator-stats-grid">
                    <div className="indicator-stat-card">
                      <span>EMA 20</span>
                      <strong>{formatPrice(detail.market.technicals.ema20)}</strong>
                    </div>
                    <div className="indicator-stat-card">
                      <span>EMA 50</span>
                      <strong>{formatPrice(detail.market.technicals.ema50)}</strong>
                    </div>
                    <div className="indicator-stat-card">
                      <span>RSI 14</span>
                      <strong>{formatNumber(detail.market.technicals.rsi14)}</strong>
                    </div>
                    <div className="indicator-stat-card">
                      <span>MACD</span>
                      <strong>{formatNumber(detail.market.technicals.macdLine, 4)}</strong>
                    </div>
                    <div className="indicator-stat-card">
                      <span>Support</span>
                      <strong>{formatPrice(detail.signal.nearestSupport)}</strong>
                    </div>
                    <div className="indicator-stat-card">
                      <span>Resistance</span>
                      <strong>{formatPrice(detail.signal.nearestResistance)}</strong>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="dashboard-middle-stack">
          <div className="card dashboard-list-card dashboard-buy-card">
            <div className="list-title-row buy-signals-head">
              <div className="buy-signals-title-wrap">
                <h3>Сигналы</h3>
              </div>

              <div className="mode-switch">
                <button
                  type="button"
                  className={buyMode === "soft" ? "mode-button active" : "mode-button"}
                  onClick={() => setBuyMode("soft")}
                >
                  soft
                </button>
                <button
                  type="button"
                  className={buyMode === "hard" ? "mode-button active" : "mode-button"}
                  onClick={() => setBuyMode("hard")}
                >
                  hard
                </button>
              </div>
            </div>

            <div className="signal-list fill-scroll buy-signal-detail-list buy-command-scroll">
              <div className="buy-command-text-block">
                {buyCommandLines.length ? (
                  buyCommandLines.map((line, index) => <p key={`buy-command-${index}`}>{line}</p>)
                ) : (
                  <p>Данные /buy пока недоступны.</p>
                )}
              </div>
            </div>
          </div>

          <div className="card dashboard-list-card dashboard-full-card">
            <div className="list-title-row">
              <h3>Полный список</h3>
              <span className="muted">{fullList.length}</span>
            </div>

            <div className="signal-list signal-list-compact fill-scroll">
              {fullList.map((item) => (
                <button
                  type="button"
                  key={item.symbol}
                  className={item.symbol === selectedSymbol ? "market-row active" : "market-row"}
                  onClick={() => {
                    setSelectedSymbol(item.symbol);
                    setPanelMode("summary");
                  }}
                >
                  <div className="market-row-left">
                    <span className="market-row-pair">{item.pair}</span>
                    <div className="market-row-meta">{item.name}</div>
                  </div>

                  <div className="market-row-right compact">
                    <span className={signalClassName(item.signal)}>{item.signal}</span>
                    <span className="market-row-price">{formatPrice(item.priceUsd)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="dashboard-right-stack">
          <div className="card dashboard-summary-card">
            <div className="list-title-row summary-head">
              <div className="summary-title-block">
                <h3>Информация</h3>
                <div className="summary-section-caption">
                  {panelMode === "summary"
                    ? "Сводка по выбранной паре"
                    : panelMode === "history"
                      ? "История"
                      : "Аналитика"}
                </div>
              </div>

              {selectedListItem ? <span className="pill summary-pair-pill">{selectedListItem.pair}</span> : null}
            </div>

            {detailLoading || sideLoading ? <p>Загрузка данных...</p> : null}
            {sideError ? <p>{sideError}</p> : null}

            {!detailLoading && !sideLoading && !sideError ? (
              <>
                {panelMode === "summary" && detail ? (
                  <div className="summary-metrics-grid">
                    <div className="summary-metric">
                      <span>Сигнал</span>
                      <strong className={signalClassName(detail.signal.signal)}>
                        {detail.signal.signal}
                      </strong>
                    </div>
                    <div className="summary-metric">
                      <span>Цена</span>
                      <strong>{formatPrice(detail.market.spot.priceUsd)}</strong>
                    </div>
                    <div className="summary-metric">
                      <span>24ч</span>
                      <strong>{formatPercent(detail.market.spot.change24h)}</strong>
                    </div>
                    <div className="summary-metric">
                      <span>30д</span>
                      <strong>{formatPercent(detail.market.technicals.change30d)}</strong>
                    </div>
                    <div className="summary-metric">
                      <span>RSI 14</span>
                      <strong>{formatNumber(detail.market.technicals.rsi14)}</strong>
                    </div>
                    <div className="summary-metric">
                      <span>TVL</span>
                      <strong>{formatCompactUsd(detail.market.liquidity.totalTvlUsd)}</strong>
                    </div>
                  </div>
                ) : null}

                <div className="summary-text-block fill-scroll">
                  {sideTextLines.map((line, index) =>
                    line === "" ? (
                      <div className="summary-gap" key={`gap-${index}`} />
                    ) : (
                      <p key={`${line}-${index}`}>{line}</p>
                    )
                  )}
                </div>
              </>
            ) : null}
          </div>

          <div className="dashboard-actions">
            <button
              type="button"
              className={panelMode === "history" ? "action-button active" : "action-button"}
              onClick={handleLoadInfo}
            >
              История
            </button>

            <button
              type="button"
              className={panelMode === "analytics" ? "action-button active" : "action-button"}
              onClick={handleLoadAi}
            >
              Аналитика
            </button>

            <button
              type="button"
              className={panelMode === "summary" ? "action-button primary active" : "action-button primary"}
              onClick={handleRefreshSignal}
            >
              Получить сигналы
            </button>
          </div>
        </div>
      </section>
    </>
  );
}