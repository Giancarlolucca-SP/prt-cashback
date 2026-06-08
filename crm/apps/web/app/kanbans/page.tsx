import { AppShell } from "../components/app-shell";
import { LiveKanbansWorkspace } from "../components/live-kanbans-workspace";

export default function KanbansPage() {
  return (
    <AppShell
      active="Kanbans"
      description="Mapa operacional consolidando status reais de leads, compras, estoque e ordens de servico."
      eyebrow="Visao macro dos fluxos"
      title="Kanbans"
    >
      <LiveKanbansWorkspace />
    </AppShell>
  );
}
