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
        setActiveRolView(userRol);
        setTab(ROL_TABS[userRol]?.[0]?.id ?? 'dashboard');
      });
  }, [session]);

  const handleSwitchMode = (newMode) => {
    if (perfil?.rol !== 'comercio') return; // Solo comercios pueden alternar modo
    setActiveRolView(newMode);
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
                  className={`app-rol-toggle-btn ${rol === 'cliente' ? 'app-rol-toggle-btn--active' : ''}`}
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
        {tab === 'dashboard' && <Dashboard session={session} rol={rol} />}

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
