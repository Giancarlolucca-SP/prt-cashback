import { AppShell } from "../components/app-shell";
import { LiveServicesWorkspace } from "../components/live-services-workspace";

export default function ServicosPage() {
  return (
    <AppShell
      active="Servicos"
      description="Controle de OS, vistoria, preparacao, prestadores, notas fiscais e anexos dos veiculos."
      eyebrow="Preparacao e servicos"
      title="Central de servicos"
    >
      <LiveServicesWorkspace />
    </AppShell>
  );
}
