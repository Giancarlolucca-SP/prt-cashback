import { AppShell } from "../components/app-shell";
import { LiveRepasseWorkspace } from "../components/live-repasse-workspace";

export default function RepassePage() {
  return (
    <AppShell
      active="Repasse"
      description="Crie anuncios de repasse, escolha listas de transmissao, grupos de compradores e registre receita com auditoria."
      eyebrow="Rede de repasse"
      title="Repasse"
    >
      <LiveRepasseWorkspace />
    </AppShell>
  );
}
