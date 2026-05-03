import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Painel',    icon: '📊', highlight: true },
  { to: '/resgatar',  label: 'Resgatar',  icon: '💸' },
  { to: '/cadastrar', label: 'Cadastrar', icon: '👤' },
  { to: '/campanhas', label: 'Campanhas', icon: '📣' },
  { to: '/antifraude',label: 'Antifraude',icon: '🔒' },
  { to: '/clientes',  label: 'Clientes',  icon: '👥' },
  { to: '/relatorios',label: 'Relatórios',icon: '📋' },
  { to: '/configuracoes-cashback', label: 'Cashback', icon: '⚙️' },
];

// ── Sidebar logo with fallback ────────────────────────────────────────────────

function SidebarLogo({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className="text-xl leading-none">⛽</span>;
  }
  return (
    <img
      src={src}
      alt="Logo"
      onError={() => setFailed(true)}
      className="w-7 h-7 rounded object-contain bg-white/10"
    />
  );
}

// ── Link component ────────────────────────────────────────────────────────────

function SidebarLink({ to, icon, label, highlight, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/dashboard'}
      onClick={onClick}
      className={({ isActive }) => {
        if (highlight) {
          // Painel: gold background when active, subtle gold tint when inactive
          return [
            'flex items-center gap-3 w-full px-5 py-3 text-sm font-semibold transition-colors',
            isActive
              ? 'bg-[#F59E0B] text-gray-900'
              : 'text-amber-300 hover:bg-white/10 hover:text-amber-200',
          ].join(' ');
        }
        // Regular links: gold left border when active
        return [
          'flex items-center gap-3 w-full pl-[16px] pr-5 py-3 text-sm font-medium transition-colors border-l-4',
          isActive
            ? 'border-[#F59E0B] bg-white/10 text-white'
            : 'border-transparent text-white/70 hover:bg-white/10 hover:text-white',
        ].join(' ');
      }}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Navbar({ open, onClose }) {
  const { operator, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside
      className={[
        'fixed top-0 left-0 h-screen w-[220px] z-40',
        'bg-[#1e3a5f] text-white flex flex-col',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        'md:translate-x-0',
      ].join(' ')}
    >
      {/* ── Logo ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-14 px-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 font-bold text-base min-w-0">
          <SidebarLogo src={operator?.logoUrl} />
          <span className="truncate">PRT Cashback</span>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
          aria-label="Fechar menu"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {visibleItems.map((item) => (
          <SidebarLink
            key={item.to}
            {...item}
            onClick={onClose}
          />
        ))}
      </nav>

      {/* ── Bottom: operator info + logout ──────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-2">
        {operator?.nome && (
          <p className="text-xs text-white/50 font-medium mb-0.5 truncate">Operador</p>
        )}
        <p className="text-sm text-white/80 font-semibold truncate">
          {operator?.nome || '—'}
        </p>

        {/* Configurações do Posto */}
        <NavLink
          to="/configuracoes-posto"
          onClick={onClose}
          className={({ isActive }) => [
            'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg',
            'border text-xs font-medium transition-colors',
            isActive
              ? 'border-white/30 bg-white/10 text-white/80'
              : 'border-white/15 text-white/40 hover:border-white/30 hover:text-white/70',
          ].join(' ')}
        >
          <span className="text-[11px] leading-none">⚙️</span>
          Configurações do Posto
        </NavLink>

        {/* Novo Estabelecimento — admin only */}
        {isAdmin && (
          <NavLink
            to="/register"
            onClick={onClose}
            className={({ isActive }) => [
              'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg',
              'border text-xs font-medium transition-colors',
              isActive
                ? 'border-white/30 bg-white/10 text-white/80'
                : 'border-white/15 text-white/40 hover:border-white/30 hover:text-white/70',
            ].join(' ')}
          >
            <span className="text-[11px] leading-none">🏪</span>
            Novo Estabelecimento
          </NavLink>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>
      </div>
    </aside>
  );
}
