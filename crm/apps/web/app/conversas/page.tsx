import { AppShell } from "../components/app-shell";
import { LiveConversationsWorkspace } from "../components/live-conversations-workspace";

export default function ConversasPage() {
  return (
    <AppShell
      active="Conversas"
      description="Inbox omnichannel para WhatsApp, Instagram, marketplaces, IA e takeover humano sem perder contexto."
      eyebrow="Omnichannel"
      title="Conversas"
    >
      <LiveConversationsWorkspace />
    </AppShell>
  );
}
