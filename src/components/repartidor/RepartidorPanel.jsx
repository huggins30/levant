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

export default function RepartidorPanel({ session }) {
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

  const [activeTab, setActiveTab] = useState('perfil'); // 'perfil' | 'historial'

  // ── Cargar datos ─────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    const load = async () => {
      const uid = session.user.id;
      const { data: rd } = await supabase
        .from('repartidores_datos')
        .select('*')
        .eq('profile_id', uid)
        .single();

      if (rd) {
        setRepData(rd);
        setDisponible(rd.disponible);
        setForm({ cedula: rd.cedula, vehiculo: rd.vehiculo, placa: rd.placa ?? '' });
      }
    };
    load();
  }, [session]);

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
        .single(),
    ]);

    setEntregas(list ?? []);
    setValoracion(val);
    setLoadingHist(false);
  }, [repData?.id]);

  useEffect(() => {
    if (repData?.id && activeTab === 'historial') fetchHistorial();
  }, [fetchHistorial, repData, activeTab]);

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
        {[['perfil','👤 Mi perfil'],['historial','📋 Historial']].map(([id, label]) => (
          <button key={id} id={`rptab-${id}`} role="tab" aria-selected={activeTab === id}
            className={`rp-tab ${activeTab === id ? 'rp-tab--active' : ''}`}
            onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

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
