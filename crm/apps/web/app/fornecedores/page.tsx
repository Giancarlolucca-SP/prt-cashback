import { AppShell } from "../components/app-shell";
import { LiveSuppliersWorkspace } from "../components/live-suppliers-workspace";

export default function FornecedoresPage() {
  return (
    <AppShell
      active="Fornecedores"
      description="Cadastro separado de fornecedores, origens de veiculos, grupos, parceiros, locadoras e prestadores."
      eyebrow="Origens de veiculos"
      title="Fornecedores e origens"
    >
      <LiveSuppliersWorkspace />
    </AppShell>
  );
}
