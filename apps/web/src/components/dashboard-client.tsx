"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardData,
  InfoResponse,
  MarketsResponse,
  MarketDetail,
  AiResponse,
  getAiAnalysis,
  getInfoCard,
  getMarketDetail
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
  | "sma7"
  | "sma30"
  | "range"
  | "supports"
  | "tradePlan"
  | "confirmation";

type SidePanelMode = "summary" | "info" | "analytics";

const INDICATORS: Array<{ key: IndicatorKey; label: string }> = [
  { key: "sma7", label: "SMA 7" },
  { key: "sma30", label: "SMA 30" },
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
    return normalizeTextBlock(dashboard?.summary.explanation);
  }

  const signal = detail.signal;
  const lines = [
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
      ? `Break-even после подтверждения: ${formatPrice(signal.breakEvenActivationPrice)}`
      : null,
    signal.nearestResistance !== null
      ? `Ближайшее сопротивление: ${formatPrice(signal.nearestResistance)}`
      : null,
    signal.nearestSupport !== null
      ? `Ближайшая поддержка: ${formatPrice(signal.nearestSupport)}`
      : null,
    signal.atr1hPercent !== null
      ? `ATR 1H: ${formatNumber(signal.atr1hPercent)}%`
      : null
  ].filter((line): line is string => Boolean(line));

  return lines;
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
    return [dashboard?.summary.explanation ?? "Данные по сопровождению сделки временно недоступны."];
  }

  const lines = [
    detail.signal.entryConfirmationText
      ? `Ждать только подтвержденный сценарий: ${detail.signal.entryConfirmationText}.`
      : null,
    detail.signal.entryZoneLow !== null && detail.signal.entryZoneHigh !== null
      ? `Рабочая зона набора позиции: ${formatPrice(detail.signal.entryZoneLow)} - ${formatPrice(detail.signal.entryZoneHigh)}.`
      : null,
    detail.signal.invalidationLevel !== null
      ? `Отмена сценария ниже ${formatPrice(detail.signal.invalidationLevel)}.`
      : null,
    detail.signal.breakEvenActivationPrice !== null
      ? `После движения к ${formatPrice(detail.signal.breakEvenActivationPrice)} переносить риск в безубыток.`
      : null,
    detail.signal.target1DistancePercent !== null
      ? `Первую фиксацию логично рассматривать после движения примерно на ${formatNumber(detail.signal.target1DistancePercent)}%.`
      : null
  ].filter((line): line is string => Boolean(line));

  return lines.length
    ? lines
    : ["Для этой пары нет отдельного buy-плана, отображается только summary из анализа."];
}

function useSelectedMarket(
  initialDetail: MarketDetail | null,
  initialSelectedSymbol: string
) {
  const [selectedSymbol, setSelectedSymbol] = useState(initialSelectedSymbol);
  const [detail, setDetail] = useState<MarketDetail | null>(initialDetail);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const nextDetail = await getMarketDetail(selectedSymbol);

        if (!cancelled) {
          setDetail(nextDetail);
        }
      } catch (error) {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : "Не удалось загрузить detail");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    if (selectedSymbol === initialSelectedSymbol && initialDetail) {
      setDetail(initialDetail);
      return;
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [initialDetail, initialSelectedSymbol, selectedSymbol]);

  return {
    selectedSymbol,
    setSelectedSymbol,
    detail,
    detailLoading,
    detailError
  };
}

function TradingChart({
  detail,
  activeIndicators
}: {
  detail: MarketDetail | null;
  activeIndicators: Record<IndicatorKey, boolean>;
}) {
  const width = 920;
  const height = 460;
  const padding = { top: 24, right: 56, bottom: 30, left: 18 };

  const candles = detail?.market.technicals.candles ?? [];
  const visibleCandles = candles.slice(-40);

  const yValues = visibleCandles.flatMap((candle) => [candle.high, candle.low]);
  const extraLevels = [
    detail?.signal.sma7,
    detail?.signal.sma30,
    detail?.signal.high30d,
    detail?.signal.low30d,
    detail?.signal.nearestResistance,
    detail?.signal.nextResistance,
    detail?.signal.nearestSupport,
    detail?.signal.entryZoneLow,
    detail?.signal.entryZoneHigh,
    detail?.signal.protectiveStop,
    detail?.signal.breakEvenActivationPrice,
    detail?.signal.confirmationLevel
  ].filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));

  const allY = [...yValues, ...extraLevels];
  const minPrice = allY.length ? Math.min(...allY) * 0.985 : 0;
  const maxPrice = allY.length ? Math.max(...allY) * 1.015 : 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const candleStep = visibleCandles.length ? innerWidth / visibleCandles.length : innerWidth;
  const candleBodyWidth = Math.max(5, candleStep * 0.56);

  function y(price: number) {
    if (maxPrice === minPrice) return padding.top + innerHeight / 2;
    const ratio = (price - minPrice) / (maxPrice - minPrice);
    return padding.top + innerHeight - ratio * innerHeight;
  }

  function x(index: number) {
    return padding.left + candleStep * index + candleStep / 2;
  }

  const closePolyline = visibleCandles
    .map((candle, index) => `${x(index)},${y(candle.close)}`)
    .join(" ");

  const priceTicks = Array.from({ length: 5 }, (_, index) => {
    const value = minPrice + ((maxPrice - minPrice) / 4) * index;
    return {
      value,
      py: y(value)
    };
  });

  const title = detail?.market.pair.display ?? "BTC/USDT";
  const low30d = detail?.signal.low30d ?? null;
  const high30d = detail?.signal.high30d ?? null;
  const entryZoneLow = detail?.signal.entryZoneLow ?? null;
  const entryZoneHigh = detail?.signal.entryZoneHigh ?? null;
  const protectiveStop = detail?.signal.protectiveStop ?? null;
  const breakEvenActivationPrice = detail?.signal.breakEvenActivationPrice ?? null;
  const nearestSupport = detail?.signal.nearestSupport ?? null;
  const nearestResistance = detail?.signal.nearestResistance ?? null;
  const confirmationLevel = detail?.signal.confirmationLevel ?? null;
  const sma30 = detail?.signal.sma30 ?? null;

  return (
    <div className="chart-shell">
      <div className="chart-header-row">
        <div>
          <div className="chart-pair">{title}</div>
          <div className="chart-subtitle">Свечной график + визуализация сигналов стратегии</div>
        </div>
        <div className="chart-price-box">
          <span>Цена</span>
          <strong>{formatPrice(detail?.market.spot.priceUsd ?? null)}</strong>
        </div>
      </div>

      <div className="chart-stage">
        <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={`График ${title}`}>
          <defs>
            <linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(47, 120, 255, 0.22)" />
              <stop offset="100%" stopColor="rgba(47, 120, 255, 0.01)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={width} height={height} rx="20" className="chart-bg" />

          {priceTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={tick.py}
                y2={tick.py}
                className="chart-grid-line"
              />
              <text x={width - padding.right + 8} y={tick.py + 4} className="chart-axis-label">
                {formatPrice(tick.value)}
              </text>
            </g>
          ))}

          {activeIndicators.range && low30d !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(low30d)}
              y2={y(low30d)}
              className="chart-line chart-line-range"
            />
          ) : null}

          {activeIndicators.range && high30d !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(high30d)}
              y2={y(high30d)}
              className="chart-line chart-line-range"
            />
          ) : null}

          {activeIndicators.tradePlan &&
          entryZoneLow !== null &&
          entryZoneHigh !== null ? (
            <rect
              x={padding.left}
              y={y(entryZoneHigh)}
              width={innerWidth}
              height={Math.max(6, y(entryZoneLow) - y(entryZoneHigh))}
              className="chart-zone chart-zone-entry"
            />
          ) : null}

          {activeIndicators.tradePlan && protectiveStop !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(protectiveStop)}
              y2={y(protectiveStop)}
              className="chart-line chart-line-stop"
            />
          ) : null}

          {activeIndicators.tradePlan && breakEvenActivationPrice !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(breakEvenActivationPrice)}
              y2={y(breakEvenActivationPrice)}
              className="chart-line chart-line-target"
            />
          ) : null}

          {activeIndicators.supports && nearestSupport !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(nearestSupport)}
              y2={y(nearestSupport)}
              className="chart-line chart-line-support"
            />
          ) : null}

          {activeIndicators.supports && nearestResistance !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(nearestResistance)}
              y2={y(nearestResistance)}
              className="chart-line chart-line-resistance"
            />
          ) : null}

          {activeIndicators.confirmation && confirmationLevel !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(confirmationLevel)}
              y2={y(confirmationLevel)}
              className="chart-line chart-line-confirmation"
            />
          ) : null}

          {visibleCandles.map((candle, index) => {
            const cx = x(index);
            const openY = y(candle.open);
            const closeY = y(candle.close);
            const highY = y(candle.high);
            const lowY = y(candle.low);
            const bullish = candle.close >= candle.open;

            return (
              <g key={candle.time}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={highY}
                  y2={lowY}
                  className={bullish ? "chart-wick-up" : "chart-wick-down"}
                />
                <rect
                  x={cx - candleBodyWidth / 2}
                  y={Math.min(openY, closeY)}
                  width={candleBodyWidth}
                  height={Math.max(2, Math.abs(closeY - openY))}
                  rx="3"
                  className={bullish ? "chart-candle-up" : "chart-candle-down"}
                />
              </g>
            );
          })}

          {activeIndicators.sma7 && visibleCandles.length ? (
            <polyline points={closePolyline} className="chart-path chart-path-sma7" />
          ) : null}

          {activeIndicators.sma30 && sma30 !== null ? (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(sma30)}
              y2={y(sma30)}
              className="chart-line chart-line-sma30"
            />
          ) : null}
        </svg>
      </div>

      <div className="chart-legend">
        <span><i className="legend-dot legend-buy" /> Бычьи свечи</span>
        <span><i className="legend-dot legend-sell" /> Медвежьи свечи</span>
        <span><i className="legend-dot legend-zone" /> Entry zone</span>
        <span><i className="legend-dot legend-resistance" /> Resistance / confirmation</span>
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
  const dashboard = initialDashboard;
  const markets = initialMarkets;
  const {
    selectedSymbol,
    setSelectedSymbol,
    detail,
    detailLoading,
    detailError
  } = useSelectedMarket(initialDetail, initialSelectedSymbol);

  const [panelMode, setPanelMode] = useState<SidePanelMode>("summary");
  const [infoData, setInfoData] = useState<InfoResponse | null>(null);
  const [aiData, setAiData] = useState<AiResponse | null>(null);
  const [sideLoading, setSideLoading] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Record<IndicatorKey, boolean>>({
    sma7: true,
    sma30: true,
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

  const summaryLines = buildSummaryLines(detail, dashboard);
  const managementLines = buildManagementLines(detail, dashboard, selectedSymbol);
  const sideTextLines =
    panelMode === "summary"
      ? [...summaryLines, "", "Как сопровождать сделку:", ...managementLines]
      : panelMode === "info"
        ? normalizeTextBlock(infoData?.text)
        : normalizeTextBlock(aiData?.text);

  return (
    <>
      <section className="hero">
        <div className="hero-badge">Dashboard</div>
        <h1 className="page-title">Crypto AI Dashboard</h1>
        <p className="page-subtitle dashboard-subtitle">
          График пары, сигналы на покупку, полный список рынка и визуализация
          индикаторов стратегии на одном экране.
        </p>
      </section>

      {dashboardError || marketsError || initialDetailError || detailError ? (
        <section className="section">
          <div className="card warning-card">
            <h3>Часть данных недоступна</h3>
            <p>
              Dashboard продолжает работать в деградированном режиме и не падает целиком.
            </p>
            <p style={{ marginTop: 12 }}>
              {dashboardError ?? marketsError ?? initialDetailError ?? detailError}
            </p>
          </div>
        </section>
      ) : null}

      <section className="section dashboard-grid">
        <div className="dashboard-left-stack">
          <div className="card dashboard-chart-card">
            <TradingChart detail={detail} activeIndicators={activeIndicators} />
          </div>

          <div className="card dashboard-indicators-card">
            <h3>Индикаторы примененные в стратегии</h3>
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
                  <p>Сейчас в кеше нет сигналов на покупку.</p>
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
                      <strong className={signalClassName(detail.signal.signal)}>{detail.signal.signal}</strong>
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
                      <div className="summary-gap" key={`${line}-${index}`} />
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
              onClick={() => setPanelMode("summary")}
            >
              Сигналы
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
