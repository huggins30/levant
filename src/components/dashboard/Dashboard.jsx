import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  BoxIcon, CheckCircleIcon, DollarIcon, StarIcon, MotoIcon, 
  ShoppingBagIcon, CloseIcon, WrenchIcon 
} from '../common/Icons';
import { User, Store, LogOut, ChevronDown, X, ChevronRight, Info, ShoppingBag } from 'lucide-react';
import { 
  ComercioAlertToasts, 
  ComercioAlertCenter, 
  getReadOrderIds, 
  isOrderRead, 
  markOrderAsRead, 
  markAllOrdersAsRead 
} from '../comercio/ComercioAlertas';
import {
  ClienteAlertCenter,
  getClientReadOrderIds,
  markClientOrderAsRead,
  markAllClientOrdersAsRead
} from '../cliente/ClienteAlertas';
import {
  RepartidorAlertCenter,
  getRepartidorReadOrderIds,
  markRepartidorOrderAsRead,
  markAllRepartidorOrdersAsRead
} from '../repartidor/RepartidorAlertas';
import { playNewOrderSound, playOrderDeliveredSound, triggerDesktopNotification } from '../comercio/comercioAlertSound';
import './Dashboard.css';

// ── Colores ──────────────────────────────────────────
const COLORS = {
  purple:   '#6c63ff',
  blue:     '#3b82f6',
  green:    '#10b981',
  yellow:   '#f59e0b',
  red:      '#f87171',
  cyan:     '#06b6d4',
  pink:     '#ec4899',
  indigo:   '#818cf8',
};

const ESTADO_COLOR = {
  pendiente:      COLORS.yellow,
  confirmado:     COLORS.blue,
  en_preparacion: COLORS.cyan,
  en_camino:      COLORS.purple,
  entregado:      COLORS.green,
  cancelado:      COLORS.red,
};

const METODO_COLOR = {
  pago_movil:       COLORS.blue,
  zelle:            COLORS.green,
  transferencia:    COLORS.purple,
  efectivo_usd:     COLORS.yellow,
  efectivo_bs:      COLORS.cyan,
};

// ── Utilidades ───────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('es-VE', { maximumFractionDigits: 2 });
}
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}
function lastNMonths(n) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' }),
    });
  }
  return months;
}
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }),
    });
  }
  return days;
}

// ── Gráfico de barras genérico ────────────────────────
function BarChart({ data, height = 160, valuePrefix = '', valueSuffix = '' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="db-chart-wrap">
      <div className="db-bars" style={{ height }}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={i} className="db-bar-col">
              <span className="db-bar-val">
                {valuePrefix}{fmt(d.value)}{valueSuffix}
              </span>
              <div className="db-bar-track">
                <div
                  className="db-bar-fill"
                  style={{
                    height: `${pct}%`,
                    background: d.color || COLORS.purple,
                    boxShadow: `0 0 12px ${(d.color || COLORS.purple)}55`,
                  }}
                />
              </div>
              <span className="db-bar-label">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI card (Estilo Soft UI / Dark Neumorphism) ───────
function KpiCard({ icon: Icon, tag = 'Servicio', label, value, sub, color = '#f59e0b', iconBg = '#38281a', onClick }) {
  return (
    <div
      className={`db-kpi ${onClick ? 'db-kpi--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="db-kpi-top">
        <div className="db-kpi-icon-wrap" style={{ background: iconBg, borderColor: `${color}44` }}>
          {typeof Icon === 'function' ? (
            <Icon size={24} color={color} />
          ) : (
            <span style={{ fontSize: '1.4rem' }}>{Icon}</span>
          )}
        </div>
        {tag && (
          <span className="db-kpi-tag" style={{ background: iconBg, color, borderColor: `${color}44` }}>
            {tag}
          </span>
        )}
      </div>
      <p className="db-kpi-label">{label}</p>
      <p className="db-kpi-value" style={{ color }}>{value}</p>
      {sub && <p className="db-kpi-sub">{sub}</p>}
      {onClick && (
        <div className="db-kpi-click-hint">
          <span>Ver resumen</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
}

// ── Modal de Detalle de KPI ───────────────────────────
function KpiDetailModal({ kpi, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!kpi) return null;

  const {
    title,
    subtitle,
    tag,
    label,
    value,
    color = '#f59e0b',
    iconBg = '#38281a',
    icon: Icon,
    metrics = [],
    breakdownTitle,
    breakdown = [],
    itemsTitle,
    items = [],
    tip,
  } = kpi;

  return (
    <div className="db-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || label}>
      <div className="db-modal-card" onClick={e => e.stopPropagation()} style={{ borderColor: `${color}33` }}>
        <div className="db-modal-header">
          <div className="db-modal-header-left">
            <div className="db-kpi-icon-wrap" style={{ background: iconBg, borderColor: `${color}44` }}>
              {typeof Icon === 'function' ? (
                <Icon size={24} color={color} />
              ) : (
                <span style={{ fontSize: '1.4rem' }}>{Icon}</span>
              )}
            </div>
            <div>
              <h3 className="db-modal-title">{title || label}</h3>
              {subtitle && <p className="db-modal-sub">{subtitle}</p>}
            </div>
          </div>
          <button className="db-modal-close-btn" onClick={onClose} aria-label="Cerrar resumen">
            <X size={18} />
          </button>
        </div>

        <div className="db-modal-body">
          {/* Banner con valor principal */}
          <div className="db-modal-banner" style={{ borderColor: `${color}33` }}>
            <div>
              <span className="db-modal-stat-label">{label}</span>
              <div className="db-modal-banner-val" style={{ color }}>{value}</div>
            </div>
            {tag && (
              <span className="db-modal-banner-tag" style={{ background: iconBg, color, borderColor: `${color}44`, border: '1px solid' }}>
                {tag}
              </span>
            )}
          </div>

          {/* Mini métricas */}
          {metrics.length > 0 && (
            <div className="db-modal-stats-grid">
              {metrics.map((m, idx) => (
                <div key={idx} className="db-modal-stat-card">
                  <span className="db-modal-stat-label">{m.label}</span>
                  <span className="db-modal-stat-value" style={{ color: m.color || '#f1f5f9' }}>{m.value}</span>
                  {m.sub && <span className="db-modal-stat-sub">{m.sub}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Desglose / barras */}
          {breakdown.length > 0 && (
            <div>
              <h4 className="db-modal-section-title">{breakdownTitle || 'Desglose detallado'}</h4>
              <div className="db-modal-breakdown-list">
                {breakdown.map((b, idx) => (
                  <div key={idx} className="db-modal-breakdown-item">
                    <div className="db-modal-breakdown-row">
                      <span className="db-modal-breakdown-label">
                        <span className="db-modal-breakdown-dot" style={{ background: b.color || color }} />
                        {b.label}
                      </span>
                      <span className="db-modal-breakdown-val">{b.value}</span>
                    </div>
                    <div className="db-modal-progress-track">
                      <div
                        className="db-modal-progress-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, b.percent ?? 0))}%`,
                          background: b.color || color,
                          boxShadow: `0 0 8px ${(b.color || color)}55`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Registros recientes */}
          {items.length > 0 && (
            <div>
              <h4 className="db-modal-section-title">{itemsTitle || 'Registros recientes'}</h4>
              <div className="db-modal-items-list">
                {items.map((it, idx) => (
                  <div key={idx} className="db-modal-item-row">
                    <div>
                      <div className="db-modal-item-title">{it.title}</div>
                      {it.sub && <div className="db-modal-item-sub">{it.sub}</div>}
                    </div>
                    {it.badge && (
                      <span
                        className="db-modal-item-badge"
                        style={{
                          background: it.badgeBg || 'rgba(255,255,255,0.08)',
                          color: it.badgeColor || '#e2e8f0',
                        }}
                      >
                        {it.badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sugerencia / Tip */}
          {tip && (
            <div className="db-modal-tip">
              <Info size={16} style={{ flexShrink: 0 }} />
              <span>{tip}</span>
            </div>
          )}
        </div>

        <div className="db-modal-footer">
          <button className="db-modal-btn-close" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sección con título ────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div className="db-section">
      <div className="db-section-header">
        <h2 className="db-section-title">{title}</h2>
        {subtitle && <p className="db-section-sub">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Avatar / menú de perfil ──────────────────────────────────────
function ProfileMenu({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const email = session?.user?.email ?? '';
  const initials = email ? email[0].toUpperCase() : '?';

  return (
    <div className="db-profile-menu" ref={ref}>
      <button
        id="btn-profile-menu"
        className="db-profile-avatar"
        onClick={() => setOpen(v => !v)}
        aria-label="Menú de perfil"
      >
        <span className="db-profile-initials">{initials}</span>
        <ChevronDown size={12} strokeWidth={2.5} className={`db-profile-chevron${open ? ' db-profile-chevron--open' : ''}`} />
      </button>

      {open && (
        <div className="db-profile-dropdown">
          <div className="db-profile-dropdown-email">{email}</div>

          {registeredRol === 'comercio' && (
            <>
              <button
                className="db-profile-dropdown-item db-profile-dropdown-item--mode"
                onClick={() => {
                  setOpen(false);
                  onSwitchMode?.(currentRol === 'comercio' ? 'cliente' : 'comercio');
                }}
              >
                {currentRol === 'comercio' ? (
                  <>
                    <User size={15} strokeWidth={2.1} />
                    <span>Cambiar a Modo Cliente</span>
                  </>
                ) : (
                  <>
                    <Store size={15} strokeWidth={2.1} />
                    <span>Volver a Modo Comercio</span>
                  </>
                )}
              </button>
              <div className="db-profile-dropdown-divider" />
            </>
          )}

          <button
            className="db-profile-dropdown-item"
            onClick={() => { setOpen(false); onGoToProfile?.(); }}
          >
            <User size={15} strokeWidth={2.1} />
            Mi Perfil
          </button>
          <div className="db-profile-dropdown-divider" />
          <button
            className="db-profile-dropdown-item db-profile-dropdown-item--danger"
            onClick={() => { setOpen(false); onSignOut?.(); }}
          >
            <LogOut size={15} strokeWidth={2.1} />
            Cerrar Sesión
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD CLIENTE
// ════════════════════════════════════════════════════
function DashboardCliente({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode, onGoToTracking, onGoToHistorial, onGoToPago, onGoToTiendas }) {
  const [pedidos, setPedidos]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('todos');
  const [expanded, setExpanded]       = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [clientNotifications, setClientNotifications] = useState([]);
  const [showClientNotifCenter, setShowClientNotifCenter] = useState(false);
  const [activeAlertPill, setActiveAlertPill] = useState(null);
  // Estado React para IDs leídos — evita que re-renders por pedidos borre el estado "leído"
  const [readIdsState, setReadIdsState] = useState(() => getClientReadOrderIds());
  // Ref para saber si el usuario cerró manualmente la píldora de alerta activa
  const dismissedPillRef = useRef(new Set());
  const [topClienteScope, setTopClienteScope] = useState('todo'); // 'todo' | 'fecha'
  const [showAllTopCliente, setShowAllTopCliente] = useState(false);

  // Fecha local de hoy en formato YYYY-MM-DD
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const [selectedDate, setSelectedDate] = useState(localToday);

  const ESTADO_LABEL = {
    pendiente: 'Pendiente', confirmado: 'Confirmado', en_preparacion: 'En preparación',
    en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado',
  };
  const ESTADOS_FILTER = ['todos', 'pendiente', 'en_camino', 'entregado', 'cancelado'];

  async function fetchPedidos(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    const { data } = await supabase
      .from('pedidos_entregas')
      .select(`
        id, estado, total_usd, created_at, valoracion, comentario, direccion_entrega,
        confirmacion_cliente, repartidor_id,
        comercios_datos ( id, nombre_comercial ),
        repartidores_datos (
          id, vehiculo, placa,
          profiles ( nombre_completo, telefono )
        ),
        pedido_items (
          cantidad, precio_usd, subtotal_usd,
          productos ( id, nombre, imagen_url )
        ),
        reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
      `)
      .eq('cliente_id', session.user.id)
      .order('created_at', { ascending: false });

    setPedidos(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchPedidos(); }, [session]);

  // Escuchar evento de repartidor asignado en tiempo real para refrescar
  useEffect(() => {
    const handleRepAsig = () => {
      fetchPedidos(true);
    };
    window.addEventListener('levant_repartidor_asignado', handleRepAsig);
    return () => window.removeEventListener('levant_repartidor_asignado', handleRepAsig);
  }, []);

  // Sincronizar pedidos con las notificaciones del cliente para la campana de alertas
  // Depende de [pedidos, readIdsState] — readIdsState es React state, NO localStorage directo
  useEffect(() => {
    if (!pedidos || pedidos.length === 0) {
      setClientNotifications([]);
      setActiveAlertPill(null);
      return;
    }

    // Usamos readIdsState (React state) en vez de leer localStorage en cada render
    const readIds = readIdsState;
    const notifs = [];

    pedidos.forEach((p) => {
      const shortId = p.id ? p.id.slice(0, 8) : '--------';
      const comercioName = p.comercios_datos?.nombre_comercial || 'Comercio';
      const repName = p.repartidores_datos?.profiles?.nombre_completo;
      const vehiculo = p.repartidores_datos?.vehiculo || '';
      const placa = p.repartidores_datos?.placa ? `(${p.repartidores_datos.placa})` : '';

      // 1. Repartidor Asignado
      if (repName && p.estado !== 'cancelado') {
        const isRead = readIds.has(`${p.id}-repartidor`);
        notifs.push({
          id: `notif-rep-${p.id}`,
          orderId: p.id,
          tipo: 'repartidor',
          title: `¡Repartidor Asignado! #${shortId}`,
          desc: `${repName} ${vehiculo ? `(${vehiculo} ${placa}) ` : ''}tiene asignado tu pedido de ${comercioName}.`,
          total: p.total_usd,
          timestamp: p.updated_at || p.created_at,
          unread: !isRead,
          pedido: p,
        });
      }

      // 2. En Camino
      if (p.estado === 'en_camino') {
        const isRead = readIds.has(`${p.id}-en_camino`);
        notifs.push({
          id: `notif-camino-${p.id}`,
          orderId: p.id,
          tipo: 'en_camino',
          title: `Pedido en Camino #${shortId}`,
          desc: `Tu pedido de ${comercioName} está en ruta hacia tu dirección de entrega.`,
          total: p.total_usd,
          timestamp: p.updated_at || p.created_at,
          unread: !isRead,
          pedido: p,
        });
      }

      // 3. Entregado
      if (p.estado === 'entregado') {
        const isRead = readIds.has(`${p.id}-entregado`);
        notifs.push({
          id: `notif-entr-${p.id}`,
          orderId: p.id,
          tipo: 'entregado',
          title: `Pedido Entregado #${shortId}`,
          desc: `Tu pedido de ${comercioName} ha sido entregado exitosamente.`,
          total: p.total_usd,
          timestamp: p.updated_at || p.created_at,
          unread: !isRead,
          pedido: p,
        });
      }
    });

    setClientNotifications(notifs);

    // Hero live pill — solo se muestra si no fue descartada manualmente por el usuario
    const unreadRep = notifs.filter(
      (n) => n.unread && (n.tipo === 'repartidor' || n.tipo === 'en_camino')
    );
    if (unreadRep.length > 0) {
      const target = unreadRep[0];
      // No mostrar la píldora si el usuario ya la descartó para este pedido/tipo
      const pillKey = `${target.orderId}-${target.tipo}`;
      if (!dismissedPillRef.current.has(pillKey)) {
        setActiveAlertPill({
          orderId: target.orderId,
          tipo: target.tipo,
          title: target.tipo === 'repartidor'
            ? `¡Repartidor Asignado! #${target.orderId.slice(0, 8)}`
            : `¡Pedido en Camino! #${target.orderId.slice(0, 8)}`,
          total: target.total,
        });
      }
    } else {
      setActiveAlertPill(null);
    }
  }, [pedidos, readIdsState]);

  // Escuchar cambios de IDs leídos desde otras pestañas o desde markClientOrderAsRead
  useEffect(() => {
    const syncReadIds = () => {
      setReadIdsState(getClientReadOrderIds());
    };
    window.addEventListener('levant_client_read_orders_updated', syncReadIds);
    return () => window.removeEventListener('levant_client_read_orders_updated', syncReadIds);
  }, []);

  const handleMarkItemAsRead = (orderId, tipo) => {
    // 1. Guardar en localStorage y actualizar React state para que el useEffect no revierta
    markClientOrderAsRead(orderId, tipo);
    setReadIdsState(getClientReadOrderIds());
    // 2. Actualizar notificaciones locales
    setClientNotifications((prev) =>
      prev.map((n) => (n.orderId === orderId && n.tipo === tipo ? { ...n, unread: false } : n))
    );
    // 3. Cerrar la píldora activa y registrar como descartada
    setActiveAlertPill((prev) => {
      if (prev?.orderId === orderId) {
        dismissedPillRef.current.add(`${orderId}-${tipo}`);
        return null;
      }
      return prev;
    });
  };

  const handleMarkAllAsRead = () => {
    markAllClientOrdersAsRead(clientNotifications);
    // Actualizar React state con todos los IDs leídos
    setReadIdsState(getClientReadOrderIds());
    setClientNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    // Registrar todas como descartadas para la píldora
    clientNotifications.forEach((n) => {
      dismissedPillRef.current.add(`${n.orderId}-${n.tipo}`);
    });
    setActiveAlertPill(null);
  };

  // Pedidos de la fecha seleccionada
  const isToday = selectedDate === localToday;
  const pedidosFecha = pedidos.filter(p => p.created_at?.slice(0, 10) === selectedDate);

  // ── Top Productos Más Comprados ──────────────────────────────
  const topProductosComprados = useMemo(() => {
    const targetPedidos = topClienteScope === 'fecha' ? pedidosFecha : pedidos;
    const map = new Map();

    targetPedidos.forEach(p => {
      if (p.estado === 'cancelado') return;
      const comercioNombre = p.comercios_datos?.nombre_comercial || 'Comercio';
      (p.pedido_items || []).forEach(item => {
        const prod = item.productos;
        const nombre = prod?.nombre || 'Producto';
        const key = prod?.id || nombre;
        const cant = Number(item.cantidad) || 1;
        const precio = Number(item.precio_usd) || 0;
        const subtotal = Number(item.subtotal_usd) || (cant * precio);
        const img = prod?.imagen_url || null;

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            nombre,
            comercio: comercioNombre,
            imagen_url: img,
            totalComprados: 0,
            totalGastado: 0,
            vecesPedido: 0,
          });
        }
        const entry = map.get(key);
        entry.totalComprados += cant;
        entry.totalGastado += subtotal;
        entry.vecesPedido += 1;
        if (!entry.imagen_url && img) entry.imagen_url = img;
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalComprados - a.totalComprados || b.totalGastado - a.totalGastado);
  }, [pedidos, pedidosFecha, topClienteScope]);

  const maxComprados = topProductosComprados[0]?.totalComprados || 1;

  if (loading) return <div className="db-loading"><span className="db-spinner" /></div>;

  // KPIs del período
  const totalFecha     = pedidosFecha.length;
  const entregadosFecha = pedidosFecha.filter(p => p.estado === 'entregado').length;
  const pendientesFecha = pedidosFecha.filter(p => ['pendiente', 'confirmado', 'en_preparacion'].includes(p.estado)).length;
  const enCaminoFecha  = pedidosFecha.filter(p => p.estado === 'en_camino').length;
  const gastoFecha     = pedidosFecha.filter(p => p.estado === 'entregado').reduce((a, p) => a + Number(p.total_usd), 0);

  // Filtro de estado sobre la fecha seleccionada
  const filtrados = filter === 'todos'
    ? pedidosFecha
    : pedidosFecha.filter(p => p.estado === filter);

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('es-VE', {
    hour: '2-digit', minute: '2-digit',
  });
  const dateLabel = isToday
    ? new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
    : new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="db-root">
      {/* Hero */}
      <div className="db-hero">
        <div>
          <h1 className="db-hero-title">📦 Mis Pedidos</h1>
          <p className="db-hero-sub" style={{ textTransform: 'capitalize' }}>{dateLabel}</p>
        </div>
        <div className="db-hero-right">
          {/* Botón directo de Realizar Pedido en cabecera */}
          <button
            type="button"
            className="db-hero-order-cta"
            onClick={() => onGoToTiendas?.()}
            title="Explorar tiendas y realizar pedido"
          >
            <span className="db-hero-order-cta-icon">🛍️</span>
            <span>Realizar Pedido</span>
          </button>

          {/* Píldora de Alerta en Vivo para el Cliente */}
          {activeAlertPill && (
            <div
              className={`db-alert-hero-chip db-alert-hero-chip--${activeAlertPill.tipo}`}
              onClick={() => {
                handleMarkItemAsRead(activeAlertPill.orderId, activeAlertPill.tipo);
                onGoToTracking?.(activeAlertPill.orderId);
              }}
              title="Clic para ver seguimiento en vivo"
            >
              <span className="db-alert-hero-pulse" />
              <span className="db-alert-hero-icon">🛵</span>
              <span className="db-alert-hero-text">
                <strong>{activeAlertPill.title}</strong>
                {activeAlertPill.total !== undefined && ` · $${Number(activeAlertPill.total).toFixed(2)}`}
              </span>
              <span className="db-alert-hero-cta">Ver →</span>
              <button
                type="button"
                className="db-alert-hero-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkItemAsRead(activeAlertPill.orderId, activeAlertPill.tipo);
                  setActiveAlertPill(null);
                }}
                title="Cerrar y marcar como leída"
              >
                ✕
              </button>
            </div>
          )}

          {registeredRol === 'comercio' ? (
            <div className="db-rol-toggle">
              <button
                type="button"
                className={`db-rol-toggle-btn ${currentRol === 'comercio' ? 'db-rol-toggle-btn--active' : ''}`}
                onClick={() => onSwitchMode?.('comercio')}
              >
                <Store size={12} strokeWidth={2.2} />
                <span>Comercio</span>
              </button>
              <button
                type="button"
                className={`db-rol-toggle-btn ${currentRol === 'cliente' ? 'db-rol-toggle-btn--active db-rol-toggle-btn--active-cliente' : ''}`}
                onClick={() => onSwitchMode?.('cliente')}
              >
                <User size={12} strokeWidth={2.2} />
                <span>Cliente</span>
              </button>
            </div>
          ) : (
            <span className="db-hero-badge db-hero-badge--cliente">👤 Cliente</span>
          )}

          {/* Campana de Notificaciones y Alertas de Cliente */}
          <div className="db-hero-alerts-bell-wrap">
            <ClienteAlertCenter
              notifications={clientNotifications}
              unreadCount={clientNotifications.filter((n) => n.unread).length}
              isOpen={showClientNotifCenter}
              onToggleOpen={() => setShowClientNotifCenter((prev) => !prev)}
              onClose={() => setShowClientNotifCenter(false)}
              onMarkAllAsRead={handleMarkAllAsRead}
              onMarkItemAsRead={handleMarkItemAsRead}
              onClearHistory={handleMarkAllAsRead}
              onGoToTracking={(orderId) => {
                setShowClientNotifCenter(false);
                onGoToTracking?.(orderId);
              }}
            />
          </div>

          <button
            className="db-refresh-btn"
            onClick={() => fetchPedidos(true)}
            disabled={refreshing}
            aria-label="Actualizar pedidos"
            title="Actualizar"
          >
            <span className={refreshing ? 'db-refresh-spin' : ''}>↻</span>
          </button>
          <ProfileMenu
            session={session}
            onSignOut={onSignOut}
            onGoToProfile={onGoToProfile}
            registeredRol={registeredRol}
            currentRol={currentRol}
            onSwitchMode={onSwitchMode}
          />
        </div>
      </div>

      {/* ── Banner Principal Destacado: Realizar Pedido ── */}
      <div className="db-quick-order-hero">
        <div className="db-quick-order-hero-content">
          <div className="db-quick-order-hero-icon-box">
            <span className="db-quick-order-hero-pulse" />
            <span className="db-quick-order-hero-emoji">🛍️</span>
          </div>
          <div className="db-quick-order-hero-text">
            <span className="db-quick-order-hero-badge">Tiendas & Delivery Levant</span>
            <h2 className="db-quick-order-hero-title">¿Qué deseas pedir hoy?</h2>
            <p className="db-quick-order-hero-desc">
              Explora todos los comercios disponibles, añade tus productos al carrito y recibe tu delivery al instante.
            </p>
          </div>
        </div>
        <button
          type="button"
          id="btn-realizar-pedido-home"
          className="db-quick-order-hero-btn"
          onClick={() => onGoToTiendas?.()}
        >
          <span>🛍️ Realizar Pedido</span>
          <span className="db-quick-order-hero-btn-arrow">➔</span>
        </button>
      </div>

      {/* Banner interactivo si hay un pedido activo con repartidor asignado */}
      {(() => {
        const activeOrderWithRep = pedidos.find(p => 
          p.repartidores_datos?.profiles?.nombre_completo &&
          ['pendiente', 'confirmado', 'en_preparacion', 'en_camino'].includes(p.estado)
        );
        if (!activeOrderWithRep) return null;
        const repName = activeOrderWithRep.repartidores_datos.profiles.nombre_completo;
        const vehiculo = activeOrderWithRep.repartidores_datos.vehiculo || 'Repartidor';
        const comercio = activeOrderWithRep.comercios_datos?.nombre_comercial || 'Comercio';

        return (
          <div className="ca-dashboard-banner">
            <div className="ca-dashboard-banner-left">
              <span className="ca-dashboard-banner-icon">🛵</span>
              <div>
                <h4 className="ca-dashboard-banner-title">
                  ¡Repartidor asignado a tu pedido!
                </h4>
                <p className="ca-dashboard-banner-sub">
                  <strong>{repName}</strong> ({vehiculo}) está asignado a tu pedido de <strong>{comercio}</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="ca-dashboard-banner-btn"
              onClick={() => onGoToTracking?.(activeOrderWithRep.id)}
            >
              🛵 Rastrear Pedido ➔
            </button>
          </div>
        );
      })()}

      {/* Selector de fecha */}
      <div className="db-date-bar">
        <div className="db-date-bar-left">
          <span className="db-date-bar-icon">📅</span>
          <span className="db-date-bar-label">{isToday ? 'Hoy' : 'Fecha seleccionada'}</span>
          <input
            type="date"
            className="db-date-input"
            value={selectedDate}
            max={localToday}
            onChange={e => { setSelectedDate(e.target.value); setFilter('todos'); setExpanded(null); }}
          />
        </div>
        {!isToday && (
          <button
            className="db-date-today-btn"
            onClick={() => { setSelectedDate(localToday); setFilter('todos'); setExpanded(null); }}
          >
            ↩ Volver a hoy
          </button>
        )}
      </div>

      {/* KPIs del período */}
      <div className="db-kpis">
        <KpiCard
          icon={BoxIcon}
          tag={isToday ? 'Hoy' : 'Ese día'}
          label="Pedidos del día"
          value={totalFecha}
          color="#f59e0b"
          sub={totalFecha === 0 ? 'Sin pedidos ese día' : `${totalFecha} pedido${totalFecha !== 1 ? 's' : ''} realizados`}
        />
        <KpiCard
          icon={CheckCircleIcon}
          tag="Entregados"
          label="Completados"
          value={entregadosFecha}
          color="#10b981"
          iconBg="#192820"
          sub={entregadosFecha > 0 ? `$${fmt(gastoFecha)} gastados` : 'Sin entregas'}
        />
        <KpiCard
          icon={MotoIcon}
          tag="En camino"
          label="En ruta"
          value={enCaminoFecha}
          color="#818cf8"
          iconBg="#1a1a2e"
          sub={enCaminoFecha > 0 ? 'Pedido en camino 🛵' : 'Sin pedidos en ruta'}
        />
        <KpiCard
          icon={WrenchIcon}
          tag="Pendientes"
          label="Por procesar"
          value={pendientesFecha}
          color="#38bdf8"
          iconBg="#0c1f2e"
          sub={pendientesFecha > 0 ? 'Esperando confirmación' : 'Todo al día ✓'}
        />
      </div>

      {/* ═══ TOP PRODUCTOS MÁS COMPRADOS ═══ */}
      <div className="db-top-section db-top-section--cliente">
        <div className="db-top-header">
          <div className="db-top-header-left">
            <div className="db-top-badge-title">
              <span className="db-top-header-icon">⭐</span>
              <h2 className="db-top-title">Tus Productos Más Comprados</h2>
            </div>
            <p className="db-top-sub">
              Tus artículos preferidos y compras frecuentes en la plataforma
            </p>
          </div>
          <div className="db-top-header-right">
            <div className="db-top-scope-toggle">
              <button
                type="button"
                className={`db-top-scope-btn ${topClienteScope === 'todo' ? 'db-top-scope-btn--active' : ''}`}
                onClick={() => setTopClienteScope('todo')}
              >
                Histórico Total
              </button>
              <button
                type="button"
                className={`db-top-scope-btn ${topClienteScope === 'fecha' ? 'db-top-scope-btn--active' : ''}`}
                onClick={() => setTopClienteScope('fecha')}
              >
                {isToday ? 'De Hoy' : 'Fecha Seleccionada'}
              </button>
            </div>
            {onGoToTiendas && (
              <button
                type="button"
                className="db-top-header-action-btn"
                onClick={() => onGoToTiendas()}
              >
                <ShoppingBag size={14} />
                <span>Explorar Tiendas</span>
              </button>
            )}
          </div>
        </div>

        {topProductosComprados.length === 0 ? (
          <div className="db-top-empty">
            <span className="db-top-empty-icon">🛍️</span>
            <div>
              <h4 className="db-top-empty-title">
                {topClienteScope === 'fecha'
                  ? 'No realizaste compras de productos en esta fecha'
                  : 'Aún no tienes productos comprados'}
              </h4>
              <p className="db-top-empty-desc">
                {topClienteScope === 'fecha'
                  ? 'Cambia al filtro "Histórico Total" para ver tu ranking general.'
                  : 'Explora nuestros comercios y pide tus productos favoritos para armar tu top personal.'}
              </p>
            </div>
            {onGoToTiendas && (
              <button type="button" className="db-top-cta-btn" onClick={() => onGoToTiendas()}>
                Ir a Tiendas ➔
              </button>
            )}
          </div>
        ) : (
          <div className="db-top-grid">
            {(showAllTopCliente ? topProductosComprados : topProductosComprados.slice(0, 5)).map((prod, idx) => {
              const rank = idx + 1;
              const isFirst = rank === 1;
              const isSecond = rank === 2;
              const isThird = rank === 3;
              const pct = Math.round((prod.totalComprados / maxComprados) * 100);

              return (
                <div
                  key={prod.id || idx}
                  className={`db-top-card ${isFirst ? 'db-top-card--first' : ''} ${isSecond ? 'db-top-card--second' : ''} ${isThird ? 'db-top-card--third' : ''}`}
                >
                  <div className="db-top-card-rank-wrap">
                    {isFirst && (
                      <span className="db-top-rank-badge db-top-rank-badge--gold">
                        👑 #1 Más Comprado
                      </span>
                    )}
                    {isSecond && (
                      <span className="db-top-rank-badge db-top-rank-badge--silver">
                        🥈 #2 Favorito
                      </span>
                    )}
                    {isThird && (
                      <span className="db-top-rank-badge db-top-rank-badge--bronze">
                        🥉 #3 Top
                      </span>
                    )}
                    {!isFirst && !isSecond && !isThird && (
                      <span className="db-top-rank-badge db-top-rank-badge--default">
                        #{rank}
                      </span>
                    )}
                  </div>

                  <div className="db-top-card-content">
                    <div className="db-top-img-wrap">
                      {prod.imagen_url ? (
                        <img src={prod.imagen_url} alt={prod.nombre} className="db-top-img" />
                      ) : (
                        <div className="db-top-img-fallback">
                          <span>🍽️</span>
                        </div>
                      )}
                      {isFirst && <span className="db-top-first-glow" />}
                    </div>

                    <div className="db-top-card-info">
                      <div className="db-top-card-main-meta">
                        <h3 className="db-top-prod-name" title={prod.nombre}>
                          {prod.nombre}
                        </h3>
                        <span className="db-top-comercio-tag">
                          🏪 {prod.comercio}
                        </span>
                      </div>

                      <div className="db-top-stats-row">
                        <div className="db-top-stat-chip db-top-stat-chip--qty">
                          <span className="db-top-stat-val">{prod.totalComprados}</span>
                          <span className="db-top-stat-lbl">
                            {prod.totalComprados === 1 ? 'unidad' : 'unidades'}
                          </span>
                        </div>
                        <div className="db-top-stat-chip db-top-stat-chip--spent">
                          <span className="db-top-stat-val">${prod.totalGastado.toFixed(2)}</span>
                          <span className="db-top-stat-lbl">total</span>
                        </div>
                        <div className="db-top-stat-chip db-top-stat-chip--orders">
                          <span className="db-top-stat-val">{prod.vecesPedido}</span>
                          <span className="db-top-stat-lbl">
                            {prod.vecesPedido === 1 ? 'pedido' : 'pedidos'}
                          </span>
                        </div>
                      </div>

                      <div className="db-top-progress-wrap" title={`Frecuencia de compra: ${pct}% respecto a tu producto más pedido`}>
                        <div className="db-top-progress-bg">
                          <div
                            className="db-top-progress-fill db-top-progress-fill--cliente"
                            style={{ width: `${Math.max(pct, 8)}%` }}
                          />
                        </div>
                        <span className="db-top-progress-lbl">{pct}%</span>
                      </div>
                    </div>

                    {onGoToTiendas && (
                      <button
                        type="button"
                        className="db-top-card-action-btn"
                        onClick={() => onGoToTiendas()}
                        title="Ver tiendas para pedir de nuevo"
                      >
                        <span>Pedir</span>
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {topProductosComprados.length > 5 && (
          <div className="db-top-footer-toggle">
            <button
              type="button"
              className="db-top-toggle-more-btn"
              onClick={() => setShowAllTopCliente(prev => !prev)}
            >
              {showAllTopCliente
                ? '▲ Ver menos'
                : `▼ Ver ranking completo (${topProductosComprados.length} productos)`}
            </button>
          </div>
        )}
      </div>

      {/* Lista de pedidos */}
      <div className="db-section">
        <div className="db-section-header">
          <h2 className="db-section-title">{isToday ? 'Pedidos de hoy' : 'Pedidos del día'}</h2>
          <p className="db-section-sub">
            {totalFecha === 0 ? 'No realizaste pedidos este día' : `${totalFecha} pedido${totalFecha !== 1 ? 's' : ''} registrados`}
          </p>
        </div>

        {/* Filtros */}
        <div className="db-day-filters" role="tablist">
          {ESTADOS_FILTER.map(f => (
            <button
              key={f}
              id={`db-filter-${f}`}
              role="tab"
              aria-selected={filter === f}
              className={`db-day-filter-btn ${filter === f ? 'db-day-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'todos' ? '🗂 Todos' : ESTADO_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="db-day-empty">
            <span>🛍️</span>
            <p>
              {totalFecha === 0
                ? isToday ? '¡Sin pedidos hoy! Ve a Tiendas para hacer tu primer pedido.' : 'No realizaste pedidos en esta fecha.'
                : `No hay pedidos con estado "${ESTADO_LABEL[filter] || filter}" en este período.`
              }
            </p>
          </div>
        ) : (
          <div className="db-day-list">
            {filtrados.map(pedido => {
              const isOpen     = expanded === pedido.id;
              const tienePago  = pedido.reportes_pago?.length > 0;
              const yaConfirmo = Boolean(pedido.confirmacion_cliente || pedido.valoracion);
              const badgeColor = ESTADO_COLOR[pedido.estado] || '#64748b';
              const badgeLabel = pedido.estado === 'entregado' && !yaConfirmo
                ? 'Por confirmar'
                : (ESTADO_LABEL[pedido.estado] || pedido.estado);

              return (
                <div key={pedido.id} className={`db-day-card ${isOpen ? 'db-day-card--open' : ''}`}>
                  {/* Cabecera */}
                  <button
                    className="db-day-card-header"
                    onClick={() => setExpanded(prev => prev === pedido.id ? null : pedido.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="db-day-card-left">
                      <span
                        className="db-day-badge"
                        style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}
                      >
                        {badgeLabel}
                      </span>
                      <span className={`db-day-badge-pago ${tienePago ? 'db-day-badge-pago--pagado' : 'db-day-badge-pago--pendiente'}`}>
                        {tienePago ? '✅ Pagado' : '⏳ Pendiente por Pagar'}
                      </span>
                      {pedido.repartidores_datos?.profiles?.nombre_completo && (
                        <span className="db-day-badge-repartidor">
                          🛵 {pedido.repartidores_datos.profiles.nombre_completo}
                        </span>
                      )}
                      <div>
                        <p className="db-day-comercio">{pedido.comercios_datos?.nombre_comercial ?? '—'}</p>
                        <p className="db-day-time">{formatTime(pedido.created_at)}</p>
                      </div>
                    </div>
                    <div className="db-day-card-right">
                      <span className="db-day-total">${pedido.total_usd?.toFixed(2)}</span>
                      <span className={`db-day-chevron ${isOpen ? 'db-day-chevron--up' : ''}`}>›</span>
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {isOpen && (
                    <div className="db-day-card-body">
                      {/* Items del pedido */}
                      {(pedido.pedido_items ?? []).length > 0 && (
                        <div className="db-day-items">
                          {pedido.pedido_items.map((item, i) => (
                            <div key={i} className="db-day-item-row">
                              {item.productos?.imagen_url && (
                                <img src={item.productos.imagen_url} alt={item.productos?.nombre} className="db-day-item-img" />
                              )}
                              <span className="db-day-item-name">{item.productos?.nombre ?? '—'}</span>
                              <span className="db-day-item-qty">x{item.cantidad}</span>
                              <span className="db-day-item-sub">${item.subtotal_usd?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Meta info */}
                      <div className="db-day-meta">
                        {pedido.direccion_entrega && (
                          <div className="db-day-meta-row">
                            <span className="db-day-meta-label">📍 Dirección</span>
                            <span>{pedido.direccion_entrega}</span>
                          </div>
                        )}
                        {pedido.repartidores_datos?.profiles?.nombre_completo && (
                          <div className="db-day-meta-row">
                            <span className="db-day-meta-label">🛵 Repartidor</span>
                            <span>{pedido.repartidores_datos.profiles.nombre_completo}</span>
                          </div>
                        )}
                        <div className="db-day-meta-row">
                          <span className="db-day-meta-label">💳 Pago</span>
                          {tienePago ? (
                            <span>
                              {pedido.reportes_pago[0].metodo?.replace(/_/g, ' ')} —
                              Ref: {pedido.reportes_pago[0].referencia} —{' '}
                              <span style={{ color: pedido.reportes_pago[0].estado === 'verificado' ? '#10b981' : '#f59e0b' }}>
                                {pedido.reportes_pago[0].estado}
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: '#f87171' }}>Sin reporte de pago</span>
                          )}
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="db-day-actions">
                        {!tienePago && (
                          <a
                            href="#"
                            className="db-day-btn db-day-btn--pagar"
                            onClick={e => { e.preventDefault(); onGoToPago?.(pedido.id); }}
                          >
                            💳 Reportar Pago
                          </a>
                        )}
                        {pedido.estado === 'entregado' && !yaConfirmo && tienePago && (
                          <span className="db-day-meta-label" style={{ color: '#f59e0b' }}>
                            ⚠️ Ve a Rastreo &amp; Chat para confirmar la recepción
                          </span>
                        )}
                        {pedido.estado === 'entregado' && yaConfirmo && (
                          <span style={{ color: '#10b981', fontSize: '0.82rem' }}>✅ Entrega confirmada</span>
                        )}
                        {pedido.repartidores_datos?.profiles?.nombre_completo && (
                          <button
                            type="button"
                            className="db-day-btn"
                            style={{
                              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                              color: '#ffffff',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '8px',
                              fontWeight: 600,
                              fontSize: '0.78rem'
                            }}
                            onClick={() => onGoToTracking?.(pedido.id)}
                          >
                            🛵 Rastrear Pedido &amp; Chat
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enlace a historial completo */}
      {pedidos.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => onGoToHistorial?.()}
            style={{
              background: 'rgba(249,115,22,0.12)',
              border: '1px solid rgba(249,115,22,0.3)',
              color: '#fb923c',
              borderRadius: '10px',
              padding: '0.55rem 1.4rem',
              fontSize: '0.83rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.2s ease',
            }}
          >
            📋 Ver historial completo de pedidos
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD COMERCIO
// ════════════════════════════════════════════════════
function DashboardComercio({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode, onGoToTiendas }) {
  const [pedidos, setPedidos]       = useState([]);
  const [productos, setProductos]   = useState([]);
  const [comercio, setComercio]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState('todos');
  const [expanded, setExpanded]     = useState(null);
  const [topComercioScope, setTopComercioScope] = useState('todo'); // 'todo' | 'fecha'
  const [showAllTopComercio, setShowAllTopComercio] = useState(false);

  // Fecha seleccionada (local YYYY-MM-DD)
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const [selectedDate, setSelectedDate] = useState(localToday);

  const ESTADO_LABEL = {
    pendiente: 'Pendiente', confirmado: 'Confirmado', en_preparacion: 'En preparación',
    en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado',
  };
  const ESTADOS_FILTER = ['todos', 'pendiente', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];

  async function fetchData(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    const { data: com } = await supabase
      .from('comercios_datos')
      .select('id, nombre_comercial, categoria')
      .eq('profile_id', session.user.id)
      .single();

    if (!com) { setLoading(false); setRefreshing(false); return; }
    setComercio(com);

    const [{ data: p }, { data: prods }] = await Promise.all([
      supabase
        .from('pedidos_entregas')
        .select(`
          id, estado, total_usd, created_at, updated_at, direccion_entrega, confirmacion_cliente,
          profiles ( nombre_completo ),
          repartidores_datos ( profiles ( nombre_completo ) ),
          pedido_items (
            cantidad, precio_usd, subtotal_usd,
            productos ( id, nombre, imagen_url, precio_usd )
          ),
          reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
        `)
        .eq('comercio_id', com.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('productos')
        .select('id, nombre, stock, precio_usd, activo')
        .eq('comercio_id', com.id),
    ]);

    setPedidos(p ?? []);
    setProductos(prods ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchData(); }, [session]);

  // ── Alertas en Tiempo Real para Dashboard Comercio ─────────────
  const [alertToasts, setAlertToasts] = useState([]);
  const [alertNotifications, setAlertNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('levant_comercio_notifs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const [activeAlertPill, setActiveAlertPill] = useState(null);
  const knownOrdersRef = useRef(new Map());
  const initialLoadedRef = useRef(false);
  const alertedEventsRef = useRef(new Set());
  const dismissedPillsRef = useRef(new Set());

  useEffect(() => {
    try {
      localStorage.setItem('levant_comercio_notifs', JSON.stringify(alertNotifications.slice(0, 50)));
    } catch {
      // Ignorar
    }
  }, [alertNotifications]);

  // ── Sincronizar pedidos con las alertas para que SOLO los pedidos no leídos aparezcan ──
  useEffect(() => {
    if (!pedidos || pedidos.length === 0) {
      setAlertNotifications([]);
      setActiveAlertPill(null);
      return;
    }

    const readIds = getReadOrderIds();
    const notifs = [];

    pedidos.forEach((p) => {
      const estadoNorm = (p.estado || '').toLowerCase();
      const isPendiente = estadoNorm === 'pendiente' || estadoNorm === 'confirmado';
      const isEntregado = estadoNorm === 'entregado' || p.confirmacion_cliente === true;
      const clientName = (p.profiles?.nombre_completo) || (Array.isArray(p.profiles) ? p.profiles[0]?.nombre_completo : null) || 'Cliente';
      const shortId = p.id ? p.id.slice(0, 8) : '--------';

      // SOLO agregar a las alertas activas si NO ha sido leído:
      if (isPendiente && !readIds.has(p.id)) {
        notifs.push({
          id: `order-pend-${p.id}`,
          orderId: p.id,
          tipo: 'nuevo',
          title: `Pedido Hecho #${shortId}`,
          desc: `Cliente: ${clientName} · ${p.direccion_entrega || 'Dirección de entrega'}`,
          total: p.total_usd,
          clientName,
          pedido: p,
          timestamp: p.created_at,
          unread: true,
        });
      } else if (isEntregado && !readIds.has(`${p.id}-entregado`)) {
        notifs.push({
          id: `order-entr-${p.id}`,
          orderId: p.id,
          tipo: 'entregado',
          title: `Pedido Entregado #${shortId}`,
          desc: `Entregado exitosamente a ${clientName}`,
          total: p.total_usd,
          clientName,
          pedido: p,
          timestamp: p.updated_at || p.created_at,
          unread: true,
        });
      }
    });

    setAlertNotifications(notifs);

    // La píldora en el header SOLO aparece si hay pedidos NO LEÍDOS:
    const unreadPending = notifs.filter((n) => n.tipo === 'nuevo');
    const unreadDelivered = notifs.filter((n) => n.tipo === 'entregado');

    if (unreadPending.length > 0) {
      const target = unreadPending[0];
      setActiveAlertPill({
        tipo: 'nuevo',
        title: unreadPending.length === 1
          ? `¡Pedido Hecho! #${target.orderId.slice(0, 8)} (${target.clientName})`
          : `¡${unreadPending.length} Pedidos Nuevos!`,
        total: target.total,
        orderId: target.orderId,
      });
    } else if (unreadDelivered.length > 0) {
      const target = unreadDelivered[0];
      setActiveAlertPill({
        tipo: 'entregado',
        title: unreadDelivered.length === 1
          ? `¡Pedido Entregado! #${target.orderId.slice(0, 8)} (${target.clientName})`
          : `¡${unreadDelivered.length} Pedidos Entregados!`,
        total: target.total,
        orderId: target.orderId,
      });
    } else {
      // Si todos fueron leídos: la alerta NO debe aparecer más
      setActiveAlertPill(null);
    }
  }, [pedidos]);

  // ── Sincronizar en tiempo real cuando se lean alertas ────────────
  useEffect(() => {
    const handleReadUpdated = () => {
      const readIds = getReadOrderIds();
      setAlertNotifications((prev) => {
        const next = prev.filter((n) => {
          const key = n.tipo === 'entregado' ? `${n.orderId}-entregado` : n.orderId;
          return !readIds.has(key);
        });

        // Actualizar píldora de alerta superior en vivo
        const nextPending = next.filter((n) => n.tipo === 'nuevo');
        const nextDelivered = next.filter((n) => n.tipo === 'entregado');
        if (nextPending.length > 0) {
          const target = nextPending[0];
          setActiveAlertPill({
            tipo: 'nuevo',
            title: nextPending.length === 1
              ? `¡Pedido Hecho! #${target.orderId.slice(0, 8)} (${target.clientName || 'Cliente'})`
              : `¡${nextPending.length} Pedidos Nuevos!`,
            total: target.total,
            orderId: target.orderId,
          });
        } else if (nextDelivered.length > 0) {
          const target = nextDelivered[0];
          setActiveAlertPill({
            tipo: 'entregado',
            title: nextDelivered.length === 1
              ? `¡Pedido Entregado! #${target.orderId.slice(0, 8)} (${target.clientName || 'Cliente'})`
              : `¡${nextDelivered.length} Pedidos Entregados!`,
            total: target.total,
            orderId: target.orderId,
          });
        } else {
          setActiveAlertPill(null);
        }

        return next;
      });

      setAlertToasts((prev) =>
        prev.filter((t) => {
          const key = t.tipo === 'entregado' ? `${t.orderId}-entregado` : t.orderId;
          return !readIds.has(key);
        })
      );
    };

    window.addEventListener('levant_read_orders_updated', handleReadUpdated);
    return () => window.removeEventListener('levant_read_orders_updated', handleReadUpdated);
  }, []);

  const handleMarkItemAsRead = (orderId, tipo = 'nuevo') => {
    if (!orderId) return;
    markOrderAsRead(orderId, tipo);
    setAlertNotifications((prev) => prev.filter((n) => n.orderId !== orderId));
    setActiveAlertPill((prev) => (prev?.orderId === orderId ? null : prev));
    setAlertToasts((prev) => prev.filter((t) => t.orderId !== orderId));
  };

  const handleMarkAllAsRead = () => {
    markAllOrdersAsRead(alertNotifications);
    setAlertNotifications([]);
    setActiveAlertPill(null);
    setAlertToasts([]);
  };

  useEffect(() => {
    if (!comercio?.id) return;
    let isMounted = true;

    // Inicializar pedidos conocidos
    const initOrders = async () => {
      try {
        const { data } = await supabase
          .from('pedidos_entregas')
          .select('id, estado, confirmacion_cliente')
          .eq('comercio_id', comercio.id)
          .limit(100);

        if (isMounted && data) {
          data.forEach(p => {
            const effective = (p.estado === 'entregado' || p.confirmacion_cliente) ? 'entregado' : (p.estado || 'pendiente');
            knownOrdersRef.current.set(p.id, effective);
          });
          initialLoadedRef.current = true;
        }
      } catch (e) {
        console.warn('Error inicializando pedidos en dashboard:', e);
      }
    };
    initOrders();

    const triggerNewOrderAlert = (ord) => {
      if (!ord?.id) return;
      if (isOrderRead(ord.id, 'nuevo')) return;

      const key = `nuevo-${ord.id}`;
      if (alertedEventsRef.current.has(key)) return;
      alertedEventsRef.current.add(key);
      knownOrdersRef.current.set(ord.id, ord.estado || 'pendiente');

      playNewOrderSound();

      const shortId = ord.id.slice(0, 8);
      const clientName = (ord.profiles?.nombre_completo) || (Array.isArray(ord.profiles) ? ord.profiles[0]?.nombre_completo : null) || 'Cliente';
      const toastId = `toast-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Píldora de alerta en el header superior derecho
      setActiveAlertPill({
        tipo: 'nuevo',
        title: `¡Nuevo Pedido! #${shortId} (${clientName})`,
        total: ord.total_usd,
        orderId: ord.id
      });

      // Notificación persistente
      setAlertNotifications(prev => [
        {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tipo: 'nuevo',
          title: `Nuevo Pedido #${shortId}`,
          desc: `Cliente: ${clientName} · Total: $${Number(ord.total_usd || 0).toFixed(2)} USD`,
          total: ord.total_usd,
          clientName,
          orderId: ord.id,
          pedido: ord,
          timestamp: new Date().toISOString(),
          unread: true
        },
        ...prev.filter(n => n.orderId !== ord.id)
      ]);

      setAlertToasts(prev => [
        {
          id: toastId,
          tipo: 'nuevo',
          title: `¡Nuevo Pedido Hecho! #${shortId}`,
          desc: `De ${clientName} · ${ord.direccion_entrega || 'Dirección de entrega'}`,
          total: ord.total_usd,
          orderId: ord.id,
          pedido: ord,
          timestamp: new Date().toISOString()
        },
        ...prev.slice(0, 2)
      ]);

      triggerDesktopNotification({
        title: `🛍️ ¡Nuevo Pedido Recibido! (#${shortId})`,
        body: `Cliente: ${clientName} · Total: $${Number(ord.total_usd || 0).toFixed(2)} USD`,
        onClick: () => {
          handleMarkItemAsRead(ord.id, 'nuevo');
          localStorage.setItem('levant_comercio_selected_order', ord.id);
          onGoToProfile?.();
        }
      });

      setTimeout(() => {
        setAlertToasts(prev => prev.filter(t => t.id !== toastId));
      }, 8000);

      fetchData(true);
    };

    const triggerDeliveredAlert = (ord) => {
      if (!ord?.id) return;
      if (isOrderRead(ord.id, 'entregado')) return;

      const key = `entregado-${ord.id}`;
      if (alertedEventsRef.current.has(key)) return;
      alertedEventsRef.current.add(key);
      knownOrdersRef.current.set(ord.id, 'entregado');

      playOrderDeliveredSound();

      const shortId = ord.id.slice(0, 8);
      const clientName = (ord.profiles?.nombre_completo) || (Array.isArray(ord.profiles) ? ord.profiles[0]?.nombre_completo : null) || 'Cliente';
      const toastId = `toast-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Píldora de alerta en el header superior derecho
      setActiveAlertPill({
        tipo: 'entregado',
        title: `¡Pedido Entregado! #${shortId} (${clientName})`,
        total: ord.total_usd,
        orderId: ord.id
      });

      // Notificación persistente
      setAlertNotifications(prev => [
        {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tipo: 'entregado',
          title: `Pedido Entregado #${shortId}`,
          desc: `Entregado a ${clientName} · Total: $${Number(ord.total_usd || 0).toFixed(2)} USD`,
          total: ord.total_usd,
          clientName,
          orderId: ord.id,
          pedido: ord,
          timestamp: new Date().toISOString(),
          unread: true
        },
        ...prev.filter(n => !(n.orderId === ord.id && n.tipo === 'entregado'))
      ]);

      setAlertToasts(prev => [
        {
          id: toastId,
          tipo: 'entregado',
          title: `¡Pedido Entregado con Éxito! #${shortId}`,
          desc: `El pedido de ${clientName} ha sido entregado correctamente.`,
          total: ord.total_usd,
          orderId: ord.id,
          pedido: ord,
          timestamp: new Date().toISOString()
        },
        ...prev.slice(0, 2)
      ]);

      triggerDesktopNotification({
        title: `✅ ¡Pedido Entregado! (#${shortId})`,
        body: `El pedido de ${clientName} fue entregado con éxito.`,
        onClick: () => {
          handleMarkItemAsRead(ord.id, 'entregado');
          localStorage.setItem('levant_comercio_selected_order', ord.id);
          onGoToProfile?.();
        }
      });

      setTimeout(() => {
        setAlertToasts(prev => prev.filter(t => t.id !== toastId));
      }, 8000);

      fetchData(true);
    };

    const channel = supabase
      .channel(`comercio-db-rt-${comercio.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pedidos_entregas',
        filter: `comercio_id=eq.${comercio.id}`
      }, async (payload) => {
        if (!isMounted || !payload.new) return;
        if (isOrderRead(payload.new.id, 'nuevo')) return;
        const { data: full } = await supabase
          .from('pedidos_entregas')
          .select('id, estado, total_usd, direccion_entrega, profiles(nombre_completo)')
          .eq('id', payload.new.id)
          .maybeSingle();
        triggerNewOrderAlert(full || payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos_entregas',
        filter: `comercio_id=eq.${comercio.id}`
      }, async (payload) => {
        if (!isMounted || !payload.new) return;
        const newRow = payload.new;
        const prev = knownOrdersRef.current.get(newRow.id);
        const isEntregado = newRow.estado === 'entregado' || newRow.confirmacion_cliente === true;
        if (isEntregado && prev !== 'entregado') {
          if (isOrderRead(newRow.id, 'entregado')) return;
          const { data: full } = await supabase
            .from('pedidos_entregas')
            .select('id, estado, total_usd, direccion_entrega, profiles(nombre_completo)')
            .eq('id', newRow.id)
            .maybeSingle();
          triggerDeliveredAlert(full || newRow);
        } else {
          knownOrdersRef.current.set(newRow.id, newRow.estado);
          fetchData(true);
        }
      })
      .subscribe();

    const interval = setInterval(async () => {
      if (!isMounted || !comercio?.id || !initialLoadedRef.current) return;
      try {
        const { data: latest } = await supabase
          .from('pedidos_entregas')
          .select('id, estado, total_usd, direccion_entrega, confirmacion_cliente, profiles(nombre_completo)')
          .eq('comercio_id', comercio.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!isMounted || !latest) return;
        for (const ord of latest) {
          const prev = knownOrdersRef.current.get(ord.id);
          const isEntregado = ord.estado === 'entregado' || ord.confirmacion_cliente === true;
          if (prev === undefined) {
            if (!isOrderRead(ord.id, 'nuevo')) {
              triggerNewOrderAlert(ord);
            } else {
              knownOrdersRef.current.set(ord.id, ord.estado);
            }
          } else if (isEntregado && prev !== 'entregado') {
            if (!isOrderRead(ord.id, 'entregado')) {
              triggerDeliveredAlert(ord);
            } else {
              knownOrdersRef.current.set(ord.id, 'entregado');
            }
          } else {
            knownOrdersRef.current.set(ord.id, ord.estado);
          }
        }
      } catch (err) {
        console.warn('Error sondeo dashboard comercio:', err);
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [comercio?.id]);

  // Filtrar por fecha seleccionada
  const pedidosFecha = pedidos.filter(p => p.created_at?.slice(0, 10) === selectedDate);

  // ── Top Productos Más Vendidos ───────────────────────────────
  const topProductosVendidos = useMemo(() => {
    const targetPedidos = topComercioScope === 'fecha' ? pedidosFecha : pedidos;
    const map = new Map();

    targetPedidos.forEach(p => {
      if (p.estado === 'cancelado') return;
      (p.pedido_items || []).forEach(item => {
        const prod = item.productos;
        const nombre = prod?.nombre || 'Producto';
        const key = prod?.id || nombre;
        const cant = Number(item.cantidad) || 1;
        const precio = Number(item.precio_usd) || Number(prod?.precio_usd) || 0;
        const subtotal = Number(item.subtotal_usd) || (cant * precio);
        const img = prod?.imagen_url || null;

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            nombre,
            precio,
            imagen_url: img,
            totalVendidos: 0,
            totalIngresos: 0,
            pedidosCount: 0,
          });
        }
        const entry = map.get(key);
        entry.totalVendidos += cant;
        entry.totalIngresos += subtotal;
        entry.pedidosCount += 1;
        if (!entry.imagen_url && img) entry.imagen_url = img;
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalVendidos - a.totalVendidos || b.totalIngresos - a.totalIngresos);
  }, [pedidos, pedidosFecha, topComercioScope]);

  const maxVendidos = topProductosVendidos[0]?.totalVendidos || 1;

  if (loading) return <div className="db-loading"><span className="db-spinner" /></div>;
  if (!comercio) return (
    <div className="db-empty-state">
      <span>🏪</span>
      <p>Completa el registro de tu comercio para ver el dashboard.</p>
    </div>
  );

  // KPIs del día
  const totalFecha      = pedidosFecha.length;
  const entregadosFecha = pedidosFecha.filter(p => p.estado === 'entregado');
  const ingresosFecha   = entregadosFecha.reduce((a, p) => a + Number(p.total_usd), 0);
  const enProceso       = pedidosFecha.filter(p => ['pendiente', 'confirmado', 'en_preparacion', 'en_camino'].includes(p.estado)).length;
  const canceladosFecha = pedidosFecha.filter(p => p.estado === 'cancelado').length;
  const prodActivos     = productos.filter(p => p.activo).length;

  // Filtro de estado sobre los pedidos del día
  const filtrados = filter === 'todos'
    ? pedidosFecha
    : pedidosFecha.filter(p => p.estado === filter);

  const isToday = selectedDate === localToday;
  const dateLabel = isToday
    ? new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
    : new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="db-root">
      {/* Alertas flotantes para comercio */}
      <ComercioAlertToasts
        toasts={alertToasts}
        onDismiss={(id, orderId, tipo) => {
          setAlertToasts((prev) => prev.filter((t) => t.id !== id));
          if (orderId) {
            handleMarkItemAsRead(orderId, tipo);
          }
        }}
        onViewOrder={(ped, ordId, tipo) => {
          const idToOpen = ped?.id || ordId;
          if (idToOpen) {
            handleMarkItemAsRead(idToOpen, tipo || ped?.tipo || 'nuevo');
            localStorage.setItem('levant_comercio_selected_order', idToOpen);
          }
          onGoToProfile?.();
        }}
      />

      {/* Hero */}
      <div className="db-hero">
        <div>
          <h1 className="db-hero-title">🏪 {comercio.nombre_comercial}</h1>
          <p className="db-hero-sub" style={{ textTransform: 'capitalize' }}>{dateLabel} · {comercio.categoria}</p>
        </div>
        <div className="db-hero-right">
          {/* Botón directo Realizar Pedido */}
          <button
            type="button"
            className="db-hero-order-cta"
            onClick={() => {
              if (onSwitchMode && currentRol === 'comercio') {
                onSwitchMode('cliente');
              }
              onGoToTiendas?.();
            }}
            title="Explorar tiendas y realizar pedido"
          >
            <span className="db-hero-order-cta-icon">🛍️</span>
            <span>Realizar Pedido</span>
          </button>

          {/* Píldora de Alerta en Vivo justo en este encabezado */}
          {activeAlertPill && (
            <div
              className={`db-alert-hero-chip db-alert-hero-chip--${activeAlertPill.tipo}`}
              onClick={() => {
                if (activeAlertPill.orderId) {
                  handleMarkItemAsRead(activeAlertPill.orderId, activeAlertPill.tipo);
                  localStorage.setItem('levant_comercio_selected_order', activeAlertPill.orderId);
                }
                onGoToProfile?.();
              }}
              title="Clic para ver detalles del pedido (marcar como leído)"
            >
              <span className="db-alert-hero-pulse" />
              <span className="db-alert-hero-icon">
                {activeAlertPill.tipo === 'nuevo' ? '🛍️' : '✅'}
              </span>
              <span className="db-alert-hero-text">
                <strong>{activeAlertPill.title || (activeAlertPill.tipo === 'nuevo' ? '¡Nuevo Pedido!' : '¡Pedido Entregado!')}</strong>
                {activeAlertPill.total !== undefined && ` · $${Number(activeAlertPill.total).toFixed(2)}`}
              </span>
              <span className="db-alert-hero-cta">Ver →</span>
              <button
                type="button"
                className="db-alert-hero-close"
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeAlertPill?.orderId) {
                    handleMarkItemAsRead(activeAlertPill.orderId, activeAlertPill.tipo);
                  } else {
                    setActiveAlertPill(null);
                  }
                }}
                title="Cerrar y marcar como leída"
              >
                ✕
              </button>
            </div>
          )}

          {registeredRol === 'comercio' ? (
            <div className="db-rol-toggle">
              <button
                type="button"
                className={`db-rol-toggle-btn ${currentRol === 'comercio' ? 'db-rol-toggle-btn--active' : ''}`}
                onClick={() => onSwitchMode?.('comercio')}
              >
                <Store size={12} strokeWidth={2.2} />
                <span>Comercio</span>
              </button>
              <button
                type="button"
                className={`db-rol-toggle-btn ${currentRol === 'cliente' ? 'db-rol-toggle-btn--active db-rol-toggle-btn--active-cliente' : ''}`}
                onClick={() => onSwitchMode?.('cliente')}
              >
                <User size={12} strokeWidth={2.2} />
                <span>Cliente</span>
              </button>
            </div>
          ) : (
            <span className="db-hero-badge db-hero-badge--comercio">🏪 Comercio</span>
          )}

          {/* Campana de Notificaciones y Alertas de Comercio */}
          <div className="db-hero-alerts-bell-wrap">
            <ComercioAlertCenter
              notifications={alertNotifications}
              unreadCount={alertNotifications.length}
              isOpen={showNotifCenter}
              onToggleOpen={() => setShowNotifCenter((prev) => !prev)}
              onClose={() => setShowNotifCenter(false)}
              onMarkAllAsRead={handleMarkAllAsRead}
              onMarkItemAsRead={handleMarkItemAsRead}
              onClearHistory={handleMarkAllAsRead}
              onViewOrder={(ped, ordId, tipo) => {
                setShowNotifCenter(false);
                const idToOpen = ped?.id || ordId;
                if (idToOpen) {
                  handleMarkItemAsRead(idToOpen, tipo || ped?.tipo || 'nuevo');
                  localStorage.setItem('levant_comercio_selected_order', idToOpen);
                }
                onGoToProfile?.();
              }}
            />
          </div>

          <button
            className="db-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            aria-label="Actualizar"
            title="Actualizar"
          >
            <span className={refreshing ? 'db-refresh-spin' : ''}>↻</span>
          </button>
          <ProfileMenu
            session={session}
            onSignOut={onSignOut}
            onGoToProfile={onGoToProfile}
            registeredRol={registeredRol}
            currentRol={currentRol}
            onSwitchMode={onSwitchMode}
          />
        </div>
      </div>

      {/* Selector de fecha */}
      <div className="db-date-bar">
        <div className="db-date-bar-left">
          <span className="db-date-bar-icon">📅</span>
          <span className="db-date-bar-label">
            {isToday ? 'Hoy' : 'Fecha seleccionada'}
          </span>
          <input
            type="date"
            className="db-date-input"
            value={selectedDate}
            max={localToday}
            onChange={e => { setSelectedDate(e.target.value); setFilter('todos'); setExpanded(null); }}
          />
        </div>
        {!isToday && (
          <button
            className="db-date-today-btn"
            onClick={() => { setSelectedDate(localToday); setFilter('todos'); setExpanded(null); }}
          >
            ↩ Volver a hoy
          </button>
        )}
      </div>

      {/* KPIs del día */}
      <div className="db-kpis">
        <KpiCard
          icon={BoxIcon}
          tag={isToday ? 'Hoy' : 'Ese día'}
          label="Órdenes recibidas"
          value={totalFecha}
          color="#f59e0b"
          sub={totalFecha === 0 ? 'Sin órdenes ese día' : `${totalFecha} orden${totalFecha !== 1 ? 'es' : ''} recibidas`}
        />
        <KpiCard
          icon={DollarIcon}
          tag="Ingresos"
          label="Facturado del día"
          value={`$${fmt(ingresosFecha)}`}
          color="#10b981"
          iconBg="#192820"
          sub={entregadosFecha.length > 0 ? `${entregadosFecha.length} pedido${entregadosFecha.length !== 1 ? 's' : ''} entregado${entregadosFecha.length !== 1 ? 's' : ''}` : 'Sin entregas'}
        />
        <KpiCard
          icon={WrenchIcon}
          tag="En proceso"
          label="Activos ahora"
          value={enProceso}
          color="#818cf8"
          iconBg="#1a1a2e"
          sub={enProceso > 0 ? 'Órdenes en preparación/ruta' : 'Sin órdenes activas'}
        />
        <KpiCard
          icon={CloseIcon}
          tag="Alertas"
          label="Cancelados"
          value={canceladosFecha}
          color="#f87171"
          iconBg="#2a1818"
          sub={canceladosFecha > 0 ? 'Órdenes no concretadas' : 'Sin cancelaciones ✓'}
        />
        <KpiCard
          icon={ShoppingBagIcon}
          tag="Inventario"
          label="Productos activos"
          value={prodActivos}
          color="#06b6d4"
          iconBg="#14262c"
          sub={`De ${productos.length} totales en catálogo`}
        />
      </div>

      {/* ═══ TOP PRODUCTOS MÁS VENDIDOS ═══ */}
      <div className="db-top-section db-top-section--comercio">
        <div className="db-top-header">
          <div className="db-top-header-left">
            <div className="db-top-badge-title">
              <span className="db-top-header-icon">🔥</span>
              <h2 className="db-top-title">Top Productos Más Vendidos</h2>
            </div>
            <p className="db-top-sub">
              Ranking de tus artículos más demandados y mayor volumen de facturación
            </p>
          </div>
          <div className="db-top-header-right">
            <div className="db-top-scope-toggle">
              <button
                type="button"
                className={`db-top-scope-btn ${topComercioScope === 'todo' ? 'db-top-scope-btn--active' : ''}`}
                onClick={() => setTopComercioScope('todo')}
              >
                Histórico General
              </button>
              <button
                type="button"
                className={`db-top-scope-btn ${topComercioScope === 'fecha' ? 'db-top-scope-btn--active' : ''}`}
                onClick={() => setTopComercioScope('fecha')}
              >
                {isToday ? 'Ventas de Hoy' : 'Fecha Seleccionada'}
              </button>
            </div>
          </div>
        </div>

        {topProductosVendidos.length === 0 ? (
          <div className="db-top-empty">
            <span className="db-top-empty-icon">📊</span>
            <div>
              <h4 className="db-top-empty-title">
                {topComercioScope === 'fecha'
                  ? 'Sin productos vendidos en esta fecha'
                  : 'Aún no se registran ventas de productos'}
              </h4>
              <p className="db-top-empty-desc">
                {topComercioScope === 'fecha'
                  ? 'Selecciona "Histórico General" o revisa tus órdenes completadas.'
                  : 'Cuando los clientes compren en tu tienda, tus productos con mayor rotación se clasificarán automáticamente aquí.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="db-top-grid">
            {(showAllTopComercio ? topProductosVendidos : topProductosVendidos.slice(0, 5)).map((prod, idx) => {
              const rank = idx + 1;
              const isFirst = rank === 1;
              const isSecond = rank === 2;
              const isThird = rank === 3;
              const pct = Math.round((prod.totalVendidos / maxVendidos) * 100);

              return (
                <div
                  key={prod.id || idx}
                  className={`db-top-card ${isFirst ? 'db-top-card--first' : ''} ${isSecond ? 'db-top-card--second' : ''} ${isThird ? 'db-top-card--third' : ''}`}
                >
                  <div className="db-top-card-rank-wrap">
                    {isFirst && (
                      <span className="db-top-rank-badge db-top-rank-badge--gold">
                        👑 #1 Más Vendido
                      </span>
                    )}
                    {isSecond && (
                      <span className="db-top-rank-badge db-top-rank-badge--silver">
                        🥈 #2 En Ventas
                      </span>
                    )}
                    {isThird && (
                      <span className="db-top-rank-badge db-top-rank-badge--bronze">
                        🥉 #3 En Ventas
                      </span>
                    )}
                    {!isFirst && !isSecond && !isThird && (
                      <span className="db-top-rank-badge db-top-rank-badge--default">
                        #{rank}
                      </span>
                    )}
                  </div>

                  <div className="db-top-card-content">
                    <div className="db-top-img-wrap">
                      {prod.imagen_url ? (
                        <img src={prod.imagen_url} alt={prod.nombre} className="db-top-img" />
                      ) : (
                        <div className="db-top-img-fallback">
                          <span>📦</span>
                        </div>
                      )}
                      {isFirst && <span className="db-top-first-glow" />}
                    </div>

                    <div className="db-top-card-info">
                      <div className="db-top-card-main-meta">
                        <h3 className="db-top-prod-name" title={prod.nombre}>
                          {prod.nombre}
                        </h3>
                        <span className="db-top-revenue-highlight">
                          ${prod.totalIngresos.toFixed(2)} USD generados
                        </span>
                      </div>

                      <div className="db-top-stats-row">
                        <div className="db-top-stat-chip db-top-stat-chip--qty-comercio">
                          <span className="db-top-stat-val">{prod.totalVendidos}</span>
                          <span className="db-top-stat-lbl">
                            {prod.totalVendidos === 1 ? 'ud. vendida' : 'uds. vendidas'}
                          </span>
                        </div>
                        <div className="db-top-stat-chip db-top-stat-chip--spent">
                          <span className="db-top-stat-val">${prod.totalIngresos.toFixed(2)}</span>
                          <span className="db-top-stat-lbl">ingresos</span>
                        </div>
                        <div className="db-top-stat-chip db-top-stat-chip--orders">
                          <span className="db-top-stat-val">{prod.pedidosCount}</span>
                          <span className="db-top-stat-lbl">
                            {prod.pedidosCount === 1 ? 'pedido' : 'pedidos'}
                          </span>
                        </div>
                      </div>

                      <div className="db-top-progress-wrap" title={`Volumen de ventas: ${pct}% respecto al producto estrella`}>
                        <div className="db-top-progress-bg">
                          <div
                            className="db-top-progress-fill db-top-progress-fill--comercio"
                            style={{ width: `${Math.max(pct, 8)}%` }}
                          />
                        </div>
                        <span className="db-top-progress-lbl">{pct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {topProductosVendidos.length > 5 && (
          <div className="db-top-footer-toggle">
            <button
              type="button"
              className="db-top-toggle-more-btn"
              onClick={() => setShowAllTopComercio(prev => !prev)}
            >
              {showAllTopComercio
                ? '▲ Ver menos'
                : `▼ Ver ranking completo (${topProductosVendidos.length} productos)`}
            </button>
          </div>
        )}
      </div>

      {/* Lista de pedidos del día */}
      <div className="db-section">
        <div className="db-section-header">
          <h2 className="db-section-title">
            {isToday ? 'Órdenes de hoy' : 'Órdenes del día'}
          </h2>
          <p className="db-section-sub">
            {totalFecha === 0 ? 'No hubo órdenes este día' : `${totalFecha} orden${totalFecha !== 1 ? 'es' : ''} registradas`}
          </p>
        </div>

        {/* Filtros */}
        <div className="db-day-filters" role="tablist">
          {ESTADOS_FILTER.map(f => (
            <button
              key={f}
              id={`db-com-filter-${f}`}
              role="tab"
              aria-selected={filter === f}
              className={`db-day-filter-btn ${filter === f ? 'db-day-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'todos' ? '🗂 Todos' : ESTADO_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="db-day-empty">
            <span>📋</span>
            <p>
              {totalFecha === 0
                ? 'No se registraron órdenes en esta fecha.'
                : `No hay órdenes con estado "${ESTADO_LABEL[filter] || filter}" en este período.`
              }
            </p>
          </div>
        ) : (
          <div className="db-day-list">
            {filtrados.map(pedido => {
              const isOpen     = expanded === pedido.id;
              const tienePago  = pedido.reportes_pago?.length > 0;
              const badgeColor = ESTADO_COLOR[pedido.estado] || '#64748b';
              const badgeLabel = ESTADO_LABEL[pedido.estado] || pedido.estado;

              return (
                <div key={pedido.id} className={`db-day-card ${isOpen ? 'db-day-card--open' : ''}`}>
                  {/* Cabecera */}
                  <button
                    className="db-day-card-header"
                    onClick={() => setExpanded(prev => prev === pedido.id ? null : pedido.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="db-day-card-left">
                      <span
                        className="db-day-badge"
                        style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}
                      >
                        {badgeLabel}
                      </span>
                      <span className={`db-day-badge-pago ${tienePago ? 'db-day-badge-pago--pagado' : 'db-day-badge-pago--pendiente'}`}>
                        {tienePago ? '✅ Pago reportado' : '⏳ Sin pago'}
                      </span>
                      <div>
                        <p className="db-day-comercio">
                          {pedido.profiles?.nombre_completo ?? `Orden #${pedido.id.slice(0, 8)}`}
                        </p>
                        <p className="db-day-time">{formatTime(pedido.created_at)}</p>
                      </div>
                    </div>
                    <div className="db-day-card-right">
                      <span className="db-day-total">${pedido.total_usd?.toFixed(2)}</span>
                      <span className={`db-day-chevron ${isOpen ? 'db-day-chevron--up' : ''}`}>›</span>
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {isOpen && (
                    <div className="db-day-card-body">
                      {/* Items del pedido */}
                      {(pedido.pedido_items ?? []).length > 0 && (
                        <div className="db-day-items">
                          {pedido.pedido_items.map((item, i) => (
                            <div key={i} className="db-day-item-row">
                              {item.productos?.imagen_url && (
                                <img src={item.productos.imagen_url} alt={item.productos?.nombre} className="db-day-item-img" />
                              )}
                              <span className="db-day-item-name">{item.productos?.nombre ?? '—'}</span>
                              <span className="db-day-item-qty">x{item.cantidad}</span>
                              <span className="db-day-item-sub">${item.subtotal_usd?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Meta info */}
                      <div className="db-day-meta">
                        {pedido.direccion_entrega && (
                          <div className="db-day-meta-row">
                            <span className="db-day-meta-label">📍 Dirección</span>
                            <span>{pedido.direccion_entrega}</span>
                          </div>
                        )}
                        {pedido.repartidores_datos?.profiles?.nombre_completo && (
                          <div className="db-day-meta-row">
                            <span className="db-day-meta-label">🛵 Repartidor</span>
                            <span>{pedido.repartidores_datos.profiles.nombre_completo}</span>
                          </div>
                        )}
                        <div className="db-day-meta-row">
                          <span className="db-day-meta-label">💳 Pago</span>
                          {tienePago ? (
                            <span>
                              {pedido.reportes_pago[0].metodo?.replace(/_/g, ' ')} —
                              Ref: {pedido.reportes_pago[0].referencia} —{' '}
                              <span style={{ color: pedido.reportes_pago[0].estado === 'verificado' ? '#10b981' : '#f59e0b' }}>
                                {pedido.reportes_pago[0].estado}
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: '#f87171' }}>Sin reporte de pago</span>
                          )}
                        </div>
                        <div className="db-day-meta-row">
                          <span className="db-day-meta-label">💰 Total</span>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>${pedido.total_usd?.toFixed(2)} USD</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD REPARTIDOR
// ════════════════════════════════════════════════════
function DashboardRepartidor({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode, onGoToPedidos, onGoToHistorial }) {
  const [pedidos, setPedidos]       = useState([]);
  const [repartidor, setRepartidor] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [repNotifications, setRepNotifications] = useState([]);
  const [showRepNotifCenter, setShowRepNotifCenter] = useState(false);
  const [activeAlertPill, setActiveAlertPill] = useState(null);
  const [filterOrders, setFilterOrders] = useState('todos');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [searchOrders, setSearchOrders] = useState('');

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const { data: rep } = await supabase
      .from('repartidores_datos')
      .select('id, vehiculo, disponible')
      .eq('profile_id', session.user.id)
      .single();

    if (!rep) { setLoading(false); setRefreshing(false); return; }
    setRepartidor(rep);

    const { data: p } = await supabase
      .from('pedidos_entregas')
      .select(`
        id, estado, total_usd, created_at, updated_at, valoracion, comentario, direccion_entrega,
        comercios_datos ( id, nombre_comercial, direccion, logo_url ),
        profiles!pedidos_entregas_cliente_id_fkey ( id, nombre_completo, telefono ),
        pedido_items (
          id, cantidad, precio_usd, subtotal_usd,
          productos ( id, nombre, imagen_url )
        )
      `)
      .eq('repartidor_id', rep.id)
      .order('created_at', { ascending: false });

    setPedidos(p ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
  }, [session]);

  // Escuchar evento de alerta en tiempo real para refrescar
  useEffect(() => {
    const handleRepAlert = () => {
      load(true);
    };
    window.addEventListener('levant_repartidor_alert_event', handleRepAlert);
    return () => window.removeEventListener('levant_repartidor_alert_event', handleRepAlert);
  }, []);

  // Sincronizar notificaciones de repartidor
  useEffect(() => {
    if (!pedidos || pedidos.length === 0) {
      setRepNotifications([]);
      setActiveAlertPill(null);
      return;
    }

    const readIds = getRepartidorReadOrderIds();
    const notifs = [];

    pedidos.forEach((p) => {
      const shortId = p.id ? p.id.slice(0, 8) : '--------';
      const comercio = p.comercios_datos?.nombre_comercial || 'Comercio';
      const cliente = p.profiles?.nombre_completo || 'Cliente';

      // 1. Pedido asignado activo
      if (p.estado !== 'cancelado' && p.estado !== 'entregado') {
        const isRead = readIds.has(`${p.id}-asignado`);
        notifs.push({
          id: `notif-asig-${p.id}`,
          orderId: p.id,
          tipo: 'asignado',
          title: `¡Pedido Asignado! #${shortId}`,
          desc: `Comercio: ${comercio} · Destino: ${p.direccion_entrega || 'Dirección de entrega'}`,
          total: p.total_usd,
          timestamp: p.updated_at || p.created_at,
          unread: !isRead,
          pedido: p,
        });
      }

      // 2. Valoración recibida
      if (p.valoracion) {
        const isRead = readIds.has(`${p.id}-valoracion`);
        notifs.push({
          id: `notif-val-${p.id}`,
          orderId: p.id,
          tipo: 'valoracion',
          title: `¡Valoración Recibida! #${shortId}`,
          desc: `${cliente} te calificó con ${p.valoracion} estrellas.${p.comentario ? ` "${p.comentario}"` : ''}`,
          total: p.total_usd,
          stars: p.valoracion,
          timestamp: p.updated_at || p.created_at,
          unread: !isRead,
          pedido: p,
        });
      }
    });

    setRepNotifications(notifs);

    // Hero chip pill
    const unreadAsig = notifs.filter((n) => n.unread && n.tipo === 'asignado');
    const unreadVal = notifs.filter((n) => n.unread && n.tipo === 'valoracion');
    if (unreadAsig.length > 0) {
      const target = unreadAsig[0];
      setActiveAlertPill({
        orderId: target.orderId,
        tipo: 'asignado',
        title: `¡Pedido Asignado! #${target.orderId.slice(0, 8)}`,
        total: target.total,
      });
    } else if (unreadVal.length > 0) {
      const target = unreadVal[0];
      setActiveAlertPill({
        orderId: target.orderId,
        tipo: 'valoracion',
        title: `¡Valoración de ${target.stars}★! #${target.orderId.slice(0, 8)}`,
        total: target.total,
      });
    } else {
      setActiveAlertPill(null);
    }
  }, [pedidos]);

  const handleMarkItemAsRead = (orderId, tipo) => {
    markRepartidorOrderAsRead(orderId, tipo);
    setRepNotifications((prev) =>
      prev.map((n) => (n.orderId === orderId && n.tipo === tipo ? { ...n, unread: false } : n))
    );
    setActiveAlertPill((prev) => (prev?.orderId === orderId ? null : prev));
  };

  const handleMarkAllAsRead = () => {
    markAllRepartidorOrdersAsRead(repNotifications);
    setRepNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    setActiveAlertPill(null);
  };

  if (loading) return <div className="db-loading"><span className="db-spinner" /></div>;
  if (!repartidor) return (
    <div className="db-empty-state">
      <span>🛵</span>
      <p>Completa tu perfil de repartidor para ver el dashboard.</p>
    </div>
  );

  const entregados = pedidos.filter(p => p.estado === 'entregado');
  const calificaciones = entregados.filter(p => p.valoracion).map(p => p.valoracion);
  const avgVal = calificaciones.length
    ? (calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length)
    : null;
  const gananciaEstimada = entregados.length * 2; // $2 por entrega (estimado)

  // Gráfico 1: Entregas últimos 7 días
  const days = lastNDays(7);
  const entregasDiarias = days.map(d => ({
    label: d.label,
    value: entregados.filter(p => p.created_at.startsWith(d.key)).length,
    color: COLORS.purple,
  }));

  const ESTADOS = ['en_camino', 'entregado', 'cancelado'];
  const ESTADO_LABEL = { en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };
  const byEstado = ESTADOS.map(e => ({
    label: ESTADO_LABEL[e],
    value: pedidos.filter(p => p.estado === e).length,
    color: ESTADO_COLOR[e],
  }));

  const REP_ESTADO_LABEL = {
    pendiente:      'Por Recibir',
    confirmado:     'Confirmado',
    en_preparacion: 'En preparación',
    en_camino:      'En camino',
    entregado:      'Entregado',
    cancelado:      'Cancelado',
  };

  const REP_ESTADO_COLOR = {
    pendiente:      '#f59e0b',
    confirmado:     '#3b82f6',
    en_preparacion: '#06b6d4',
    en_camino:      '#818cf8',
    entregado:      '#10b981',
    cancelado:      '#f87171',
  };

  const pedidosActivosCount = pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length;

  const filtradosOrders = pedidos.filter(p => {
    if (filterOrders === 'activos') {
      if (p.estado === 'entregado' || p.estado === 'cancelado') return false;
    } else if (filterOrders !== 'todos') {
      if (p.estado !== filterOrders) return false;
    }

    if (searchOrders.trim() !== '') {
      const q = searchOrders.toLowerCase();
      const idMatch = p.id?.toLowerCase().includes(q);
      const comMatch = p.comercios_datos?.nombre_comercial?.toLowerCase().includes(q);
      const cliMatch = p.profiles?.nombre_completo?.toLowerCase().includes(q);
      const dirMatch = p.direccion_entrega?.toLowerCase().includes(q);
      return idMatch || comMatch || cliMatch || dirMatch;
    }
    return true;
  });

  // Gráfico 3: Valoraciones recibidas (distribución 1-5 estrellas)
  const stars = [1, 2, 3, 4, 5].map(s => ({
    label: '★'.repeat(s),
    value: calificaciones.filter(v => v === s).length,
    color: s >= 4 ? COLORS.green : s === 3 ? COLORS.yellow : COLORS.red,
  }));

  // Gráfico 4: Entregas mensuales (últimos 6 meses)
  const months = lastNMonths(6);
  const entregasMensuales = months.map(m => ({
    label: m.label,
    value: entregados.filter(p => p.created_at.startsWith(m.key)).length,
    color: COLORS.green,
  }));

  return (
    <div className="db-root">
      <div className="db-hero">
        <div>
          <h1 className="db-hero-title">Mi Dashboard</h1>
          <p className="db-hero-sub">
            Repartidor · {repartidor.vehiculo}
            <span className={`db-status-dot ${repartidor.disponible ? 'db-status-dot--on' : ''}`} />
            {repartidor.disponible ? 'Disponible' : 'No disponible'}
          </p>
        </div>
        <div className="db-hero-right">
          {/* Píldora de alerta en vivo para repartidor */}
          {activeAlertPill && (
            <div
              className={`db-alert-hero-chip db-alert-hero-chip--${activeAlertPill.tipo === 'valoracion' ? 'entregado' : 'nuevo'}`}
              onClick={() => {
                handleMarkItemAsRead(activeAlertPill.orderId, activeAlertPill.tipo);
                if (activeAlertPill.tipo === 'valoracion') onGoToHistorial?.();
                else onGoToPedidos?.(activeAlertPill.orderId);
              }}
              title="Clic para ver detalles"
            >
              <span className="db-alert-hero-pulse" />
              <span className="db-alert-hero-icon">{activeAlertPill.tipo === 'valoracion' ? '⭐' : '🛵'}</span>
              <span className="db-alert-hero-text">
                <strong>{activeAlertPill.title}</strong>
                {activeAlertPill.total !== undefined && ` · $${Number(activeAlertPill.total).toFixed(2)}`}
              </span>
              <span className="db-alert-hero-cta">Ver →</span>
              <button
                type="button"
                className="db-alert-hero-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkItemAsRead(activeAlertPill.orderId, activeAlertPill.tipo);
                  setActiveAlertPill(null);
                }}
                title="Cerrar y marcar como leída"
              >
                ✕
              </button>
            </div>
          )}

          <span className="db-hero-badge db-hero-badge--repartidor">🛵 Repartidor</span>

          {/* Campana de Alertas de Repartidor */}
          <div className="db-hero-alerts-bell-wrap">
            <RepartidorAlertCenter
              notifications={repNotifications}
              unreadCount={repNotifications.filter((n) => n.unread).length}
              isOpen={showRepNotifCenter}
              onToggleOpen={() => setShowRepNotifCenter((prev) => !prev)}
              onClose={() => setShowRepNotifCenter(false)}
              onMarkAllAsRead={handleMarkAllAsRead}
              onMarkItemAsRead={handleMarkItemAsRead}
              onClearHistory={handleMarkAllAsRead}
              onGoToPedidos={(orderId) => {
                setShowRepNotifCenter(false);
                onGoToPedidos?.(orderId);
              }}
              onGoToHistorial={() => {
                setShowRepNotifCenter(false);
                onGoToHistorial?.();
              }}
            />
          </div>

          <button
            className="db-refresh-btn"
            onClick={() => load(true)}
            disabled={refreshing}
            aria-label="Actualizar"
            title="Actualizar"
          >
            <span className={refreshing ? 'db-refresh-spin' : ''}>↻</span>
          </button>
          <ProfileMenu
            session={session}
            onSignOut={onSignOut}
            onGoToProfile={onGoToProfile}
            registeredRol={registeredRol}
            currentRol={currentRol}
            onSwitchMode={onSwitchMode}
          />
        </div>
      </div>

      <div className="db-kpis">
        <KpiCard
          icon={MotoIcon}
          tag="Servicio"
          label="Total entregas"
          value={pedidos.length}
          color="#f59e0b"
          sub="Servicios asignados"
          onClick={() => setSelectedKpi({
            icon: MotoIcon,
            tag: 'Servicio',
            label: 'Total entregas',
            value: pedidos.length,
            color: '#f59e0b',
            iconBg: '#38281a',
            title: 'Resumen de Servicios Asignados',
            subtitle: 'Historial de entregas y carreras asignadas a tu cuenta',
            metrics: [
              { label: 'Entregadas con éxito', value: entregados.length, color: '#10b981', sub: `${pedidos.length ? Math.round((entregados.length / pedidos.length) * 100) : 0}% efectividad` },
              { label: 'En camino / Tránsito', value: pedidos.filter(p => p.estado === 'en_camino').length, color: '#3b82f6', sub: 'En curso' },
              { label: 'Canceladas', value: pedidos.filter(p => p.estado === 'cancelado').length, color: '#f87171', sub: 'No completadas' },
              { label: 'Ganancia estimada', value: `$${fmt(gananciaEstimada)}`, color: '#f59e0b', sub: 'Por servicios exitosos' },
            ],
            breakdownTitle: 'Distribución por Estado',
            breakdown: ESTADOS.map(e => {
              const count = pedidos.filter(p => p.estado === e).length;
              return {
                label: ESTADO_LABEL[e],
                value: `${count} servicio${count === 1 ? '' : 's'}`,
                percent: pedidos.length ? Math.round((count / pedidos.length) * 100) : 0,
                color: ESTADO_COLOR[e],
              };
            }).filter(b => b.percent > 0),
            itemsTitle: 'Últimos servicios asignados',
            items: pedidos.slice(0, 4).map(p => ({
              title: `Servicio #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.total_usd)} · ${ESTADO_LABEL[p.estado] || p.estado}`,
              badgeBg: `${ESTADO_COLOR[p.estado] || '#6c63ff'}22`,
              badgeColor: ESTADO_COLOR[p.estado] || '#a5b4fc',
            })),
            tip: `Vehículo: ${repartidor.vehiculo}. Estado actual: ${repartidor.disponible ? 'Disponible para servicios' : 'En pausa / no disponible'}.`,
          })}
        />

        <KpiCard
          icon={CheckCircleIcon}
          tag="Entregados"
          label="Entregas con éxito"
          value={entregados.length}
          color="#10b981"
          iconBg="#192820"
          sub="Completadas a tiempo"
          onClick={() => setSelectedKpi({
            icon: CheckCircleIcon,
            tag: 'Entregados',
            label: 'Entregas con éxito',
            value: entregados.length,
            color: '#10b981',
            iconBg: '#192820',
            title: 'Resumen de Entregas Completadas',
            subtitle: 'Servicios finalizados con éxito y recibidos por los clientes',
            metrics: [
              { label: 'Exitosas', value: entregados.length, color: '#10b981', sub: 'Entregas completas' },
              { label: 'Tasa de efectividad', value: `${pedidos.length ? Math.round((entregados.length / pedidos.length) * 100) : 0}%`, color: '#3b82f6', sub: 'De servicios asignados' },
              { label: 'Ganancia generada', value: `$${fmt(gananciaEstimada)}`, color: '#f59e0b', sub: 'Por entregas finalizadas' },
              { label: 'Con calificación', value: calificaciones.length, color: '#fbbf24', sub: 'Opiniones recibidas' },
            ],
            itemsTitle: 'Últimas entregas confirmadas',
            items: entregados.slice(0, 4).map(p => ({
              title: `Entrega #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.total_usd)} ${p.valoracion ? `· ${p.valoracion}★` : ''}`,
              badgeBg: 'rgba(16, 185, 129, 0.15)',
              badgeColor: '#6ee7b7',
            })),
            tip: 'Mantener un trato cordial y puntualidad impulsa que los clientes te dejen calificaciones de 5 estrellas.',
          })}
        />

        <KpiCard
          icon={StarIcon}
          tag="Rating"
          label="Val. promedio"
          value={avgVal ? avgVal.toFixed(1) + ' / 5' : 'N/A'}
          color="#fbbf24"
          sub="Calificación de clientes"
          onClick={() => setSelectedKpi({
            icon: StarIcon,
            tag: 'Rating',
            label: 'Val. promedio',
            value: avgVal ? avgVal.toFixed(1) + ' / 5' : 'N/A',
            color: '#fbbf24',
            iconBg: '#38281a',
            title: 'Resumen de Reputación y Reseñas',
            subtitle: 'Puntuaciones y comentarios otorgados por los clientes',
            metrics: [
              { label: 'Puntuación promedio', value: avgVal ? `${avgVal.toFixed(1)} / 5` : 'N/A', color: '#fbbf24', sub: 'Calificación global' },
              { label: 'Total opiniones', value: calificaciones.length, color: '#10b981', sub: `De ${entregados.length} entregas` },
              { label: 'Calificaciones 5★', value: calificaciones.filter(v => v === 5).length, color: '#06b6d4', sub: 'Calificación máxima' },
              { label: 'Satisfacción alta', value: `${calificaciones.length ? Math.round((calificaciones.filter(v => v >= 4).length / calificaciones.length) * 100) : 0}%`, color: '#10b981', sub: '4 y 5 estrellas' },
            ],
            breakdownTitle: 'Distribución de Estrellas Recibidas',
            breakdown: [5, 4, 3, 2, 1].map(s => {
              const count = calificaciones.filter(v => v === s).length;
              return {
                label: `${s} Estrella${s > 1 ? 's' : ''} (${'★'.repeat(s)})`,
                value: `${count}`,
                percent: calificaciones.length ? Math.round((count / calificaciones.length) * 100) : 0,
                color: s >= 4 ? '#10b981' : s === 3 ? '#f59e0b' : '#f87171',
              };
            }),
            tip: 'Una calificación promedio alta (≥ 4.5) te otorga preferencia en asignaciones automáticas de pedidos.',
          })}
        />

        <KpiCard
          icon={DollarIcon}
          tag="Ganancias"
          label="Ganancia estimada"
          value={`$${fmt(gananciaEstimada)}`}
          color="#f59e0b"
          sub="Acumulado estimado"
          onClick={() => setSelectedKpi({
            icon: DollarIcon,
            tag: 'Ganancias',
            label: 'Ganancia estimada',
            value: `$${fmt(gananciaEstimada)}`,
            color: '#f59e0b',
            iconBg: '#38281a',
            title: 'Resumen de Ganancias Estimadas',
            subtitle: 'Cálculo de ingresos por comisiones de entrega completadas',
            metrics: [
              { label: 'Total acumulado', value: `$${fmt(gananciaEstimada)}`, color: '#f59e0b', sub: 'USD estimado' },
              { label: 'Tarifa por entrega', value: '$2.00 USD', color: '#3b82f6', sub: 'Por servicio finalizado' },
              { label: 'Entregas liquidadas', value: entregados.length, color: '#10b981', sub: 'Servicios cerrados' },
              { label: 'Potencial en tránsito', value: `$${fmt(pedidos.filter(p => p.estado === 'en_camino').length * 2)}`, color: '#06b6d4', sub: 'En pedidos en camino' },
            ],
            itemsTitle: 'Últimas entregas con ganancia generada',
            items: entregados.slice(0, 4).map(p => ({
              title: `Entrega #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: '+$2.00 USD',
              badgeBg: 'rgba(245, 158, 11, 0.15)',
              badgeColor: '#fbbf24',
            })),
            tip: 'Las ganancias estimadas se actualizan en tiempo real cada vez que completas un servicio.',
          })}
        />
      </div>

      {/* ── LISTA COMPLETA DE PEDIDOS RECIBIDOS POR EL REPARTIDOR ── */}
      <div className="db-section">
        <div className="db-section-header">
          <div>
            <h2 className="db-section-title">📦 Todos los Pedidos Recibidos ({pedidos.length})</h2>
            <p className="db-section-sub">
              {pedidos.length === 0
                ? 'Aún no has recibido pedidos asignados por comercios'
                : `Historial completo de tus pedidos (${pedidosActivosCount} activo${pedidosActivosCount !== 1 ? 's' : ''})`
              }
            </p>
          </div>
          <button
            type="button"
            className="db-section-action-btn"
            onClick={() => onGoToPedidos?.()}
            title="Ir al panel de gestión de pedidos"
          >
            🛵 Gestionar Entregas ({pedidosActivosCount}) →
          </button>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <div className="db-day-filters" role="tablist">
            {[
              { id: 'todos',     label: `🗂 Todos (${pedidos.length})` },
              { id: 'activos',   label: `⚡ Activos (${pedidosActivosCount})` },
              { id: 'en_camino', label: `🚚 En camino (${pedidos.filter(p => p.estado === 'en_camino').length})` },
              { id: 'entregado', label: `✅ Entregados (${entregados.length})` },
              { id: 'cancelado', label: `❌ Cancelados (${pedidos.filter(p => p.estado === 'cancelado').length})` },
            ].map(f => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filterOrders === f.id}
                className={`db-day-filter-btn ${filterOrders === f.id ? 'db-day-filter-btn--active' : ''}`}
                onClick={() => setFilterOrders(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', minWidth: '220px' }}>
            <input
              type="text"
              placeholder="🔍 Buscar por comercio, cliente o #ID..."
              value={searchOrders}
              onChange={(e) => setSearchOrders(e.target.value)}
              className="db-search-input"
              style={{
                width: '100%',
                padding: '0.42rem 0.85rem',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--db-border)',
                color: '#f1f5f9',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            />
            {searchOrders && (
              <button
                type="button"
                onClick={() => setSearchOrders('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Lista de Pedidos Recibidos */}
        {filtradosOrders.length === 0 ? (
          <div className="db-day-empty">
            <span>🛵</span>
            <p>
              {pedidos.length === 0
                ? 'No tienes pedidos asignados por el momento. Cuando un comercio te asigne un pedido, aparecerá aquí inmediatamente.'
                : 'No se encontraron pedidos con el filtro o búsqueda seleccionada.'
              }
            </p>
          </div>
        ) : (
          <div className="db-day-list">
            {filtradosOrders.map(pedido => {
              const isOpen = expandedOrderId === pedido.id;
              const isActivo = pedido.estado !== 'entregado' && pedido.estado !== 'cancelado';
              const badgeColor = REP_ESTADO_COLOR[pedido.estado] || '#64748b';
              const badgeLabel = REP_ESTADO_LABEL[pedido.estado] || pedido.estado;
              const comercioName = pedido.comercios_datos?.nombre_comercial || 'Comercio';
              const clientName = pedido.profiles?.nombre_completo || 'Cliente';
              const shortId = pedido.id ? pedido.id.slice(0, 8) : '--------';

              return (
                <div key={pedido.id} className={`db-day-card ${isOpen ? 'db-day-card--open' : ''} ${isActivo ? 'db-day-card--active-rep' : ''}`}>
                  {/* Cabecera del pedido */}
                  <button
                    className="db-day-card-header"
                    onClick={() => setExpandedOrderId(prev => prev === pedido.id ? null : pedido.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="db-day-card-left">
                      <span
                        className="db-day-badge"
                        style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}
                      >
                        {badgeLabel}
                      </span>

                      {isActivo && (
                        <span className="db-rep-card-pill-active">
                          ⚡ EN CURSO
                        </span>
                      )}

                      {pedido.valoracion && (
                        <span className="db-rep-card-pill-val">
                          ⭐ {pedido.valoracion}★
                        </span>
                      )}

                      <div>
                        <p className="db-day-comercio">
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>#{shortId} · </span>
                          <strong>{comercioName}</strong> → {clientName}
                        </p>
                        <p className="db-day-time">{formatDate(pedido.created_at)}</p>
                      </div>
                    </div>

                    <div className="db-day-card-right">
                      <span className="db-day-total">${pedido.total_usd?.toFixed(2)} USD</span>
                      <span className={`db-day-chevron ${isOpen ? 'db-day-chevron--up' : ''}`}>›</span>
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {isOpen && (
                    <div className="db-day-card-body">
                      {/* Ruta Comercio -> Cliente */}
                      <div className="db-rep-route-summary">
                        <div className="db-rep-route-item">
                          <span className="db-rep-route-icon">🏪</span>
                          <div>
                            <span className="db-rep-route-type">PUNTO DE RETIRO:</span>
                            <strong>{comercioName}</strong>
                            <span className="db-rep-route-addr">{pedido.comercios_datos?.direccion || 'Dirección de comercio no especificada'}</span>
                          </div>
                        </div>

                        <div className="db-rep-route-item">
                          <span className="db-rep-route-icon">📍</span>
                          <div>
                            <span className="db-rep-route-type">PUNTO DE ENTREGA:</span>
                            <strong>{clientName}</strong>
                            <span className="db-rep-route-addr">{pedido.direccion_entrega || 'Dirección de entrega no especificada'}</span>
                            {pedido.profiles?.telefono && (
                              <a href={`tel:${pedido.profiles.telefono}`} className="db-rep-tel-link">
                                📞 Contactar cliente: {pedido.profiles.telefono}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Items del pedido si existen */}
                      {(pedido.pedido_items ?? []).length > 0 && (
                        <div className="db-day-items">
                          <div className="db-rep-items-header">
                            <span>📦 Productos ({pedido.pedido_items.length}):</span>
                          </div>
                          {pedido.pedido_items.map((item, i) => (
                            <div key={i} className="db-day-item-row">
                              {item.productos?.imagen_url && (
                                <img src={item.productos.imagen_url} alt={item.productos?.nombre} className="db-day-item-img" />
                              )}
                              <span className="db-day-item-name">{item.productos?.nombre ?? 'Producto'}</span>
                              <span className="db-day-item-qty">x{item.cantidad}</span>
                              <span className="db-day-item-sub">${item.subtotal_usd?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Calificación y Comentario */}
                      {pedido.valoracion && (
                        <div className="db-rep-val-box">
                          <span className="db-rep-val-stars">{'★'.repeat(pedido.valoracion)}{'☆'.repeat(5 - pedido.valoracion)}</span>
                          <span>Calificación del cliente: <strong>{pedido.valoracion}.0 / 5.0</strong></span>
                          {pedido.comentario && <p className="db-rep-val-comment">"{pedido.comentario}"</p>}
                        </div>
                      )}

                      {/* Acciones de pie de tarjeta */}
                      <div className="db-rep-card-footer-actions">
                        <button
                          type="button"
                          className="db-rep-btn-manage"
                          onClick={() => {
                            onGoToPedidos?.(pedido.id);
                          }}
                        >
                          {isActivo ? '🛵 Gestionar Entrega en Pedidos →' : '📋 Ver en Gestión de Pedidos →'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="db-grid-2">
        <Section title="Entregas Últimos 7 Días" subtitle="Pedidos entregados por día">
          <BarChart data={entregasDiarias} />
        </Section>

        <Section title="Entregas Mensuales" subtitle="Últimos 6 meses">
          <BarChart data={entregasMensuales} />
        </Section>
      </div>

      <div className="db-grid-2">
        <Section title="Pedidos por Estado" subtitle="Distribución de todos tus pedidos">
          <BarChart data={byEstado} />
        </Section>

        <Section title="Distribución de Calificaciones" subtitle="Estrellas recibidas">
          {calificaciones.length
            ? <BarChart data={stars} />
            : <p className="db-empty">Sin calificaciones aún</p>}
        </Section>
      </div>

      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />
    </div>
  );
}

// ════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════
export default function Dashboard({ session, rol, registeredRol, onSwitchMode, onSignOut, onGoToProfile, onGoToTracking, onGoToPedidos, onGoToHistorial, onGoToPago, onGoToTiendas }) {
  if (rol === 'comercio') {
    return (
      <DashboardComercio
        session={session}
        currentRol={rol}
        registeredRol={registeredRol}
        onSwitchMode={onSwitchMode}
        onSignOut={onSignOut}
        onGoToProfile={onGoToProfile}
      />
    );
  }
  if (rol === 'repartidor') {
    return (
      <DashboardRepartidor
        session={session}
        currentRol={rol}
        registeredRol={registeredRol}
        onSwitchMode={onSwitchMode}
        onSignOut={onSignOut}
        onGoToProfile={onGoToProfile}
        onGoToPedidos={onGoToPedidos}
        onGoToHistorial={onGoToHistorial}
      />
    );
  }
  return (
    <DashboardCliente
      session={session}
      currentRol={rol}
      registeredRol={registeredRol}
      onSwitchMode={onSwitchMode}
      onSignOut={onSignOut}
      onGoToProfile={onGoToProfile}
      onGoToTracking={onGoToTracking}
      onGoToHistorial={onGoToHistorial}
      onGoToPago={onGoToPago}
      onGoToTiendas={onGoToTiendas}
    />
  );
}
