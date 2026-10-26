import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

// ── Módulos por rol ──────────────────────────────────────────────
import ClienteForm      from './components/cliente/ClienteForm';
import ReportePago      from './components/cliente/ReportePago';
import TiendasCliente  from './components/cliente/TiendasCliente';
import HistorialCliente from './components/cliente/HistorialCliente';
import ComercioPanel    from './components/comercio/ComercioPanel';
import RepartidorPanel  from './components/repartidor/RepartidorPanel';
import AdminPanel      from './components/admin/AdminPanel';
import Login            from './components/auth/Login';
import Dashboard        from './components/dashboard/Dashboard';
import RastreoPedidoNeumorphic from './components/cliente/RastreoPedidoNeumorphic';
import ClienteAlertas    from './components/cliente/ClienteAlertas';
import RepartidorAlertas from './components/repartidor/RepartidorAlertas';
import PedidosRealtimeBadge from './components/common/PedidosRealtimeBadge';
import { usePedidosRealtime } from './hooks/usePedidosRealtime';

import {
  LayoutDashboard,
  Zap,
  Store,
  User,
  CreditCard,
  Bike,
  PackageSearch,
  LogOut,
  ShieldCheck,
  Car,
  Menu,
  X,
  ChevronDown,
  ClipboardList,
  MailCheck,
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
      label: 'Hacer Pedidos',
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
      id: 'historial',
      label: 'Mis Pedidos',
      icon: ClipboardList,
      color: '#fb923c',
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.3)',
      glow: 'rgba(249, 115, 22, 0.4)',
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
  // ── Admin: Acceso total a gestión de la plataforma ──
  admin: [
    {
      id: 'panel',
      label: 'Admin Panel',
      icon: ShieldCheck,
      color: '#818cf8',
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.3)',
      glow: 'rgba(99, 102, 241, 0.4)',
    },
    {
      id: 'activaciones',
      label: 'Activar Cuentas',
      icon: MailCheck,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
      glow: 'rgba(245, 158, 11, 0.4)',
    },
    {
      id: 'comercios',
      label: 'Comercios',
      icon: Store,
      color: '#2dd4bf',
      bg: 'rgba(45, 212, 191, 0.12)',
      border: 'rgba(45, 212, 191, 0.3)',
      glow: 'rgba(45, 212, 191, 0.4)',
    },
    {
      id: 'repartidores',
      label: 'Repartidores',
      icon: Bike,
      color: '#fb923c',
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.3)',
      glow: 'rgba(249, 115, 22, 0.4)',
    },
    {
      id: 'vehiculos',
      label: 'Tipos Vehículo',
      icon: Car,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.12)',
      border: 'rgba(56, 189, 248, 0.3)',
      glow: 'rgba(56, 189, 248, 0.4)',
    },
  ],
};

export default function App() {
  const [session, setSession]         = useState(null);
  const [perfil, setPerfil]           = useState(null);
  const [activeRolView, setActiveRolView] = useState(null);
  const [tab, setTab]                 = useState('dashboard');
  const [pagoPedidoId, setPagoPedidoId] = useState(null);
  const [trackingOrderId, setTrackingOrderId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // ── Alerta en tiempo real para nuevos pedidos (Supabase Realtime) ──
  const {
    hasNewOrder,
    newOrdersCount,
    resetNotification,
  } = usePedidosRealtime({
    enabled: !!session?.user,
    table: 'pedidos_entregas',
  });

  // Helper para identificar qué pestaña representa pedidos según el rol del usuario
  const isOrderTabForRole = (tabId, currentRol) => {
    if (currentRol === 'repartidor') return tabId === 'pedidos';
    if (currentRol === 'comercio')   return tabId === 'panel';
    if (currentRol === 'cliente')    return tabId === 'historial';
    return false;
  };

  const handleSelectTab = (tabId) => {
    setTab(tabId);
    const currentRol = perfil?.rol === 'comercio' ? (activeRolView || 'comercio') : (perfil?.rol ?? 'cliente');
    if (isOrderTabForRole(tabId, currentRol)) {
      resetNotification();
    }
  };

  const handleGoToPago = (id) => {
    setPagoPedidoId(id || null);
    handleSelectTab('pago');
  };

  const handleGoToTracking = (id) => {
    if (id) setTrackingOrderId(id);
    handleSelectTab('tracking');
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
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error cargando perfil:', error.message);
        }
        if (data && (data.rol === 'comercio' || data.rol === 'repartidor') && data.correo_activado === false) {
          supabase.auth.signOut();
          alert('Tu cuenta está registrada pero aún no ha sido activada por el Administrador.');
          return;
        }
        setPerfil(data);
        const userRol = data?.rol ?? 'cliente';
        const savedView = localStorage.getItem(`levant_rol_view_${session.user.id}`);
        const effectiveView = (userRol === 'comercio' && (savedView === 'cliente' || savedView === 'comercio'))
          ? savedView
          : userRol;
        setActiveRolView(effectiveView);
        // Admin siempre arranca en 'panel'
        setTab(userRol === 'admin' ? 'panel' : (ROL_TABS[effectiveView]?.[0]?.id ?? 'dashboard'));
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
    admin:      '🛡️ ADMIN',
  };

  // ── JSX ──────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      {/* Alertas en tiempo real para cliente cuando se asigna un repartidor */}
      <ClienteAlertas
        session={session}
        rol={rol}
        onGoToTracking={handleGoToTracking}
      />

      {/* Alertas en tiempo real para repartidor cuando se asigna un pedido o recibe valoración */}
      <RepartidorAlertas
        session={session}
        rol={rol}
        onGoToPedidos={(orderId) => {
          handleSelectTab('pedidos');
          if (orderId && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('levant_focus_pedido', { detail: { orderId } }));
          }
        }}
        onGoToHistorial={() => handleSelectTab('panel')}
      />

      {/* Mobile Topbar adaptada de acuerdo a cada usuario */}
      <header className="app-mobile-topbar">
        <button
          type="button"
          className="app-mobile-menu-trigger"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Abrir menú de navegación"
          title="Menú de navegación"
        >
          <div className="app-mobile-menu-hamburger">
            <Menu size={18} strokeWidth={2.2} />
            <PedidosRealtimeBadge active={hasNewOrder} count={newOrdersCount} />
          </div>
          <div className="app-mobile-logo-circle">
            <img src="/logo.png" alt="Levant" className="app-mobile-logo-img" />
          </div>
          <span className="app-mobile-brand-name">Levant</span>
          <ChevronDown size={14} className={`app-mobile-menu-chevron ${mobileMenuOpen ? 'app-mobile-menu-chevron--open' : ''}`} />
        </button>

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
              onClick={() => handleSelectTab('panel')}
              title="Panel de repartidor"
            >
              <Bike size={13} strokeWidth={2.2} />
              <span>Repartidor</span>
            </button>
          ) : registeredRol === 'admin' ? (
            <button
              type="button"
              className="app-mobile-role-badge app-mobile-role-badge--admin"
              onClick={() => handleSelectTab('panel')}
              title="Panel Admin"
            >
              <ShieldCheck size={13} strokeWidth={2.2} />
              <span>Admin</span>
            </button>
          ) : (
            <button
              type="button"
              className="app-mobile-role-badge app-mobile-role-badge--cliente"
              onClick={() => handleSelectTab('perfil')}
              title="Mi perfil de cliente"
            >
              <User size={13} strokeWidth={2.2} />
              <span>Cliente</span>
            </button>
          )}
        </div>
      </header>

      {/* Menú Drawer Responsivo accesible desde el icono Levant para todos los usuarios */}
      {mobileMenuOpen && (
        <>
          <div
            className="app-mobile-drawer-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="app-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menú principal">
            {/* Cabecera del menú */}
            <div className="app-mobile-drawer-header">
              <div className="app-mobile-drawer-brand">
                <div className="app-mobile-logo-circle">
                  <img src="/logo.png" alt="Levant" className="app-mobile-logo-img" />
                </div>
                <span className="app-mobile-brand-name">Levant</span>
              </div>
              <button
                type="button"
                className="app-mobile-drawer-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                title="Cerrar menú"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            {/* Perfil del usuario */}
            <div className="app-mobile-drawer-user">
              <div className="app-mobile-drawer-avatar">
                {perfil?.nombre_completo ? perfil.nombre_completo.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="app-mobile-drawer-user-info">
                <span className="app-mobile-drawer-user-name">
                  {perfil?.nombre_completo || session?.user?.email || 'Usuario'}
                </span>
                <span className={`app-mobile-drawer-user-role app-mobile-drawer-user-role--${rol}`}>
                  {ROL_LABELS[rol] || rol.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Alternar modo si es comercio */}
            {registeredRol === 'comercio' && (
              <div className="app-mobile-drawer-switcher">
                <span className="app-mobile-drawer-switcher-label">Modo de Vista:</span>
                <div className="app-rol-toggle">
                  <button
                    type="button"
                    className={`app-rol-toggle-btn ${rol === 'comercio' ? 'app-rol-toggle-btn--active' : ''}`}
                    onClick={() => {
                      handleSwitchMode('comercio');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Store size={13} strokeWidth={2.2} />
                    <span>Comercio</span>
                  </button>
                  <button
                    type="button"
                    className={`app-rol-toggle-btn ${rol === 'cliente' ? 'app-rol-toggle-btn--active app-rol-toggle-btn--active-cliente' : ''}`}
                    onClick={() => {
                      handleSwitchMode('cliente');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <User size={13} strokeWidth={2.2} />
                    <span>Cliente</span>
                  </button>
                </div>
              </div>
            )}

            {/* Lista de navegación con todas las pestañas */}
            <nav className="app-mobile-drawer-nav" role="tablist">
              <span className="app-mobile-drawer-nav-title">Secciones</span>
              {tabs.map((t) => {
                const IconComp = t.icon;
                const isActive = tab === t.id;
                const isOrdersTab = isOrderTabForRole(t.id, rol);
                return (
                  <button
                    key={t.id}
                    id={`drawer-tab-${t.id}`}
                    role="tab"
                    aria-selected={isActive}
                    className={`app-mobile-drawer-item ${isActive ? 'app-mobile-drawer-item--active' : ''}`}
                    style={{
                      '--tab-color': t.color,
                      '--tab-bg': t.bg,
                      '--tab-border': t.border,
                      '--tab-glow': t.glow,
                    }}
                    onClick={() => {
                      handleSelectTab(t.id);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="app-tab-badge">
                      {IconComp && <IconComp size={18} strokeWidth={2.2} className="app-tab-icon" />}
                      <PedidosRealtimeBadge
                        active={hasNewOrder && isOrdersTab}
                        count={newOrdersCount}
                      />
                    </span>
                    <span className="app-mobile-drawer-item-label">{t.label}</span>
                    {isActive && <span className="app-mobile-drawer-item-dot" />}
                  </button>
                );
              })}
            </nav>

            {/* Footer con Cerrar Sesión */}
            <div className="app-mobile-drawer-footer">
              <button
                type="button"
                className="app-mobile-drawer-logout"
                onClick={() => {
                  setMobileMenuOpen(false);
                  supabase.auth.signOut();
                }}
              >
                <LogOut size={16} strokeWidth={2.2} />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar-top">
          <span className="app-logo">
            <div className="app-logo-circle">
              <img src="/logo.png" alt="Levant" className="app-logo-img" />
            </div>
            <span className="app-logo-text">Levant</span>
          </span>

          <nav className="app-tabs" role="tablist">
            {tabs.map(t => {
              const IconComp = t.icon;
              const isActive = tab === t.id;
              const isOrdersTab = isOrderTabForRole(t.id, rol);
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
                  onClick={() => handleSelectTab(t.id)}
                >
                  <span className="app-tab-badge">
                    {IconComp && <IconComp size={18} strokeWidth={2.2} className="app-tab-icon" />}
                    <PedidosRealtimeBadge
                      active={hasNewOrder && isOrdersTab}
                      count={newOrdersCount}
                    />
                  </span>
                  <span className="app-tab-label">{t.label}</span>
                </button>
              );
            })}
          </nav>

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
              {rol === 'cliente'    && <User size={14} strokeWidth={2.2} />}
              {rol === 'comercio'  && <Store size={14} strokeWidth={2.2} />}
              {rol === 'repartidor'&& <Bike size={14} strokeWidth={2.2} />}
              {rol === 'admin'     && <ShieldCheck size={14} strokeWidth={2.2} />}
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
            onGoToProfile={() => handleSelectTab(rol === 'cliente' ? 'perfil' : 'panel')}
            onGoToTracking={handleGoToTracking}
            onGoToPedidos={() => handleSelectTab('pedidos')}
            onGoToHistorial={() => handleSelectTab(rol === 'cliente' ? 'historial' : 'panel')}
            onGoToPago={handleGoToPago}
            onGoToTiendas={() => handleSelectTab('tiendas')}
          />
        )}

        {/* ── CLIENTE ── */}
        {rol === 'cliente' && tab === 'tracking'  && (
          <RastreoPedidoNeumorphic session={session} initialOrderId={trackingOrderId} />
        )}
        {rol === 'cliente' && tab === 'tiendas'   && <TiendasCliente session={session} onGoToPago={handleGoToPago} />}
        {rol === 'cliente' && tab === 'perfil'    && <ClienteForm      session={session} />}
        {rol === 'cliente' && tab === 'historial' && (
          <HistorialCliente
            session={session}
            onGoToPago={(id) => {
              handleGoToPago(id);
            }}
          />
        )}
        {rol === 'cliente' && tab === 'pago'      && (
          <ReportePago
            session={session}
            pedidoId={pagoPedidoId}
            onReported={() => {
              setPagoPedidoId(null);
              setTab('dashboard');
            }}
          />
        )}

        {/* ── COMERCIO ── */}
        {rol === 'comercio'   && tab === 'panel' && <ComercioPanel   session={session} />}

        {/* ── REPARTIDOR ── */}
        {rol === 'repartidor' && tab === 'pedidos' && <RepartidorPanel session={session} initialTab="pedidos" />}
        {rol === 'repartidor' && tab === 'panel'   && <RepartidorPanel session={session} initialTab="perfil" />}

        {/* ── ADMIN ── panel único sincronizado con la barra lateral */}
        {rol === 'admin' && (
          <AdminPanel
            session={session}
            currentTab={tab}
            onTabChange={(newTab) => setTab(newTab)}
          />
        )}
      </main>
    </div>
  );
}
