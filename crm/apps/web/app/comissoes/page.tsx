import { AppShell } from "../components/app-shell";
import { LiveCommissionsWorkspace } from "../components/live-commissions-workspace";

export default function ComissoesPage() {
  return (
    <AppShell
      active="Comissoes"
      description="Controle de saldos, metricas por vendedor, premios, valores previstos, aprovados, pagos e bloqueados."
      eyebrow="Remuneracao variavel"
      title="Comissoes e premios"
    >
      <LiveCommissionsWorkspace />
    </AppShell>
  );
}
