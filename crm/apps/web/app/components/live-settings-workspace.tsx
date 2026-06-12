"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, Database, FileText, KeyRound, Plus, Settings, ShieldCheck, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type RecordStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type UserRole = "OWNER_MANAGER" | "ADMIN" | "ADMINISTRATIVE" | "SELLER" | "SDR" | "APPRAISER" | "SERVICE_MANAGER";
type LeadOutcomeStage = "WON" | "LOST" | "COLD";

type SettingSummary = {
  storeSettings: Array<{ id: string; key: string; value: unknown }>;
  taxSettings: Array<{ id: string; name: string; taxRegime: string | null; profitTaxRate: string | null }>;
  accountantSettings: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  businessHours: Array<{ id: string; weekday: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }>;
  holidays: Array<{ id: string; name: string; date: string; isRecurring: boolean }>;
  deadlines: Array<{ id: string; module: string; action: string; hours: number }>;
  categories: Array<{ id: string; domain: string; metadata?: unknown; name: string; status: RecordStatus }>;
  documentTemplates: Array<{ id: string; name: string; module: string; version: number; status: RecordStatus }>;
  messageTemplates: Array<{ id: string; name: string; channel: string; version: number; status: RecordStatus }>;
  operationalParameters: Array<{ id: string; key: string; value: unknown }>;
};

type BirthdayNotificationValue = {
  channel: string;
  daysBefore: number;
  enabled: boolean;
  responsibleUserId?: string | null;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type ModalKind = "user" | "message" | "document" | "category" | "leadOutcome" | "deadline" | "parameter" | "birthday" | "accountant" | "tax";

type FormState = {
  action: string;
  channel: string;
  content: string;
  domain: string;
  email: string;
  hours: string;
  key: string;
  leadOutcomeStage: LeadOutcomeStage;
  module: string;
  name: string;
  password: string;
  phone: string;
  responsibleUserId: string;
  role: UserRole;
  taxRate: string;
  taxRegime: string;
  value: string;
};

const emptyForm: FormState = {
  action: "first_response",
  channel: "WHATSAPP",
  content: "",
  domain: "lead_source",
  email: "",
  hours: "24",
  key: "ai.guardrails",
  leadOutcomeStage: "LOST",
  module: "leads",
  name: "",
  password: "Temp12345",
  phone: "",
  responsibleUserId: "",
  role: "SELLER",
  taxRate: "0.12",
  taxRegime: "Simples Nacional",
  value: "{}",
};

const fallbackSummary: SettingSummary = {
  accountantSettings: [],
  businessHours: [],
  categories: [],
  deadlines: [],
  documentTemplates: [],
  holidays: [],
  messageTemplates: [],
  operationalParameters: [],
  storeSettings: [],
  taxSettings: [],
};

const fallbackUsers: User[] = [
  {
    id: "fallback-user-1",
    name: "Gestor GT3",
    email: "gestor@example.com",
    role: "OWNER_MANAGER",
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const modalLabels: Record<ModalKind, string> = {
  accountant: "Contador",
  birthday: "Notificacoes de aniversario",
  category: "Categoria",
  deadline: "Prazo",
  document: "Template documento",
  leadOutcome: "Motivo de lead",
  message: "Template mensagem",
  parameter: "Parametro",
  tax: "Fiscal",
  user: "Usuario",
};

const leadOutcomeStageLabels: Record<LeadOutcomeStage, string> = {
  COLD: "Esfriou",
  LOST: "Perdido",
  WON: "Ganho",
};

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Admin",
  ADMINISTRATIVE: "Administrativo",
  APPRAISER: "Avaliador",
  OWNER_MANAGER: "Dono/Gestor",
  SDR: "SDR",
  SELLER: "Vendedor",
  SERVICE_MANAGER: "Servicos",
};

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function isBirthdayNotificationValue(value: unknown): value is BirthdayNotificationValue {
  return Boolean(value && typeof value === "object" && "daysBefore" in value && "enabled" in value);
}

function relativeDate(dateIso: string | null) {
  if (!dateIso) return "nunca";
  const days = Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 86400000));
  return days === 0 ? "hoje" : `${days} dias`;
}

export function LiveSettingsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageSettings = hasPermission({ module: "settings", action: "manage", scope: "ALL", sensitiveArea: "technical" });
  const canManageUsers = hasPermission({ module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
  const [form, setForm] = useState(emptyForm);
  const [modalKind, setModalKind] = useState<ModalKind | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [summary, setSummary] = useState(fallbackSummary);
  const [users, setUsers] = useState(fallbackUsers);

  useEffect(() => {
    if (!token) return;
    if (!canManageSettings) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    setStatus("loading");
    Promise.all([
      apiGet<SettingSummary>("/settings/summary", token),
      canManageUsers ? apiGet<ListResponse<User>>("/users?page=1&page_size=100", token) : Promise.resolve({ items: [] }),
    ])
      .then(([settingsSummary, userList]) => {
        if (!isCurrent) return;
        setSummary(settingsSummary);
        setUsers(userList.items.length > 0 ? userList.items : fallbackUsers);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canManageSettings, canManageUsers, refreshKey, token]);

  function openModal(kind: ModalKind) {
    if (kind === "birthday") {
      const existing = summary.operationalParameters.find((parameter) => parameter.key === "customer_birthday_notifications");
      const value = isBirthdayNotificationValue(existing?.value)
        ? existing.value
        : { channel: "WHATSAPP", daysBefore: 7, enabled: true, responsibleUserId: "" };
      setForm({
        ...emptyForm,
        channel: value.channel,
        hours: String(value.daysBefore),
        responsibleUserId: value.responsibleUserId ?? "",
        value: JSON.stringify({ enabled: value.enabled }, null, 2),
      });
      setSaveError(null);
      setModalKind(kind);
      return;
    }

    setForm(emptyForm);
    setSaveError(null);
    setModalKind(kind);
  }

  async function saveSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageSettings || !modalKind || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (modalKind === "user") {
        if (!canManageUsers) throw new Error("forbidden");
        await apiPost<{ data: User }>("/users", token, {
          email: form.email.trim(),
          isActive: true,
          mustChangePassword: true,
          name: form.name.trim(),
          password: form.password,
          role: form.role,
        });
      }
      if (modalKind === "message") {
        await apiPost<{ data: { id: string } }>("/settings/message-templates", token, {
          channel: form.channel.trim(),
          content: form.content.trim(),
          name: form.name.trim(),
          status: "ACTIVE",
          variables: parseJson(form.value),
        });
      }
      if (modalKind === "document") {
        await apiPost<{ data: { id: string } }>("/settings/document-templates", token, {
          content: form.content.trim(),
          module: form.module.trim(),
          name: form.name.trim(),
          snapshot: parseJson(form.value),
          status: "ACTIVE",
        });
      }
      if (modalKind === "category") {
        await apiPost<{ data: { id: string } }>("/settings/categories", token, {
          domain: form.domain.trim(),
          metadata: parseJson(form.value),
          name: form.name.trim(),
          status: "ACTIVE",
        });
      }
      if (modalKind === "leadOutcome") {
        await apiPost<{ data: { id: string } }>("/settings/categories", token, {
          domain: "lead_outcome_reason",
          metadata: { stage: form.leadOutcomeStage },
          name: form.name.trim(),
          status: "ACTIVE",
        });
      }
      if (modalKind === "deadline") {
        await apiPost<{ data: { id: string } }>("/settings/deadlines", token, {
          action: form.action.trim(),
          hours: Number(form.hours),
          module: form.module.trim(),
        });
      }
      if (modalKind === "parameter") {
        await apiPut<{ data: { id: string } }>(`/settings/operational-parameters/${encodeURIComponent(form.key.trim())}`, token, {
          snapshot: { source: "crm-web" },
          value: parseJson(form.value),
        });
      }
      if (modalKind === "birthday") {
        const metadata = parseJson(form.value);
        await apiPut<{ data: { id: string | null } }>("/settings/customer-birthday-notifications", token, {
          channel: form.channel.trim(),
          daysBefore: Number(form.hours),
          enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true,
          responsibleUserId: form.responsibleUserId || null,
        });
      }
      if (modalKind === "accountant") {
        await apiPost<{ data: { id: string } }>("/settings/accountants", token, {
          email: form.email.trim() || undefined,
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
        });
      }
      if (modalKind === "tax") {
        await apiPost<{ data: { id: string } }>("/settings/tax-settings", token, {
          name: form.name.trim(),
          profitTaxRate: Number(form.taxRate),
          taxRegime: form.taxRegime.trim() || undefined,
        });
      }

      setModalKind(null);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel salvar a configuracao. Confira campos e permissoes.");
    } finally {
      setSaving(false);
    }
  }

  const view = useMemo(() => {
    const templates = summary.documentTemplates.length + summary.messageTemplates.length;
    const critical = summary.operationalParameters.length + summary.deadlines.length + summary.taxSettings.length;
    return {
      metrics: [
        { detail: "perfis operacionais", label: "Usuarios", tone: "teal", value: String(users.length) },
        { detail: "dono, adm, vendedor etc.", label: "Perfis RBAC", tone: "blue", value: String(new Set(users.map((user) => user.role)).size) },
        { detail: "mensagens e documentos", label: "Templates", tone: "amber", value: String(templates) },
        { detail: "exigem gestor", label: "Ajustes criticos", tone: "rose", value: String(critical) },
      ],
    };
  }, [summary, users]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];
  const birthdayParameter = summary.operationalParameters.find((parameter) => parameter.key === "customer_birthday_notifications");
  const birthdayValue = isBirthdayNotificationValue(birthdayParameter?.value) ? birthdayParameter.value : null;
  const birthdayResponsible = users.find((user) => user.id === birthdayValue?.responsibleUserId);
  const leadOutcomeReasons = summary.categories.filter((category) => category.domain === "lead_outcome_reason");

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de configuracoes">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Acoes de configuracao">
        <div>
          <button className="active" type="button">Todos</button>
          <button type="button">Usuarios</button>
          <button type="button">Templates</button>
          <button type="button">Fiscal</button>
          <button type="button">Parametros</button>
        </div>
        <button className="primary-action" disabled={!canManageUsers} onClick={() => openModal("user")} type="button"><Plus aria-hidden="true" size={17} />Usuario</button>
        <button className="text-button" disabled={!canManageSettings} onClick={() => openModal("message")} type="button">Template msg</button>
        <button className="text-button" disabled={!canManageSettings} onClick={() => openModal("leadOutcome")} type="button">Motivo lead</button>
        <button className="text-button" disabled={!canManageSettings} onClick={() => openModal("birthday")} type="button">Aniversarios</button>
        <button className="text-button" disabled={!canManageSettings} onClick={() => openModal("parameter")} type="button">Parametro</button>
      </section>

      {modalKind ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label={modalLabels[modalKind]}>
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Configuracoes</p><h3>{modalLabels[modalKind]}</h3></div>
              <button aria-label="Fechar configuracao" className="icon-button" onClick={() => setModalKind(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={saveSetting}>
              {modalKind === "user" ? (
                <>
                  <label>Nome<input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Email<input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Perfil<select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}>{(Object.keys(roleLabels) as UserRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
                  <label>Senha temporaria<input minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "message" ? (
                <>
                  <label>Nome<input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Canal<input required value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))} /></label>
                  <label className="lead-modal-wide">Conteudo<textarea required minLength={2} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} /></label>
                  <label className="lead-modal-wide">Variaveis JSON<textarea value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "document" ? (
                <>
                  <label>Nome<input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Modulo<input required value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))} /></label>
                  <label className="lead-modal-wide">Conteudo<textarea required minLength={2} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "category" ? (
                <>
                  <label>Dominio<input autoFocus required value={form.domain} onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))} /></label>
                  <label>Nome<input required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label className="lead-modal-wide">Metadata JSON<textarea value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "leadOutcome" ? (
                <>
                  <label>Etapa<select autoFocus value={form.leadOutcomeStage} onChange={(event) => setForm((current) => ({ ...current, leadOutcomeStage: event.target.value as LeadOutcomeStage }))}>{(Object.keys(leadOutcomeStageLabels) as LeadOutcomeStage[]).map((stage) => <option key={stage} value={stage}>{leadOutcomeStageLabels[stage]}</option>)}</select></label>
                  <label>Motivo<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Cliente comprou em outra loja" /></label>
                  <div className="lead-modal-wide lead-outcome-summary">
                    <strong>Configuracao comercial</strong>
                    <span>O motivo sera usado no modal de desfecho do funil e gravado em auditoria quando selecionado.</span>
                  </div>
                </>
              ) : null}
              {modalKind === "deadline" ? (
                <>
                  <label>Modulo<input autoFocus required value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))} /></label>
                  <label>Acao<input required value={form.action} onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))} /></label>
                  <label>Horas<input min="1" required type="number" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "parameter" ? (
                <>
                  <label className="lead-modal-wide">Chave<input autoFocus required minLength={2} value={form.key} onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))} /></label>
                  <label className="lead-modal-wide">Valor JSON<textarea value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "birthday" ? (
                <>
                  <label className="lead-modal-wide">Responsavel<select autoFocus value={form.responsibleUserId} onChange={(event) => setForm((current) => ({ ...current, responsibleUserId: event.target.value }))}><option value="">Sem responsavel fixo</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} | {roleLabels[user.role]}</option>)}</select></label>
                  <label>Antecedencia dias<input min="0" max="31" required type="number" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} /></label>
                  <label>Canal<input required value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))} /></label>
                  <label className="lead-modal-wide">Opcoes JSON<textarea value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "accountant" ? (
                <>
                  <label>Nome<input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Email<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Telefone<input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                </>
              ) : null}
              {modalKind === "tax" ? (
                <>
                  <label>Nome<input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Regime<input value={form.taxRegime} onChange={(event) => setForm((current) => ({ ...current, taxRegime: event.target.value }))} /></label>
                  <label>Aliquota lucro<input min="0" max="1" step="0.01" type="number" value={form.taxRate} onChange={(event) => setForm((current) => ({ ...current, taxRate: event.target.value }))} /></label>
                </>
              ) : null}
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalKind(null)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="panel module-kanban-panel">
        <div className="section-heading"><div><p className="eyebrow">Governanca</p><h3>Areas configuraveis</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="module-kanban">
          {[
            { title: "Usuarios", total: users.length, cards: users.slice(0, 3).map((user) => user.name) },
            { title: "Templates", total: summary.documentTemplates.length + summary.messageTemplates.length, cards: [...summary.messageTemplates, ...summary.documentTemplates].slice(0, 3).map((item) => item.name) },
            { title: "Categorias", total: summary.categories.length, cards: summary.categories.slice(0, 3).map((item) => item.name) },
            { title: "Prazos", total: summary.deadlines.length, cards: summary.deadlines.slice(0, 3).map((item) => `${item.module}:${item.action}`) },
            { title: "Fiscal", total: summary.taxSettings.length, cards: summary.taxSettings.slice(0, 3).map((item) => item.name) },
            { title: "Parametros", total: summary.operationalParameters.length, cards: summary.operationalParameters.slice(0, 3).map((item) => item.key) },
          ].map((column) => (
            <section className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.map((card, index) => <article className="module-kanban-card" key={`${column.title}-${index}-${card}`}><strong>{card}</strong><span>configuracao auditavel</span><em>ativo</em></article>)}
              {column.cards.length === 0 ? <article className="module-kanban-card"><strong>Sem itens</strong><span>Nenhuma configuracao nesta area</span><em>0</em></article> : null}
            </section>
          ))}
        </div>
      </section>

      <section className="blueprint-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Usuarios</p><h3>Perfis e seguranca</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="blueprint-list">
            {users.map((user) => (
              <article className="blueprint-row" key={user.id}>
                <div className="blueprint-main"><UsersRound aria-hidden="true" /><div><strong>{user.name}</strong><span>{user.email} | {roleLabels[user.role]}</span></div></div>
                <div className="blueprint-tags"><span>{user.isActive ? "ativo" : "inativo"}</span><span>{user.mustChangePassword ? "trocar senha" : "senha ok"}</span></div>
                <div className="blueprint-value"><strong>{relativeDate(user.lastLoginAt)}</strong><span>ultimo login</span></div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading"><div><p className="eyebrow">Administracao</p><h3>Acoes rapidas</h3></div><Settings aria-hidden="true" size={20} /></div>
          <div className="stock-actions">
            <button disabled={!canManageSettings} onClick={() => openModal("document")} type="button"><FileText aria-hidden="true" size={17} />Template doc</button>
            <button disabled={!canManageSettings} onClick={() => openModal("birthday")} type="button"><UsersRound aria-hidden="true" size={17} />Aniversarios</button>
            <button disabled={!canManageSettings} onClick={() => openModal("leadOutcome")} type="button"><SlidersHorizontal aria-hidden="true" size={17} />Motivo lead</button>
            <button disabled={!canManageSettings} onClick={() => openModal("category")} type="button"><SlidersHorizontal aria-hidden="true" size={17} />Categoria</button>
            <button disabled={!canManageSettings} onClick={() => openModal("deadline")} type="button"><KeyRound aria-hidden="true" size={17} />Prazo</button>
            <button disabled={!canManageSettings} onClick={() => openModal("accountant")} type="button"><Database aria-hidden="true" size={17} />Contador</button>
            <button disabled={!canManageSettings} onClick={() => openModal("tax")} type="button"><ShieldCheck aria-hidden="true" size={17} />Fiscal</button>
          </div>
          <ul className="blueprint-side-list">
            <li><UsersRound aria-hidden="true" size={18} /><div><strong>Aniversarios</strong><span>{birthdayValue?.enabled === false ? "Notificacoes pausadas" : `Responsavel: ${birthdayResponsible?.name ?? "nao definido"} | ${birthdayValue?.daysBefore ?? 7} dia(s) antes`}</span></div></li>
            <li><SlidersHorizontal aria-hidden="true" size={18} /><div><strong>Motivos de lead</strong><span>{leadOutcomeReasons.length > 0 ? `${leadOutcomeReasons.length} motivo(s) configurado(s)` : "usando motivos padrao do sistema"}</span></div></li>
            <li><ShieldCheck aria-hidden="true" size={18} /><div><strong>RBAC real</strong><span>Usuarios e ajustes tecnicos exigem permissao sensivel.</span></div></li>
            <li><SlidersHorizontal aria-hidden="true" size={18} /><div><strong>Configuravel</strong><span>Templates, prazos e categorias saem do hardcode.</span></div></li>
            <li><Bot aria-hidden="true" size={18} /><div><strong>Integracoes</strong><span>Parametros operacionais guardam toggles e guardrails.</span></div></li>
          </ul>
        </aside>
      </section>
    </>
  );
}
