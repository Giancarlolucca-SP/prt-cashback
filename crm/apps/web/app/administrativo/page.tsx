import { AppShell } from "../components/app-shell";
import { LiveAdministrativeWorkspace } from "../components/live-administrative-workspace";

export default function AdministrativoPage() {
  return (
    <AppShell
      active="Administrativo"
      description="Atalhos de criacao, cadastros operacionais e triagem de tarefas que conectam comercial, servicos, financeiro e documentos."
      eyebrow="Backoffice operacional"
      title="Administrativo"
    >
      <LiveAdministrativeWorkspace />
    </AppShell>
  );
}
