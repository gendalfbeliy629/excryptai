import DashboardClient from "../../components/dashboard-client";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
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