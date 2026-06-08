import { AppShell } from "../components/app-shell";
import { LiveDocumentsWorkspace } from "../components/live-documents-workspace";

export default function DocumentosPage() {
  return (
    <AppShell
      active="Documentos"
      description="Dossie operacional para contratos, assinaturas, snapshots de venda e regras de liberacao administrativa."
      eyebrow="Backoffice"
      title="Documentos e administrativo"
    >
      <LiveDocumentsWorkspace />
    </AppShell>
  );
}
