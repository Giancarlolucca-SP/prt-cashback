import { AppShell } from "./components/app-shell";
import { DashboardCharts } from "./components/dashboard-charts";
import { LiveCommercialAnalytics } from "./components/live-commercial-analytics";
import { LiveDashboardSummary } from "./components/live-dashboard-summary";

export default function HomePage() {
  return (
    <AppShell
      active="Painel"
      description="Vendas, estoque, alertas e automacoes em uma unica superficie de decisao."
      eyebrow="Gestao GT3 em tempo real"
      title="Painel executivo da loja"
    >
      <LiveDashboardSummary />

      <DashboardCharts />

      <LiveCommercialAnalytics />
    </AppShell>
  );
}
