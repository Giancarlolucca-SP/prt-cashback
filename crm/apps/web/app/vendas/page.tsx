import { AppShell } from "../components/app-shell";
import { LiveSalesWorkspace } from "../components/live-sales-workspace";

export default function VendasPage() {
  return (
    <AppShell
      active="Vendas"
      description="Acompanhamento de propostas, documentos, retorno financeiro e passagem para administrativo."
      eyebrow="Pipeline comercial"
      title="Central de vendas"
    >
      <LiveSalesWorkspace />
    </AppShell>
  );
}
