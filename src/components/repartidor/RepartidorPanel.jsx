import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import './RepartidorPanel.css';

const VEHICULOS = ['moto', 'carro', 'bicicleta', 'a_pie'];
const VEHICULO_ICON = { moto: '🏍️', carro: '🚗', bicicleta: '🚲', a_pie: '🚶' };

const ESTADO_BADGE = {
  pendiente:      { label: 'Pendiente',      color: '#f59e0b' },
  confirmado:     { label: 'Confirmado',     color: '#6c63ff' },
  en_preparacion: { label: 'En preparación', color: '#3b82f6' },
  en_camino:      { label: 'En camino',      color: '#8b5cf6' },
  entregado:      { label: 'Entregado',      color: '#10b981' },
  cancelado:      { label: 'Cancelado',      color: '#f87171' },
};

const CEDULA_REGEX = /^(V|E)-[0-9]{6,8}$/;
const PLACA_REGEX  = /^[A-Z0-9]{5,8}$/;

// ── Star display ────────────────────────────────────────────────
const Stars = ({ value }) => (
  <span className="rp-stars" aria-label={`${value} de 5 estrellas`}>
    {[1,2,3,4,5].map(s => (
      <span key={s} className={s <= Math.round(value) ? 'rp-star rp-star--on' : 'rp-star'}>★</span>
    ))}
    <span className="rp-star-val">{value?.toFixed(1)}</span>
  </span>
);

export default function RepartidorPanel({ session, initialTab = 'pedidos' }) {
  // ── Estado del repartidor ────────────────────────────────────
  const [repData, setRepData]   = useState(null);   // row en repartidores_datos
  const [form, setForm]         = useState({ cedula: '', vehiculo: 'moto', placa: '' });
  const [disponible, setDisponible] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formStatus, setFormStatus] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // ── Historial ────────────────────────────────────────────────
  const [entregas, setEntregas]     = useState([]);
  const [valoracion, setValoracion] = useState(null); // de la vista
  const [loadingHist, setLoadingHist] = useState(true);

  // ── Pedidos Asignados ────────────────────────────────────────
  const [pedidosAsignados, setPedidosAsignados] = useState([]);
  const [loadingPedidos, setLoadingPedidos]     = useState(true);
  const [updatingPedidoId, setUpdatingPedidoId] = useState(null);
  const [filtroPedidos, setFiltroPedidos]       = useState('activos');

  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // ── Cargar datos ─────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    const load = async () => {
      const uid = session.user.id;
      const { data: rd } = await supabase
        .from('repartidores_datos')
        .select('*')
        .eq('profile_id', uid)
        .maybeSingle();

      if (rd) {
        setRepData(rd);
        setDisponible(rd.disponible);
        setForm({ cedula: rd.cedula, vehiculo: rd.vehiculo, placa: rd.placa ?? '' });
      }
    };
    load();
  }, [session]);

  // ── Cargar pedidos asignados ─────────────────────────────────
  const fetchPedidosAsignados = useCallback(async () => {
    if (!repData?.id) return;
    setLoadingPedidos(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_entregas')
        .select(`
          id, estado, total_usd, created_at, updated_at, direccion_entrega,
          comercios_datos (
            id, nombre_comercial, direccion
          ),
          profiles!pedidos_entregas_cliente_id_fkey (
            id, nombre_completo, telefono
          ),
          pedido_items (
            id, cantidad, precio_usd, subtotal_usd,
            productos ( nombre, imagen_url )
          )
        `)
        .eq('repartidor_id', repData.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error cargando pedidos asignados:', error);
      } else {
        setPedidosAsignados(data ?? []);
      }
    } catch (err) {
      console.error('Error fetchPedidosAsignados:', err);
    } finally {
      setLoadingPedidos(false);
    }
  }, [repData?.id]);

  // ── Cargar historial y valoración ────────────────────────────
  const fetchHistorial = useCallback(async () => {
    if (!repData?.id) return;
    setLoadingHist(true);

    const [{ data: list }, { data: val }] = await Promise.all([
      supabase
        .from('pedidos_entregas')
        .select(`
          id, estado, total_usd, valoracion, comentario, created_at, direccion_entrega,
          profiles!pedidos_entregas_cliente_id_fkey( nombre_completo ),
          comercios_datos( nombre_comercial )
        `)
        .eq('repartidor_id', repData.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('repartidor_valoracion_promedio')
        .select('*')
        .eq('repartidor_id', repData.id)
        .maybeSingle(),
    ]);

    setEntregas(list ?? []);
    setValoracion(val);
    setLoadingHist(false);
  }, [repData?.id]);

  useEffect(() => {
    if (repData?.id) {
      if (activeTab === 'pedidos') fetchPedidosAsignados();
      if (activeTab === 'historial') fetchHistorial();
    }
  }, [fetchPedidosAsignados, fetchHistorial, repData, activeTab]);

  // ── Cambiar estado del pedido (Recibir / Entregar) ─────────────
  const cambiarEstadoPedido = async (pedidoId, nuevoEstado) => {
    setUpdatingPedidoId(pedidoId);
    try {
      const { error } = await supabase
        .from('pedidos_entregas')
        .update({
          estado: nuevoEstado,
          updated_at: new Date().toISOString()
        })
        .eq('id', pedidoId)
        .eq('repartidor_id', repData.id);

      if (error) {
        console.error('Error actualizando pedido:', error);
        alert('Error al actualizar pedido: ' + error.message);
      } else {
        setPedidosAsignados(prev => prev.map(p => (
          p.id === pedidoId ? { ...p, estado: nuevoEstado } : p
        )));
        if (nuevoEstado === 'entregado') {
          fetchHistorial();
        }
      }
    } catch (err) {
      console.error(err);
      alert('Error inesperado al actualizar pedido.');
    } finally {
      setUpdatingPedidoId(null);
    }
  };

  // ── Toggle disponibilidad ────────────────────────────────────
  const toggleDisponible = async () => {
    if (!repData?.id) return;
    setToggling(true);
    const next = !disponible;
    const { error } = await supabase
      .from('repartidores_datos')
      .update({ disponible: next })
      .eq('id', repData.id);
    if (!error) setDisponible(next);
    setToggling(false);
  };

  // ── Validar formulario ───────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!CEDULA_REGEX.test(form.cedula))
      e.cedula = 'Formato: V-1234567 o E-12345678';
    if (form.placa && !PLACA_REGEX.test(form.placa.toUpperCase()))
      e.placa = 'Placa inválida (5-8 caracteres alfanuméricos)';
    return e;
  };

  // ── Guardar perfil ───────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    const ve = validate();
    if (Object.keys(ve).length) { setFormErrors(ve); return; }
    setFormLoading(true);
    setFormStatus(null);

    try {
      const uid = session.user.id;
      const payload = {
        profile_id: uid,
        cedula:     form.cedula.trim().toUpperCase(),
        vehiculo:   form.vehiculo,
        placa:      form.placa.trim().toUpperCase() || null,
        disponible,
      };

      const { data, error } = await supabase
        .from('repartidores_datos')
        .upsert(payload, { onConflict: 'profile_id' })
        .select()
        .single();

      if (error) throw error;
      setRepData(data);
      setFormStatus('ok');
    } catch (err) {
      console.error(err);
      setFormStatus('err');
    } finally {
      setFormLoading(false);
    }
  };

  const handleChange = ({ target: { name, value } }) => {
    setForm(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: '' }));
  };

  // ── Métricas rápidas ─────────────────────────────────────────
  const entregadas  = entregas.filter(e => e.estado === 'entregado').length;
  const enCamino    = entregas.filter(e => e.estado === 'en_camino').length;
  const ingresos    = entregas.filter(e => e.estado === 'entregado').reduce((s, e) => s + (e.total_usd ?? 0), 0);
  const pedidosActivosCount = pedidosAsignados.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length;

  // ── JSX ──────────────────────────────────────────────────────
  return (
    <div className="rp-wrap">
      {/* ── Header con toggle de disponibilidad ── */}
      <div className="rp-hero">
        <div className="rp-hero-info">
          <span className="rp-hero-icon">{VEHICULO_ICON[form.vehiculo] ?? '🛵'}</span>
          <div>
            <h2 className="rp-hero-title">Panel del Repartidor</h2>
            <p className="rp-hero-sub">{form.cedula || 'Sin cédula registrada'}</p>
          </div>
        </div>

        {/* Toggle de disponibilidad */}
        <div className="rp-avail">
          <span className={`rp-avail-dot ${disponible ? 'rp-avail-dot--on' : ''}`} />
          <span className="rp-avail-label">{disponible ? 'Disponible' : 'No disponible'}</span>
          <button
            id="rp-toggle-disponible"
            className={`rp-avail-btn ${disponible ? 'rp-avail-btn--on' : 'rp-avail-btn--off'}`}
            onClick={toggleDisponible}
            disabled={toggling || !repData?.id}
            aria-pressed={disponible}
          >
            {toggling ? <span className="rp-spinner-sm" /> : disponible ? '🟢 EN LÍNEA' : '⚫ DESCONECTADO'}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="rp-tabs" role="tablist">
        {[
          ['pedidos', `📦 Pedidos Asignados ${pedidosActivosCount > 0 ? `(${pedidosActivosCount})` : ''}`],
          ['historial', '📋 Historial'],
          ['perfil', '👤 Mi perfil']
        ].map(([id, label]) => (
          <button key={id} id={`rptab-${id}`} role="tab" aria-selected={activeTab === id}
            className={`rp-tab ${activeTab === id ? 'rp-tab--active' : ''}`}
            onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {/* ═══ TAB: PEDIDOS ASIGNADOS ═══ */}
      {activeTab === 'pedidos' && (
        <div className="rp-section">
          <div className="rp-section-header">
            <div>
              <h2 className="rp-section-title">📦 Pedidos Asignados</h2>
              <p className="rp-section-sub">Pedidos asignados por comercios listos para retiro y entrega</p>
            </div>
            <button className="rp-btn-refresh-icon" onClick={fetchPedidosAsignados} title="Refrescar pedidos">
              ↻
            </button>
          </div>

          {!repData?.id ? (
            <div className="rp-info-box">
              ⚠️ Completa primero tu perfil (cédula y vehículo) en la pestaña <strong>Mi perfil</strong> para gestionar pedidos.
            </div>
          ) : (
            <>
              {/* Filtros de pedidos */}
              <div className="rp-filtros-bar">
                {[
                  { id: 'activos',   label: '⚡ Activos' },
                  { id: 'asignados', label: '📥 Por Recibir' },
                  { id: 'en_camino', label: '🚚 En camino' },
                  { id: 'entregado', label: '✅ Entregados' },
                  { id: 'todos',     label: '📋 Todos' },
                ].map(f => {
                  let count = 0;
                  if (f.id === 'activos')   count = pedidosAsignados.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length;
                  if (f.id === 'asignados') count = pedidosAsignados.filter(p => p.estado === 'pendiente' || p.estado === 'confirmado' || p.estado === 'en_preparacion').length;
                  if (f.id === 'en_camino') count = pedidosAsignados.filter(p => p.estado === 'en_camino').length;
                  if (f.id === 'entregado') count = pedidosAsignados.filter(p => p.estado === 'entregado').length;
                  if (f.id === 'todos')     count = pedidosAsignados.length;

                  return (
                    <button
                      key={f.id}
                      className={`rp-filtro-btn ${filtroPedidos === f.id ? 'rp-filtro-btn--active' : ''}`}
                      onClick={() => setFiltroPedidos(f.id)}
                    >
                      {f.label} <span className="rp-filtro-badge">{count}</span>
                    </button>
                  );
                })}
              </div>

              {loadingPedidos ? (
                <div className="rp-center"><span className="rp-loader" /></div>
              ) : (() => {
                const filtrados = pedidosAsignados.filter(p => {
                  if (filtroPedidos === 'activos')   return p.estado !== 'entregado' && p.estado !== 'cancelado';
                  if (filtroPedidos === 'asignados') return p.estado === 'pendiente' || p.estado === 'confirmado' || p.estado === 'en_preparacion';
                  if (filtroPedidos === 'en_camino') return p.estado === 'en_camino';
                  if (filtroPedidos === 'entregado') return p.estado === 'entregado';
                  return true;
                });

                if (filtrados.length === 0) {
                  return (
                    <div className="rp-empty-pedidos">
                      <span className="rp-empty-icon">🛵</span>
                      <p className="rp-empty-title">
                        {filtroPedidos === 'activos' 
                          ? 'No tienes pedidos asignados activos por el momento.' 
                          : `No hay pedidos con el filtro "${filtroPedidos}".`}
                      </p>
                      <p className="rp-empty-sub">
                        Cuando un comercio te asigne un pedido, aparecerá en esta lista con los botones de recepción y entrega.
                      </p>
                      <button className="rp-btn-refresh" onClick={fetchPedidosAsignados}>↻ Refrescar lista</button>
                    </div>
                  );
                }

                return (
                  <div className="rp-pedidos-list">
                    {filtrados.map(ped => {
                      const badge = ESTADO_BADGE[ped.estado] ?? { label: ped.estado, color: '#64748b' };
                      const isAsignado = ped.estado === 'pendiente' || ped.estado === 'confirmado' || ped.estado === 'en_preparacion';
                      const isEnCamino = ped.estado === 'en_camino';
                      const isEntregado = ped.estado === 'entregado';

                      return (
                        <div key={ped.id} className={`rp-pedido-card ${isEnCamino ? 'rp-pedido-card--en-camino' : ''}`}>
                          {/* Top */}
                          <div className="rp-card-header">
                            <div className="rp-card-id-wrap">
                              <span className="rp-card-id">#{ped.id.slice(0, 8)}</span>
                              <span className="rp-card-date">
                                {new Date(ped.created_at).toLocaleDateString('es-VE', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <span className="rp-badge" style={{ '--bc': badge.color }}>
                              {badge.label}
                            </span>
                          </div>

                          {/* Ruta Comercio -> Cliente */}
                          <div className="rp-route-box">
                            {/* Punto 1: Comercio (Retiro) */}
                            <div className="rp-route-point">
                              <div className="rp-route-marker rp-route-marker--comercio">🏪</div>
                              <div className="rp-route-details">
                                <span className="rp-route-type">PUNTO DE RETIRO (COMERCIO)</span>
                                <strong className="rp-route-name">{ped.comercios_datos?.nombre_comercial || 'Comercio asignado'}</strong>
                                <span className="rp-route-addr">{ped.comercios_datos?.direccion || 'Dirección no especificada'}</span>
                              </div>
                            </div>

                            <div className="rp-route-connector" />

                            {/* Punto 2: Cliente (Entrega) */}
                            <div className="rp-route-point">
                              <div className="rp-route-marker rp-route-marker--cliente">📍</div>
                              <div className="rp-route-details">
                                <span className="rp-route-type">PUNTO DE ENTREGA (CLIENTE)</span>
                                <strong className="rp-route-name">{ped.profiles?.nombre_completo || 'Cliente'}</strong>
                                <span className="rp-route-addr">{ped.direccion_entrega}</span>
                                {ped.profiles?.telefono && (
                                  <a href={`tel:${ped.profiles.telefono}`} className="rp-route-phone">
                                    📞 Llamar: {ped.profiles.telefono}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Items resumen */}
                          {ped.pedido_items && ped.pedido_items.length > 0 && (
                            <div className="rp-items-summary">
                              <span className="rp-items-title">
                                📦 {ped.pedido_items.length} producto{ped.pedido_items.length !== 1 ? 's' : ''}:
                              </span>
                              <div className="rp-items-chips">
                                {ped.pedido_items.map(it => (
                                  <span key={it.id} className="rp-item-chip">
                                    {it.cantidad}x {it.productos?.nombre || 'Item'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Footer con Total y Botón de Acción */}
                          <div className="rp-card-footer">
                            <div className="rp-total-wrap">
                              <span className="rp-total-label">Total del pedido</span>
                              <span className="rp-total-amount">${ped.total_usd?.toFixed(2)}</span>
                            </div>

                            <div className="rp-actions-wrap">
                              {/* Botón: Recibir pedido / Iniciar camino */}
                              {isAsignado && (
                                <button
                                  className="rp-btn-action rp-btn-action--recibir"
                                  disabled={updatingPedidoId === ped.id}
                                  onClick={() => cambiarEstadoPedido(ped.id, 'en_camino')}
                                >
                                  {updatingPedidoId === ped.id ? (
                                    <span className="rp-spinner-sm" />
                                  ) : (
                                    <>📥 Recibir Pedido / Iniciar Entrega</>
                                  )}
                                </button>
                              )}

                              {/* Botón: Marcar como entregado */}
                              {isEnCamino && (
                                <button
                                  className="rp-btn-action rp-btn-action--entregar"
                                  disabled={updatingPedidoId === ped.id}
                                  onClick={() => {
                                    if (confirm('¿Confirmas que entregaste este pedido al cliente?')) {
                                      cambiarEstadoPedido(ped.id, 'entregado');
                                    }
                                  }}
                                >
                                  {updatingPedidoId === ped.id ? (
                                    <span className="rp-spinner-sm" />
                                  ) : (
                                    <>✅ Marcar como Entregado</>
                                  )}
                                </button>
                              )}

                              {/* Entregado info */}
                              {isEntregado && (
                                <span className="rp-status-completed">
                                  🎉 Pedido entregado con éxito
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: PERFIL ═══ */}
      {activeTab === 'perfil' && (
        <div className="rp-section">
          <form className="rp-form" onSubmit={handleSave} noValidate>

            {/* Cédula */}
            <div className={`rp-field ${formErrors.cedula ? 'rp-field--err' : ''}`}>
              <label htmlFor="rp-cedula">Cédula de identidad</label>
              <input id="rp-cedula" name="cedula" type="text" value={form.cedula}
                onChange={handleChange} placeholder="V-1234567" maxLength={11} />
              {formErrors.cedula
                ? <span className="rp-err-txt">{formErrors.cedula}</span>
                : <span className="rp-hint">Formato: V-XXXXXXX o E-XXXXXXXX</span>}
            </div>

            {/* Vehículo */}
            <div className="rp-field">
              <label>Tipo de vehículo</label>
              <div className="rp-vehiculos">
                {VEHICULOS.map(v => (
                  <button key={v} type="button" id={`rp-vehiculo-${v}`}
                    className={`rp-veh-btn ${form.vehiculo === v ? 'rp-veh-btn--active' : ''}`}
                    onClick={() => setForm(p => ({ ...p, vehiculo: v }))}>
                    {VEHICULO_ICON[v]} {v.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Placa */}
            <div className={`rp-field ${formErrors.placa ? 'rp-field--err' : ''}`}>
              <label htmlFor="rp-placa">Placa <span className="rp-opt">(opcional)</span></label>
              <input id="rp-placa" name="placa" type="text" value={form.placa}
                onChange={handleChange} placeholder="ABC12" maxLength={8}
                style={{ textTransform: 'uppercase' }} />
              {formErrors.placa && <span className="rp-err-txt">{formErrors.placa}</span>}
            </div>

            {formStatus === 'ok'  && <div className="rp-alert-ok">✅ Perfil guardado correctamente.</div>}
            {formStatus === 'err' && <div className="rp-alert-err">❌ Error al guardar. Intenta de nuevo.</div>}

            <button id="rp-perfil-save" type="submit" className="rp-btn-primary" disabled={formLoading}>
              {formLoading ? <span className="rp-spinner" /> : '💾 Guardar perfil'}
            </button>
          </form>
        </div>
      )}

      {/* ═══ TAB: HISTORIAL ═══ */}
      {activeTab === 'historial' && (
        <div className="rp-section">
          {!repData?.id ? (
            <div className="rp-info-box">⚠️ Guarda primero tu perfil para ver el historial.</div>
          ) : loadingHist ? (
            <div className="rp-center"><span className="rp-loader" /></div>
          ) : (
            <>
              {/* KPIs */}
              <div className="rp-kpis">
                <div className="rp-kpi rp-kpi--green">
                  <span>✅</span>
                  <p className="rp-kpi-val">{entregadas}</p>
                  <p className="rp-kpi-lbl">Entregados</p>
                </div>
                <div className="rp-kpi rp-kpi--purple">
                  <span>🛵</span>
                  <p className="rp-kpi-val">{enCamino}</p>
                  <p className="rp-kpi-lbl">En camino</p>
                </div>
                <div className="rp-kpi rp-kpi--blue">
                  <span>💵</span>
                  <p className="rp-kpi-val">${ingresos.toFixed(2)}</p>
                  <p className="rp-kpi-lbl">Ingresos USD</p>
                </div>
                <div className="rp-kpi rp-kpi--yellow">
                  <span>⭐</span>
                  <p className="rp-kpi-val">
                    {valoracion?.valoracion_promedio != null
                      ? valoracion.valoracion_promedio
                      : '—'}
                  </p>
                  <p className="rp-kpi-lbl">Val. promedio</p>
                </div>
              </div>

              {/* Valoración visual */}
              {valoracion?.valoracion_promedio != null && (
                <div className="rp-val-card">
                  <p className="rp-val-title">⭐ Valoración promedio</p>
                  <Stars value={parseFloat(valoracion.valoracion_promedio)} />
                  <p className="rp-val-sub">basada en {valoracion.total_entregas} entrega{valoracion.total_entregas !== 1 ? 's' : ''}</p>
                </div>
              )}

              {/* Tabla de entregas */}
              {entregas.length === 0 ? (
                <div className="rp-empty"><span>📭</span><p>No hay entregas registradas aún.</p></div>
              ) : (
                <div className="rp-table-wrap">
                  <table className="rp-table" aria-label="Historial de entregas">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Comercio</th>
                        <th>Cliente</th>
                        <th className="rp-th-c">Estado</th>
                        <th className="rp-th-c">Val.</th>
                        <th className="rp-th-r">Total USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregas.map(e => {
                        const badge = ESTADO_BADGE[e.estado] ?? { label: e.estado, color: '#64748b' };
                        return (
                          <tr key={e.id}>
                            <td className="rp-td-date">
                              {new Date(e.created_at).toLocaleDateString('es-VE', { day:'2-digit', month:'short' })}
                            </td>
                            <td className="rp-td-comercio">{e.comercios_datos?.nombre_comercial ?? '—'}</td>
                            <td className="rp-td-cliente">{e.profiles?.nombre_completo ?? '—'}</td>
                            <td className="rp-td-c">
                              <span className="rp-badge" style={{ '--bc': badge.color }}>{badge.label}</span>
                            </td>
                            <td className="rp-td-c">
                              {e.valoracion != null
                                ? <span className="rp-star-inline">{'★'.repeat(e.valoracion)}<span className="rp-star-empty">{'★'.repeat(5 - e.valoracion)}</span></span>
                                : <span className="rp-no-val">—</span>}
                            </td>
                            <td className="rp-td-r rp-price">${e.total_usd?.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <button className="rp-btn-refresh" onClick={fetchHistorial}>↻ Actualizar historial</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
