import { AppShell } from "../components/app-shell";
import { LiveFinanceWorkspace } from "../components/live-finance-workspace";

export default function FinanceiroPage() {
  return (
    <AppShell
      active="Financeiro"
      description="Contas a pagar, lancamento de despesas, fornecedores, vencimentos e conciliacao bancaria."
      eyebrow="Controle financeiro"
      title="Contas a pagar"
    >
      <LiveFinanceWorkspace />
    </AppShell>
  );
}
