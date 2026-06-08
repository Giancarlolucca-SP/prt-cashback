import { AppShell } from "../components/app-shell";
import { LiveRelationshipWorkspace } from "../components/live-relationship-workspace";

export default function RelacionamentoPage() {
  return (
    <AppShell
      active="Relacionamento"
      description="Rotinas de pos-venda, aniversario, recompra, ranking de clientes e linha do tempo de relacionamento."
      eyebrow="Relacionamento"
      title="Relacionamento e pos-venda"
    >
      <LiveRelationshipWorkspace />
    </AppShell>
  );
}
