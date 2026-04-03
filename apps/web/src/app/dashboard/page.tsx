import DashboardClient from "../../components/dashboard-client";
import {
  safeGetDashboardData,
  safeGetMarketDetail,
  safeGetMarkets
} from "../../lib/api";

export default async function DashboardPage() {
  const dashboardResult = await safeGetDashboardData();
  const marketsResult = await safeGetMarkets(30);

  const firstBuySymbol = dashboardResult.data?.topBuys?.[0]?.symbol ?? null;
  const fallbackSymbol =
    marketsResult.data?.items?.find((item) => item.symbol === "BTC")?.symbol ??
    marketsResult.data?.items?.[0]?.symbol ??
    "BTC";

  const initialSelectedSymbol = firstBuySymbol ?? fallbackSymbol;
  const detailResult = await safeGetMarketDetail(initialSelectedSymbol);

  return (
    <DashboardClient
      initialDashboard={dashboardResult.data}
      dashboardError={dashboardResult.error}
      initialMarkets={marketsResult.data}
      marketsError={marketsResult.error}
      initialSelectedSymbol={initialSelectedSymbol}
      initialDetail={detailResult.data}
      detailError={detailResult.error}
    />
  );
}