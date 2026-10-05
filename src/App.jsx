import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

// ── Módulos por rol ──────────────────────────────────────────────
import ClienteForm      from './components/cliente/ClienteForm';
import ReportePago      from './components/cliente/ReportePago';
import HistorialCliente from './components/cliente/HistorialCliente';
import TiendasCliente  from './components/cliente/TiendasCliente';
import ComercioPanel    from './components/comercio/ComercioPanel';
import RepartidorPanel  from './components/repartidor/RepartidorPanel';
import Login            from './components/auth/Login';
import Dashboard        from './components/dashboard/Dashboard';
import RastreoPedidoNeumorphic from './components/cliente/RastreoPedidoNeumorphic';

import {
  LayoutDashboard,
  Zap,
  Store,
  User,
  CreditCard,
  Package,
  Bike,
  PackageSearch,
  LogOut,
} from 'lucide-react';

import './App.css';

// ── Navegación por rol ───────────────────────────────────────────
const ROL_TABS = {
  cliente: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      color: '#818cf8',
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.3)',
      glow: 'rgba(99, 102, 241, 0.4)',
    },
    {
      id: 'tracking',
      label: 'Rastreo & Chat',
      icon: Zap,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.12)',
      border: 'rgba(56, 189, 248, 0.3)',
      glow: 'rgba(56, 189, 248, 0.4)',
    },
    {
      id: 'tiendas',
      label: 'Tiendas',
      icon: Store,
      color: '#34d399',
      bg: 'rgba(52, 211, 153, 0.12)',
      border: 'rgba(52, 211, 153, 0.3)',
      glow: 'rgba(52, 211, 153, 0.4)',
    },
    {
      id: 'perfil',
      label: 'Mi Perfil',
      icon: User,
      color: '#c084fc',
      bg: 'rgba(192, 132, 252, 0.12)',
      border: 'rgba(192, 132, 252, 0.3)',
      glow: 'rgba(192, 132, 252, 0.4)',
    },
    {
      id: 'pago',
      label: 'Reportar Pago',
      icon: CreditCard,
      color: '#fbbf24',
      bg: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(251, 191, 36, 0.3)',
      glow: 'rgba(251, 191, 36, 0.4)',
    },
    {
      id: 'historial',
      label: 'Mis Pedidos',
      icon: Package,
      color: '#fb923c',
      bg: 'rgba(251, 146, 60, 0.12)',
      border: 'rgba(251, 146, 60, 0.3)',
      glow: 'rgba(251, 146, 60, 0.4)',
    },
  ],
  comercio: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      color: '#818cf8',
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.3)',
      glow: 'rgba(99, 102, 241, 0.4)',
    },
    {
      id: 'panel',
      label: 'Panel Comercio',
      icon: Store,
      color: '#2dd4bf',
      bg: 'rgba(45, 212, 191, 0.12)',
      border: 'rgba(45, 212, 191, 0.3)',
      glow: 'rgba(45, 212, 191, 0.4)',
    },
  ],
  repartidor: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      color: '#818cf8',
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.3)',
      glow: 'rgba(99, 102, 241, 0.4)',
    },
    {
      id: 'pedidos',
      label: 'Recibir Pedidos',
      icon: PackageSearch,
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.3)',
      glow: 'rgba(249, 115, 22, 0.4)',
    },
    {
      id: 'panel',
      label: 'Panel Repartidor',
      icon: Bike,
      color: '#34d399',
      bg: 'rgba(52, 211, 153, 0.12)',
      border: 'rgba(52, 211, 153, 0.3)',
      glow: 'rgba(52, 211, 153, 0.4)',
    },
  ],
};

export default function App() {
  const [session, setSession]         = useState(null);
  const [perfil, setPerfil]           = useState(null);
  const [activeRolView, setActiveRolView] = useState(null);
  const [tab, setTab]                 = useState('dashboard');
  const [pagoPedidoId, setPagoPedidoId] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const handleGoToPago = (id) => {
    setPagoPedidoId(id || null);
    setTab('pago');
  };

  // ── Auth listener ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setPerfil(null);
        setActiveRolView(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Cargar rol del usuario ──────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from('profiles')
      .select('rol, nombre_completo')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setPerfil(data);
        const userRol = data?.rol ?? 'cliente';
        const savedView = localStorage.getItem(`levant_rol_view_${session.user.id}`);
        const effectiveView = (userRol === 'comercio' && (savedView === 'cliente' || savedView === 'comercio'))
          ? savedView
          : userRol;
        setActiveRolView(effectiveView);
        setTab(ROL_TABS[effectiveView]?.[0]?.id ?? 'dashboard');
      });
  }, [session]);

  const handleSwitchMode = (newMode) => {
    if (perfil?.rol !== 'comercio') return; // Solo comercios pueden alternar modo
    setActiveRolView(newMode);
    if (session?.user?.id) {
      localStorage.setItem(`levant_rol_view_${session.user.id}`, newMode);
    }
    setTab(ROL_TABS[newMode]?.[0]?.id ?? 'dashboard');
  };

  // ── Loaders ─────────────────────────────────────────────────────
  if (loadingAuth) return (
    <div className="app-loading"><span className="app-spinner" /></div>
  );

  if (!session) return <Login />;

  const registeredRol = perfil?.rol ?? 'cliente';
  // Si el usuario es comercio, permite usar activeRolView (comercio o cliente); si no, forza registeredRol.
  const rol  = registeredRol === 'comercio' ? (activeRolView || 'comercio') : registeredRol;
  const tabs = ROL_TABS[rol] ?? ROL_TABS.cliente;

  const ROL_LABELS = {
    cliente:    '👤 CLIENTE',
    comercio:   '🏪 COMERCIO',
    repartidor: '🛵 REPARTIDOR',
  };

  // ── JSX ──────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      {/* Mobile Topbar adaptada de acuerdo a cada usuario */}
      <header className="app-mobile-topbar">
        <div
          className="app-mobile-topbar-brand"
          onClick={() => setTab('dashboard')}
          role="button"
          tabIndex={0}
          title="Ir al inicio"
        >
          <div className="app-mobile-logo-circle">
            <img src="/logo.png" alt="Levant" className="app-mobile-logo-img" />
          </div>
          <span className="app-mobile-brand-name">Levant</span>
        </div>

        <div className="app-mobile-topbar-right">
          {registeredRol === 'comercio' ? (
            <div className="app-mobile-rol-switcher">
              <div className="app-rol-toggle">
                <button
                  type="button"
                  className={`app-rol-toggle-btn ${rol === 'comercio' ? 'app-rol-toggle-btn--active' : ''}`}
                  onClick={() => handleSwitchMode('comercio')}
                >
                  <Store size={13} strokeWidth={2.2} />
                  <span>Comercio</span>
                </button>
                <button
                  type="button"
                  className={`app-rol-toggle-btn ${rol === 'cliente' ? 'app-rol-toggle-btn--active app-rol-toggle-btn--active-cliente' : ''}`}
                  onClick={() => handleSwitchMode('cliente')}
                >
                  <User size={13} strokeWidth={2.2} />
                  <span>Cliente</span>
                </button>
              </div>
            </div>
          ) : registeredRol === 'repartidor' ? (
            <button
              type="button"
              className="app-mobile-role-badge app-mobile-role-badge--repartidor"
              onClick={() => setTab('panel')}
              title="Panel de repartidor"
            >
              <Bike size={13} strokeWidth={2.2} />
              <span>Repartidor</span>
            </button>
          ) : (
            <button
              type="button"
              className="app-mobile-role-badge app-mobile-role-badge--cliente"
              onClick={() => setTab('perfil')}
              title="Mi perfil de cliente"
            >
              <User size={13} strokeWidth={2.2} />
              <span>Cliente</span>
            </button>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar-top">
          <span className="app-logo">
            <img src="/logo.png" alt="Levant" className="app-logo-img" />
            Levant
          </span>

          <nav className="app-tabs" role="tablist">
            {tabs.map(t => {
              const IconComp = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  aria-selected={isActive}
                  className={`app-tab ${isActive ? 'app-tab--active' : ''}`}
                  style={{
                    '--tab-color': t.color,
                    '--tab-bg': t.bg,
                    '--tab-border': t.border,
                    '--tab-glow': t.glow,
                  }}
                  onClick={() => setTab(t.id)}
                >
                  <span className="app-tab-badge">
                    {IconComp && <IconComp size={18} strokeWidth={2.2} className="app-tab-icon" />}
                  </span>
                  <span className="app-tab-label">{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Botón cambiar modo Comercio / Cliente en mobile bottom nav */}
          {registeredRol === 'comercio' && (
            <button
              id="btn-rol-toggle-mobile"
              className="app-tab-rol-mobile"
              onClick={() => handleSwitchMode(rol === 'comercio' ? 'cliente' : 'comercio')}
              title={rol === 'comercio' ? 'Cambiar a modo Cliente' : 'Cambiar a modo Comercio'}
            >
              <span
                className="app-tab-badge"
                style={{
                  '--tab-bg': rol === 'comercio' ? 'rgba(108,99,255,0.18)' : 'rgba(16,185,129,0.18)',
                  '--tab-border': rol === 'comercio' ? 'rgba(108,99,255,0.35)' : 'rgba(16,185,129,0.35)',
                  '--tab-color': rol === 'comercio' ? '#a5b4fc' : '#6ee7b7',
                  '--tab-glow': rol === 'comercio' ? 'rgba(108,99,255,0.4)' : 'rgba(16,185,129,0.4)',
                }}
              >
                {rol === 'comercio' ? (
                  <User size={18} strokeWidth={2.2} className="app-tab-icon" />
                ) : (
                  <Store size={18} strokeWidth={2.2} className="app-tab-icon" />
                )}
              </span>
              <span className="app-tab-label">
                {rol === 'comercio' ? 'A Cliente' : 'A Comercio'}
              </span>
            </button>
          )}

          {/* Botón cerrar sesión — visible solo en mobile (bottom nav) */}
          <button
            id="btn-logout-mobile"
            className="app-tab-logout-mobile"
            onClick={() => supabase.auth.signOut()}
            title="Cerrar Sesión"
          >
            <span className="app-tab-badge" style={{ '--tab-bg': 'rgba(248,113,113,0.12)', '--tab-border': 'rgba(248,113,113,0.3)', '--tab-color': '#f87171', '--tab-glow': 'rgba(248,113,113,0.4)' }}>
              <LogOut size={18} strokeWidth={2.2} className="app-tab-icon" />
            </span>
            <span className="app-tab-label">Salir</span>
          </button>
        </div>

        <div className="app-sidebar-bottom">
          {registeredRol === 'comercio' ? (
            <div className="app-rol-switcher">
              <span className="app-rol-label">Perfil / Modo</span>
              <div className="app-rol-toggle">
                <button
                  type="button"
                  className={`app-rol-toggle-btn ${rol === 'comercio' ? 'app-rol-toggle-btn--active' : ''}`}
                  onClick={() => handleSwitchMode('comercio')}
                >
                  <Store size={13} strokeWidth={2.2} />
                  <span>Comercio</span>
                </button>
                <button
                  type="button"
                  className={`app-rol-toggle-btn ${rol === 'cliente' ? 'app-rol-toggle-btn--active app-rol-toggle-btn--active-cliente' : ''}`}
                  onClick={() => handleSwitchMode('cliente')}
                >
                  <User size={13} strokeWidth={2.2} />
                  <span>Cliente</span>
                </button>
              </div>
            </div>
          ) : (
            <span className={`app-rol-badge app-rol-badge--${rol}`}>
              {rol === 'cliente' && <User size={14} strokeWidth={2.2} />}
              {rol === 'comercio' && <Store size={14} strokeWidth={2.2} />}
              {rol === 'repartidor' && <Bike size={14} strokeWidth={2.2} />}
              <span>{rol.toUpperCase()}</span>
            </span>
          )}
          <button id="btn-logout" className="app-logout"
            onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} strokeWidth={2.1} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main">
        {/* ── DASHBOARD (todos los roles) ── */}
        {tab === 'dashboard' && (
          <Dashboard
            session={session}
            rol={rol}
            registeredRol={registeredRol}
            onSwitchMode={handleSwitchMode}
            onSignOut={() => supabase.auth.signOut()}
            onGoToProfile={() => setTab(rol === 'cliente' ? 'perfil' : 'panel')}
          />
        )}

        {/* ── CLIENTE ── */}
        {rol === 'cliente' && tab === 'tracking'  && <RastreoPedidoNeumorphic session={session} />}
        {rol === 'cliente' && tab === 'tiendas'   && <TiendasCliente session={session} onGoToPago={handleGoToPago} />}
        {rol === 'cliente' && tab === 'perfil'    && <ClienteForm      session={session} />}
        {rol === 'cliente' && tab === 'pago'      && (
          <ReportePago
            session={session}
            pedidoId={pagoPedidoId}
            onReported={() => {
              setPagoPedidoId(null);
              setTab('historial');
            }}
          />
        )}
        {rol === 'cliente' && tab === 'historial' && <HistorialCliente session={session} onGoToPago={handleGoToPago} />}

        {/* ── COMERCIO ── */}
        {rol === 'comercio'   && tab === 'panel' && <ComercioPanel   session={session} />}

        {/* ── REPARTIDOR ── */}
        {rol === 'repartidor' && tab === 'pedidos' && <RepartidorPanel session={session} initialTab="pedidos" />}
        {rol === 'repartidor' && tab === 'panel'   && <RepartidorPanel session={session} initialTab="perfil" />}
      </main>
    </div>
  );
}
