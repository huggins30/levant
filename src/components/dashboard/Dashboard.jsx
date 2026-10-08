import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  BoxIcon, CheckCircleIcon, DollarIcon, StarIcon, MotoIcon, 
  ShoppingBagIcon, CloseIcon, WrenchIcon 
} from '../common/Icons';
import { User, Store, LogOut, ChevronDown, X, ChevronRight, Info } from 'lucide-react';
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
function DashboardCliente({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode }) {
  const [pedidos, setPedidos]       = useState([]);
  const [pagos, setPagos]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedKpi, setSelectedKpi] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: p }, { data: rp }] = await Promise.all([
        supabase
          .from('pedidos_entregas')
          .select('id, estado, total_usd, created_at, valoracion')
          .eq('cliente_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('reportes_pago')
          .select('id, metodo, monto_usd, monto_bs, estado, created_at')
          .eq('cliente_id', session.user.id)
          .order('created_at', { ascending: false }),
      ]);
      setPedidos(p ?? []);
      setPagos(rp ?? []);
      setLoading(false);
    }
    load();
  }, [session]);

  if (loading) return <div className="db-loading"><span className="db-spinner" /></div>;

  // KPIs
  const totalGastado   = pedidos.filter(p => p.estado === 'entregado').reduce((a, p) => a + Number(p.total_usd), 0);
  const totalPedidos   = pedidos.length;
  const entregados     = pedidos.filter(p => p.estado === 'entregado').length;
  const calificaciones = pedidos.filter(p => p.valoracion).map(p => p.valoracion);
  const avgVal         = calificaciones.length ? (calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length) : null;

  // Gráfico 1: Pedidos por estado
  const ESTADOS = ['pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];
  const ESTADO_LABEL = {
    pendiente: 'Pendiente', confirmado: 'Confirm.', en_preparacion: 'Preparan.',
    en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado',
  };
  const byEstado = ESTADOS.map(e => ({
    label: ESTADO_LABEL[e],
    value: pedidos.filter(p => p.estado === e).length,
    color: ESTADO_COLOR[e],
  })).filter(d => d.value > 0);

  // Gráfico 2: Métodos de pago
  const metodos = ['pago_movil', 'zelle', 'transferencia', 'efectivo_usd', 'efectivo_bs'];
  const METODO_LABEL = {
    pago_movil: 'Pago Móvil', zelle: 'Zelle', transferencia: 'Transfer.',
    efectivo_usd: 'USD', efectivo_bs: 'Bs.',
  };
  const byMetodo = metodos.map(m => ({
    label: METODO_LABEL[m],
    value: pagos.filter(p => p.metodo === m).length,
    color: METODO_COLOR[m],
  })).filter(d => d.value > 0);

  return (
    <div className="db-root">
      <div className="db-hero">
        <div>
          <h1 className="db-hero-title">Mi Dashboard</h1>
          <p className="db-hero-sub">Resumen de tu actividad como cliente</p>
        </div>
        <div className="db-hero-right">
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

      {/* KPIs */}
      <div className="db-kpis">
        <KpiCard
          icon={BoxIcon}
          tag="Pedidos"
          label="Total pedidos"
          value={totalPedidos}
          color="#f59e0b"
          sub="Registrados en tu cuenta"
          onClick={() => setSelectedKpi({
            icon: BoxIcon,
            tag: 'Pedidos',
            label: 'Total pedidos',
            value: totalPedidos,
            color: '#f59e0b',
            iconBg: '#38281a',
            title: 'Resumen de tus Pedidos',
            subtitle: 'Detalle del estado de todas tus solicitudes',
            metrics: [
              { label: 'Entregados con éxito', value: entregados, color: '#10b981', sub: `${totalPedidos ? Math.round((entregados / totalPedidos) * 100) : 0}% efectividad` },
              { label: 'En proceso', value: pedidos.filter(p => ['pendiente', 'confirmado', 'en_preparacion', 'en_camino'].includes(p.estado)).length, color: '#3b82f6', sub: 'Activos en curso' },
              { label: 'Cancelados', value: pedidos.filter(p => p.estado === 'cancelado').length, color: '#f87171', sub: 'No completados' },
              { label: 'Inversión total', value: `$${fmt(totalGastado)}`, color: '#f59e0b', sub: 'En pedidos entregados' },
            ],
            breakdownTitle: 'Distribución por Estado',
            breakdown: ESTADOS.map(e => {
              const count = pedidos.filter(p => p.estado === e).length;
              return {
                label: ESTADO_LABEL[e],
                value: `${count} pedido${count === 1 ? '' : 's'}`,
                percent: totalPedidos ? Math.round((count / totalPedidos) * 100) : 0,
                color: ESTADO_COLOR[e],
              };
            }).filter(b => b.percent > 0),
            itemsTitle: 'Últimos pedidos registrados',
            items: pedidos.slice(0, 4).map(p => ({
              title: `Pedido #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.total_usd)} · ${ESTADO_LABEL[p.estado] || p.estado}`,
              badgeBg: `${ESTADO_COLOR[p.estado] || '#6c63ff'}22`,
              badgeColor: ESTADO_COLOR[p.estado] || '#a5b4fc',
            })),
            tip: 'Puedes consultar el estado detallado y chatear con el comercio o repartidor desde la sección de seguimiento.',
          })}
        />

        <KpiCard
          icon={CheckCircleIcon}
          tag="Entregas"
          label="Entregados"
          value={entregados}
          color="#10b981"
          iconBg="#192820"
          sub="Completados con éxito"
          onClick={() => setSelectedKpi({
            icon: CheckCircleIcon,
            tag: 'Entregas',
            label: 'Entregados',
            value: entregados,
            color: '#10b981',
            iconBg: '#192820',
            title: 'Resumen de Entregas Exitosas',
            subtitle: 'Pedidos despachados y recibidos satisfactoriamente',
            metrics: [
              { label: 'Tasa de efectividad', value: `${totalPedidos ? Math.round((entregados / totalPedidos) * 100) : 0}%`, color: '#10b981', sub: 'Del total de tus pedidos' },
              { label: 'Total invertido', value: `$${fmt(totalGastado)}`, color: '#f59e0b', sub: 'En entregas exitosas' },
              { label: 'Gasto promedio', value: `$${fmt(entregados ? totalGastado / entregados : 0)}`, color: '#3b82f6', sub: 'Por pedido completado' },
              { label: 'Con calificación', value: calificaciones.length, color: '#fbbf24', sub: 'Evaluados por ti' },
            ],
            itemsTitle: 'Últimas entregas completadas',
            items: pedidos.filter(p => p.estado === 'entregado').slice(0, 4).map(p => ({
              title: `Pedido #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.total_usd)} ${p.valoracion ? `· ${p.valoracion}★` : ''}`,
              badgeBg: 'rgba(16, 185, 129, 0.15)',
              badgeColor: '#6ee7b7',
            })),
            tip: 'Calificar cada entrega nos ayuda a mantener y premiar a los mejores repartidores.',
          })}
        />

        <KpiCard
          icon={DollarIcon}
          tag="Finanzas"
          label="Gasto total"
          value={`$${fmt(totalGastado)}`}
          color="#f59e0b"
          sub="Total invertido en USD"
          onClick={() => setSelectedKpi({
            icon: DollarIcon,
            tag: 'Finanzas',
            label: 'Gasto total',
            value: `$${fmt(totalGastado)}`,
            color: '#f59e0b',
            iconBg: '#38281a',
            title: 'Resumen Financiero de Compras',
            subtitle: 'Consolidado de pagos e inversión acumulada en tus compras',
            metrics: [
              { label: 'Total invertido', value: `$${fmt(totalGastado)}`, color: '#f59e0b', sub: 'USD en entregas' },
              { label: 'Ticket promedio', value: `$${fmt(entregados ? totalGastado / entregados : 0)}`, color: '#3b82f6', sub: 'Por pedido entregado' },
              { label: 'Reportes registrados', value: pagos.length, color: '#10b981', sub: 'Transacciones de pago' },
              { label: 'Pedidos completados', value: entregados, color: '#06b6d4', sub: 'Entregados' },
            ],
            breakdownTitle: 'Distribución por Método de Pago',
            breakdown: metodos.map(m => {
              const count = pagos.filter(p => p.metodo === m).length;
              return {
                label: METODO_LABEL[m],
                value: `${count} reporte${count === 1 ? '' : 's'}`,
                percent: pagos.length ? Math.round((count / pagos.length) * 100) : 0,
                color: METODO_COLOR[m],
              };
            }).filter(b => b.percent > 0),
            itemsTitle: 'Últimos reportes de pago registrados',
            items: pagos.slice(0, 4).map(p => ({
              title: `${METODO_LABEL[p.metodo] || p.metodo} · ${p.estado ? p.estado.toUpperCase() : 'REPORTADO'}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.monto_usd)} ${p.monto_bs ? `(Bs. ${fmt(p.monto_bs)})` : ''}`,
              badgeBg: 'rgba(245, 158, 11, 0.15)',
              badgeColor: '#fbbf24',
            })),
            tip: 'Los pagos son validados directamente contra el reporte y la cuenta receptora.',
          })}
        />

        <KpiCard
          icon={StarIcon}
          tag="Feedback"
          label="Val. promedio"
          value={avgVal ? avgVal.toFixed(1) + ' / 5' : 'N/A'}
          color="#fbbf24"
          sub="Puntuación a repartidores"
          onClick={() => setSelectedKpi({
            icon: StarIcon,
            tag: 'Feedback',
            label: 'Val. promedio',
            value: avgVal ? avgVal.toFixed(1) + ' / 5' : 'N/A',
            color: '#fbbf24',
            iconBg: '#38281a',
            title: 'Resumen de tus Calificaciones',
            subtitle: 'Feedback y valoraciones otorgadas por tus pedidos',
            metrics: [
              { label: 'Promedio general', value: avgVal ? `${avgVal.toFixed(1)} / 5` : 'Sin calificar', color: '#fbbf24', sub: 'Puntuación promedio' },
              { label: 'Pedidos calificados', value: calificaciones.length, color: '#10b981', sub: `De ${entregados} entregados` },
              { label: 'Pendientes por calificar', value: Math.max(0, entregados - calificaciones.length), color: '#f59e0b', sub: 'Sin valoración aún' },
              { label: 'Satisfacción alta', value: `${calificaciones.length ? Math.round((calificaciones.filter(v => v >= 4).length / calificaciones.length) * 100) : 0}%`, color: '#06b6d4', sub: 'Calificaciones 4★ o 5★' },
            ],
            breakdownTitle: 'Distribución de Estrellas Otorgadas',
            breakdown: [5, 4, 3, 2, 1].map(s => {
              const count = calificaciones.filter(v => v === s).length;
              return {
                label: `${s} Estrella${s > 1 ? 's' : ''} (${'★'.repeat(s)})`,
                value: `${count}`,
                percent: calificaciones.length ? Math.round((count / calificaciones.length) * 100) : 0,
                color: s >= 4 ? '#10b981' : s === 3 ? '#f59e0b' : '#f87171',
              };
            }),
            tip: 'Tus opiniones ayudan a premiar la responsabilidad y el buen trato de los repartidores.',
          })}
        />
      </div>

      <div className={byMetodo.length > 0 ? "db-grid-2" : ""}>
        <Section title="Pedidos por Estado" subtitle="Distribución de todos tus pedidos">
          {byEstado.length ? <BarChart data={byEstado} /> : <p className="db-empty">Sin pedidos aún</p>}
        </Section>

        {byMetodo.length > 0 && (
          <Section title="Métodos de Pago Usados" subtitle="Cantidad de reportes por método">
            <BarChart data={byMetodo} />
          </Section>
        )}
      </div>

      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD COMERCIO
// ════════════════════════════════════════════════════
function DashboardComercio({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode }) {
  const [pedidos, setPedidos]       = useState([]);
  const [productos, setProductos]   = useState([]);
  const [comercio, setComercio]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [selectedKpi, setSelectedKpi] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Obtener comercio_id
      const { data: com } = await supabase
        .from('comercios_datos')
        .select('id, nombre_comercial, categoria')
        .eq('profile_id', session.user.id)
        .single();

      if (!com) { setLoading(false); return; }
      setComercio(com);

      const [{ data: p }, { data: prods }] = await Promise.all([
        supabase
          .from('pedidos_entregas')
          .select('id, estado, total_usd, created_at')
          .eq('comercio_id', com.id),
        supabase
          .from('productos')
          .select('id, nombre, stock, precio_usd, activo')
          .eq('comercio_id', com.id),
      ]);

      // Obtener items de pedidos entregados para top productos
      const pedidosIds = (p ?? []).filter(x => x.estado === 'entregado').map(x => x.id);
      let items = [];
      if (pedidosIds.length) {
        const { data: it } = await supabase
          .from('pedido_items')
          .select('producto_id, cantidad, subtotal_usd')
          .in('pedido_id', pedidosIds);
        items = it ?? [];
      }

      // Agregar ventas por producto
      const ventasPorProd = {};
      items.forEach(it => {
        if (!ventasPorProd[it.producto_id]) ventasPorProd[it.producto_id] = { cantidad: 0, ingresos: 0 };
        ventasPorProd[it.producto_id].cantidad  += it.cantidad;
        ventasPorProd[it.producto_id].ingresos  += Number(it.subtotal_usd);
      });
      const prodsConVentas = (prods ?? []).map(pr => ({
        ...pr,
        vendidos: ventasPorProd[pr.id]?.cantidad  ?? 0,
        ingresos: ventasPorProd[pr.id]?.ingresos  ?? 0,
      }));

      setProductos(prodsConVentas);
      setPedidos(p ?? []);
      setLoading(false);
    }
    load();
  }, [session]);

  if (loading) return <div className="db-loading"><span className="db-spinner" /></div>;
  if (!comercio) return (
    <div className="db-empty-state">
      <span>🏪</span>
      <p>Completa el registro de tu comercio para ver el dashboard.</p>
    </div>
  );

  // KPIs
  const entregados    = pedidos.filter(p => p.estado === 'entregado');
  const ingresos      = entregados.reduce((a, p) => a + Number(p.total_usd), 0);
  const cancelados    = pedidos.filter(p => p.estado === 'cancelado').length;
  const prodActivos   = productos.filter(p => p.activo).length;

  // Gráfico 1: Pedidos por estado
  const ESTADOS = ['pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];
  const ESTADO_LABEL = {
    pendiente: 'Pendiente', confirmado: 'Confirm.', en_preparacion: 'Preparan.',
    en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado',
  };
  const byEstado = ESTADOS.map(e => ({
    label: ESTADO_LABEL[e],
    value: pedidos.filter(p => p.estado === e).length,
    color: ESTADO_COLOR[e],
  })).filter(d => d.value > 0);

  // Gráfico 2: Ingresos mensuales (últimos 6 meses)
  const months = lastNMonths(6);
  const ingresosMensual = months.map(m => ({
    label: m.label,
    value: entregados
      .filter(p => p.created_at.startsWith(m.key))
      .reduce((a, p) => a + Number(p.total_usd), 0),
    color: COLORS.green,
  }));

  // Gráfico 3: Top 8 productos más vendidos
  const topProductos = [...productos]
    .sort((a, b) => b.vendidos - a.vendidos)
    .slice(0, 8)
    .map((p, i) => ({
      label: p.nombre.length > 12 ? p.nombre.slice(0, 10) + '…' : p.nombre,
      value: p.vendidos,
      color: Object.values(COLORS)[i % Object.values(COLORS).length],
    }));

  // Gráfico 4: Stock por producto (top 8 con menor stock)
  const stockBajo = [...productos]
    .filter(p => p.activo)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8)
    .map(p => ({
      label: p.nombre.length > 12 ? p.nombre.slice(0, 10) + '…' : p.nombre,
      value: p.stock,
      color: p.stock === 0 ? COLORS.red : p.stock < 5 ? COLORS.yellow : COLORS.cyan,
    }));

  return (
    <div className="db-root">
      <div className="db-hero">
        <div>
          <h1 className="db-hero-title">{comercio.nombre_comercial}</h1>
          <p className="db-hero-sub">Dashboard del comercio · {comercio.categoria}</p>
        </div>
        <div className="db-hero-right">
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
          icon={BoxIcon}
          tag="Pedidos"
          label="Total pedidos"
          value={pedidos.length}
          color="#f59e0b"
          sub="Historial del comercio"
          onClick={() => setSelectedKpi({
            icon: BoxIcon,
            tag: 'Pedidos',
            label: 'Total pedidos',
            value: pedidos.length,
            color: '#f59e0b',
            iconBg: '#38281a',
            title: 'Resumen de Pedidos del Comercio',
            subtitle: 'Distribución operativa de las órdenes recibidas',
            metrics: [
              { label: 'Entregados con éxito', value: entregados.length, color: '#10b981', sub: `${pedidos.length ? Math.round((entregados.length / pedidos.length) * 100) : 0}% efectividad` },
              { label: 'Activos en curso', value: pedidos.filter(p => ['pendiente', 'confirmado', 'en_preparacion', 'en_camino'].includes(p.estado)).length, color: '#3b82f6', sub: 'En preparación/ruta' },
              { label: 'Cancelados', value: cancelados, color: '#f87171', sub: 'No concretados' },
              { label: 'Total facturado', value: `$${fmt(ingresos)}`, color: '#f59e0b', sub: 'En órdenes entregadas' },
            ],
            breakdownTitle: 'Distribución de Órdenes por Estado',
            breakdown: ESTADOS.map(e => {
              const count = pedidos.filter(p => p.estado === e).length;
              return {
                label: ESTADO_LABEL[e],
                value: `${count} pedido${count === 1 ? '' : 's'}`,
                percent: pedidos.length ? Math.round((count / pedidos.length) * 100) : 0,
                color: ESTADO_COLOR[e],
              };
            }).filter(b => b.percent > 0),
            itemsTitle: 'Últimos pedidos recibidos',
            items: pedidos.slice(0, 4).map(p => ({
              title: `Orden #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.total_usd)} · ${ESTADO_LABEL[p.estado] || p.estado}`,
              badgeBg: `${ESTADO_COLOR[p.estado] || '#6c63ff'}22`,
              badgeColor: ESTADO_COLOR[p.estado] || '#a5b4fc',
            })),
            tip: 'Mantener tiempos de confirmación y preparación ágiles maximiza las valoraciones positivas de tus clientes.',
          })}
        />

        <KpiCard
          icon={DollarIcon}
          tag="Ventas"
          label="Ingresos USD"
          value={`$${fmt(ingresos)}`}
          color="#10b981"
          iconBg="#192820"
          sub="Total liquidado"
          onClick={() => setSelectedKpi({
            icon: DollarIcon,
            tag: 'Ventas',
            label: 'Ingresos USD',
            value: `$${fmt(ingresos)}`,
            color: '#10b981',
            iconBg: '#192820',
            title: 'Resumen de Facturación y Ventas',
            subtitle: 'Balance monetario generado por pedidos entregados',
            metrics: [
              { label: 'Total facturado', value: `$${fmt(ingresos)}`, color: '#10b981', sub: 'En órdenes entregadas' },
              { label: 'Ticket promedio', value: `$${fmt(entregados.length ? ingresos / entregados.length : 0)}`, color: '#3b82f6', sub: 'Por orden despachada' },
              { label: 'Órdenes completadas', value: entregados.length, color: '#06b6d4', sub: 'Despachos exitosos' },
              { label: 'Productos con venta', value: productos.filter(p => p.vendidos > 0).length, color: '#f59e0b', sub: 'Del catálogo' },
            ],
            breakdownTitle: 'Top Productos por Recaudación USD',
            breakdown: [...productos]
              .sort((a, b) => b.ingresos - a.ingresos)
              .slice(0, 5)
              .map((pr, idx) => ({
                label: pr.nombre,
                value: `$${fmt(pr.ingresos)} (${pr.vendidos} u.)`,
                percent: ingresos ? Math.round((pr.ingresos / ingresos) * 100) : 0,
                color: Object.values(COLORS)[idx % Object.values(COLORS).length],
              }))
              .filter(b => b.percent > 0),
            itemsTitle: 'Productos más rentables',
            items: [...productos].sort((a, b) => b.ingresos - a.ingresos).slice(0, 4).map(pr => ({
              title: pr.nombre,
              sub: `${pr.vendidos} unidades vendidas`,
              badge: `$${fmt(pr.ingresos)}`,
              badgeBg: 'rgba(16, 185, 129, 0.15)',
              badgeColor: '#6ee7b7',
            })),
            tip: 'Los ingresos reflejan únicamente las órdenes liquidadas con entrega confirmada.',
          })}
        />

        <KpiCard
          icon={CheckCircleIcon}
          tag="Completados"
          label="Entregados"
          value={entregados.length}
          color="#3b82f6"
          iconBg="#1a2233"
          sub="Pedidos despachados"
          onClick={() => setSelectedKpi({
            icon: CheckCircleIcon,
            tag: 'Completados',
            label: 'Entregados',
            value: entregados.length,
            color: '#3b82f6',
            iconBg: '#1a2233',
            title: 'Resumen de Pedidos Despachados',
            subtitle: 'Órdenes procesadas y entregadas a los compradores',
            metrics: [
              { label: 'Total completados', value: entregados.length, color: '#3b82f6', sub: 'Entregados con éxito' },
              { label: 'Tasa de cumplimiento', value: `${pedidos.length ? Math.round((entregados.length / pedidos.length) * 100) : 0}%`, color: '#10b981', sub: 'De todos los pedidos' },
              { label: 'Total recaudado', value: `$${fmt(ingresos)}`, color: '#f59e0b', sub: 'En USD' },
              { label: 'Promedio por entrega', value: `$${fmt(entregados.length ? ingresos / entregados.length : 0)}`, color: '#06b6d4', sub: 'Por despacho' },
            ],
            itemsTitle: 'Últimas entregas completadas',
            items: entregados.slice(0, 4).map(p => ({
              title: `Orden #${p.id.slice(0, 8)}`,
              sub: formatDate(p.created_at),
              badge: `$${fmt(p.total_usd)} · Entregado`,
              badgeBg: 'rgba(59, 130, 246, 0.15)',
              badgeColor: '#93c5fd',
            })),
            tip: 'Una tasa alta de pedidos completados asegura que tu comercio gane preferencia entre los usuarios.',
          })}
        />

        <KpiCard
          icon={CloseIcon}
          tag="Alertas"
          label="Cancelados"
          value={cancelados}
          color="#f87171"
          iconBg="#2a1818"
          sub="Pedidos no concretados"
          onClick={() => {
            const perdidaEst = pedidos.filter(p => p.estado === 'cancelado').reduce((a, p) => a + Number(p.total_usd || 0), 0);
            setSelectedKpi({
              icon: CloseIcon,
              tag: 'Alertas',
              label: 'Cancelados',
              value: cancelados,
              color: '#f87171',
              iconBg: '#2a1818',
              title: 'Resumen de Pedidos Cancelados',
              subtitle: 'Análisis de pedidos no concretados o dados de baja',
              metrics: [
                { label: 'Total cancelados', value: cancelados, color: '#f87171', sub: 'Órdenes canceladas' },
                { label: 'Tasa de cancelación', value: `${pedidos.length ? Math.round((cancelados / pedidos.length) * 100) : 0}%`, color: '#f59e0b', sub: 'Sobre el total' },
                { label: 'Ventas no concretadas', value: `$${fmt(perdidaEst)}`, color: '#ef4444', sub: 'USD estimado' },
                { label: 'Órdenes exitosas', value: entregados.length, color: '#10b981', sub: 'Completadas' },
              ],
              itemsTitle: 'Órdenes canceladas recientes',
              items: pedidos.filter(p => p.estado === 'cancelado').slice(0, 4).map(p => ({
                title: `Orden #${p.id.slice(0, 8)}`,
                sub: formatDate(p.created_at),
                badge: `$${fmt(p.total_usd)} · Cancelado`,
                badgeBg: 'rgba(248, 113, 113, 0.15)',
                badgeColor: '#fca5a5',
              })),
              tip: 'Mantener actualizado el stock de productos previene cancelaciones por quiebre de inventario.',
            });
          }}
        />

        <KpiCard
          icon={ShoppingBagIcon}
          tag="Inventario"
          label="Productos activos"
          value={prodActivos}
          color="#06b6d4"
          iconBg="#14262c"
          sub="Disponibles en catálogo"
          onClick={() => setSelectedKpi({
            icon: ShoppingBagIcon,
            tag: 'Inventario',
            label: 'Productos activos',
            value: prodActivos,
            color: '#06b6d4',
            iconBg: '#14262c',
            title: 'Resumen de Inventario y Catálogo',
            subtitle: 'Estado del catálogo y alertas de stock de productos',
            metrics: [
              { label: 'Activos en catálogo', value: prodActivos, color: '#06b6d4', sub: `De ${productos.length} totales` },
              { label: 'Pausados / Inactivos', value: productos.filter(p => !p.activo).length, color: '#64748b', sub: 'No visibles' },
              { label: 'Stock crítico (< 5 u.)', value: productos.filter(p => p.activo && p.stock < 5).length, color: '#f59e0b', sub: 'Por agotarse' },
              { label: 'Agotados (0 stock)', value: productos.filter(p => p.activo && p.stock === 0).length, color: '#f87171', sub: 'Sin existencias' },
            ],
            breakdownTitle: 'Distribución del Stock Activo',
            breakdown: [
              { label: 'Stock Normal (≥ 5)', value: `${productos.filter(p => p.activo && p.stock >= 5).length} productos`, percent: prodActivos ? Math.round((productos.filter(p => p.activo && p.stock >= 5).length / prodActivos) * 100) : 0, color: '#10b981' },
              { label: 'Stock Bajo (1 a 4)', value: `${productos.filter(p => p.activo && p.stock > 0 && p.stock < 5).length} productos`, percent: prodActivos ? Math.round((productos.filter(p => p.activo && p.stock > 0 && p.stock < 5).length / prodActivos) * 100) : 0, color: '#f59e0b' },
              { label: 'Agotados (0 unidades)', value: `${productos.filter(p => p.activo && p.stock === 0).length} productos`, percent: prodActivos ? Math.round((productos.filter(p => p.activo && p.stock === 0).length / prodActivos) * 100) : 0, color: '#f87171' },
            ].filter(b => b.percent > 0),
            itemsTitle: 'Productos con menor disponibilidad',
            items: stockBajo.slice(0, 4).map(p => ({
              title: p.label,
              sub: `Stock actual: ${p.value} unidades`,
              badge: p.value === 0 ? 'AGOTADO' : `${p.value} u. restantes`,
              badgeBg: p.value === 0 ? 'rgba(248, 113, 113, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              badgeColor: p.value === 0 ? '#f87171' : '#f59e0b',
            })),
            tip: 'Puedes gestionar el stock, precios y activación directamente desde el panel de comercio.',
          })}
        />
      </div>

      <div className="db-grid-2">
        <Section title="Pedidos por Estado" subtitle="Todos los pedidos del comercio">
          {byEstado.length ? <BarChart data={byEstado} /> : <p className="db-empty">Sin pedidos aún</p>}
        </Section>

        <Section title="Ingresos Mensuales" subtitle="Últimos 6 meses (USD)">
          <BarChart data={ingresosMensual} valuePrefix="$" />
        </Section>
      </div>

      <div className="db-grid-2">
        <Section title="Productos Más Vendidos" subtitle="Unidades vendidas (pedidos entregados)">
          {topProductos.some(d => d.value > 0)
            ? <BarChart data={topProductos} />
            : <p className="db-empty">Sin ventas registradas aún</p>}
        </Section>

        <Section title="Alerta de Stock" subtitle="Productos activos con menor stock">
          {stockBajo.length
            ? <BarChart data={stockBajo} valueSuffix=" u." />
            : <p className="db-empty">Sin productos activos</p>}
        </Section>
      </div>

      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD REPARTIDOR
// ════════════════════════════════════════════════════
function DashboardRepartidor({ session, onSignOut, onGoToProfile, registeredRol, currentRol, onSwitchMode }) {
  const [pedidos, setPedidos]       = useState([]);
  const [repartidor, setRepartidor] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [selectedKpi, setSelectedKpi] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rep } = await supabase
        .from('repartidores_datos')
        .select('id, vehiculo, disponible')
        .eq('profile_id', session.user.id)
        .single();

      if (!rep) { setLoading(false); return; }
      setRepartidor(rep);

      const { data: p } = await supabase
        .from('pedidos_entregas')
        .select('id, estado, total_usd, created_at, valoracion')
        .eq('repartidor_id', rep.id)
        .order('created_at', { ascending: false });

      setPedidos(p ?? []);
      setLoading(false);
    }
    load();
  }, [session]);

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

  // Gráfico 2: Pedidos por estado
  const ESTADOS = ['en_camino', 'entregado', 'cancelado'];
  const ESTADO_LABEL = { en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };
  const byEstado = ESTADOS.map(e => ({
    label: ESTADO_LABEL[e],
    value: pedidos.filter(p => p.estado === e).length,
    color: ESTADO_COLOR[e],
  }));

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
          <span className="db-hero-badge db-hero-badge--repartidor">🛵 Repartidor</span>
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
export default function Dashboard({ session, rol, registeredRol, onSwitchMode, onSignOut, onGoToProfile }) {
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
    />
  );
}
