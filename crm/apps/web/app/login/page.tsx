"use client";

import { ArrowRight, KeyRound, ShieldCheck, UserRoundCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import { ThemeToggle } from "../components/theme-toggle";

const devUsers = [
  { label: "Dono", email: "dono@gt3.local" },
  { label: "Admin", email: "admin@gt3.local" },
  { label: "Administrativo", email: "administrativo@gt3.local" },
  { label: "Vendedor", email: "vendedor@gt3.local" },
  { label: "SDR", email: "sdr@gt3.local" },
  { label: "Avaliador", email: "avaliador@gt3.local" },
  { label: "Servicos", email: "servicos@gt3.local" },
];

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState("dono@gt3.local");
  const [password, setPassword] = useState("Gt3@2026dev");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedProfile = useMemo(() => devUsers.find((item) => item.email === email), [email]);

  if (user) {
    window.location.href = "/";
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      window.location.href = "/";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Nao foi possivel entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-top">
          <img src="/logo_gt3_quadrado.svg" alt="Logo GT3" />
          <ThemeToggle />
        </div>

        <div className="login-hero-copy">
          <span>GT3 CRM</span>
          <h1>Operacao comercial, estoque e resultado no mesmo cockpit.</h1>
          <p>
            Acesso por perfil para esconder dados sensiveis no frontend e manter o backend como fonte de verdade.
          </p>
        </div>

        <div className="login-security-grid">
          <article>
            <ShieldCheck size={19} />
            <strong>RBAC real</strong>
            <span>Menus e acoes por permissao efetiva.</span>
          </article>
          <article>
            <KeyRound size={19} />
            <strong>Sessao ativa</strong>
            <span>Sem expiracao por inatividade no MVP.</span>
          </article>
        </div>
      </section>

      <section className="login-card" aria-label="Entrar no GT3 CRM">
        <div className="login-card-heading">
          <UserRoundCheck size={22} />
          <div>
            <span>Acesso interno</span>
            <h2>Entrar no CRM</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" />
          </label>
          <label>
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="dev-login-panel">
          <span>Perfis de desenvolvimento</span>
          <div>
            {devUsers.map((devUser) => (
              <button
                className={selectedProfile?.email === devUser.email ? "active" : ""}
                key={devUser.email}
                type="button"
                onClick={() => {
                  setEmail(devUser.email);
                  setPassword("Gt3@2026dev");
                }}
              >
                {devUser.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
