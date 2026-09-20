import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  BoxIcon, CheckCircleIcon, DollarIcon, StarIcon, MotoIcon, 
  ShoppingBagIcon, CloseIcon, WrenchIcon 
} from '../common/Icons';
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
function KpiCard({ icon: Icon, tag = 'Servicio', label, value, sub, color = '#f59e0b', iconBg = '#38281a' }) {
  return (
    <div className="db-kpi">
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

// ════════════════════════════════════════════════════
// DASHBOARD CLIENTE
// ════════════════════════════════════════════════════
function DashboardCliente({ session }) {
  const [pedidos, setPedidos]   = useState([]);
  const [pagos, setPagos]       = useState([]);
  const [loading, setLoading]   = useState(true);

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
          .select('metodo, monto_usd, estado, created_at')
          .eq('cliente_id', session.user.id),
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

  // Gráfico 2: Gasto mensual (últimos 6 meses)
  const months = lastNMonths(6);
  const gastoMensual = months.map(m => ({
    label: m.label,
    value: pedidos
      .filter(p => p.estado === 'entregado' && p.created_at.startsWith(m.key))
      .reduce((a, p) => a + Number(p.total_usd), 0),
    color: COLORS.purple,
  }));

  // Gráfico 3: Métodos de pago
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
        <span className="db-hero-badge db-hero-badge--cliente">👤 Cliente</span>
      </div>

      {/* KPIs */}
      <div className="db-kpis">
        <KpiCard icon={BoxIcon} tag="Pedidos" label="Total pedidos" value={totalPedidos} color="#f59e0b" sub="Registrados en tu cuenta" />
        <KpiCard icon={CheckCircleIcon} tag="Entregas" label="Entregados" value={entregados} color="#10b981" iconBg="#192820" sub="Completados con éxito" />
        <KpiCard icon={DollarIcon} tag="Finanzas" label="Gasto total" value={`$${fmt(totalGastado)}`} color="#f59e0b" sub="Total invertido en USD" />
        <KpiCard icon={StarIcon} tag="Feedback" label="Val. promedio" value={avgVal ? avgVal.toFixed(1) + ' / 5' : 'N/A'} color="#fbbf24" sub="Puntuación a repartidores" />
      </div>

      <div className="db-grid-2">
        <Section title="Pedidos por Estado" subtitle="Distribución de todos tus pedidos">
          {byEstado.length ? <BarChart data={byEstado} /> : <p className="db-empty">Sin pedidos aún</p>}
        </Section>

        <Section title="Gasto Mensual" subtitle="Últimos 6 meses (USD)">
          <BarChart data={gastoMensual} valuePrefix="$" />
        </Section>
      </div>

      {byMetodo.length > 0 && (
        <Section title="Métodos de Pago Usados" subtitle="Cantidad de reportes por método">
          <BarChart data={byMetodo} />
        </Section>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD COMERCIO
// ════════════════════════════════════════════════════
function DashboardComercio({ session }) {
  const [pedidos, setPedidos]     = useState([]);
  const [productos, setProductos] = useState([]);
  const [comercio, setComercio]   = useState(null);
  const [loading, setLoading]     = useState(true);

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
        <span className="db-hero-badge db-hero-badge--comercio">🏪 Comercio</span>
      </div>

      <div className="db-kpis">
        <KpiCard icon={BoxIcon} tag="Pedidos" label="Total pedidos" value={pedidos.length} color="#f59e0b" sub="Historial del comercio" />
        <KpiCard icon={DollarIcon} tag="Ventas" label="Ingresos USD" value={`$${fmt(ingresos)}`} color="#10b981" iconBg="#192820" sub="Total liquidado" />
        <KpiCard icon={CheckCircleIcon} tag="Completados" label="Entregados" value={entregados.length} color="#3b82f6" iconBg="#1a2233" sub="Pedidos despachados" />
        <KpiCard icon={CloseIcon} tag="Alertas" label="Cancelados" value={cancelados} color="#f87171" iconBg="#2a1818" sub="Pedidos no concretados" />
        <KpiCard icon={ShoppingBagIcon} tag="Inventario" label="Productos activos" value={prodActivos} color="#06b6d4" iconBg="#14262c" sub="Disponibles en catálogo" />
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
    </div>
  );
}

// ════════════════════════════════════════════════════
// DASHBOARD REPARTIDOR
// ════════════════════════════════════════════════════
function DashboardRepartidor({ session }) {
  const [pedidos, setPedidos]     = useState([]);
  const [repartidor, setRepartidor] = useState(null);
  const [loading, setLoading]     = useState(true);

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
        <span className="db-hero-badge db-hero-badge--repartidor">🛵 Repartidor</span>
      </div>

      <div className="db-kpis">
        <KpiCard icon={MotoIcon} tag="Servicio" label="Total entregas" value={pedidos.length} color="#f59e0b" sub="Servicios asignados" />
        <KpiCard icon={CheckCircleIcon} tag="Entregados" label="Entregas con éxito" value={entregados.length} color="#10b981" iconBg="#192820" sub="Completadas a tiempo" />
        <KpiCard icon={StarIcon} tag="Rating" label="Val. promedio" value={avgVal ? avgVal.toFixed(1) + ' / 5' : 'N/A'} color="#fbbf24" sub="Calificación de clientes" />
        <KpiCard icon={DollarIcon} tag="Ganancias" label="Ganancia estimada" value={`$${fmt(gananciaEstimada)}`} color="#f59e0b" sub="Acumulado estimado" />
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
    </div>
  );
}

// ════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════
export default function Dashboard({ session, rol }) {
  if (rol === 'comercio')   return <DashboardComercio   session={session} />;
  if (rol === 'repartidor') return <DashboardRepartidor session={session} />;
  return <DashboardCliente session={session} />;
}
