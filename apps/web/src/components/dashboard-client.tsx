"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AiResponse,
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
  const maxAttempts = 120;

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
  const width = 1080;
  const priceHeight = 320;
  const rsiHeight = activeIndicators.rsi ? 92 : 0;
  const macdHeight = activeIndicators.macd ? 104 : 0;
  const gap = 18;
  const left = 18;
  const right = 76;
  const top = 18;

  const candles = (detail?.market.technicals.candles ?? []).slice(-80);
  const closes = candles.map((item) => item.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);

  const totalHeight =
    top +
    priceHeight +
    (rsiHeight ? gap + rsiHeight : 0) +
    (macdHeight ? gap + macdHeight : 0) +
    24;

  if (!candles.length) {
    return (
      <div className="chart-empty">
        Свечи временно недоступны. График будет показан, как только backend вернет candles.
      </div>
    );
  }

  const chartWidth = width - left - right;
  const candleStep = chartWidth / candles.length;
  const candleBodyWidth = Math.max(4, candleStep * 0.58);

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

  const minPrice = Math.min(...candles.map((item) => item.low), ...overlayLevels) * 0.985;
  const maxPrice = Math.max(...candles.map((item) => item.high), ...overlayLevels) * 1.015;
  const priceAreaBottom = top + priceHeight;
  const rsiTop = priceAreaBottom + gap;
  const macdTop = rsiTop + (rsiHeight ? rsiHeight + gap : 0);

  const latestRsi = rsi14[rsi14.length - 1] ?? detail?.market.technicals.rsi14 ?? null;
  const latestEma20 = ema20[ema20.length - 1] ?? detail?.market.technicals.ema20 ?? null;
  const latestEma50 = ema50[ema50.length - 1] ?? detail?.market.technicals.ema50 ?? null;
  const latestMacd = macd.macdLine[macd.macdLine.length - 1] ?? detail?.market.technicals.macdLine ?? null;
  const latestMacdSignal =
    macd.signalLine[macd.signalLine.length - 1] ?? detail?.market.technicals.macdSignal ?? null;

  const macdValues = [
    0,
    ...macd.macdLine.filter((value): value is number => value !== null),
    ...macd.signalLine.filter((value): value is number => value !== null),
    ...macd.histogram.filter((value): value is number => value !== null)
  ];

  const minMacd = Math.min(...macdValues) * 1.12;
  const maxMacd = Math.max(...macdValues) * 1.12;

  function x(index: number) {
    return left + candleStep * index + candleStep / 2;
  }

  const ema20Points = candles
    .map((_, index) => {
      const value = ema20[index];
      return value === null ? null : `${x(index)},${lineY(value, minPrice, maxPrice, top, priceHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const ema50Points = candles
    .map((_, index) => {
      const value = ema50[index];
      return value === null ? null : `${x(index)},${lineY(value, minPrice, maxPrice, top, priceHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const rsiPoints = candles
    .map((_, index) => {
      const value = rsi14[index];
      return value === null ? null : `${x(index)},${lineY(value, 0, 100, rsiTop, rsiHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const macdPoints = candles
    .map((_, index) => {
      const value = macd.macdLine[index];
      return value === null ? null : `${x(index)},${lineY(value, minMacd, maxMacd, macdTop, macdHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const macdSignalPoints = candles
    .map((_, index) => {
      const value = macd.signalLine[index];
      return value === null ? null : `${x(index)},${lineY(value, minMacd, maxMacd, macdTop, macdHeight)}`;
    })
    .filter(Boolean)
    .join(" ");

  const dateStep = Math.max(1, Math.floor(candles.length / 6));
  const dateLabels = candles.filter(
    (_, index) => index % dateStep === 0 || index === candles.length - 1
  );

  function renderHorizontalLevel(value: number | null, color: string, label: string, dash = "6 6") {
    if (value === null || !Number.isFinite(value)) return null;
    const y = lineY(value, minPrice, maxPrice, top, priceHeight);

    return (
      <g key={`${label}-${value}`}>
        <line
          x1={left}
          y1={y}
          x2={width - right + 8}
          y2={y}
          stroke={color}
          strokeWidth="1"
          strokeDasharray={dash}
        />
        <text x={width - right + 12} y={y + 4} fill={color} fontSize="11">
          {label}
        </text>
      </g>
    );
  }

  return (
    <div className="chart-shell">
      <div className="tv-toolbar">
        <div className="tv-toolbar-left">
          <span className="tv-chip active">PIONEX</span>
          <span className="tv-chip">30D</span>
          <span className="tv-chip">1H confirm</span>
        </div>

        <div className="tv-toolbar-right">
          <span className={signalClassName(detail?.signal.signal ?? "HOLD")}>
            {detail?.signal.signal ?? "HOLD"}
          </span>
          <span className="tv-chip pair">{detail?.market.pair.display ?? "BTC/USDT"}</span>
        </div>
      </div>

      <div className="chart-header chart-header-compact">
        <div>
          <div className="chart-title">{detail?.market.pair.display ?? "BTC/USDT"}</div>
          <div className="chart-subtitle">
            Светлый TradingView-подобный график в стиле Pionex с candle, EMA, RSI и MACD.
          </div>
        </div>

        <div className="chart-price-box">
          <span>Текущая цена</span>
          <strong>{formatPrice(detail?.market.spot.priceUsd ?? null)}</strong>
        </div>
      </div>

      <div className="chart-metrics chart-metrics-compact">
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

      <div className="chart-svg-wrap tradingview-shell">
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="chart-svg"
          role="img"
          aria-label="market chart"
        >
          <rect x="0" y="0" width={width} height={totalHeight} rx="18" fill="#ffffff" />

          {Array.from({ length: 5 }).map((_, index) => {
            const value = minPrice + ((maxPrice - minPrice) / 4) * index;
            const y = lineY(value, minPrice, maxPrice, top, priceHeight);

            return (
              <g key={`price-grid-${index}`}>
                <line
                  x1={left}
                  y1={y}
                  x2={width - right + 8}
                  y2={y}
                  stroke="#e9eef7"
                  strokeWidth="1"
                />
                <text x={width - right + 12} y={y + 4} fill="#7c8aa5" fontSize="11">
                  {formatPrice(value)}
                </text>
              </g>
            );
          })}

          {candles.map((candle, index) => {
            const cx = x(index);
            const openY = lineY(candle.open, minPrice, maxPrice, top, priceHeight);
            const closeY = lineY(candle.close, minPrice, maxPrice, top, priceHeight);
            const highY = lineY(candle.high, minPrice, maxPrice, top, priceHeight);
            const lowY = lineY(candle.low, minPrice, maxPrice, top, priceHeight);
            const candleColor = candle.close >= candle.open ? "#22c55e" : "#ef4444";
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(2, Math.abs(closeY - openY));

            return (
              <g key={candle.time}>
                <line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={candleColor} strokeWidth="1.2" />
                <rect
                  x={cx - candleBodyWidth / 2}
                  y={bodyY}
                  width={candleBodyWidth}
                  height={bodyHeight}
                  rx="1.5"
                  fill={candleColor}
                  opacity="0.96"
                />
              </g>
            );
          })}

          {activeIndicators.ema20 && ema20Points ? (
            <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={ema20Points} />
          ) : null}

          {activeIndicators.ema50 && ema50Points ? (
            <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={ema50Points} />
          ) : null}

          {activeIndicators.range ? (
            <>
              {renderHorizontalLevel(detail?.signal.low30d ?? null, "#94a3b8", "Low", "4 6")}
              {renderHorizontalLevel(detail?.signal.high30d ?? null, "#64748b", "High", "4 6")}
            </>
          ) : null}

          {activeIndicators.supports ? (
            <>
              {renderHorizontalLevel(detail?.signal.nearestSupport ?? null, "#0f766e", "Support")}
              {renderHorizontalLevel(detail?.signal.nearestResistance ?? null, "#ef4444", "Resistance")}
            </>
          ) : null}

          {activeIndicators.tradePlan ? (
            <>
              {renderHorizontalLevel(detail?.signal.entryZoneLow ?? null, "#0ea5e9", "Entry low", "3 5")}
              {renderHorizontalLevel(detail?.signal.entryZoneHigh ?? null, "#0ea5e9", "Entry high", "3 5")}
              {renderHorizontalLevel(detail?.signal.protectiveStop ?? null, "#b91c1c", "Stop", "3 5")}
              {renderHorizontalLevel(detail?.signal.breakEvenActivationPrice ?? null, "#16a34a", "BE", "3 5")}
            </>
          ) : null}

          {activeIndicators.confirmation
            ? renderHorizontalLevel(detail?.signal.confirmationLevel ?? null, "#7c3aed", "1H confirm", "3 5")
            : null}

          {dateLabels.map((item) => {
            const originalIndex = candles.findIndex((candidate) => candidate.time === item.time);

            return (
              <text
                key={item.time}
                x={x(originalIndex) - 16}
                y={priceAreaBottom + 18}
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

          {activeIndicators.rsi ? (
            <>
              <rect
                x={left}
                y={rsiTop}
                width={chartWidth}
                height={rsiHeight}
                rx="12"
                fill="#fafcff"
                stroke="#e6edf8"
              />
              <line
                x1={left}
                y1={lineY(70, 0, 100, rsiTop, rsiHeight)}
                x2={left + chartWidth}
                y2={lineY(70, 0, 100, rsiTop, rsiHeight)}
                stroke="#fecaca"
                strokeDasharray="4 4"
              />
              <line
                x1={left}
                y1={lineY(30, 0, 100, rsiTop, rsiHeight)}
                x2={left + chartWidth}
                y2={lineY(30, 0, 100, rsiTop, rsiHeight)}
                stroke="#bfdbfe"
                strokeDasharray="4 4"
              />
              {rsiPoints ? (
                <polyline fill="none" stroke="#7c3aed" strokeWidth="2" points={rsiPoints} />
              ) : null}
              <text x={left + 8} y={rsiTop + 16} fill="#64748b" fontSize="12">
                RSI 14
              </text>
            </>
          ) : null}

          {activeIndicators.macd ? (
            <>
              <rect
                x={left}
                y={macdTop}
                width={chartWidth}
                height={macdHeight}
                rx="12"
                fill="#fafcff"
                stroke="#e6edf8"
              />
              <line
                x1={left}
                y1={lineY(0, minMacd, maxMacd, macdTop, macdHeight)}
                x2={left + chartWidth}
                y2={lineY(0, minMacd, maxMacd, macdTop, macdHeight)}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
              />

              {candles.map((_, index) => {
                const value = macd.histogram[index];
                if (value === null) return null;

                const zeroY = lineY(0, minMacd, maxMacd, macdTop, macdHeight);
                const valueY = lineY(value, minMacd, maxMacd, macdTop, macdHeight);
                const barHeight = Math.max(1.5, Math.abs(valueY - zeroY));
                const y = value >= 0 ? valueY : zeroY;

                return (
                  <rect
                    key={`macd-${index}`}
                    x={x(index) - Math.max(1.5, candleBodyWidth / 4)}
                    y={y}
                    width={Math.max(3, candleBodyWidth / 2)}
                    height={barHeight}
                    fill={value >= 0 ? "#86efac" : "#fca5a5"}
                  />
                );
              })}

              {macdPoints ? (
                <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={macdPoints} />
              ) : null}

              {macdSignalPoints ? (
                <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={macdSignalPoints} />
              ) : null}

              <text x={left + 8} y={macdTop + 16} fill="#64748b" fontSize="12">
                MACD
              </text>
            </>
          ) : null}
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

        setLoaderMessage("Кеш готов. Загружаем dashboard, список рынка и карточку выбранной пары.");

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
    setBootstrapError(null);
    setBootstrapLoading(true);
    setLoaderMessage(
      "Принудительно обновляем кеш BUY-сигналов по кнопке «Получить сигналы». Это может занять до минуты."
    );

    try {
      await refreshBuySignalsCache();

      const [dashboardResponse, marketsResponse] = await Promise.all([
        getDashboardData(),
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
      setBootstrapError(
        error instanceof Error ? error.message : "Не удалось обновить кеш сигналов"
      );
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
              Лоадер не скрывается, пока backend не завершит scan и не положит BUY-данные в кеш.
            </p>
          </div>
        </div>
      ) : null}

      <section className="hero hero-compact">
        <h1 className="page-title">Crypto AI Dashboard</h1>
        <p className="page-subtitle dashboard-subtitle">
          График пары, сигналы на покупку, полный список рынка и визуализация индикаторов стратегии на одном экране.
        </p>
      </section>

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

          <div className="card dashboard-indicators-card">
            <h3>Индикаторы</h3>

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
          </div>
        </div>

        <div className="dashboard-middle-stack">
          <div className="card dashboard-list-card dashboard-buy-card">
            <div className="list-title-row">
              <h3>Сигналы на покупку</h3>
              <span className="muted">{dashboard?.topBuys.length ?? 0}</span>
            </div>

            <div className="signal-list fill-scroll">
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
                    <div className="market-row-left">
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
                  <p>На графике отображается выбранная пара из полного списка.</p>
                </div>
              )}
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
                  ? "Информация"
                  : panelMode === "info"
                    ? "Справка"
                    : "Аналитика"}
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
              className={panelMode === "info" ? "action-button active" : "action-button"}
              onClick={handleLoadInfo}
            >
              Справка
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