import { useState, useEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Navbar from './Navbar.jsx';

const PAGE_TITLES = {
  '/dashboard':              'Painel',
  '/clientes':               'Clientes',
  '/cadastrar':              'Cadastrar Cliente',
  '/resgatar':               'Resgatar Cashback',
  '/campanhas':              'Campanhas',
  '/antifraude':             'Antifraude',
  '/relatorios':             'Relatórios',
  '/configuracoes-cashback': 'Configurações de Cashback',
  '/configuracoes-posto':    'Configurações do Posto',
  '/consultar':              'Consultar Cliente',
  '/register':               'Novo Estabelecimento',
};

// ── Bottom tab items (mobile only) ────────────────────────────────────────────

const BOTTOM_TABS = [
  { to: '/dashboard',              label: 'Painel',       icon: '🏠' },
  { to: '/clientes',               label: 'Clientes',     icon: '👥' },
  { to: '/campanhas',              label: 'Campanhas',    icon: '📣' },
  { to: '/relatorios',             label: 'Relatórios',   icon: '📊' },
  { to: '/configuracoes-cashback', label: 'Configurações',icon: '⚙️' },
];

export default function ProtectedRoute() {
  const { token, loading, operator } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const page  = PAGE_TITLES[location.pathname] || 'PRT Cashback';
    const posto = operator?.estabelecimento;
    document.title = posto ? `${page} — ${posto}` : `${page} | PRT Cashback`;
  }, [location.pathname, operator?.estabelecimento]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <svg className="animate-spin h-8 w-8 text-primary-700" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sidebar (desktop only) ──────────────────────────────────────────── */}
      <Navbar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Sidebar backdrop (mobile, when sidebar manually opened) ─────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="md:ml-[220px] min-h-screen flex flex-col">
        <main className="flex-1 px-4 sm:px-6 py-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* ── Bottom tab bar (mobile only) ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1e3a5f] border-t border-white/10 flex">
        {BOTTOM_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/dashboard'}
            className={({ isActive }) =>
              [
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-[#F59E0B]'
                  : 'text-white/60 hover:text-white',
              ].join(' ')
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="leading-tight">{tab.label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
