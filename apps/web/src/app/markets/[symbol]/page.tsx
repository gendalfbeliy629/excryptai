import { notFound } from "next/navigation";
import { getMarketDetail } from "../../../lib/api";
import {
  formatCompactUsd,
  formatNumber,
  formatPercent,
  formatPrice
} from "../../../lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

function signalClassName(signal: "BUY" | "HOLD" | "SELL") {
  if (signal === "BUY") return "pill signal-buy";
  if (signal === "SELL") return "pill signal-sell";
  return "pill signal-hold";
}

export default async function MarketSymbolPage({ params }: PageProps) {
  const { symbol } = await params;

  let data;
  try {
    data = await getMarketDetail(symbol);
  } catch {
    notFound();
  }

  const recentCandles = data.market.technicals.candles.slice(-5).reverse();

  return (
    <>
      <section className="hero">
        <div className="hero-badge">{data.market.pair.display}</div>
        <h1 className="page-title">
          {data.market.asset.name} ({data.market.asset.symbol})
        </h1>
        <p className="page-subtitle">
          Детальная страница монеты с данными из текущего backend и готовым
          deterministic signal.
        </p>
      </section>

      <section className="section">
        <div className="grid grid-3">
          <div className="card">
            <h3>Текущая цена</h3>
            <div className="metric-value">{formatPrice(data.market.spot.priceUsd)}</div>
            <p style={{ marginTop: 12 }}>
              Изменение 24ч: {formatPercent(data.market.spot.change24h)}
              <br />
              Market Cap: {formatCompactUsd(data.market.spot.marketCapUsd)}
            </p>
          </div>

          <div className="card">
            <h3>30-дневный теханализ</h3>
            <p>
              Изменение 30д: {formatPercent(data.market.technicals.change30d)}
              <br />
              Trend: {data.market.technicals.trend30d}
              <br />
              RSI(14): {formatNumber(data.market.technicals.rsi14)}
              <br />
              SMA7: {formatPrice(data.market.technicals.sma7)}
              <br />
              SMA30: {formatPrice(data.market.technicals.sma30)}
            </p>
          </div>

          <div className="card">
            <h3>Signal engine</h3>
            <div className={signalClassName(data.signal.signal)}>{data.signal.signal}</div>
            <p style={{ marginTop: 12 }}>
              Score: {data.signal.score.toFixed(2)}
              <br />
              Причина: {data.signal.reason}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="grid grid-2">
          <div className="card">
            <h3>Диапазон и уровни</h3>
            <p>
              High 30д: {formatPrice(data.market.technicals.high30d)}
              <br />
              Low 30д: {formatPrice(data.market.technicals.low30d)}
              <br />
              Range position: {formatNumber(data.signal.rangePosition)}%
              <br />
              Pullback from high: {formatPercent(data.signal.pullbackFromHigh)}
            </p>
          </div>

          <div className="card">
            <h3>Ликвидность и social</h3>
            <p>
              TVL: {formatCompactUsd(data.market.liquidity.totalTvlUsd)}
              <br />
              Protocols:{" "}
              {data.market.liquidity.protocolsUsed.length
                ? data.market.liquidity.protocolsUsed.join(", ")
                : "n/a"}
              <br />
              Social volume: {data.market.sentiment.socialVolumeTotal ?? "n/a"}
              <br />
              Social dominance:{" "}
              {data.market.sentiment.socialDominanceLatest ?? "n/a"}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="grid grid-2">
          <div className="card">
            <h3>Плюсы</h3>
            <ul className="list">
              {data.signal.positives.length ? (
                data.signal.positives.map((item, index) => <li key={index}>{item}</li>)
              ) : (
                <li>Явных позитивных факторов не найдено.</li>
              )}
            </ul>
          </div>

          <div className="card">
            <h3>Риски</h3>
            <ul className="list">
              {data.signal.negatives.length ? (
                data.signal.negatives.map((item, index) => <li key={index}>{item}</li>)
              ) : (
                <li>Выраженных негативных факторов не найдено.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h3>Последние свечи</h3>
          <div className="candles-grid">
            {recentCandles.map((candle) => (
              <div className="candle-card" key={candle.time}>
                <strong>{new Date(candle.time * 1000).toLocaleDateString("ru-RU")}</strong>
                <div className="muted">Open: {formatPrice(candle.open)}</div>
                <div className="muted">High: {formatPrice(candle.high)}</div>
                <div className="muted">Low: {formatPrice(candle.low)}</div>
                <div className="muted">Close: {formatPrice(candle.close)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}