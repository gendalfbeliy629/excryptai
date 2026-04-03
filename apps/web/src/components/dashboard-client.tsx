"use client";

import { useEffect, useMemo, useState } from "react";
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
  MarketsResponse
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

type SidePanelMode = "summary" | "info" | "analytics";

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
    : ["Для этой пары отдельный buy-план сейчас отсутствует, отображается только summary из анализа."];
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

function useSelectedMarket(
  initialDetail: MarketDetail | null,
  initialSelectedSymbol: string
) {
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

async function waitUntilBuySignalsCacheReady() {
  const maxAttempts = 60;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getDashboardBootstrapStatus();

    if (status.buySignalsCacheReady) {
      return status;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Кеш BUY-сигналов не успел прогреться. Повтори обновление через несколько секунд.");
}

function lineY(value: number, min: number, max: number, top: number, height: number) {
  if (max === min) return top + height / 2;
  const ratio = (value - min) / (max - min);
  return top + height - ratio * height;
}

function TradingChart({
  detail,
  activeIndicators
}: {
  detail: MarketDetail | null;
  activeIndicators: Record<IndicatorKey, boolean>;
}) {
  const width = 980;
  const priceHeight = 380;
  const indicatorHeight = 110;
  const macdHeight = 120;
  const gap = 18;
  const left = 16;
  const right = 62;
  const top = 18;

  const candles = (detail?.market.technicals.candles ?? []).slice(-80);
  const closes = candles.map((item) => item.close);

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);

  const showRsi = activeIndicators.rsi;
  const showMacd = activeIndicators.macd;

  const totalHeight =
    top +
    priceHeight +
    (showRsi ? gap + indicatorHeight : 0) +
    (showMacd ? gap + macdHeight : 0) +
    16;

  const innerWidth = width - left - right;
  const candleStep = candles.length > 0 ? innerWidth / candles.length : innerWidth;
  const candleBodyWidth = Math.max(4, candleStep * 0.52);

  const extraLevels = [
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

  const priceValues = candles.flatMap((item) => [item.high, item.low, item.close]);
  const allPriceValues = [...priceValues, ...extraLevels];
  const minPrice = allPriceValues.length ? Math.min(...allPriceValues) * 0.985 : 0;
  const maxPrice = allPriceValues.length ? Math.max(...allPriceValues) * 1.015 : 1;

  const rsiTop = top + priceHeight + gap;
  const macdTop = top + priceHeight + (showRsi ? gap + indicatorHeight : 0) + gap;

  function x(index: number) {
    return left + candleStep * index + candleStep / 2;
  }

  const closePolyline = candles
    .map((item, index) => `${x(index)},${lineY(item.close, minPrice, maxPrice, top, priceHeight)}`)
    .join(" ");

  const ema20Polyline = candles
    .map((item, index) => {
      const value = ema20[index];
      if (value === null) return null;
      return `${x(index)},${lineY(value, minPrice, maxPrice, top, priceHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const ema50Polyline = candles
    .map((item, index) => {
      const value = ema50[index];
      if (value === null) return null;
      return `${x(index)},${lineY(value, minPrice, maxPrice, top, priceHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const rsiPolyline = candles
    .map((item, index) => {
      const value = rsi14[index];
      if (value === null) return null;
      return `${x(index)},${lineY(value, 0, 100, rsiTop, indicatorHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const validMacdValues = [
    ...macd.macdLine.filter((v): v is number => v !== null),
    ...macd.signalLine.filter((v): v is number => v !== null),
    ...macd.histogram.filter((v): v is number => v !== null),
    0
  ];

  const minMacd = validMacdValues.length ? Math.min(...validMacdValues) * 1.15 : -1;
  const maxMacd = validMacdValues.length ? Math.max(...validMacdValues) * 1.15 : 1;

  const macdPolyline = candles
    .map((item, index) => {
      const value = macd.macdLine[index];
      if (value === null) return null;
      return `${x(index)},${lineY(value, minMacd, maxMacd, macdTop, macdHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const macdSignalPolyline = candles
    .map((item, index) => {
      const value = macd.signalLine[index];
      if (value === null) return null;
      return `${x(index)},${lineY(value, minMacd, maxMacd, macdTop, macdHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const latestRsi = rsi14[rsi14.length - 1] ?? detail?.market.technicals.rsi14 ?? null;
  const latestEma20 = ema20[ema20.length - 1] ?? null;
  const latestEma50 = ema50[ema50.length - 1] ?? null;
  const latestMacd = macd.macdLine[macd.macdLine.length - 1] ?? null;
  const latestMacdSignal = macd.signalLine[macd.signalLine.length - 1] ?? null;

  const priceTickValues = Array.from({ length: 5 }, (_, index) => {
    const value = minPrice + ((maxPrice - minPrice) / 4) * index;
    return {
      value,
      y: lineY(value, minPrice, maxPrice, top, priceHeight)
    };
  });

  const dateLabels = candles.filter((_, index) => index % Math.max(1, Math.floor(candles.length / 6)) === 0);

  function renderLevel(
    value: number | null,
    color: string,
    dash = "6 6",
    label?: string
  ) {
    if (value === null || !Number.isFinite(value)) return null;
    const y = lineY(value, minPrice, maxPrice, top, priceHeight);

    return (
      <g key={`${label ?? color}-${value}`}>
        <line x1={left} y1={y} x2={width - right + 8} y2={y} stroke={color} strokeDasharray={dash} strokeWidth="1" />
        {label ? (
          <text x={width - right + 12} y={y + 4} fill={color} fontSize="11">
            {label}
          </text>
        ) : null}
      </g>
    );
  }

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <div>
          <div className="chart-title">{detail?.market.pair.display ?? "BTC/USDT"}</div>
          <div className="chart-subtitle">
            Светлый TradingView-подобный график без внешней библиотеки, чтобы сборка не падала.
          </div>
        </div>

        <div className="chart-price-box">
          <span>Текущая цена</span>
          <strong>{formatPrice(detail?.market.spot.priceUsd ?? null)}</strong>
        </div>
      </div>

      <div className="chart-metrics">
        <div className="tv-metric">
          <span>EMA 20</span>
          <strong>{formatPrice(latestEma20)}</strong>
        </div>
        <div className="tv-metric">
          <span>EMA 50</span>
          <strong>{formatPrice(latestEma50)}</strong>
        </div>
        <div className="tv-metric">
          <span>RSI 14</span>
          <strong>{formatNumber(latestRsi)}</strong>
        </div>
        <div className="tv-metric">
          <span>MACD</span>
          <strong>{formatNumber(latestMacd, 4)}</strong>
        </div>
        <div className="tv-metric">
          <span>Signal</span>
          <strong>{formatNumber(latestMacdSignal, 4)}</strong>
        </div>
      </div>

      {candles.length ? (
        <div className="chart-svg-wrap">
          <svg viewBox={`0 0 ${width} ${totalHeight}`} className="chart-svg" role="img" aria-label="market chart">
            <rect x="0" y="0" width={width} height={totalHeight} rx="18" fill="#ffffff" />

            {priceTickValues.map((tick, index) => (
              <g key={`price-tick-${index}`}>
                <line
                  x1={left}
                  y1={tick.y}
                  x2={width - right + 8}
                  y2={tick.y}
                  stroke="#e8eef8"
                  strokeWidth="1"
                />
                <text
                  x={width - right + 12}
                  y={tick.y + 4}
                  fill="#64748b"
                  fontSize="11"
                >
                  {formatPrice(tick.value)}
                </text>
              </g>
            ))}

            {dateLabels.map((item, index) => {
              const originalIndex = candles.findIndex((candidate) => candidate.time === item.time);
              const labelX = x(originalIndex);
              return (
                <text
                  key={`date-${item.time}-${index}`}
                  x={labelX - 18}
                  y={top + priceHeight + 18}
                  fill="#94a3b8"
                  fontSize="11"
                >
                  {new Date(item.time * 1000).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit"
                  })}
                </text>
              );
            })}

            {activeIndicators.range
              ? [
                  renderLevel(detail?.signal.low30d ?? null, "#94a3b8", "4 6", "Low"),
                  renderLevel(detail?.signal.high30d ?? null, "#64748b", "4 6", "High")
                ]
              : null}

            {activeIndicators.supports
              ? [
                  renderLevel(detail?.signal.nearestSupport ?? null, "#0f766e", "6 6", "Support"),
                  renderLevel(detail?.signal.nearestResistance ?? null, "#ea580c", "6 6", "Resistance")
                ]
              : null}

            {activeIndicators.tradePlan
              ? [
                  renderLevel(detail?.signal.entryZoneLow ?? null, "#38bdf8", "5 5", "Entry low"),
                  renderLevel(detail?.signal.entryZoneHigh ?? null, "#38bdf8", "5 5", "Entry high"),
                  renderLevel(detail?.signal.protectiveStop ?? null, "#dc2626", "2 5", "Stop"),
                  renderLevel(detail?.signal.breakEvenActivationPrice ?? null, "#16a34a", "2 5", "BE")
                ]
              : null}

            {activeIndicators.confirmation
              ? renderLevel(detail?.signal.confirmationLevel ?? null, "#f59e0b", "6 6", "Confirm")
              : null}

            {closePolyline ? (
              <polyline
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                points={closePolyline}
              />
            ) : null}

            {activeIndicators.ema20 && ema20Polyline ? (
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                points={ema20Polyline}
              />
            ) : null}

            {activeIndicators.ema50 && ema50Polyline ? (
              <polyline
                fill="none"
                stroke="#7c3aed"
                strokeWidth="2"
                points={ema50Polyline}
              />
            ) : null}

            {candles.map((candle, index) => {
              const xCenter = x(index);
              const yOpen = lineY(candle.open, minPrice, maxPrice, top, priceHeight);
              const yClose = lineY(candle.close, minPrice, maxPrice, top, priceHeight);
              const yHigh = lineY(candle.high, minPrice, maxPrice, top, priceHeight);
              const yLow = lineY(candle.low, minPrice, maxPrice, top, priceHeight);
              const bullish = candle.close >= candle.open;
              const color = bullish ? "#16a34a" : "#dc2626";
              const rectY = Math.min(yOpen, yClose);
              const rectH = Math.max(2, Math.abs(yClose - yOpen));

              return (
                <g key={`${candle.time}-${index}`}>
                  <line
                    x1={xCenter}
                    y1={yHigh}
                    x2={xCenter}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={xCenter - candleBodyWidth / 2}
                    y={rectY}
                    width={candleBodyWidth}
                    height={rectH}
                    rx="2"
                    fill={color}
                    opacity="0.9"
                  />
                </g>
              );
            })}

            {showRsi ? (
              <>
                <rect
                  x={left}
                  y={rsiTop}
                  width={innerWidth}
                  height={indicatorHeight}
                  rx="12"
                  fill="#f8fafc"
                  stroke="#e2e8f0"
                />
                <line
                  x1={left}
                  y1={lineY(70, 0, 100, rsiTop, indicatorHeight)}
                  x2={left + innerWidth}
                  y2={lineY(70, 0, 100, rsiTop, indicatorHeight)}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                />
                <line
                  x1={left}
                  y1={lineY(30, 0, 100, rsiTop, indicatorHeight)}
                  x2={left + innerWidth}
                  y2={lineY(30, 0, 100, rsiTop, indicatorHeight)}
                  stroke="#10b981"
                  strokeDasharray="5 5"
                />
                {rsiPolyline ? (
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    points={rsiPolyline}
                  />
                ) : null}
                <text x={left + 8} y={rsiTop + 16} fill="#64748b" fontSize="12">
                  RSI 14
                </text>
              </>
            ) : null}

            {showMacd ? (
              <>
                <rect
                  x={left}
                  y={macdTop}
                  width={innerWidth}
                  height={macdHeight}
                  rx="12"
                  fill="#f8fafc"
                  stroke="#e2e8f0"
                />
                <line
                  x1={left}
                  y1={lineY(0, minMacd, maxMacd, macdTop, macdHeight)}
                  x2={left + innerWidth}
                  y2={lineY(0, minMacd, maxMacd, macdTop, macdHeight)}
                  stroke="#cbd5e1"
                  strokeDasharray="4 4"
                />
                {candles.map((item, index) => {
                  const value = macd.histogram[index];
                  if (value === null) return null;

                  const xCenter = x(index);
                  const zeroY = lineY(0, minMacd, maxMacd, macdTop, macdHeight);
                  const yValue = lineY(value, minMacd, maxMacd, macdTop, macdHeight);
                  const barHeight = Math.max(1.5, Math.abs(zeroY - yValue));
                  const yTop = Math.min(zeroY, yValue);

                  return (
                    <rect
                      key={`macd-bar-${item.time}-${index}`}
                      x={xCenter - Math.max(2, candleBodyWidth / 3)}
                      y={yTop}
                      width={Math.max(4, candleBodyWidth / 1.5)}
                      height={barHeight}
                      rx="1.5"
                      fill={value >= 0 ? "#16a34a" : "#dc2626"}
                      opacity="0.7"
                    />
                  );
                })}
                {macdPolyline ? (
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    points={macdPolyline}
                  />
                ) : null}
                {macdSignalPolyline ? (
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    points={macdSignalPolyline}
                  />
                ) : null}
                <text x={left + 8} y={macdTop + 16} fill="#64748b" fontSize="12">
                  MACD
                </text>
              </>
            ) : null}
          </svg>
        </div>
      ) : (
        <div className="chart-empty">
          Свечи временно недоступны. График будет показан, как только backend вернет candles.
        </div>
      )}
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
    ema20: true,
    ema50: true,
    rsi: true,
    macd: true,
    range: true,
    supports: true,
    tradePlan: true,
    confirmation: true
  });

  const buySymbols = useMemo(
    () => new Set((dashboard?.topBuys ?? []).map((item) => item.symbol)),
    [dashboard]
  );

  const fullList = useMemo(
    () => (markets?.items ?? []).filter((item) => !buySymbols.has(item.symbol)),
    [buySymbols, markets]
  );

  const selectedListItem = useMemo(() => {
    return (
      (dashboard?.topBuys ?? []).find((item) => item.symbol === selectedSymbol) ??
      (markets?.items ?? []).find((item) => item.symbol === selectedSymbol) ??
      null
    );
  }, [dashboard, markets, selectedSymbol]);

  useEffect(() => {
    setSideError(null);
  }, [selectedSymbol]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (initialDashboard && initialMarkets && initialDetail) {
        setBootstrapLoading(false);
        return;
      }

      setBootstrapLoading(true);
      setBootstrapError(null);
      setLoaderMessage("Ждём, пока backend положит BUY-сигналы в кеш.");

      try {
        await waitUntilBuySignalsCacheReady();

        if (cancelled) return;

        setLoaderMessage("Кеш готов. Загружаем dashboard, список рынков и карточку пары.");

        const [dashboardResponse, marketsResponse] = await Promise.all([
          getDashboardData(),
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

        try {
          const detailResponse = await getMarketDetail(nextSymbol);

          if (cancelled) return;

          setDetailSeed(detailResponse);
        } catch (error) {
          if (cancelled) return;

          setDetailSeed(null);
          setBootstrapError(
            error instanceof Error ? error.message : "Не удалось загрузить данные по выбранной паре"
          );
        }
      } catch (error) {
        if (cancelled) return;

        setBootstrapError(
          error instanceof Error ? error.message : "Не удалось загрузить dashboard"
        );
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
  }, [initialDashboard, initialDetail, initialMarkets, initialSelectedSymbol]);

  async function handleLoadInfo() {
    setPanelMode("info");
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
    await reloadDetail();
  }

  const summaryLines = buildSummaryLines(detail, dashboard);
  const managementLines = buildManagementLines(detail, dashboard, selectedSymbol);

  const sideTextLines =
    panelMode === "summary"
      ? [...summaryLines, "", "Как сопровождать сделку:", ...managementLines]
      : panelMode === "info"
        ? normalizeTextBlock(infoData?.text)
        : normalizeTextBlock(aiData?.text);

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
              Лоадер не скрывается, пока backend не закончит первый scan и не положит BUY-данные в кеш.
            </p>
          </div>
        </div>
      ) : null}

      <section className="hero">
        <div className="hero-badge">Dashboard</div>
        <h1 className="page-title">Crypto AI Dashboard</h1>
        <p className="page-subtitle dashboard-subtitle">
          График пары, сигналы на покупку, полный список рынка и визуализация индикаторов стратегии на одном экране.
        </p>
      </section>

      {topError ? (
        <section className="section">
          <div className="card warning-card">
            <h3>Часть данных недоступна</h3>
            <p>Dashboard продолжает работать в деградированном режиме и не падает целиком.</p>
            <p style={{ marginTop: 12 }}>{topError}</p>
          </div>
        </section>
      ) : null}

      <section className="section dashboard-grid" aria-busy={bootstrapLoading}>
        <div className="dashboard-left-stack">
          <div className="card dashboard-chart-card">
            <TradingChart detail={detail} activeIndicators={activeIndicators} />
          </div>

          <div className="card dashboard-indicators-card">
            <h3>Индикаторы и уровни на графике</h3>
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
                    {indicator.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="dashboard-middle-stack">
          <div className="card dashboard-list-card">
            <div className="list-title-row">
              <h3>Сигналы на покупку</h3>
              <span className="muted">{dashboard?.topBuys.length ?? 0}</span>
            </div>

            <div className="signal-list">
              {(dashboard?.topBuys ?? []).length ? (
                dashboard?.topBuys.map((item) => (
                  <button
                    type="button"
                    key={item.symbol}
                    className={item.symbol === selectedSymbol ? "market-row active" : "market-row"}
                    onClick={() => {
                      setSelectedSymbol(item.symbol);
                      setPanelMode("summary");
                    }}
                  >
                    <div>
                      <strong>{item.pair}</strong>
                      <div className="market-row-meta">{item.name}</div>
                    </div>
                    <div className="market-row-right">
                      <span className="pill signal-buy">BUY</span>
                      <span className="market-row-price">{formatPrice(item.priceUsd)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <p>Сейчас в кеше нет BUY-сигналов.</p>
                  <p>На графике показывается дефолтная пара BTC/USDT.</p>
                </div>
              )}
            </div>
          </div>

          <div className="card dashboard-list-card dashboard-list-card-secondary">
            <div className="list-title-row">
              <h3>Полный список</h3>
              <span className="muted">{fullList.length}</span>
            </div>

            <div className="signal-list signal-list-compact">
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
                  <div>
                    <strong>{item.pair}</strong>
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
              <h3>
                {panelMode === "summary"
                  ? "Сводка по сигналам"
                  : panelMode === "info"
                    ? "Справка"
                    : "Аналитика 30 дней"}
              </h3>
              {selectedListItem ? (
                <span className="pill summary-pair-pill">{selectedListItem.pair}</span>
              ) : null}
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

                <div className="summary-text-block">
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
            <button type="button" className="action-button" onClick={handleLoadInfo}>
              Справка
            </button>
            <button type="button" className="action-button" onClick={handleLoadAi}>
              Аналитика
            </button>
            <button
              type="button"
              className={panelMode === "summary" ? "action-button active" : "action-button"}
              onClick={handleRefreshSignal}
            >
              Сигналы
            </button>
          </div>
        </div>
      </section>
    </>
  );
}