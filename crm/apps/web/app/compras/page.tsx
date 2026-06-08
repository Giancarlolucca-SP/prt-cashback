import { AppShell } from "../components/app-shell";
import { LivePurchasesWorkspace } from "../components/live-purchases-workspace";

export default function ComprasPage() {
  return (
    <AppShell
      active="Compras"
      description="Modulo para oportunidade de compra, origem do veiculo, avaliacao, decisao humana e pagamento."
      eyebrow="Avaliacao e compra"
      title="Compras e avaliacao"
    >
      <LivePurchasesWorkspace />
    </AppShell>
  );
}
