"use client";

import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import {
  Candle,
  DashboardData,
  getDashboardBootstrapStatus,
  getDashboardData,
  getMarketCandles,
  getMarketDetail,
  getMarkets,
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

type BuyMode = "soft" | "hard";
type FullListSortDirection = "desc" | "asc";
type FullListSortField = "signal" | "pair" | "volume" | "price";

type FullListSortState = {
  field: FullListSortField;
  pairDirection: FullListSortDirection;
  volumeDirection: FullListSortDirection;
  signalDirection: FullListSortDirection;
  priceDirection: FullListSortDirection;
};

type IssueNotification = {
  id: string;
  title: string;
  message: string;
  severity: "error" | "warning";
  createdAt: number;
  visibleUntil: number;
  seenInPanel: boolean;
  sourceKey: string;
};

type ReportIssueInput = {
  title: string;
  message: string;
  severity?: "error" | "warning";
  sourceKey?: string;
};

type ChartInterval = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W" | "1M";
type ChartWindow = "1D" | "1W" | "1M" | "1Y" | "All";
type FetchableChartInterval = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D";

function resolveFetchInterval(interval: ChartInterval): FetchableChartInterval {
  if (interval === "1W" || interval === "1M") return "1D";
  return interval;
}

function mergeCandlesChronologically(current: Candle[], incoming: Candle[]): Candle[] {
  const merged = [...current, ...incoming].sort((a, b) => a.time - b.time);
  const unique: Candle[] = [];

  for (const candle of merged) {
    const last = unique[unique.length - 1];
    if (last && last.time === candle.time) {
      unique[unique.length - 1] = candle;
      continue;
    }

    unique.push(candle);
  }

  return unique;
}

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

function signalPriority(signal: "BUY" | "HOLD" | "SELL"): number {
  if (signal === "BUY") return 3;
  if (signal === "HOLD") return 2;
  return 1;
}

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

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const normalized = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";

  const day = padDatePart(date.getDate());
  const month = padDatePart(date.getMonth() + 1);
  const year = padDatePart(date.getFullYear() % 100);
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatAxisTime(value: string | number | null | undefined, interval: ChartInterval): string {
  const date = toDate(value);
  if (!date) return "—";

  const day = padDatePart(date.getDate());
  const month = padDatePart(date.getMonth() + 1);
  const year = padDatePart(date.getFullYear() % 100);
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());

  if (interval === "1D" || interval === "1W" || interval === "1M") {
    return `${day}.${month}.${year}`;
  }

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatNotificationTimestamp(value: number): string {
  return formatDateTime(value);
}

function buildIssueKey(sourceKey: string, message: string): string {
  return `${sourceKey}::${message.trim()}`;
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
  selectedMarketKey: string
): string[] {
  const buyItem =
    dashboard?.topBuys.find((item) => item.pair === selectedMarketKey) ??
    dashboard?.topBuys.find((item) => item.symbol === selectedMarketKey);

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

function aggregateCandles(candles: Candle[], bucketSize: number): Candle[] {
  if (!candles.length || bucketSize <= 1) return candles;

  const result: Candle[] = [];

  for (let index = 0; index < candles.length; index += bucketSize) {
    const bucket = candles.slice(index, index + bucketSize);
    if (!bucket.length) continue;

    const volumeFrom = bucket.reduce((sum, item) => sum + (item.volumeFrom ?? item.volume ?? 0), 0);
    const volumeTo = bucket.reduce((sum, item) => sum + (item.volumeTo ?? item.quoteVolume ?? 0), 0);

    result.push({
      time: bucket[0].time,
      open: bucket[0].open,
      high: Math.max(...bucket.map((item) => item.high)),
      low: Math.min(...bucket.map((item) => item.low)),
      close: bucket[bucket.length - 1].close,
      volume: volumeFrom,
      quoteVolume: volumeTo,
      volumeFrom,
      volumeTo
    });
  }

  return result;
}

function resolveUtcOffsetLabel(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

  const intraday1m = detail.market.technicals.intraday1m?.candles ?? [];
  const intraday5m = detail.market.technicals.intraday5m?.candles ?? [];
  const intraday15m = detail.market.technicals.intraday15m?.candles ?? [];
  const intraday30m = detail.market.technicals.intraday30m?.candles ?? [];
  const intraday1h = detail.market.technicals.intraday1h?.candles ?? [];
  const intraday4h = detail.market.technicals.intraday4h?.candles ?? [];
  const daily = detail.market.technicals.candles ?? [];

  if (interval === "1m") return intraday1m;
  if (interval === "5m") return intraday5m;
  if (interval === "15m") return intraday15m;
  if (interval === "30m") return intraday30m;
  if (interval === "1H") return intraday1h;
  if (interval === "4H") return intraday4h;

  if (interval === "1W") {
    return aggregateCandles(daily, 7);
  }

  if (interval === "1M") {
    return aggregateCandles(daily, 30);
  }

  return daily;
}

function getEffectiveInterval(interval: ChartInterval): ChartInterval {
  return interval;
}

function getWindowCount(interval: ChartInterval, windowValue: ChartWindow): number {
  const effectiveInterval = getEffectiveInterval(interval);

  if (effectiveInterval === "1m") {
    if (windowValue === "1D") return 24 * 60;
    if (windowValue === "1W") return 24 * 60;
    if (windowValue === "1M") return 24 * 60;
    if (windowValue === "1Y") return 24 * 60;
    return 24 * 60;
  }

  if (effectiveInterval === "5m") {
    if (windowValue === "1D") return 12 * 24;
    if (windowValue === "1W") return 12 * 24 * 7;
    if (windowValue === "1M") return 2000;
    if (windowValue === "1Y") return 2000;
    return 2000;
  }

  if (effectiveInterval === "15m") {
    if (windowValue === "1D") return 4 * 24;
    if (windowValue === "1W") return 4 * 24 * 7;
    if (windowValue === "1M") return 4 * 24 * 30;
    if (windowValue === "1Y") return 2000;
    return 2000;
  }

  if (effectiveInterval === "30m") {
    if (windowValue === "1D") return 2 * 24;
    if (windowValue === "1W") return 2 * 24 * 7;
    if (windowValue === "1M") return 2 * 24 * 30;
    if (windowValue === "1Y") return 1440;
    return 2000;
  }

  if (effectiveInterval === "1H") {
    if (windowValue === "1D") return 24;
    if (windowValue === "1W") return 24 * 7;
    if (windowValue === "1M") return 24 * 30;
    if (windowValue === "1Y") return 24 * 365;
    return 2000;
  }

  if (effectiveInterval === "4H") {
    if (windowValue === "1D") return 6;
    if (windowValue === "1W") return 42;
    if (windowValue === "1M") return 180;
    if (windowValue === "1Y") return 6 * 365;
    return 2000;
  }

  if (effectiveInterval === "1D") {
    if (windowValue === "1D") return 1;
    if (windowValue === "1W") return 7;
    if (windowValue === "1M") return 30;
    if (windowValue === "1Y") return 365;
    return 365;
  }

  if (effectiveInterval === "1W") {
    if (windowValue === "1D") return 1;
    if (windowValue === "1W") return 1;
    if (windowValue === "1M") return 4;
    if (windowValue === "1Y") return 52;
    return 260;
  }

  if (windowValue === "1D") return 1;
  if (windowValue === "1W") return 1;
  if (windowValue === "1M") return 1;
  if (windowValue === "1Y") return 12;
  return 120;
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

  useEffect(() => {
    if (!selectedSymbol) return;

    const timerId = window.setInterval(() => {
      void loadDetail(selectedSymbol);
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, [selectedSymbol]);

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

    if (status.buySignalsCacheReady || status.dashboardCacheReady) {
      return status;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Кеш BUY-сигналов не успел прогреться. Повтори обновление через несколько секунд.");
}

function TradingChart({
  detail,
  activeIndicators,
  onIssue
}: {
  detail: MarketDetail | null;
  activeIndicators: Record<IndicatorKey, boolean>;
  onIssue?: (issue: ReportIssueInput) => void;
}) {
  const [interval, setIntervalValue] = useState<ChartInterval>("1H");
  const [windowValue, setWindowValue] = useState<ChartWindow>("1Y");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [startIndex, setStartIndex] = useState(0);
  const [clockText, setClockText] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [isChartHovered, setIsChartHovered] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const effectiveInterval = useMemo(() => getEffectiveInterval(interval), [interval]);
  const fetchInterval = useMemo(() => resolveFetchInterval(interval), [interval]);
  const initialCandles = useMemo(() => getChartCandles(detail, interval), [detail, interval]);
  const [loadedCandles, setLoadedCandles] = useState<Candle[]>(initialCandles);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const pendingOlderRequestRef = useRef(false);
  const baseVisibleCount = getWindowCount(interval, windowValue);

  useEffect(() => {
    setLoadedCandles(initialCandles);
    setHasMoreOlder(initialCandles.length >= Math.min(500, Math.max(50, baseVisibleCount)));
    setLoadingOlder(false);
    pendingOlderRequestRef.current = false;
    setHoverIndex(null);
  }, [initialCandles, baseVisibleCount, detail?.market.pair.display, interval]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const datePart = new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(now);

      setClockText(`${datePart} (${resolveUtcOffsetLabel(now)})`);
    };

    updateClock();
    const timerId = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const preventBrowserZoom = (event: globalThis.WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    svg.addEventListener("wheel", preventBrowserZoom, { passive: false });

    return () => {
      svg.removeEventListener("wheel", preventBrowserZoom);
    };
  }, []);

  useEffect(() => {
    const preventPageZoomWhileChartHovered = (event: globalThis.WheelEvent) => {
      if (!isChartHovered || !event.ctrlKey) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("wheel", preventPageZoomWhileChartHovered, {
      passive: false,
      capture: true
    });

    return () => {
      window.removeEventListener("wheel", preventPageZoomWhileChartHovered, true);
    };
  }, [isChartHovered]);

  useEffect(() => {
    setZoomFactor(1);
  }, [interval, windowValue, detail?.market.asset.symbol]);

  const visibleCount = useMemo(() => {
    if (!loadedCandles.length) return 0;
    const rawCount = Math.round(baseVisibleCount / zoomFactor);
    return Math.max(12, Math.min(loadedCandles.length, rawCount));
  }, [loadedCandles.length, baseVisibleCount, zoomFactor]);

  const maxStartIndex = Math.max(0, loadedCandles.length - visibleCount);

  useEffect(() => {
    setStartIndex(maxStartIndex);
  }, [maxStartIndex, interval, windowValue, detail?.market.asset.symbol]);

  useEffect(() => {
    if (autoScroll) {
      setStartIndex(maxStartIndex);
    }
  }, [autoScroll, maxStartIndex, loadedCandles.length]);

  useEffect(() => {
    setStartIndex((current) => Math.max(0, Math.min(maxStartIndex, current)));
  }, [maxStartIndex]);

  const candles = useMemo(
    () => loadedCandles.slice(startIndex, startIndex + visibleCount),
    [loadedCandles, startIndex, visibleCount]
  );

  useEffect(() => {
    const shouldLoadOlder =
      !loadingOlder &&
      hasMoreOlder &&
      loadedCandles.length > 0 &&
      startIndex <= Math.max(8, Math.floor(visibleCount * 0.2));

    if (!shouldLoadOlder || pendingOlderRequestRef.current || !detail?.market.pair.display) {
      return;
    }

    pendingOlderRequestRef.current = true;
    setLoadingOlder(true);

    const beforeTime = loadedCandles[0]?.time ? loadedCandles[0].time - 1 : undefined;

    void getMarketCandles(detail.market.pair.display, fetchInterval, Math.min(200, Math.max(120, visibleCount)), beforeTime)
      .then((response) => {
        const olderCandles = response.candles.filter((item) => item.time < (loadedCandles[0]?.time ?? Number.MAX_SAFE_INTEGER));

        if (!olderCandles.length) {
          setHasMoreOlder(false);
          return;
        }

        setLoadedCandles((current) => mergeCandlesChronologically(current, olderCandles));
        setStartIndex((current) => current + olderCandles.length);
        setHasMoreOlder(response.hasMore && olderCandles.length > 0);
      })
      .catch((error) => {
        setHasMoreOlder(false);
        onIssue?.({
          title: "Не удалось догрузить свечи",
          message: error instanceof Error ? error.message : "Ошибка загрузки истории свечей.",
          severity: "error",
          sourceKey: `candles:${detail?.market.pair.display ?? "unknown"}:${fetchInterval}`
        });
      })
      .finally(() => {
        pendingOlderRequestRef.current = false;
        setLoadingOlder(false);
      });
  }, [detail?.market.pair.display, fetchInterval, hasMoreOlder, loadedCandles, loadingOlder, startIndex, visibleCount]);

  const closes = candles.map((item) => item.close);
  const volumes = candles.map((item) => item.volume ?? item.volumeFrom ?? 0);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);

  const width = 1200;
  const left = 18;
  const right = 86;
  const top = 18;
  const priceHeight = 360;
  const volumeHeight = 90;
  const rsiHeight = activeIndicators.rsi ? 90 : 0;
  const macdHeight = activeIndicators.macd ? 96 : 0;
  const gap = 8;
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
  const hoveredCandleToneClass =
    hoveredCandle.close >= hoveredCandle.open ? "positive" : "negative";

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
        const nextVisible = Math.max(12, Math.min(loadedCandles.length, Math.round(baseVisibleCount / clampedZoom)));
        const absoluteAnchor = startIndex + Math.max(0, Math.min(candles.length - 1, anchorIndex));
        const projectedStart = Math.round(absoluteAnchor - anchorRatio * Math.max(0, nextVisible - 1));
        const nextMaxStart = Math.max(0, loadedCandles.length - nextVisible);
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
        <div className="tv-topbar-left">
          <div className="tv-symbol-inline">
            <span className="tv-symbol">{detail?.market.pair.display ?? "BTC/USDT"}</span>
            <span className="tv-symbol-price">{formatPrice(detail?.market.spot.priceUsd ?? null)}</span>
            <span className="tv-symbol-meta">
              24H {formatPercent(detail?.market.spot.change24h ?? null)} · 30D{" "}
              {formatPercent(detail?.market.technicals.change30d ?? null)}
            </span>
          </div>
        </div>

        <div className="tv-clock">{clockText}</div>

        <div className="tv-badges">
          <span className={signalClassName(detail?.signal.signal ?? "HOLD")}>
            {detail?.signal.signal ?? "HOLD"}
          </span>
          <span className="tv-mini-chip">PIONEX</span>
        </div>
      </div>

      <div className="tv-controls">
        <div className="tv-controls-section">
          <span className="tv-controls-label">Свеча</span>
          <div className="tv-control-group">
            {(["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"] as ChartInterval[]).map((item) => (
              <button
                key={item}
                type="button"
                className={item === interval ? "tv-control active" : "tv-control"}
                onClick={() => setIntervalValue(item)}
                title={item === effectiveInterval ? undefined : `Пока используется агрегация на базе ${effectiveInterval}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="tv-controls-section tv-controls-section-right">
          <span className="tv-controls-label">Диапазон</span>
          <div className="tv-control-group">
            {(["1D", "1W", "1M", "1Y", "All"] as ChartWindow[]).map((item) => (
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
      </div>

      <div className="tv-hover-card">
        <div className="tv-hover-card-main">
          <span className="tv-hover-date">{formatDateTime(hoveredCandle?.time)}</span>
          <span className={`tv-hover-ohlc ${hoveredCandleToneClass}`}>O {formatPrice(hoveredCandle?.open ?? null)}</span>
          <span className={`tv-hover-ohlc ${hoveredCandleToneClass}`}>H {formatPrice(hoveredCandle?.high ?? null)}</span>
          <span className={`tv-hover-ohlc ${hoveredCandleToneClass}`}>L {formatPrice(hoveredCandle?.low ?? null)}</span>
          <span className={`tv-hover-ohlc ${hoveredCandleToneClass}`}>C {formatPrice(hoveredCandle?.close ?? null)}</span>
          <span className="tv-hover-volume">Volume {formatNumber(hoveredCandle?.volume ?? hoveredCandle?.volumeFrom ?? null)}</span>
          <span className="tv-hover-volume">Quote {formatNumber(hoveredCandle?.quoteVolume ?? hoveredCandle?.volumeTo ?? null)}</span>
        </div>

        <div className="tv-hover-card-side">
          <button
            type="button"
            className={autoScroll ? "tv-auto-toggle active" : "tv-auto-toggle"}
            onClick={() => setAutoScroll((current) => !current)}
          >
            auto
          </button>
        </div>
      </div>

      <div
        className="chart-svg-wrap tradingview-shell"
        onMouseEnter={() => setIsChartHovered(true)}
        onMouseLeave={() => setIsChartHovered(false)}
      >
        {loadingOlder ? <div className="tv-history-loader">Загружаем более ранние свечи…</div> : null}
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
                  {formatAxisTime(candle?.time, effectiveInterval)}
                </text>
              </g>
            );
          })}

          <line x1={left} y1={chartBottom} x2={width - right} y2={chartBottom} className="tv-axis-line" />

          <text x={left} y={volumeTop - 6} className="tv-pane-title">Volume</text>
          <text x={width - right} y={volumeTop - 6} textAnchor="end" className="tv-pane-title">base / quote</text>

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
            const volume = candle.volume ?? candle.volumeFrom ?? 0;
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
              {formatAxisTime(hoveredCandle.time, effectiveInterval)}
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
  const [selectedSymbolSeed, setSelectedSymbolSeed] = useState(initialSelectedSymbol || "BTC/USDT");
  const [detailSeed, setDetailSeed] = useState<MarketDetail | null>(initialDetail);
  const [bootstrapLoading, setBootstrapLoading] = useState(
    !initialDashboard || !initialMarkets || !initialDetail
  );
  const [bootstrapError, setBootstrapError] = useState<string | null>(
    dashboardError ?? marketsError ?? initialDetailError ?? null
  );
  const [cacheStatusText, setCacheStatusText] = useState<string | null>(
    initialDashboard?.warming ? "обновляется" : null
  );
  const [loaderMessage, setLoaderMessage] = useState(
    "Проверяем прогрев кеша BUY-сигналов и ждём первые данные."
  );
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [fullListSort, setFullListSort] = useState<FullListSortState>({
    field: "volume",
    signalDirection: "desc",
    pairDirection: "asc",
    volumeDirection: "desc",
    priceDirection: "desc"
  });
  const [fullListSearchQuery, setFullListSearchQuery] = useState("");
  const [showStage1Only, setShowStage1Only] = useState(false);
  const [showStage2Only, setShowStage2Only] = useState(false);
  const [issueNotifications, setIssueNotifications] = useState<IssueNotification[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issuesNowTs, setIssuesNowTs] = useState(() => Date.now());

  const {
    selectedSymbol,
    setSelectedSymbol,
    detail,
    detailLoading,
    detailError,
    reloadDetail
  } = useSelectedMarket(detailSeed, selectedSymbolSeed);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      const now = Date.now();
      setIssuesNowTs(now);
      setIssueNotifications((current) => current.filter((item) => now - item.createdAt < 7 * 24 * 60 * 60 * 1000));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (bootstrapError) {
      reportIssue({
        title: "Часть данных недоступна",
        message: bootstrapError,
        severity: "error",
        sourceKey: "bootstrap-error"
      });
    }
  }, [bootstrapError]);

  useEffect(() => {
    if (detailError) {
      reportIssue({
        title: "Не удалось загрузить выбранную пару",
        message: detailError,
        severity: "error",
        sourceKey: `detail-error:${selectedSymbol}`
      });
    }
  }, [detailError, selectedSymbol]);

  useEffect(() => {
    if (dashboard?.degraded || markets?.degraded) {
      reportIssue({
        title: "Фронт работает в деградированном режиме",
        message: "Часть данных backend сейчас не отдал полностью. Интерфейс продолжает работать без падения всей страницы.",
        severity: "warning",
        sourceKey: `degraded:${dashboard?.generatedAt ?? "unknown"}:${buyMode}`
      });
    }
  }, [buyMode, dashboard?.degraded, dashboard?.generatedAt, markets?.degraded]);

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

  const fullListSortField = fullListSort.field;
  const fullListPairSortDirection = fullListSort.pairDirection;
  const fullListVolumeSortDirection = fullListSort.volumeDirection;
  const fullListSignalSortDirection = fullListSort.signalDirection;
  const fullListPriceSortDirection = fullListSort.priceDirection;

  function reportIssue(input: ReportIssueInput) {
    const createdAt = Date.now();
    const severity = input.severity ?? "error";
    const sourceKey = input.sourceKey ?? input.title;
    const dedupeKey = buildIssueKey(sourceKey, input.message);

    setIssueNotifications((current) => {
      const existingIndex = current.findIndex((item) => buildIssueKey(item.sourceKey, item.message) === dedupeKey);

      if (existingIndex >= 0) {
        const next = [...current];
        const existing = next[existingIndex];
        next[existingIndex] = {
          ...existing,
          title: input.title,
          severity,
          createdAt,
          visibleUntil: createdAt + 60_000
        };
        return next.sort((a, b) => b.createdAt - a.createdAt);
      }

      return [
        {
          id: `${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
          title: input.title,
          message: input.message,
          severity,
          createdAt,
          visibleUntil: createdAt + 60_000,
          seenInPanel: false,
          sourceKey
        },
        ...current
      ].sort((a, b) => b.createdAt - a.createdAt);
    });
  }

  function handleToggleIssues() {
    setIssuesOpen((current) => {
      const nextOpen = !current;

      if (!current) {
        setIssueNotifications((items) => items.map((item) => ({ ...item, seenInPanel: true })));
      }

      return nextOpen;
    });
  }

  function handleFullListSortClick(field: FullListSortField) {
    setFullListSort((current) => {
      if (current.field !== field) {
        return {
          ...current,
          field
        };
      }

      if (field === "pair") {
        return {
          ...current,
          pairDirection: current.pairDirection === "asc" ? "desc" : "asc"
        };
      }

      if (field === "volume") {
        return {
          ...current,
          volumeDirection: current.volumeDirection === "desc" ? "asc" : "desc"
        };
      }

      if (field === "price") {
        return {
          ...current,
          priceDirection: current.priceDirection === "desc" ? "asc" : "desc"
        };
      }

      return {
        ...current,
        signalDirection: current.signalDirection === "desc" ? "asc" : "desc"
      };
    });
  }

  const fullList = useMemo(() => {
    const searchQuery = fullListSearchQuery.trim().toLocaleLowerCase("ru");
    const sourceItems = markets?.items?.length ? markets.items : dashboard?.allStage1Markets ?? [];

    const compareNumbers = (
      left: number | null | undefined,
      right: number | null | undefined,
      direction: FullListSortDirection
    ) => {
      const safeLeft = Number.isFinite(left as number) ? Number(left) : 0;
      const safeRight = Number.isFinite(right as number) ? Number(right) : 0;

      if (safeLeft === safeRight) return 0;
      return direction === "asc" ? safeLeft - safeRight : safeRight - safeLeft;
    };

    const compareStrings = (left: string, right: string, direction: FullListSortDirection) => {
      const delta = left.localeCompare(right, "ru", { sensitivity: "base" });
      return direction === "asc" ? delta : -delta;
    };

    const resolveListKey = (item: (typeof sourceItems)[number]) => {
      const pairKey = item.pair?.trim().toUpperCase();
      if (pairKey) return pairKey;
      const symbolKey = item.symbol?.trim().toUpperCase();
      if (symbolKey) return symbolKey;
      return `${item.name ?? "UNKNOWN"}:${item.priceUsd ?? "0"}`;
    };

    const preferItem = (
      current: (typeof sourceItems)[number],
      incoming: (typeof sourceItems)[number]
    ) => {
      const currentStageRank = current.stage2Passed ? 2 : current.stage1Passed ? 1 : 0;
      const incomingStageRank = incoming.stage2Passed ? 2 : incoming.stage1Passed ? 1 : 0;

      if (incomingStageRank !== currentStageRank) {
        return incomingStageRank > currentStageRank ? incoming : current;
      }

      const currentScore = Number.isFinite(current.score) ? current.score : 0;
      const incomingScore = Number.isFinite(incoming.score) ? incoming.score : 0;
      if (incomingScore !== currentScore) {
        return incomingScore > currentScore ? incoming : current;
      }

      const currentVolume = Number.isFinite(current.volume24h as number) ? Number(current.volume24h) : 0;
      const incomingVolume = Number.isFinite(incoming.volume24h as number) ? Number(incoming.volume24h) : 0;
      if (incomingVolume !== currentVolume) {
        return incomingVolume > currentVolume ? incoming : current;
      }

      const currentPrice = Number.isFinite(current.priceUsd as number) ? Number(current.priceUsd) : 0;
      const incomingPrice = Number.isFinite(incoming.priceUsd as number) ? Number(incoming.priceUsd) : 0;
      if (incomingPrice !== currentPrice) {
        return incomingPrice > currentPrice ? incoming : current;
      }

      return compareStrings(incoming.pair, current.pair, "asc") < 0 ? incoming : current;
    };

    const dedupedMap = new Map<string, (typeof sourceItems)[number]>();

    for (const item of sourceItems) {
      const key = resolveListKey(item);
      const existing = dedupedMap.get(key);

      if (!existing) {
        dedupedMap.set(key, item);
        continue;
      }

      const preferred = preferItem(existing, item);
      dedupedMap.set(key, {
        ...preferred,
        stage1Passed: Boolean(existing.stage1Passed || item.stage1Passed || preferred.stage1Passed),
        stage2Passed: Boolean(existing.stage2Passed || item.stage2Passed || preferred.stage2Passed),
        volume24h: Math.max(existing.volume24h ?? 0, item.volume24h ?? 0, preferred.volume24h ?? 0)
      });
    }

    const items = Array.from(dedupedMap.values()).filter((item) => {
      if (showStage2Only && !item.stage2Passed) {
        return false;
      }

      if (!showStage2Only && showStage1Only && !item.stage1Passed) {
        return false;
      }

      if (!searchQuery) return true;

      const haystack = [item.name, item.pair, item.symbol]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru");

      return haystack.includes(searchQuery);
    });

    return [...items].sort((left, right) => {
      if (fullListSortField === "pair") {
        const pairDelta = compareStrings(left.pair, right.pair, fullListPairSortDirection);
        if (pairDelta !== 0) return pairDelta;

        const nameDelta = compareStrings(left.name, right.name, fullListPairSortDirection);
        if (nameDelta !== 0) return nameDelta;

        const volumeTieBreak = compareNumbers(left.volume24h ?? 0, right.volume24h ?? 0, "desc");
        if (volumeTieBreak !== 0) return volumeTieBreak;

        const signalTieBreak = signalPriority(right.signal) - signalPriority(left.signal);
        if (signalTieBreak !== 0) return signalTieBreak;

        return compareStrings(left.symbol, right.symbol, "asc");
      }

      if (fullListSortField === "volume") {
        const volumeDelta = compareNumbers(left.volume24h ?? 0, right.volume24h ?? 0, fullListVolumeSortDirection);
        if (volumeDelta !== 0) return volumeDelta;

        const signalTieBreak = signalPriority(right.signal) - signalPriority(left.signal);
        if (signalTieBreak !== 0) return signalTieBreak;

        const scoreTieBreak = compareNumbers(left.score, right.score, "desc");
        if (scoreTieBreak !== 0) return scoreTieBreak;

        const pairTieBreak = compareStrings(left.pair, right.pair, "asc");
        if (pairTieBreak !== 0) return pairTieBreak;

        return compareStrings(left.symbol, right.symbol, "asc");
      }

      if (fullListSortField === "price") {
        const priceDelta = compareNumbers(left.priceUsd ?? 0, right.priceUsd ?? 0, fullListPriceSortDirection);
        if (priceDelta !== 0) return priceDelta;

        const signalTieBreak = signalPriority(right.signal) - signalPriority(left.signal);
        if (signalTieBreak !== 0) return signalTieBreak;

        const volumeTieBreak = compareNumbers(left.volume24h ?? 0, right.volume24h ?? 0, "desc");
        if (volumeTieBreak !== 0) return volumeTieBreak;

        const pairTieBreak = compareStrings(left.pair, right.pair, "asc");
        if (pairTieBreak !== 0) return pairTieBreak;

        return compareStrings(left.symbol, right.symbol, "asc");
      }

      const signalDelta = compareNumbers(signalPriority(left.signal), signalPriority(right.signal), fullListSignalSortDirection);
      if (signalDelta !== 0) return signalDelta;

      const scoreDelta = compareNumbers(left.score, right.score, fullListSignalSortDirection);
      if (scoreDelta !== 0) return scoreDelta;

      const volumeTieBreak = compareNumbers(left.volume24h ?? 0, right.volume24h ?? 0, "desc");
      if (volumeTieBreak !== 0) return volumeTieBreak;

      const pairTieBreak = compareStrings(left.pair, right.pair, "asc");
      if (pairTieBreak !== 0) return pairTieBreak;

      return compareStrings(left.symbol, right.symbol, "asc");
    });
  }, [dashboard, fullListPairSortDirection, fullListPriceSortDirection, fullListSearchQuery, fullListSignalSortDirection, fullListSortField, fullListVolumeSortDirection, markets, showStage1Only, showStage2Only]);

  const selectedListItem = useMemo(() => {
    return (
      fullList.find((item) => item.pair === selectedSymbol) ??
      topBuys.find((item) => item.pair === selectedSymbol) ??
      topBuys.find((item) => item.symbol === selectedSymbol) ??
      (markets?.items ?? dashboard?.allStage1Markets ?? []).find((item) => item.pair === selectedSymbol) ??
      (markets?.items ?? dashboard?.allStage1Markets ?? []).find((item) => item.symbol === selectedSymbol) ??
      null
    );
  }, [dashboard, fullList, topBuys, markets, selectedSymbol]);


  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const hasVisibleData = Boolean(dashboard || markets || detail);

      setBootstrapLoading(!hasVisibleData);
      setBootstrapError(null);
      setLoaderMessage(`Ждём, пока backend положит BUY-сигналы (${buyMode}) в кеш.`);

      try {
        const status = await waitUntilBuySignalsCacheReady(buyMode);

        if (cancelled) return;

        setCacheStatusText(
          status.buySignalsCacheWarming || status.dashboardCacheWarming ? "обновляется" : null
        );
        setLoaderMessage(`Кеш готов для стратегии (${buyMode}). Загружаем dashboard, рынок и выбранную пару.`);

        const [dashboardResponse, marketsResponse] = await Promise.all([
          getDashboardData(buyMode),
          getMarkets(buyMode)
        ]);

        if (cancelled) return;

        setDashboard(dashboardResponse);
        setMarkets(marketsResponse);
        setCacheStatusText(dashboardResponse.warming ? "обновляется" : null);

        const nextSymbol =
          dashboardResponse.topBuys[0]?.pair ??
          marketsResponse.items.find((item) => item.pair === "BTC/USDT")?.pair ??
          marketsResponse.items[0]?.pair ??
          initialSelectedSymbol ??
          "BTC/USDT";

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


  async function handleRefreshSignal() {
    setBootstrapError(null);
    setBootstrapLoading(true);
    setLoaderMessage(
      `Принудительно обновляем кеш BUY-сигналов (${buyMode}) по кнопке «Получить сигналы».`
    );

    try {
      await refreshBuySignalsCache(buyMode);

      const [dashboardResponse, marketsResponse, status] = await Promise.all([
        getDashboardData(buyMode),
        getMarkets(buyMode),
        getDashboardBootstrapStatus(buyMode)
      ]);

      setDashboard(dashboardResponse);
      setMarkets(marketsResponse);
      setCacheStatusText(
        dashboardResponse.warming || status.buySignalsCacheWarming || status.dashboardCacheWarming
          ? "обновляется"
          : null
      );

      const nextSymbol =
        dashboardResponse.topBuys[0]?.pair ??
        selectedSymbol ??
        marketsResponse.items.find((item) => item.pair === "BTC/USDT")?.pair ??
        marketsResponse.items[0]?.pair ??
        "BTC/USDT";

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

  useEffect(() => {
    setCacheStatusText(dashboard?.warming ? "обновляется" : null);
  }, [dashboard?.warming]);

  const summaryLines = buildSummaryLines(detail, dashboard);
  const managementLines = buildManagementLines(detail, dashboard, selectedSymbol);

  const sideTextLines = [...summaryLines, "", "Как сопровождать сделку:", ...managementLines];


  useEffect(() => {
    const pair = detail?.market.pair.display ?? selectedListItem?.pair ?? dashboard?.topBuys[0]?.pair ?? "BTC/USDT";
    const price = detail?.market.spot.priceUsd ?? selectedListItem?.priceUsd ?? null;
    document.title = `${formatPrice(price)} · ${pair}`;

    return () => {
      document.title = "crypto-ai";
    };
  }, [dashboard, detail, selectedListItem]);

  const unreadIssuesCount = issueNotifications.filter((item) => !item.seenInPanel).length;
  const visibleIssues = issueNotifications.filter((item) => item.visibleUntil > issuesNowTs);

  return (
    <>
      {visibleIssues.length ? (
        <div className="issues-toast-stack" aria-live="polite" aria-atomic="false">
          {visibleIssues.map((issue) => (
            <div
              key={issue.id}
              className={issue.severity === "warning" ? "issue-toast warning" : "issue-toast"}
            >
              <div className="issue-toast-title-row">
                <strong>{issue.title}</strong>
                <span>{formatNotificationTimestamp(issue.createdAt)}</span>
              </div>
              <p>{issue.message}</p>
            </div>
          ))}
        </div>
      ) : null}
      {bootstrapLoading ? (
        <div className="loader-overlay">
          <div className="loader-card">
            <div className="loader-spinner" />
            <h3>Прогреваем кеш сигналов</h3>
            <p>{loaderMessage}</p>
            <p className="loader-note">
              {`Лоадер не скрывается, пока backend не завершит scan и не положит BUY-данные в кеш для выбранной стратегии (${buyMode}).`}
            </p>
          </div>
        </div>
      ) : null}


      <section className="section section-tight dashboard-grid" aria-busy={bootstrapLoading}>
        <div className="dashboard-left-stack">
          <div className="card dashboard-chart-card">
            <TradingChart detail={detail} activeIndicators={activeIndicators} onIssue={reportIssue} />
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
          <div className="card dashboard-list-card dashboard-full-card">
            <div className="full-list-header">
              <div className="full-list-controls-row">
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

                <div className="stage-filter-group">
                  <label className="stage-filter-checkbox">
                    <input
                      type="checkbox"
                      checked={showStage1Only}
                      onChange={(event) => {
                        const checked = event.target.checked;

                        if (!checked && showStage2Only) {
                          setShowStage2Only(false);
                        }

                        setShowStage1Only(checked);
                      }}
                    />
                    <span>Stage 1</span>
                  </label>

                  <label className="stage-filter-checkbox">
                    <input
                      type="checkbox"
                      checked={showStage2Only}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setShowStage2Only(checked);

                        if (checked) {
                          setShowStage1Only(true);
                        }
                      }}
                    />
                    <span>Stage 2</span>
                  </label>
                </div>
              </div>

              <div className="list-title-row full-list-title-row">
                <div className="full-list-title-group">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3>Полный список</h3>{cacheStatusText ? <span className="muted" style={{ fontSize: 11 }}>• {cacheStatusText}</span> : null}</div>
                  <span className="muted">{fullList.length} пар</span>
                </div>
              </div>

              <div className="full-list-sort-group">
                <button
                  type="button"
                  className={fullListSortField === "pair" ? "full-list-sort-button active" : "full-list-sort-button"}
                  aria-label={`Сортировка по названию пары: ${fullListPairSortDirection === "asc" ? "от А до Я" : "от Я до А"}`}
                  title={`Сортировка по названию пары: ${fullListPairSortDirection === "asc" ? "от А до Я" : "от Я до А"}`}
                  onClick={() => handleFullListSortClick("pair")}
                >
                  <span className="full-list-sort-label">Пара</span>
                  <span className="full-list-sort-arrows" aria-hidden="true">
                    <span className={fullListSortField === "pair" && fullListPairSortDirection === "asc" ? "sort-arrow active" : "sort-arrow"}>↑</span>
                    <span className={fullListSortField === "pair" && fullListPairSortDirection === "desc" ? "sort-arrow active" : "sort-arrow"}>↓</span>
                  </span>
                </button>

                <button
                  type="button"
                  className={fullListSortField === "volume" ? "full-list-sort-button active" : "full-list-sort-button"}
                  aria-label={`Сортировка по объему: ${fullListVolumeSortDirection === "desc" ? "большие сверху" : "большие снизу"}`}
                  title={`Сортировка по объему: ${fullListVolumeSortDirection === "desc" ? "большие сверху" : "большие снизу"}`}
                  onClick={() => handleFullListSortClick("volume")}
                >
                  <span className="full-list-sort-label">Объем</span>
                  <span className="full-list-sort-arrows" aria-hidden="true">
                    <span className={fullListSortField === "volume" && fullListVolumeSortDirection === "asc" ? "sort-arrow active" : "sort-arrow"}>↑</span>
                    <span className={fullListSortField === "volume" && fullListVolumeSortDirection === "desc" ? "sort-arrow active" : "sort-arrow"}>↓</span>
                  </span>
                </button>

                <button
                  type="button"
                  className={fullListSortField === "signal" ? "full-list-sort-button active" : "full-list-sort-button"}
                  aria-label={`Сортировка по сигналу: ${fullListSignalSortDirection === "desc" ? "сильные сверху" : "сильные снизу"}`}
                  title={`Сортировка по сигналу: ${fullListSignalSortDirection === "desc" ? "сильные сверху" : "сильные снизу"}`}
                  onClick={() => handleFullListSortClick("signal")}
                >
                  <span className="full-list-sort-label">Сигнал</span>
                  <span className="full-list-sort-arrows" aria-hidden="true">
                    <span className={fullListSortField === "signal" && fullListSignalSortDirection === "asc" ? "sort-arrow active" : "sort-arrow"}>↑</span>
                    <span className={fullListSortField === "signal" && fullListSignalSortDirection === "desc" ? "sort-arrow active" : "sort-arrow"}>↓</span>
                  </span>
                </button>

                <button
                  type="button"
                  className={fullListSortField === "price" ? "full-list-sort-button active" : "full-list-sort-button"}
                  aria-label={`Сортировка по цене: ${fullListPriceSortDirection === "desc" ? "дорогие сверху" : "дешевые сверху"}`}
                  title={`Сортировка по цене: ${fullListPriceSortDirection === "desc" ? "дорогие сверху" : "дешевые сверху"}`}
                  onClick={() => handleFullListSortClick("price")}
                >
                  <span className="full-list-sort-label">Цена</span>
                  <span className="full-list-sort-arrows" aria-hidden="true">
                    <span className={fullListSortField === "price" && fullListPriceSortDirection === "asc" ? "sort-arrow active" : "sort-arrow"}>↑</span>
                    <span className={fullListSortField === "price" && fullListPriceSortDirection === "desc" ? "sort-arrow active" : "sort-arrow"}>↓</span>
                  </span>
                </button>
              </div>

              <div className="full-list-search-row">
                <input
                  type="text"
                  value={fullListSearchQuery}
                  onChange={(event) => setFullListSearchQuery(event.target.value)}
                  placeholder="Поиск по имени криптовалюты"
                  className="full-list-search-input"
                />
              </div>
            </div>

            <div className="signal-list signal-list-compact fill-scroll">
              {fullList.map((item) => (
                <button
                  type="button"
                  key={item.pair}
                  className={item.pair === selectedSymbol ? "market-row active" : "market-row"}
                  onClick={() => {
                    setSelectedSymbol(item.pair);
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
                <div className="summary-title-row-with-bell">
                  <h3>Информация</h3>
                  <button
                    type="button"
                    className={issuesOpen ? "issues-bell-button active" : "issues-bell-button"}
                    onClick={handleToggleIssues}
                    aria-label="Показать проблемные сообщения"
                    title="Показать проблемные сообщения"
                  >
                    <span className="issues-bell-icon" aria-hidden="true">🔔</span>
                    {unreadIssuesCount > 0 ? <span className="issues-bell-badge">{unreadIssuesCount}</span> : null}
                  </button>
                </div>
                <div className="summary-section-caption">Сводка по сигналу</div>
              </div>

              {selectedListItem ? <span className="pill summary-pair-pill">{selectedListItem.pair}</span> : null}
            </div>

            {issuesOpen ? (
              <div className="issues-panel">
                {issueNotifications.length ? (
                  issueNotifications.map((issue) => (
                    <div key={issue.id} className="issues-panel-item">
                      <div className="issues-panel-item-head">
                        <strong>{issue.title}</strong>
                        <span>{formatNotificationTimestamp(issue.createdAt)}</span>
                      </div>
                      <p>{issue.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="issues-panel-empty">Проблемных сообщений пока нет.</div>
                )}
              </div>
            ) : null}

            {detailLoading ? <p>Загрузка данных...</p> : null}

            {!detailLoading ? (
              <>
                {detail ? (
                  <div className="summary-metrics-grid">
                    <div className="summary-metric summary-metric-inline">
                      <span>Сигнал</span>
                      <strong className={signalClassName(detail.signal.signal)}>
                        {detail.signal.signal}
                      </strong>
                    </div>
                    <div className="summary-metric summary-metric-inline">
                      <span>Цена</span>
                      <strong>{formatPrice(detail.market.spot.priceUsd)}</strong>
                    </div>
                    <div className="summary-metric summary-metric-inline">
                      <span>24ч</span>
                      <strong>{formatPercent(detail.market.spot.change24h)}</strong>
                    </div>
                    <div className="summary-metric summary-metric-inline">
                      <span>30д</span>
                      <strong>{formatPercent(detail.market.technicals.change30d)}</strong>
                    </div>
                    <div className="summary-metric summary-metric-inline">
                      <span>RSI 14</span>
                      <strong>{formatNumber(detail.market.technicals.rsi14)}</strong>
                    </div>
                    <div className="summary-metric summary-metric-inline">
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
              className="action-button primary active"
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