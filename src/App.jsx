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

import './App.css';

// ── Navegación por rol ───────────────────────────────────────────
const ROL_TABS = {
  cliente: [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'tracking',  label: '⚡ Rastreo & Chat' },
    { id: 'tiendas',   label: '🏪 Tiendas' },
    { id: 'perfil',    label: '👤 Mi Perfil' },
    { id: 'pago',      label: '💳 Reportar Pago' },
    { id: 'historial', label: '📦 Mis Pedidos' },
  ],
  comercio:    [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'panel',     label: '🏪 Panel Comercio' },
  ],
  repartidor:  [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'pedidos',   label: '📦 Recibir Pedidos' },
    { id: 'panel',     label: '🛵 Panel Repartidor' },
  ],
};

export default function App() {
  const [session, setSession]         = useState(null);
  const [perfil, setPerfil]           = useState(null);
  const [activeRolView, setActiveRolView] = useState(null);
  const [tab, setTab]                 = useState('dashboard');
  const [loadingAuth, setLoadingAuth] = useState(true);

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
            {tabs.map(t => (
              <button key={t.id} id={`tab-${t.id}`} role="tab"
                aria-selected={tab === t.id}
                className={`app-tab ${tab === t.id ? 'app-tab--active' : ''}`}
                onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
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
                  🏪 Comercio
                </button>
                <button
                  type="button"
                  className={`app-rol-toggle-btn ${rol === 'cliente' ? 'app-rol-toggle-btn--active' : ''}`}
                  onClick={() => handleSwitchMode('cliente')}
                >
                  👤 Cliente
                </button>
              </div>
            </div>
          ) : (
            <span className={`app-rol-badge app-rol-badge--${rol}`}>
              {ROL_LABELS[rol] ?? rol.toUpperCase()}
            </span>
          )}
          <button id="btn-logout" className="app-logout"
            onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main">
        {/* ── DASHBOARD (todos los roles) ── */}
        {tab === 'dashboard' && <Dashboard session={session} rol={rol} />}

        {/* ── CLIENTE ── */}
        {rol === 'cliente' && tab === 'tracking'  && <RastreoPedidoNeumorphic session={session} />}
        {rol === 'cliente' && tab === 'tiendas'   && <TiendasCliente session={session} />}
        {rol === 'cliente' && tab === 'perfil'    && <ClienteForm      session={session} />}
        {rol === 'cliente' && tab === 'pago'      && <ReportePago      session={session} pedidoId={null} />}
        {rol === 'cliente' && tab === 'historial' && <HistorialCliente session={session} />}

        {/* ── COMERCIO ── */}
        {rol === 'comercio'   && tab === 'panel' && <ComercioPanel   session={session} />}

        {/* ── REPARTIDOR ── */}
        {rol === 'repartidor' && tab === 'pedidos' && <RepartidorPanel session={session} initialTab="pedidos" />}
        {rol === 'repartidor' && tab === 'panel'   && <RepartidorPanel session={session} initialTab="perfil" />}
      </main>
    </div>
  );
}
