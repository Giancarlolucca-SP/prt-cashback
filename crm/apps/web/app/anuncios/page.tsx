import { AppShell } from "../components/app-shell";
import { LiveListingsWorkspace } from "../components/live-listings-workspace";

export default function AnunciosPage() {
  return (
    <AppShell
      active="Anuncios"
      description="Preparacao, publicacao e leitura operacional dos anuncios no site, marketplaces e campanhas sociais."
      eyebrow="Publicacao comercial"
      title="Anuncios e marketplaces"
    >
      <LiveListingsWorkspace />
    </AppShell>
  );
}
