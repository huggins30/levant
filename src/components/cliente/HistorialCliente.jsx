import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import './HistorialCliente.css';

const ESTADO_BADGE = {
  pendiente:       { label: 'Pendiente',       color: '#f59e0b' },
  confirmado:      { label: 'Confirmado',       color: '#6c63ff' },
  en_preparacion:  { label: 'En preparación',   color: '#3b82f6' },
  en_camino:       { label: 'En camino',        color: '#8b5cf6' },
  entregado:       { label: 'Entregado',        color: '#10b981' },
  cancelado:       { label: 'Cancelado',        color: '#f87171' },
};

const StarRating = ({ value, onChange, readonly = false }) => (
  <div className="hc-stars" aria-label={`Valoración: ${value} de 5`}>
    {[1, 2, 3, 4, 5].map(star => (
      <button
        key={star}
        type="button"
        className={`hc-star ${star <= value ? 'hc-star--active' : ''}`}
        onClick={() => !readonly && onChange?.(star)}
        disabled={readonly}
        aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
      >
        ★
      </button>
    ))}
  </div>
);

export default function HistorialCliente({ session }) {
  const [pedidos, setPedidos]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [valorando, setValorando] = useState({});   // { pedidoId: { stars, comment, loading } }
  const [filter, setFilter]       = useState('todos');

  // ── Cargar pedidos del cliente ─────────────────────────────────
  const fetchPedidos = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('pedidos_entregas')
      .select(`
        id, estado, total_usd, valoracion, comentario, created_at, direccion_entrega,
        comercios_datos ( nombre_comercial ),
        repartidores_datos ( profiles ( nombre_completo ) ),
        pedido_items (
          cantidad, precio_usd, subtotal_usd,
          productos ( nombre, imagen_url )
        ),
        reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
      `)
      .eq('cliente_id', session.user.id)
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); }
    else      { setPedidos(data ?? []); }
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // ── Enviar valoración ──────────────────────────────────────────
  const submitValoracion = async (pedidoId) => {
    const v = valorando[pedidoId];
    if (!v?.stars) return;

    setValorando(prev => ({ ...prev, [pedidoId]: { ...v, loading: true } }));

    const { error: err } = await supabase
      .from('pedidos_entregas')
      .update({ valoracion: v.stars, comentario: v.comment ?? null })
      .eq('id', pedidoId)
      .eq('cliente_id', session.user.id);

    if (!err) {
      setPedidos(prev => prev.map(p =>
        p.id === pedidoId ? { ...p, valoracion: v.stars, comentario: v.comment } : p
      ));
      setValorando(prev => { const next = { ...prev }; delete next[pedidoId]; return next; });
    }

    setValorando(prev => ({ ...prev, [pedidoId]: { ...v, loading: false } }));
  };

  // ── Filtro ─────────────────────────────────────────────────────
  const filtrados = filter === 'todos' ? pedidos : pedidos.filter(p => p.estado === filter);

  // ── Render helpers ─────────────────────────────────────────────
  const formatDate = (iso) => new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  if (loading) return (
    <div className="hc-center">
      <span className="hc-loader" />
      <p>Cargando historial…</p>
    </div>
  );

  if (error) return (
    <div className="hc-center hc-error">
      ⚠️ Error: {error}
      <button className="hc-retry" onClick={fetchPedidos}>Reintentar</button>
    </div>
  );

  // ── JSX ────────────────────────────────────────────────────────
  return (
    <div className="hc-wrapper">
      {/* Encabezado */}
      <div className="hc-top">
        <div>
          <h2 className="hc-title">📦 Mis Pedidos</h2>
          <p className="hc-subtitle">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} en total</p>
        </div>
        <button className="hc-refresh" onClick={fetchPedidos} aria-label="Refrescar">↻</button>
      </div>

      {/* Filtro por estado */}
      <div className="hc-filters" role="tablist">
        {['todos', 'pendiente', 'en_camino', 'entregado', 'cancelado'].map(f => (
          <button
            key={f}
            id={`hc-filter-${f}`}
            role="tab"
            aria-selected={filter === f}
            className={`hc-filter-btn ${filter === f ? 'hc-filter-btn--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'todos' ? '🗂 Todos' : ESTADO_BADGE[f]?.label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 && (
        <div className="hc-empty">
          <span>🛍️</span>
          <p>No hay pedidos {filter !== 'todos' ? `con estado "${ESTADO_BADGE[filter]?.label}"` : 'aún'}.</p>
        </div>
      )}

      {/* Lista de pedidos */}
      <div className="hc-list">
        {filtrados.map(pedido => {
          const badge   = ESTADO_BADGE[pedido.estado] ?? { label: pedido.estado, color: '#64748b' };
          const isOpen  = expanded === pedido.id;
          const yaValorado = Boolean(pedido.valoracion);
          const v = valorando[pedido.id] ?? {};

          return (
            <div key={pedido.id} className={`hc-card ${isOpen ? 'hc-card--open' : ''}`}>
              {/* ── Cabecera ── */}
              <button
                className="hc-card-header"
                onClick={() => setExpanded(prev => prev === pedido.id ? null : pedido.id)}
                aria-expanded={isOpen}
                id={`hc-pedido-${pedido.id}`}
              >
                <div className="hc-card-left">
                  <span className="hc-badge" style={{ '--badge-color': badge.color }}>
                    {badge.label}
                  </span>
                  <div>
                    <p className="hc-comercio">{pedido.comercios_datos?.nombre_comercial ?? '—'}</p>
                    <p className="hc-date">{formatDate(pedido.created_at)}</p>
                  </div>
                </div>
                <div className="hc-card-right">
                  <span className="hc-total">${pedido.total_usd?.toFixed(2)}</span>
                  <span className={`hc-chevron ${isOpen ? 'hc-chevron--up' : ''}`}>›</span>
                </div>
              </button>

              {/* ── Detalle expandido ── */}
              {isOpen && (
                <div className="hc-card-body">
                  {/* Items */}
                  <table className="hc-table" aria-label="Productos del pedido">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="hc-th-num">Cant.</th>
                        <th className="hc-th-num">Precio</th>
                        <th className="hc-th-num">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pedido.pedido_items ?? []).map((item, i) => (
                        <tr key={i}>
                          <td className="hc-td-prod">
                            {item.productos?.imagen_url && (
                              <img src={item.productos.imagen_url} alt={item.productos?.nombre} className="hc-prod-img" />
                            )}
                            {item.productos?.nombre ?? '—'}
                          </td>
                          <td className="hc-td-num">{item.cantidad}</td>
                          <td className="hc-td-num">${item.precio_usd?.toFixed(2)}</td>
                          <td className="hc-td-num hc-td-sub">${item.subtotal_usd?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="hc-tf-label">Total</td>
                        <td className="hc-td-num hc-tf-total">${pedido.total_usd?.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Meta info */}
                  <div className="hc-meta">
                    <div className="hc-meta-item">
                      <span className="hc-meta-label">Dirección</span>
                      <span>{pedido.direccion_entrega}</span>
                    </div>
                    {pedido.repartidores_datos?.profiles?.nombre_completo && (
                      <div className="hc-meta-item">
                        <span className="hc-meta-label">Repartidor</span>
                        <span>🛵 {pedido.repartidores_datos.profiles.nombre_completo}</span>
                      </div>
                    )}
                    {pedido.reportes_pago?.[0] && (
                      <div className="hc-meta-item">
                        <span className="hc-meta-label">Pago</span>
                        <span>
                          {pedido.reportes_pago[0].metodo?.replace('_', ' ')} —
                          Ref: {pedido.reportes_pago[0].referencia} —
                          <span className={`hc-pago-estado hc-pago-estado--${pedido.reportes_pago[0].estado}`}>
                            {' '}{pedido.reportes_pago[0].estado}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Valoración ── */}
                  {pedido.estado === 'entregado' && (
                    <div className="hc-rating-section">
                      <p className="hc-rating-label">
                        {yaValorado ? '⭐ Tu valoración' : '⭐ Valorar pedido'}
                      </p>
                      {yaValorado ? (
                        <>
                          <StarRating value={pedido.valoracion} readonly />
                          {pedido.comentario && (
                            <p className="hc-comment-readonly">"{pedido.comentario}"</p>
                          )}
                        </>
                      ) : (
                        <div className="hc-rating-form">
                          <StarRating
                            value={v.stars ?? 0}
                            onChange={(s) => setValorando(prev => ({ ...prev, [pedido.id]: { ...v, stars: s } }))}
                          />
                          <textarea
                            className="hc-rating-comment"
                            placeholder="Comentario opcional…"
                            rows={2}
                            value={v.comment ?? ''}
                            onChange={(e) => setValorando(prev => ({ ...prev, [pedido.id]: { ...v, comment: e.target.value } }))}
                          />
                          <button
                            id={`hc-valorar-${pedido.id}`}
                            className="hc-btn-rate"
                            disabled={!v.stars || v.loading}
                            onClick={() => submitValoracion(pedido.id)}
                          >
                            {v.loading ? <span className="hc-spinner-sm" /> : 'Enviar valoración'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
