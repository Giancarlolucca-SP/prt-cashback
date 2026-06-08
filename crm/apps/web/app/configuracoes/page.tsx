import { AppShell } from "../components/app-shell";
import { LiveSettingsWorkspace } from "../components/live-settings-workspace";

export default function ConfiguracoesPage() {
  return (
    <AppShell
      active="Configuracoes"
      description="Area administrativa para usuarios, RBAC, templates, canais, bancos, fiscal, storage, automacoes e ajustes futuros."
      eyebrow="Governanca"
      title="Configuracoes"
    >
      <LiveSettingsWorkspace />
    </AppShell>
  );
}
