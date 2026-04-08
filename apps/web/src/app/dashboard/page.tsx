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

  if (!bootstrapStatus?.buySignalsCacheReady) {
    return (
      <DashboardClient
        initialDashboard={null}
        dashboardError={null}
        initialMarkets={null}
        marketsError={null}
        initialSelectedSymbol="BTC"
        initialDetail={null}
        detailError={null}
      />
    );
  }

  const [dashboardResult, marketsResult] = await Promise.all([
    safeGetDashboardData("soft"),
    safeGetMarkets(30)
  ]);

  const initialSelectedSymbol =
    dashboardResult.data?.topBuys[0]?.symbol ??
    marketsResult.data?.items.find((item) => item.symbol === "BTC")?.symbol ??
    marketsResult.data?.items[0]?.symbol ??
    "BTC";

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