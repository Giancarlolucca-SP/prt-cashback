import {
  BadgeDollarSign,
  Bot,
  CalendarDays,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Handshake,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  PieChart,
  Repeat2,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Trophy,
  UsersRound,
  UserRoundCheck,
  Wrench
} from "lucide-react";
import { AppShell } from "../components/app-shell";

const previewGroups = [
  {
    label: "Gestao",
    description: "Visao macro do negocio, indicadores e resultado.",
    pages: [
      { label: "Painel", href: "/", icon: LayoutDashboard, status: "executivo", detail: "Resumo da loja, decisoes, graficos e alertas." },
      { label: "Resultados", href: "/resultados", icon: PieChart, status: "live", detail: "DRE, EBITDA, fluxo, margem, estoque e balanco gerencial." }
    ]
  },
  {
    label: "Comercial",
    description: "Relacionamento com cliente, atendimento e funil de venda.",
    pages: [
      { label: "Leads", href: "/leads", icon: UsersRound, status: "live", detail: "Leads, SLA, risco de esfriar e prioridade." },
      { label: "Clientes", href: "/clientes", icon: UserRoundCheck, status: "live", detail: "Cadastro, historico, interesses e recompra." },
      { label: "Conversas", href: "/conversas", icon: MessageSquareText, status: "live", detail: "Inbox omnichannel com conversa selecionavel." },
      { label: "Agendamentos", href: "/agendamentos", icon: CalendarDays, status: "live", detail: "Visitas, avaliacoes, vistorias e entregas." },
      { label: "Vendas", href: "/vendas", icon: BadgeDollarSign, status: "live", detail: "Propostas, documentos e passagem administrativa." },
      { label: "Pos-venda", href: "/pos-venda", icon: Sparkles, status: "live", detail: "PPF, insulfilme, estetica, DRE proprio e comissoes." },
      { label: "Relacionamento", href: "/relacionamento", icon: Handshake, status: "live", detail: "Aniversario, feedback, recompra e ranking." }
    ]
  },
  {
    label: "Veiculos",
    description: "Compra, estoque, preparacao, anuncios e repasse.",
    pages: [
      { label: "Kanbans", href: "/kanbans", icon: ClipboardList, status: "live", detail: "Fluxos consolidados de leads, compra, estoque e OS." },
      { label: "Compras", href: "/compras", icon: ClipboardList, status: "live", detail: "Oportunidades, consultas, FIPE e aprovacao." },
      { label: "Avaliacoes", href: "/avaliacoes", icon: SearchCheck, status: "live", detail: "Avaliacoes realizadas, decisoes, valores e timeline." },
      { label: "Fornecedores", href: "/fornecedores", icon: Truck, status: "live", detail: "Fontes, parceiros, grupos, prestadores e credenciais seguras." },
      { label: "Repasse", href: "/repasse", icon: Repeat2, status: "live", detail: "Anuncio, listas, grupos e Instagram." },
      { label: "Estoque", href: "/estoque", icon: CarFront, status: "live", detail: "Veiculos, dias em estoque, gastos e margem." },
      { label: "Anuncios", href: "/anuncios", icon: Megaphone, status: "live", detail: "Site, marketplace, Instagram e pendencias." },
      { label: "Servicos", href: "/servicos", icon: Wrench, status: "live", detail: "Preparacao, prestadores, NF e prazos." }
    ]
  },
  {
    label: "Backoffice",
    description: "Documentos, financeiro e remuneracao variavel.",
    pages: [
      { label: "Administrativo", href: "/administrativo", icon: ClipboardCheck, status: "live", detail: "Criar agenda, cliente, venda, fornecedor e prestador." },
      { label: "Documentos", href: "/documentos", icon: FileText, status: "live", detail: "Anexos, contratos, OCR, assinatura e bloqueios." },
      { label: "Financeiro", href: "/financeiro", icon: Landmark, status: "live", detail: "Contas a pagar, despesas e conciliacao." },
      { label: "Comissoes", href: "/comissoes", icon: Trophy, status: "live", detail: "Saldo, previsto, aprovado, pago e bloqueado por vendedor." }
    ]
  },
  {
    label: "Sistema",
    description: "Configuracoes, automacoes, auditoria e site publico.",
    pages: [
      { label: "Automacoes", href: "/automacoes", icon: Bot, status: "live", detail: "Filas, IA, OCR, webhooks e guardrails." },
      { label: "Configuracoes", href: "/configuracoes", icon: Settings, status: "live", detail: "Usuarios, templates, integracoes e regras." },
      { label: "Site Loja", href: "/site-loja", icon: Store, status: "live", detail: "Vitrine, detalhe do veiculo, captura e agenda." },
      { label: "Auditoria", href: "/auditoria", icon: ShieldCheck, status: "live", detail: "Eventos sensiveis, permissoes e automacoes." }
    ]
  }
];

export default function PreviewPage() {
  const totalPages = previewGroups.reduce((sum, group) => sum + group.pages.length, 0);

  return (
    <AppShell
      active="Preview"
      description="Mapa visual para navegar pelas telas conectadas do CRM e revisar o produto de forma macro."
      eyebrow="Revisao do produto"
      title="Preview das telas"
    >
      <section className="metric-grid">
        <article className="metric-card teal">
          <div>
            <h3>Telas no preview</h3>
            <strong>{totalPages}</strong>
            <span>rotas navegaveis</span>
          </div>
        </article>
        <article className="metric-card blue">
          <div>
            <h3>Grupos</h3>
            <strong>{previewGroups.length}</strong>
            <span>gestao, comercial, veiculos, backoffice e sistema</span>
          </div>
        </article>
        <article className="metric-card amber">
          <div>
            <h3>Status</h3>
            <strong>Conectado</strong>
            <span>telas com API, permissoes e fallback</span>
          </div>
        </article>
        <article className="metric-card rose">
          <div>
            <h3>Revisao</h3>
            <strong>Global</strong>
            <span>validar fluxo, UX e dados por modulo</span>
          </div>
        </article>
      </section>

      <section className="preview-map">
        {previewGroups.map((group) => (
          <article className="panel preview-group" key={group.label}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{group.label}</p>
                <h3>{group.description}</h3>
              </div>
              <span className="live-pill">{group.pages.length} telas</span>
            </div>
            <div className="preview-card-grid">
              {group.pages.map((page) => {
                const Icon = page.icon;
                return (
                  <a className="preview-card" href={page.href} key={page.href}>
                    <span className="preview-icon">
                      <Icon aria-hidden="true" size={20} />
                    </span>
                    <span>
                      <strong>{page.label}</strong>
                      <em>{page.detail}</em>
                    </span>
                    <i>{page.status}</i>
                  </a>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
