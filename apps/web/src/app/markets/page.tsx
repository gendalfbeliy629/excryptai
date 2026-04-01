import Link from "next/link";
import { getMarkets } from "../../lib/api";
import { formatPercent, formatPrice } from "../../lib/format";

export const dynamic = "force-dynamic";

function signalClassName(signal: "BUY" | "HOLD" | "SELL") {
  if (signal === "BUY") return "pill signal-buy";
  if (signal === "SELL") return "pill signal-sell";
  return "pill signal-hold";
}

export default async function MarketsPage() {
  const data = await getMarkets(16);

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