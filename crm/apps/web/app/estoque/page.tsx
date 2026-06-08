import { AppShell } from "../components/app-shell";
import { LiveInventoryWorkspace } from "../components/live-inventory-workspace";

export default function EstoquePage() {
  return (
    <AppShell
      active="Estoque"
      description="Controle dos veiculos proprios, preparacao, anuncios, pendencias e disponibilidade comercial."
      eyebrow="Estoque operacional"
      title="Central de estoque"
    >
      <LiveInventoryWorkspace />
    </AppShell>
  );
}
