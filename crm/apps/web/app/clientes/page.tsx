import { AppShell } from "../components/app-shell";
import { LiveCustomersWorkspace } from "../components/live-customers-workspace";

export default function ClientesPage() {
  return (
    <AppShell
      active="Clientes"
      description="Base unica para clientes, leads convertidos, historico, documentos, veiculos de interesse, recompras e permissoes."
      eyebrow="Cadastro central"
      title="Clientes"
    >
      <LiveCustomersWorkspace />
    </AppShell>
  );
}
