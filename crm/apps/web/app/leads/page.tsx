import { AppShell } from "../components/app-shell";
import { LiveLeadsWorkspace } from "../components/live-leads-workspace";

export default function LeadsPage() {
  return (
    <AppShell
      active="Leads"
      description="Captacao, atendimento, deduplicacao e priorizacao dos contatos comerciais da GT3."
      eyebrow="Comercial em tempo real"
      title="Central de leads"
    >
      <LiveLeadsWorkspace />
    </AppShell>
  );
}
