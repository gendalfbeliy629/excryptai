import DashboardClient from "../../components/dashboard-client";
import {
  safeGetDashboardData,
  safeGetMarketDetail,
  safeGetMarkets
} from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboardResult = await safeGetDashboardData();
  const selectedSymbol = dashboardResult.data?.topBuys[0]?.symbol ?? "BTC";

  const [marketsResult, detailResult] = await Promise.all([
    safeGetMarkets(30),
    safeGetMarketDetail(selectedSymbol)
  ]);

  return (
    <DashboardClient
      initialDashboard={dashboardResult.data}
      dashboardError={dashboardResult.error}
      initialMarkets={marketsResult.data}
      marketsError={marketsResult.error}
      initialSelectedSymbol={selectedSymbol}
      initialDetail={detailResult.data}
      detailError={detailResult.error}
    />
  );
}