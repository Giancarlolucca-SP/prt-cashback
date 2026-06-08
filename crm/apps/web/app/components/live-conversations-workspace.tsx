"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, CheckCircle2, MessageCircle, Plus, Send, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { apiGet, apiPost } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type Thread = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  channelId: string | null;
  subject: string | null;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Channel = {
  id: string;
  type: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  threadId: string;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  sender: string | null;
  recipient: string | null;
  body: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};

type ThreadDetail = {
  data: Thread;
  messages: Message[];
  emails: Array<{ id: string; subject: string | null; body: string | null; createdAt: string }>;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
};

type ThreadFormState = {
  channelId: string;
  channelName: string;
  channelType: string;
  subject: string;
};

const emptyThreadForm: ThreadFormState = {
  channelId: "",
  channelName: "WhatsApp loja",
  channelType: "WHATSAPP",
  subject: "",
};

const fallbackThreads: Thread[] = [
  {
    id: "fallback-1",
    customerId: null,
    leadId: null,
    channelId: null,
    subject: "Corolla XEI 2021",
    status: "OPEN",
    lastMessageAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackMessages: Message[] = [
  {
    id: "fallback-message-1",
    threadId: "fallback-1",
    direction: "INBOUND",
    sender: "Cliente",
    recipient: "GT3",
    body: "Bom dia, ainda tem o Corolla XEI branco?",
    sentAt: null,
    receivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "fallback-message-2",
    threadId: "fallback-1",
    direction: "OUTBOUND",
    sender: "GT3",
    recipient: "Cliente",
    body: "Temos sim. Posso confirmar disponibilidade e simular uma visita?",
    sentAt: new Date().toISOString(),
    receivedAt: null,
    createdAt: new Date().toISOString(),
  },
];

const filters: Array<{ label: string; status?: string }> = [
  { label: "Todos" },
  { label: "Abertas", status: "OPEN" },
  { label: "IA ativa", status: "AI_ACTIVE" },
  { label: "Humano", status: "HUMAN_TAKEOVER" },
  { label: "Follow-up", status: "FOLLOW_UP" },
  { label: "Encerradas", status: "CLOSED" },
];

function relativeDate(dateIso: string | null) {
  if (!dateIso) return "sem mensagens";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function channelLabel(thread: Thread, channels: Channel[]) {
  const channel = channels.find((item) => item.id === thread.channelId);
  return channel ? `${channel.type} | ${channel.name}` : "Canal nao vinculado";
}

export function LiveConversationsWorkspace() {
  const { hasPermission, token } = useAuth();
  const canManageCommunications = hasPermission({ module: "communications", action: "manage" });
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form, setForm] = useState(emptyThreadForm);
  const [messageBody, setMessageBody] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(fallbackMessages);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(fallbackThreads[0].id);
  const [status, setStatus] = useState<"fallback" | "loading" | "live" | "error" | "locked">("fallback");
  const [threads, setThreads] = useState(fallbackThreads);

  useEffect(() => {
    if (!token) return;
    if (!canManageCommunications) {
      setStatus("locked");
      return;
    }

    let isCurrent = true;
    const query = new URLSearchParams({ page: "1", page_size: "50" });
    if (activeFilter.status) query.set("status", activeFilter.status);

    setStatus("loading");
    Promise.all([
      apiGet<ListResponse<Thread>>(`/communications/threads?${query.toString()}`, token),
      apiGet<ListResponse<Channel>>("/communications/channels?page=1&page_size=100", token),
    ])
      .then(([threadList, channelList]) => {
        if (!isCurrent) return;
        setThreads(threadList.items);
        setChannels(channelList.items);
        setSelectedId((current) => threadList.items.find((thread) => thread.id === current)?.id ?? threadList.items[0]?.id ?? current);
        setStatus("live");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeFilter, canManageCommunications, refreshKey, token]);

  useEffect(() => {
    if (!token || !canManageCommunications || !selectedId || selectedId.startsWith("fallback")) return;

    let isCurrent = true;
    apiGet<ThreadDetail>(`/communications/threads/${selectedId}`, token)
      .then((detail) => {
        if (!isCurrent) return;
        setMessages(detail.messages);
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [canManageCommunications, selectedId, token]);

  async function createThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageCommunications || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      let channelId = form.channelId;
      if (!channelId) {
        const channel = await apiPost<{ data: Channel }>("/communications/channels", token, {
          name: form.channelName.trim(),
          status: "ACTIVE",
          type: form.channelType.trim(),
        });
        channelId = channel.data.id;
        setChannels((current) => [channel.data, ...current.filter((item) => item.id !== channel.data.id)]);
      }

      const response = await apiPost<{ data: Thread }>("/communications/threads", token, {
        channelId,
        status: "OPEN",
        subject: form.subject.trim() || undefined,
      });
      setThreads((current) => [response.data, ...current.filter((thread) => thread.id !== response.data.id)]);
      setSelectedId(response.data.id);
      setForm(emptyThreadForm);
      setModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel criar a conversa.");
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageCommunications || saving || !selectedId || selectedId.startsWith("fallback")) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiPost<{ data: Message }>(`/communications/threads/${selectedId}/messages`, token, {
        body: messageBody.trim(),
        direction: "OUTBOUND",
        sender: "GT3",
        sentAt: new Date().toISOString(),
      });
      setMessages((current) => [...current, response.data]);
      setMessageBody("");
      setRefreshKey((current) => current + 1);
    } catch {
      setSaveError("Nao foi possivel enviar a mensagem.");
    } finally {
      setSaving(false);
    }
  }

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? threads[0] ?? fallbackThreads[0];
  const visibleMessages = selectedThread.id.startsWith("fallback") ? fallbackMessages : messages;
  const view = useMemo(() => {
    const open = threads.filter((thread) => thread.status === "OPEN").length;
    const ai = threads.filter((thread) => thread.status === "AI_ACTIVE").length;
    const takeover = threads.filter((thread) => thread.status === "HUMAN_TAKEOVER").length;
    const late = threads.filter((thread) => {
      if (!thread.lastMessageAt) return false;
      return Date.now() - new Date(thread.lastMessageAt).getTime() > 60 * 60 * 1000;
    }).length;

    return {
      board: filters.slice(1).map((filter) => ({
        cards: threads.filter((thread) => thread.status === filter.status).slice(0, 3),
        title: filter.label,
        total: threads.filter((thread) => thread.status === filter.status).length,
      })),
      metrics: [
        { detail: "canais integrados", label: "Conversas abertas", tone: "teal", value: String(open) },
        { detail: "resposta automatica", label: "Com IA", tone: "blue", value: String(ai) },
        { detail: "precisam humano", label: "SLA estourado", tone: "amber", value: String(late) },
        { detail: "vendedor assumiu", label: "Takeover", tone: "rose", value: String(takeover) },
      ],
    };
  }, [threads]);

  const statusLabel = {
    error: "Usando fallback",
    fallback: "Fallback visual",
    live: "Dados reais",
    loading: "Sincronizando",
    locked: "Sem permissao",
  }[status];

  return (
    <>
      <section className="metric-grid" aria-label="Indicadores de conversas">
        {view.metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.detail}</span></div>
            <span className="metric-trend">ativo</span>
          </article>
        ))}
      </section>

      <section className="leads-toolbar panel">
        <div>
          {filters.map((filter) => (
            <button className={filter.label === activeFilter.label ? "active" : ""} key={filter.label} onClick={() => setActiveFilter(filter)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!canManageCommunications} onClick={() => { setSaveError(null); setModalOpen(true); }} type="button">
          <Plus aria-hidden="true" size={16} />
          Nova conversa
        </button>
      </section>

      {modalOpen ? (
        <div className="dre-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova conversa">
          <section className="dre-modal lead-modal">
            <header className="dre-modal-header">
              <div><p className="eyebrow">Omnichannel</p><h3>Nova conversa</h3></div>
              <button aria-label="Fechar conversa" className="icon-button" onClick={() => setModalOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </header>
            <form className="lead-modal-form" onSubmit={createThread}>
              <label className="lead-modal-wide">
                Canal existente
                <select onChange={(event) => setForm((current) => ({ ...current, channelId: event.target.value }))} value={form.channelId}>
                  <option value="">Criar canal rapido</option>
                  {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.type} | {channel.name}</option>)}
                </select>
              </label>
              {!form.channelId ? (
                <>
                  <label>Tipo<input required value={form.channelType} onChange={(event) => setForm((current) => ({ ...current, channelType: event.target.value }))} /></label>
                  <label>Nome do canal<input required value={form.channelName} onChange={(event) => setForm((current) => ({ ...current, channelName: event.target.value }))} /></label>
                </>
              ) : null}
              <label className="lead-modal-wide">Assunto<input maxLength={180} value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></label>
              {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
              <div className="lead-modal-actions">
                <button className="text-button" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={saving} type="submit">{saving ? "Criando..." : "Criar conversa"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="module-kanban-panel panel">
        <div className="section-heading"><div><p className="eyebrow">Fluxo</p><h3>Kanban operacional</h3></div><span className="live-pill">{statusLabel}</span></div>
        <div className="module-kanban">
          {view.board.map((column) => (
            <article className="module-kanban-column" key={column.title}>
              <header><strong>{column.title}</strong><span>{column.total}</span></header>
              {column.cards.map((thread) => <div className="module-kanban-card" key={thread.id}><strong>{thread.subject || `Conversa ${thread.id.slice(0, 8)}`}</strong><span>{channelLabel(thread, channels)}</span><em>{relativeDate(thread.lastMessageAt)}</em></div>)}
              {column.cards.length === 0 ? <div className="module-kanban-card"><strong>Sem cards</strong><span>Nenhuma conversa nesta etapa</span><em>0</em></div> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="conversation-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Clique para visualizar</p><h3>Conversas disponiveis ao administrador</h3></div></div>
          <div className="conversation-list">
            {threads.map((thread) => (
              <button className={`conversation-row ${thread.id === selectedThread.id ? "active" : ""}`} key={thread.id} onClick={() => setSelectedId(thread.id)} type="button">
                <span className="conversation-icon"><MessageCircle aria-hidden="true" size={18} /></span>
                <span><strong>{thread.subject || `Conversa ${thread.id.slice(0, 8)}`}</strong><em>{channelLabel(thread, channels)}</em></span>
                <span><strong>{thread.status}</strong><em>{relativeDate(thread.lastMessageAt)}</em></span>
              </button>
            ))}
          </div>
        </article>

        <aside className="panel conversation-thread">
          <div className="section-heading"><div><p className="eyebrow">{channelLabel(selectedThread, channels)}</p><h3>{selectedThread.subject || `Conversa ${selectedThread.id.slice(0, 8)}`}</h3></div><span className="live-pill">{statusLabel}</span></div>
          <div className="conversation-summary"><strong>Status {selectedThread.status}</strong><span>Thread vinculada a cliente, lead ou canal quando informado. Ultima mensagem: {relativeDate(selectedThread.lastMessageAt)}.</span></div>
          <div className="thread-messages">
            {visibleMessages.map((message) => (
              <div className={message.direction === "INBOUND" ? "message customer" : "message system"} key={message.id}>
                <strong>{message.sender || (message.direction === "INBOUND" ? "Cliente" : "GT3")}</strong>
                <p>{message.body || "Mensagem sem corpo"}</p>
                <span>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
          <form className="conversation-controls" onSubmit={sendMessage}>
            <input aria-label="Mensagem" disabled={selectedThread.id.startsWith("fallback")} onChange={(event) => setMessageBody(event.target.value)} placeholder="Escrever mensagem" value={messageBody} />
            <button disabled={saving || selectedThread.id.startsWith("fallback") || messageBody.trim().length < 1} type="submit"><Send aria-hidden="true" size={16} />Enviar</button>
            <button type="button"><UserRoundCheck aria-hidden="true" size={16} />Assumir</button>
            <button type="button"><CheckCircle2 aria-hidden="true" size={16} />Criar tarefa</button>
            <button type="button"><ShieldCheck aria-hidden="true" size={16} />Ver log</button>
          </form>
          {saveError ? <p className="lead-modal-error">{saveError}</p> : null}
          <div className="automation-status"><Bot aria-hidden="true" size={18} /><span>Administrador pode abrir qualquer conversa permitida pelo RBAC; vendedor ve apenas carteira autorizada.</span></div>
        </aside>
      </section>
    </>
  );
}
