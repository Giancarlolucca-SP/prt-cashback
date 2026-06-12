"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CarFront,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  Plus,
  UserRoundCheck,
  X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "DONE" | "CANCELLED" | "NO_SHOW";

type Appointment = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  vehicleId: string | null;
  assignedUserId: string | null;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type LeadFollowUp = {
  id: string;
  leadId: string | null;
  type: string;
  dueAt: string;
  completedAt: string | null;
  notes: string | null;
  lead: {
    id: string;
    interest: string | null;
    source: string | null;
    status: string;
    title: string;
  } | null;
};

type AppointmentFormState = {
  endsAt: string;
  notes: string;
  startsAt: string;
  title: string;
  type: string;
};

const emptyForm: AppointmentFormState = {
  endsAt: "",
  notes: "",
  startsAt: "",
  title: "",
  type: "Visita loja",
};

const fallbackAppointments: Appointment[] = [
  {
    id: "fallback-1",
    customerId: null,
    leadId: null,
    vehicleId: null,
    assignedUserId: null,
    type: "Visita loja",
    title: "Marina Souza",
    startsAt: new Date().toISOString(),
    endsAt: null,
    status: "CONFIRMED",
    notes: "Lead | Corolla XEI 2021",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    customerId: null,
    leadId: null,
    vehicleId: null,
    assignedUserId: null,
    type: "Avaliacao",
    title: "Paulo Lima",
    startsAt: new Date(Date.now() + 45 * 60000).toISOString(),
    endsAt: null,
    status: "SCHEDULED",
    notes: "Troca | Onix LTZ 2019",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackFollowUps: LeadFollowUp[] = [];

const filters: Array<{ label: string; status?: AppointmentStatus }> = [
  { label: "Todos" },
  { label: "Agendados", status: "SCHEDULED" },
  { label: "Confirmados", status: "CONFIRMED" },
  { label: "Concluidos", status: "DONE" },
  { label: "No-show", status: "NO_SHOW" },
  { label: "Cancelados", status: "CANCELLED" },
];

const statusLabels: Record<AppointmentStatus, string> = {
  CANCELLED: "Cancelado",
  CONFIRMED: "Confirmado",
  DONE: "Concluido",
  NO_SHOW: "Nao compareceu",
  SCHEDULED: "Agendado",
};

function todayRange() {
  const from = new Date();
  const to = new Date();
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function timeLabel(dateIso: string) {
  return new Date(dateIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function toneForStatus(status: AppointmentStatus) {
  if (status === "CONFIRMED" || status === "DONE") return "confirmed";
  if (status === "SCHEDULED") return "warning";
  return "risk";
}

export function LiveAppointmentsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageAppointments = hasPermission({ module: "appointments", action: "manage" });
  const canReadLeads = hasPermission({ module: "leads", action: "read" });
  const canUpdateLeads = hasPermission({ module: "leads", action: "update" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [appointments, setAppointments] = useState(fallbackAppointments);
  const [followUps, setFollowUps] = useState(fallbackFollowUps);
  const [form, setForm] = useState<AppointmentFormState>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");

  useEffect(() => {
    if (!token) return;
    if (!canManageAppointments) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const range = todayRange();
    const query = new URLSearchParams({
      from: range.from.toISOString(),
      page: "1",
      page_size: "50",
      to: range.to.toISOString(),
    });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    Promise.all([
      apiGet<ListResponse<Appointment>>(`/appointments?${query.toString()}`, token),
      canReadLeads ? apiGet<ListResponse<LeadFollowUp>>(`/leads/follow-ups?${query.toString()}`, token) : Promise.resolve({ items: fallbackFollowUps, page: 1, pageSize: 50 }),
    ])
      .then(([list, followUpList]) => {
        if (!isCurrent) return;
        setAppointments(list.items);
        setFollowUps(followUpList.items);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageAppointments, canReadLeads, refreshKey, token]);

  function openCreateModal() {
    const start = new Date(Date.now() + 60 * 60000);
    const end = new Date(start.getTime() + 60 * 60000);
    setForm({ ...emptyForm, endsAt: toDateTimeLocal(end), startsAt: toDateTimeLocal(start) });
    setSaveError(null);
    setModalOpen(true);
  }

  async function handleCreateAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageAppointments || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Appointment }>("/appointments", token, {
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        notes: form.notes.trim() || undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        title: form.title.trim(),
        type: form.type.trim(),
      });

      setAppointments((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setModalOpen(false);
      setForm(emptyForm);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar o agendamento. Confira titulo, tipo e horarios.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(appointment: Appointment, nextStatus: AppointmentStatus) {
    if (!token || !canManageAppointments || movingId || appointment.status === nextStatus) return;

    const previous = appointment;
    setMovingId(appointment.id);
    setAppointments((current) => current.map((item) => (item.id === appointment.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item)));

    try {
      const response = await apiPost<{ data: Appointment }>(`/appointments/${appointment.id}/status`, token, {
        reason: "Atualizado pela agenda operacional",
        status: nextStatus,
      });
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? response.data : item)));
      setRefreshKey((current) => current + 1);
    } catch {
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? previous : item)));
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function shiftAppointment(appointment: Appointment, minutes: number) {
    if (!token || !canManageAppointments || movingId) return;

    const startsAt = new Date(new Date(appointment.startsAt).getTime() + minutes * 60000);
    const endsAt = appointment.endsAt ? new Date(new Date(appointment.endsAt).getTime() + minutes * 60000) : undefined;
    setMovingId(appointment.id);

    try {
      const response = await apiPatch<{ data: Appointment }>(`/appointments/${appointment.id}`, token, {
        endsAt: endsAt?.toISOString(),
        startsAt: startsAt.toISOString(),
      });
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? response.data : item)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  async function completeFollowUp(followUp: LeadFollowUp) {
    if (!token || !canUpdateLeads || movingId) return;

    setMovingId(followUp.id);
    try {
      const response = await apiPost<{ data: LeadFollowUp }>(`/leads/follow-ups/${followUp.id}/complete`, token, {});
      setFollowUps((current) => current.filter((item) => item.id !== response.data.id));
      setRefreshKey((current) => current + 1);
    } catch {
      setStatus("error");
    } finally {
      setMovingId(null);
    }
  }

  const view = useMemo(() => {
    const confirmed = appointments.filter((item) => item.status === "CONFIRMED").length;
    const scheduled = appointments.filter((item) => item.status === "SCHEDULED").length;
    const conflicts = appointments.length - new Set(appointments.map((item) => `${item.startsAt}-${item.assignedUserId ?? "sem-responsavel"}`)).size;

    return {
      metrics: [
        { label: "Hoje", value: String(appointments.length), detail: "visitas, avaliacoes e entregas", tone: "teal" },
        { label: "Follow-ups", value: String(followUps.length), detail: "contatos comerciais do dia", tone: "teal" },
        { label: "Confirmados", value: String(confirmed), detail: "com status confirmado", tone: "blue" },
        { label: "Reagendar", value: String(scheduled), detail: "aguardam confirmacao", tone: "amber" },
        { label: "Conflitos", value: String(conflicts), detail: "mesmo horario ou responsavel", tone: "rose" },
      ],
      reminders: appointments.slice(0, 4).map((item) => ({
        icon: item.status === "CONFIRMED" ? CheckCircle2 : item.status === "SCHEDULED" ? MessageCircle : AlertTriangle,
        label: item.status === "SCHEDULED" ? "Confirmar agendamento" : "Acompanhar agenda",
        target: `${item.title} | ${timeLabel(item.startsAt)}`,
      })),
    };
  }, [appointments, followUps.length]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de agendamentos">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel" aria-label="Filtros de agendamentos">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageAppointments} onClick={openCreateModal} type="button">
          <Plus aria-hidden="true" size={17} />
          Novo agendamento
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo agendamento">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div>
                <p className="eyebrow">Agenda operacional</p>
                <h3>Novo agendamento</h3>
              </div>
              <button aria-label="Fechar novo agendamento" className="icon-button" onClick={() => setModalOpen(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="lead-modal-form" onSubmit={handleCreateAppointment}>
              <label>
                Titulo
                <input autoFocus maxLength={180} minLength={2} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required value={form.title} />
              </label>
              <label>
                Tipo
                <select onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} value={form.type}>
                  <option>Visita loja</option>
                  <option>Avaliacao</option>
                  <option>Vistoria</option>
                  <option>Entrega tecnica</option>
                  <option>Retorno comercial</option>
                </select>
              </label>
              <label>
                Inicio
                <input onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} required type="datetime-local" value={form.startsAt} />
              </label>
              <label>
                Fim
                <input onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} type="datetime-local" value={form.endsAt} />
              </label>
              <label className="lead-modal-wide">
                Observacoes
                <input maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Origem, veiculo, local ou instrucao" value={form.notes} />
              </label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">
                  Cancelar
                </button>
                <button className="primary-action" disabled={saving || form.title.trim().length < 2 || !form.startsAt} type="submit">
                  {saving ? "Salvando..." : "Criar agendamento"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="schedule-grid">
        <section className="panel schedule-board" aria-label="Agenda do dia">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Hoje</p>
              <h3>Linha do tempo operacional</h3>
            </div>
            <span className="live-pill">{statusLabel}</span>
          </div>

          <div className="appointment-list">
            {appointments.map((appointment) => (
              <article className={`appointment-card ${toneForStatus(appointment.status)}`} key={appointment.id}>
                <div className="appointment-time">
                  <Clock3 aria-hidden="true" size={18} />
                  <strong>{timeLabel(appointment.startsAt)}</strong>
                </div>
                <div className="appointment-main">
                  <span>{appointment.type}</span>
                  <strong>{appointment.title}</strong>
                  <em>{appointment.notes ?? "Sem observacoes"}</em>
                </div>
                <div className="appointment-tags">
                  <span>{appointment.assignedUserId ? "Responsavel vinculado" : "Responsavel atual"}</span>
                  <select
                    className="kanban-stage-select"
                    disabled={!canManageAppointments || movingId === appointment.id}
                    onChange={(event) => void handleStatusChange(appointment, event.target.value as AppointmentStatus)}
                    value={appointment.status}
                  >
                    {(Object.keys(statusLabels) as AppointmentStatus[]).map((item) => (
                      <option key={item} value={item}>
                        {statusLabels[item]}
                      </option>
                    ))}
                  </select>
                  <span>
                    <MapPin aria-hidden="true" size={13} />
                    Loja GT3
                  </span>
                  <button disabled={!canManageAppointments || movingId === appointment.id} onClick={() => void shiftAppointment(appointment, 30)} type="button">
                    +30 min
                  </button>
                </div>
              </article>
            ))}
            {appointments.length === 0 ? (
              <article className="appointment-card">
                <div className="appointment-time">
                  <Clock3 aria-hidden="true" size={18} />
                  <strong>--:--</strong>
                </div>
                <div className="appointment-main">
                  <span>Agenda</span>
                  <strong>Nenhum agendamento formal hoje</strong>
                  <em>Use o botao Novo agendamento para criar visita, avaliacao ou entrega.</em>
                </div>
              </article>
            ) : null}
          </div>
        </section>

        <aside className="panel schedule-side" aria-label="Lembretes e conflitos">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Automacoes</p>
              <h3>Lembretes e conflitos</h3>
            </div>
            <CalendarCheck aria-hidden="true" size={20} />
          </div>

          <ul className="schedule-task-list">
            {view.reminders.map((item) => {
              const Icon = item.icon;
              return (
                <li key={`${item.label}-${item.target}`}>
                  <Icon aria-hidden="true" size={18} />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.target}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="stock-actions">
            <button type="button">
              <MessageCircle aria-hidden="true" size={17} />
              Enviar lembretes
            </button>
            <button type="button">
              <CalendarClock aria-hidden="true" size={17} />
              Reagendar pendentes
            </button>
            <button type="button">
              <CarFront aria-hidden="true" size={17} />
              Vincular veiculo
            </button>
          </div>

          <div className="automation-status warning">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Agendamentos devem sempre vincular lead, veiculo, venda ou OS quando existir origem.</span>
          </div>
        </aside>

        <section className="panel schedule-board commercial-agenda" aria-label="Agenda comercial de follow-ups">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Agenda comercial</p>
              <h3>Follow-ups de leads hoje</h3>
            </div>
            <span className="live-pill">{followUps.length}</span>
          </div>

          <div className="appointment-list">
            {followUps.map((followUp) => (
              <article className="appointment-card warning" key={followUp.id}>
                <div className="appointment-time">
                  <MessageCircle aria-hidden="true" size={18} />
                  <strong>{timeLabel(followUp.dueAt)}</strong>
                </div>
                <div className="appointment-main">
                  <span>{followUp.type}</span>
                  <strong>{followUp.lead?.title ?? "Lead sem titulo"}</strong>
                  <em>{followUp.lead?.interest ?? followUp.notes ?? "Sem observacoes"}</em>
                </div>
                <div className="appointment-tags">
                  <span>{followUp.lead?.source ?? "Origem nao informada"}</span>
                  <button disabled={!canUpdateLeads || movingId === followUp.id} onClick={() => void completeFollowUp(followUp)} type="button">
                    {movingId === followUp.id ? "Salvando..." : "Concluir"}
                  </button>
                </div>
              </article>
            ))}
            {followUps.length === 0 ? (
              <article className="appointment-card confirmed">
                <div className="appointment-time">
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <strong>ok</strong>
                </div>
                <div className="appointment-main">
                  <span>Follow-ups</span>
                  <strong>Sem contatos pendentes hoje</strong>
                  <em>A fila comercial leve esta limpa para o periodo.</em>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      </section>
    </>
  );
}
