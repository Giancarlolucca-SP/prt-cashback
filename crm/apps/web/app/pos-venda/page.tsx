import { AppShell } from "../components/app-shell";
import { LivePostSaleWorkspace } from "../components/live-post-sale-workspace";

export default function PosVendaPage() {
  return (
    <AppShell
      active="Pos-venda"
      description="Agenda, historico, recorrencia, DRE proprio e comissoes da operacao de servicos ao cliente."
      eyebrow="Operacao recorrente"
      title="Pos-venda e servicos recorrentes"
    >
      <LivePostSaleWorkspace />
    </AppShell>
  );
}
