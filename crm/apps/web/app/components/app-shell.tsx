"use client";

import {
  BadgeDollarSign,
  Bell,
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
  Search,
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
import type { ReactNode } from "react";
import { ProtectedShell } from "../auth/protected-shell";
import { useAuth, type PermissionRequirement } from "../auth/auth-provider";
import { ThemeToggle } from "./theme-toggle";

const navGroups = [
  {
    label: "Gestao",
    items: [
      { label: "Painel", href: "/", icon: LayoutDashboard, permission: { module: "dashboard", action: "read" } },
      { label: "Preview", href: "/preview", icon: ClipboardList, permission: { module: "dashboard", action: "read" } },
      { label: "Resultados", href: "/resultados", icon: PieChart, permission: { module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" } }
    ]
  },
  {
    label: "Comercial",
    items: [
      { label: "Leads", href: "/leads", icon: UsersRound, permission: { module: "leads", action: "read" } },
      { label: "Clientes", href: "/clientes", icon: UserRoundCheck, permission: { module: "customers", action: "read" } },
      { label: "Conversas", href: "/conversas", icon: MessageSquareText, permission: { module: "leads", action: "read" } },
      { label: "Agendamentos", href: "/agendamentos", icon: CalendarDays, permission: { module: "appointments", action: "manage" } },
      { label: "Vendas", href: "/vendas", icon: BadgeDollarSign, permission: { module: "sales", action: "read" } },
      { label: "Pos-venda", href: "/pos-venda", icon: Sparkles, permission: { module: "services", action: "manage" } },
      { label: "Relacionamento", href: "/relacionamento", icon: Handshake, permission: { module: "customers", action: "read" } }
    ]
  },
  {
    label: "Veiculos",
    items: [
      { label: "Kanbans", href: "/kanbans", icon: ClipboardList, permission: { module: "leads", action: "read" } },
      { label: "Compras", href: "/compras", icon: ClipboardList, permission: { module: "inventory", action: "manage" } },
      { label: "Avaliacoes", href: "/avaliacoes", icon: SearchCheck, permission: { module: "inventory", action: "manage" } },
      { label: "Fornecedores", href: "/fornecedores", icon: Truck, permission: { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" } },
      { label: "Repasse", href: "/repasse", icon: Repeat2, permission: { module: "repasse", action: "manage" } },
      { label: "Estoque", href: "/estoque", icon: CarFront, permission: { module: "inventory", action: "read" } },
      { label: "Anuncios", href: "/anuncios", icon: Megaphone, permission: { module: "ads", action: "manage" } },
      { label: "Servicos", href: "/servicos", icon: Wrench, permission: { module: "services", action: "manage" } }
    ]
  },
  {
    label: "Backoffice",
    items: [
      { label: "Administrativo", href: "/administrativo", icon: ClipboardCheck, permission: { module: "customers", action: "create" } },
      { label: "Documentos", href: "/documentos", icon: FileText, permission: { module: "documents", action: "manage" } },
      { label: "Financeiro", href: "/financeiro", icon: Landmark, permission: { module: "finance", action: "manage", scope: "ALL", sensitiveArea: "financial" } },
      { label: "Comissoes", href: "/comissoes", icon: Trophy, anyPermission: [{ module: "commissions", action: "read_all", scope: "ALL", sensitiveArea: "financial" }, { module: "commissions", action: "read_own" }] }
    ]
  },
  {
    label: "Sistema",
    items: [
      { label: "Automacoes", href: "/automacoes", icon: Bot, permission: { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" } },
      { label: "Configuracoes", href: "/configuracoes", icon: Settings, permission: { module: "settings", action: "manage", scope: "ALL", sensitiveArea: "technical" } },
      { label: "Site Loja", href: "/site-loja", icon: Store, permission: { module: "ads", action: "manage" } },
      { label: "Auditoria", href: "/auditoria", icon: ShieldCheck, permission: { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" } }
    ]
  }
];

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: PermissionRequirement;
  anyPermission?: PermissionRequirement[];
};

type AppShellProps = {
  active: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function AppShell({ active, children, description, eyebrow, title }: AppShellProps) {
  const { hasPermission, user, signOut } = useAuth();
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: (group.items as NavItem[]).filter((item) => {
        if (item.anyPermission) {
          return item.anyPermission.some(hasPermission);
        }
        return item.permission ? hasPermission(item.permission) : true;
      })
    }))
    .filter((group) => group.items.length > 0);

  return (
    <ProtectedShell>
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand-block">
          <img className="brand-logo" src="/logo_gt3_quadrado.svg" alt="Logo GT3" />
          <div>
            <h1>GT3 CRM</h1>
            <span>Operacao automotiva</span>
          </div>
        </div>

        <nav>
          {visibleGroups.map((group) => (
            <section className="sidebar-section" key={group.label}>
              <span className="sidebar-section-title">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <a className={active === item.label ? "active" : ""} href={item.href} key={item.label}>
                    <Icon aria-hidden="true" size={18} />
                    {item.label}
                  </a>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-status" aria-label="Status das automacoes">
          <Sparkles aria-hidden="true" size={17} />
          <div>
            <strong>24 automacoes ativas</strong>
            <span>Ultima sincronizacao ha 2 min</span>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>

          <div className="topbar-actions">
            <span className="live-pill">Dados ao vivo</span>
            <ThemeToggle />
            {user ? (
              <div className="user-chip" title={user.email}>
                <strong>{user.name}</strong>
                <span>{user.role}</span>
              </div>
            ) : null}
            <label className="search-box">
              <Search aria-hidden="true" size={17} />
              <input aria-label="Buscar no CRM" placeholder="Buscar lead, placa, cliente" />
            </label>
            <button type="button" className="icon-button" aria-label="Notificacoes">
              <Bell aria-hidden="true" size={18} />
            </button>
            <button type="button" className="text-button" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        </header>

        {children}
      </section>
    </main>
    </ProtectedShell>
  );
}
