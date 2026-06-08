import { AppShell } from "../components/app-shell";
import { LiveAutomationsWorkspace } from "../components/live-automations-workspace";

export default function AutomacoesPage() {
  return (
    <AppShell
      active="Automacoes"
      description="Central para filas, jobs, webhooks, IA, OCR, guardrails, custos, logs e aprovacoes humanas."
      eyebrow="IA e operacao"
      title="Automacoes e IA"
    >
      <LiveAutomationsWorkspace />
    </AppShell>
  );
}
