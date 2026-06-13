import { AppShell } from "../components/app-shell";
import { LiveProfileWorkspace } from "../components/live-profile-workspace";

export default function PerfilPage() {
  return (
    <AppShell
      active="Perfil"
      description="Preferencias pessoais, sessao atual e ajustes locais do usuario autenticado."
      eyebrow="Conta"
      title="Perfil"
    >
      <LiveProfileWorkspace />
    </AppShell>
  );
}
