import { AppShell } from "../components/app-shell";
import { LiveStorefrontWorkspace } from "../components/live-storefront-workspace";

export default function SiteLojaPage() {
  return (
    <AppShell
      active="Site Loja"
      description="Vitrine publica da loja conectada ao estoque, captura de lead, WhatsApp, agendamento e origem no CRM."
      eyebrow="Experiencia publica"
      title="Site da loja"
    >
      <LiveStorefrontWorkspace />
    </AppShell>
  );
}
