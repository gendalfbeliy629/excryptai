import Link from "next/link";
import { safeGetDashboardData } from "../../lib/api";
import { formatPercent, formatPrice } from "../../lib/format";

export const dynamic = "force-dynamic";

function signalClassName(signal: "BUY" | "HOLD" | "SELL") {
  if (signal === "BUY") return "pill signal-buy";
  if (signal === "SELL") return "pill signal-sell";
  return "pill signal-hold";
}

export default async function DashboardPage() {
  const result = await safeGetDashboardData();

  if (!result.data) {
    return (
      <>
        <section className="hero">
          <div className="hero-badge">Dashboard</div>
          <h1 className="page-title">Crypto AI Dashboard</h1>
          <p className="page-subtitle">
            Страница временно недоступна, но frontend больше не падает целиком.
          </p>
        </section>

        <section className="section">
          <div className="card error-card">
            <h3>Не удалось загрузить dashboard</h3>
            <p>Backend вернул ошибку при сборке рыночной сводки.</p>
            <p style={{ marginTop: 12 }}>
              <strong>Причина:</strong> {result.error ?? "неизвестная ошибка"}
            </p>
            <p style={{ marginTop: 12 }}>
              Попробуй обновить страницу через 10–20 секунд.
            </p>
          </div>
        </section>
      </>
    );
  }

  const data = result.data;

  return (
    <>
      <section className="hero">
        <div className="hero-badge">Dashboard</div>
        <h1 className="page-title">Crypto AI Dashboard</h1>
        <p className="page-subtitle">
          Стартовый web-экран для проекта: витрина рынка, лучшие BUY-сетапы и
          базовая сводка по текущему месячному горизонту.
        </p>
      </section>

      {data.degraded ? (
        <section className="section">
          <div className="card warning-card">
            <h3>Данные загружены частично</h3>
            <p>
              Один или несколько внешних источников временно отдали неполные
              данные. Страница показана в частичном режиме вместо 500 ошибки.
            </p>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="grid grid-3">
          <div className="card kpi">
            <span className="metric-label">Проверено активов</span>
            <div className="metric-value">{data.summary.totalChecked}</div>
          </div>

          <div className="card kpi">
            <span className="metric-label">BUY сигналов</span>
            <div className="metric-value">{data.summary.buyCount}</div>
          </div>

          <div className="card kpi">
            <span className="metric-label">Средний RSI</span>
            <div className="metric-value">
              {data.summary.avgRsi14 !== null
                ? data.summary.avgRsi14.toFixed(2)
                : "n/a"}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Featured market overview</h2>

        <div className="grid grid-3">
          {data.featured.map((item) => (
            <div className="card" key={item.symbol}>
              <h3>
                <Link className="link" href={`/markets/${item.symbol}`}>
                  {item.name} ({item.symbol})
                </Link>
              </h3>

              <div className={signalClassName(item.signal)}>{item.signal}</div>

              <div className="metric-value">{formatPrice(item.priceUsd)}</div>

              <p style={{ marginTop: 12 }}>
                24ч: {formatPercent(item.change24h)}
                <br />
                30д: {formatPercent(item.change30d)}
                <br />
                Тренд: {item.trend30d}
                <br />
                RSI: {item.rsi14 !== null ? item.rsi14.toFixed(2) : "n/a"}
                <br />
                Score: {item.score.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Top BUY setups</h2>

        <div className="grid grid-2">
          {data.topBuys.map((item) => (
            <div className="card" key={`${item.symbol}-${item.rank}`}>
              <h3>
                <Link className="link" href={`/markets/${item.symbol}`}>
                  {item.rank}. {item.pair}
                </Link>
              </h3>

              <div className="pill signal-buy">{item.signal}</div>

              <p style={{ marginTop: 12 }}>
                Текущая цена: {formatPrice(item.priceUsd)}
                <br />
                Покупка: до {formatPrice(item.buyPriceUsd)}
                <br />
                SL: {formatPrice(item.initialStopLossUsd)}
                <br />
                TP1: {formatPrice(item.tp1Usd)}
                <br />
                TP2: {formatPrice(item.tp2Usd)}
                <br />
                TP3: {formatPrice(item.tp3Usd)}
              </p>

              <p style={{ marginTop: 12 }}>
                24ч: {formatPercent(item.change24h)}
                <br />
                30д: {formatPercent(item.change30d)}
                <br />
                RSI: {item.rsi14 !== null ? item.rsi14.toFixed(2) : "n/a"}
                <br />
                Score: {item.score.toFixed(2)}
              </p>

              <p style={{ marginTop: 12 }}>{item.reason}</p>

              <ul className="list" style={{ marginTop: 12 }}>
                {item.managementPlan.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h3>Краткая сводка рынка</h3>
          <p>{data.summary.explanation}</p>
          <p style={{ marginTop: 12 }}>
            Среднее изменение за 30д:{" "}
            <strong>{formatPercent(data.summary.avgChange30d)}</strong>
            <br />
            Bullish: <strong>{data.summary.bullishCount}</strong>
            <br />
            Sideways: <strong>{data.summary.sidewaysCount}</strong>
            <br />
            Bearish: <strong>{data.summary.bearishCount}</strong>
          </p>
        </div>
      </section>
    </>
  );
}