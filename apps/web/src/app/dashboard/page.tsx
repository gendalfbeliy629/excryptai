import DashboardClient from "../../components/dashboard-client";
import {
  getDashboardBootstrapStatus,
  safeGetDashboardData,
  safeGetMarketDetail,
  safeGetMarkets
} from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const bootstrapStatus = await getDashboardBootstrapStatus("soft").catch(() => null);

  if (!bootstrapStatus?.buySignalsCacheReady && !bootstrapStatus?.dashboardCacheReady) {
    return (
      <DashboardClient
        initialDashboard={null}
        dashboardError={null}
        initialMarkets={null}
        marketsError={null}
        initialSelectedSymbol="BTC/USDT"
        initialDetail={null}
        detailError={null}
      />
    );
  }

  const [dashboardResult, marketsResult] = await Promise.all([
    safeGetDashboardData("soft"),
    safeGetMarkets("soft")
  ]);

  const initialSelectedSymbol =
    dashboardResult.data?.topBuys[0]?.pair ??
    marketsResult.data?.items.find((item) => item.pair === "BTC/USDT")?.pair ??
    marketsResult.data?.items[0]?.pair ??
    "BTC/USDT";

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
