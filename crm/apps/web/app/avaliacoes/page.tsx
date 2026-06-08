import { AppShell } from "../components/app-shell";
import { LiveEvaluationsWorkspace } from "../components/live-evaluations-workspace";

export default function AvaliacoesPage() {
  return (
    <AppShell
      active="Avaliacoes"
      description="Historico de avaliacoes realizadas com valores, decisao, consultas, anexos e trilha de alteracoes."
      eyebrow="Compra e avaliacao"
      title="Historico de avaliacoes"
    >
      <LiveEvaluationsWorkspace />
    </AppShell>
  );
}
