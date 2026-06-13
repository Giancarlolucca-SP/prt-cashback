"use client";

import { useEffect, useMemo, useState } from "react";
import { History, RefreshCcw, Settings2, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { apiDelete, apiGet } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";

type UserPreference = {
  key: string;
  value: unknown;
  updatedAt: string;
};

type UserPreferencesResponse = {
  items: UserPreference[];
  page: number;
  pageSize: number;
  total: number;
};

const preferenceLabels: Record<string, { title: string; detail: string }> = {
  customer_history_timeline: {
    title: "Timeline do cliente",
    detail: "Filtro e busca usados no historico comercial do cliente.",
  },
};

function preferenceTitle(key: string) {
  return preferenceLabels[key]?.title ?? key;
}

function preferenceDetail(preference: UserPreference) {
  const knownDetail = preferenceLabels[preference.key]?.detail;
  if (knownDetail) {
    return knownDetail;
  }

  return "Preferencia pessoal salva pela interface.";
}

function preferenceValueLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Valor salvo";
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => typeof entryValue === "string" && entryValue.trim())
    .map(([key, entryValue]) => `${key}: ${String(entryValue).slice(0, 80)}`);

  return entries.length ? entries.join(" | ") : "Valor salvo";
}

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function LiveProfileWorkspace() {
  const { token, user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const metrics = useMemo(
    () => [
      { label: "Usuario", value: user?.name ?? "Sessao", detail: user?.email ?? "Conta autenticada", tone: "blue" },
      { label: "Loja", value: user?.storeName ?? "GT3", detail: "Escopo da sessao atual", tone: "amber" },
      { label: "Preferencias", value: String(preferences.length), detail: "Ajustes pessoais salvos", tone: "rose" },
    ],
    [preferences.length, user],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let isCurrent = true;
    setStatus("loading");

    apiGet<UserPreferencesResponse>("/auth/preferences", token)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        setPreferences(response.items);
        setStatus("loaded");
      })
      .catch(() => {
        if (isCurrent) {
          setStatus("error");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [refreshKey, token]);

  async function clearPreference(key: string) {
    if (!token || removingKey) {
      return;
    }

    setRemovingKey(key);
    try {
      await apiDelete("/auth/preferences/" + encodeURIComponent(key), token);
      setPreferences((current) => current.filter((preference) => preference.key !== key));
    } finally {
      setRemovingKey(null);
    }
  }

  return (
    <>
      <section className="metric-grid" aria-label="Resumo do perfil">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="profile-grid">
        <article className="panel profile-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sessao</p>
              <h3>Dados da conta</h3>
            </div>
            <UserRound aria-hidden="true" size={20} />
          </div>
          <ul className="profile-detail-list">
            <li><strong>Nome</strong><span>{user?.name ?? "Usuario autenticado"}</span></li>
            <li><strong>E-mail</strong><span>{user?.email ?? "Nao informado"}</span></li>
            <li><strong>Perfil</strong><span>{user?.role ?? "Sessao"}</span></li>
            <li><strong>Loja</strong><span>{user?.storeName ?? "GT3"}</span></li>
          </ul>
        </article>

        <article className="panel profile-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Seguranca</p>
              <h3>Controles ativos</h3>
            </div>
            <ShieldCheck aria-hidden="true" size={20} />
          </div>
          <ul className="profile-check-list">
            <li><ShieldCheck aria-hidden="true" size={17} /><span>Sessao validada no backend a cada carregamento.</span></li>
            <li><ShieldCheck aria-hidden="true" size={17} /><span>Preferencias isoladas por usuario autenticado.</span></li>
            <li><ShieldCheck aria-hidden="true" size={17} /><span>Logout revoga o token opaco no servidor.</span></li>
          </ul>
        </article>
      </section>

      <section className="panel profile-preferences">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Preferencias</p>
            <h3>Ajustes pessoais salvos</h3>
          </div>
          <button className="text-button" onClick={() => setRefreshKey((current) => current + 1)} type="button">
            <RefreshCcw aria-hidden="true" size={16} /> Atualizar
          </button>
        </div>

        {status === "loading" ? (
          <div className="empty-state"><Settings2 aria-hidden="true" size={22} />Carregando preferencias...</div>
        ) : null}

        {status === "error" ? (
          <div className="empty-state"><Settings2 aria-hidden="true" size={22} />Nao foi possivel carregar as preferencias.</div>
        ) : null}

        {status === "loaded" && preferences.length === 0 ? (
          <div className="empty-state"><History aria-hidden="true" size={22} />Nenhuma preferencia salva ate agora.</div>
        ) : null}

        {preferences.length > 0 ? (
          <div className="profile-preference-list">
            {preferences.map((preference) => (
              <article className="profile-preference-row" key={preference.key}>
                <div>
                  <strong>{preferenceTitle(preference.key)}</strong>
                  <span>{preferenceDetail(preference)}</span>
                  <small>{preferenceValueLabel(preference.value)}</small>
                </div>
                <time dateTime={preference.updatedAt}>{formatDate(preference.updatedAt)}</time>
                <button
                  className="text-button"
                  disabled={removingKey === preference.key}
                  onClick={() => void clearPreference(preference.key)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  {removingKey === preference.key ? "Limpando" : "Limpar"}
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
