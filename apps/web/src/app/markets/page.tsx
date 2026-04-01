import Link from "next/link";
import { safeGetMarkets } from "../../lib/api";
import { formatPercent, formatPrice } from "../../lib/format";

export const dynamic = "force-dynamic";

function signalClassName(signal: "BUY" | "HOLD" | "SELL") {
  if (signal === "BUY") return "pill signal-buy";
  if (signal === "SELL") return "pill signal-sell";
  return "pill signal-hold";
}

export default async function MarketsPage() {
  const result = await safeGetMarkets(16);

  if (!result.data) {
    return (
      <>
        <section className="hero">
          <div className="hero-badge">Markets</div>
          <h1 className="page-title">Рынок и текущие сигналы</h1>
          <p className="page-subtitle">
            Страница временно недоступна, но frontend больше не падает целиком.
          </p>
        </section>

        <section className="section">
          <div className="card error-card">
            <h3>Не удалось загрузить markets</h3>
            <p>Backend вернул ошибку при сборке списка активов.</p>
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
        <div className="hero-badge">Markets</div>
        <h1 className="page-title">Рынок и текущие сигналы</h1>
        <p className="page-subtitle">
          Таблица строится на основе текущего backend `crypto-ai`: CoinCap +
          CryptoCompare + deterministic signal engine.
        </p>
      </section>

      {data.degraded ? (
        <section className="section">
          <div className="card warning-card">
            <h3>Данные загружены частично</h3>
            <p>
              Один или несколько активов были пропущены из-за временной ошибки
              внешнего провайдера. Таблица показана в частичном режиме вместо
              500 ошибки.
            </p>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Актив</th>
                <th>Пара</th>
                <th>Цена</th>
                <th>24ч</th>
                <th>30д</th>
                <th>Тренд</th>
                <th>RSI</th>
                <th>Signal</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.symbol}>
                  <td>
                    <Link className="link" href={`/markets/${item.symbol}`}>
                      {item.name} ({item.symbol})
                    </Link>
                  </td>
                  <td>{item.pair}</td>
                  <td>{formatPrice(item.priceUsd)}</td>
                  <td>{formatPercent(item.change24h)}</td>
                  <td>{formatPercent(item.change30d)}</td>
                  <td>{item.trend30d}</td>
                  <td>{item.rsi14 !== null ? item.rsi14.toFixed(2) : "n/a"}</td>
                  <td>
                    <span className={signalClassName(item.signal)}>
                      {item.signal}
                    </span>
                  </td>
                  <td>{item.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}