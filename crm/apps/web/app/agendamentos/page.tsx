import { AppShell } from "../components/app-shell";
import { LiveAppointmentsWorkspace } from "../components/live-appointments-workspace";

export default function AgendamentosPage() {
  return (
    <AppShell
      active="Agendamentos"
      description="Agenda operacional para visitas, avaliacoes, vistorias, retornos, entregas e servicos."
      eyebrow="Agenda da operacao"
      title="Agendamentos"
    >
      <LiveAppointmentsWorkspace />
    </AppShell>
  );
}
