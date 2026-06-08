import { AppShell } from "../components/app-shell";
import { LiveAuditWorkspace } from "../components/live-audit-workspace";

export default function AuditoriaPage() {
  return (
    <AppShell
      active="Auditoria"
      description="Rastreabilidade de acessos, permissoes, consultas sensiveis, automacoes e eventos criticos."
      eyebrow="Seguranca e confianca"
      title="Auditoria"
    >
      <LiveAuditWorkspace />
    </AppShell>
  );
}
