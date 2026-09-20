import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import './ComercioPanel.css';

const CATEGORIAS = [
  'restaurante','farmacia','supermercado','tecnologia',
  'ropa','ferreteria','panaderia','licoreria','otro',
];

const RIF_REGEX = /^(J|V|G|E)-[0-9]{8}-[0-9]$/;

// ─── Sub-componente: Modal de Producto ────────────────────────────────────────
function ProductoModal({ producto, comercioId, onClose, onSaved }) {
  const isEdit = Boolean(producto?.id);
  const [form, setForm]     = useState({
    nombre:      producto?.nombre      ?? '',
    descripcion: producto?.descripcion ?? '',
    precio_usd:  producto?.precio_usd  ?? '',
    stock:       producto?.stock       ?? 0,
    activo:      producto?.activo      ?? true,
  });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(producto?.imagen_url ?? null);

  const handleChange = ({ target: { name, value, type, checked } }) => {
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleImg = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { setErrors(prev => ({ ...prev, img: 'Máx 3 MB.' })); return; }
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };

  const validate = () => {
    const e = {};
    if (!form.nombre.trim() || form.nombre.length < 2) e.nombre = 'Nombre requerido (mín 2 chars).';
    if (!form.precio_usd || isNaN(parseFloat(form.precio_usd)) || parseFloat(form.precio_usd) < 0)
      e.precio_usd = 'Precio USD inválido.';
    if (isNaN(parseInt(form.stock)) || parseInt(form.stock) < 0)
      e.stock = 'Stock inválido.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ve = validate();
    if (Object.keys(ve).length) { setErrors(ve); return; }
    setLoading(true);

    try {
      let imagen_url = producto?.imagen_url ?? null;

      if (imgFile) {
        const ext  = imgFile.name.split('.').pop();
        const path = `productos/${comercioId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('productos').upload(path, imgFile, { upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from('productos').getPublicUrl(path);
        imagen_url = data.publicUrl;
      }

      const payload = {
        comercio_id: comercioId,
        nombre:      form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        precio_usd:  parseFloat(form.precio_usd),
        stock:       parseInt(form.stock),
        activo:      form.activo,
        imagen_url,
      };

      const { error } = isEdit
        ? await supabase.from('productos').update(payload).eq('id', producto.id)
        : await supabase.from('productos').insert(payload);

      if (error) throw error;
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      setErrors(prev => ({ ...prev, global: err.message }));
    } finally {
      setLoading(false);
    }
  };

  // Trap focus inside modal
  return (
    <div className="cp-overlay" role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar producto' : 'Nuevo producto'}>
      <div className="cp-modal">
        <div className="cp-modal-header">
          <h3>{isEdit ? '✏️ Editar producto' : '➕ Nuevo producto'}</h3>
          <button className="cp-modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form className="cp-modal-form" onSubmit={handleSubmit} noValidate>
          {/* Imagen */}
          <div className="cp-field">
            <label>Imagen <span className="cp-opt">(opcional, máx 3 MB)</span></label>
            <label htmlFor="cp-img" className="cp-img-label">
              {imgPreview
                ? <img src={imgPreview} alt="preview" className="cp-img-preview" />
                : <><span>🖼</span><span>Subir imagen</span></>
              }
            </label>
            <input id="cp-img" type="file" accept="image/*" onChange={handleImg} className="cp-hidden" />
            {errors.img && <span className="cp-error">{errors.img}</span>}
          </div>

          {/* Nombre */}
          <div className={`cp-field ${errors.nombre ? 'cp-field--err' : ''}`}>
            <label htmlFor="cp-nombre">Nombre del producto</label>
            <input id="cp-nombre" name="nombre" type="text" placeholder="Ej: Hamburguesa Clásica"
              value={form.nombre} onChange={handleChange} />
            {errors.nombre && <span className="cp-error">{errors.nombre}</span>}
          </div>

          {/* Descripción */}
          <div className="cp-field">
            <label htmlFor="cp-desc">Descripción <span className="cp-opt">(opcional)</span></label>
            <textarea id="cp-desc" name="descripcion" rows={2} placeholder="Ingredientes, presentación…"
              value={form.descripcion} onChange={handleChange} />
          </div>

          {/* Precio y Stock */}
          <div className="cp-row2">
            <div className={`cp-field ${errors.precio_usd ? 'cp-field--err' : ''}`}>
              <label htmlFor="cp-precio">Precio (USD)</label>
              <div className="cp-prefix">
                <span>$</span>
                <input id="cp-precio" name="precio_usd" type="number" min="0" step="0.01"
                  placeholder="0.00" value={form.precio_usd} onChange={handleChange} />
              </div>
              {errors.precio_usd && <span className="cp-error">{errors.precio_usd}</span>}
            </div>

            <div className={`cp-field ${errors.stock ? 'cp-field--err' : ''}`}>
              <label htmlFor="cp-stock">Stock</label>
              <input id="cp-stock" name="stock" type="number" min="0"
                placeholder="0" value={form.stock} onChange={handleChange} />
              {errors.stock && <span className="cp-error">{errors.stock}</span>}
            </div>
          </div>

          {/* Activo toggle */}
          <label className="cp-toggle">
            <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange} />
            <span className="cp-toggle-track"><span className="cp-toggle-thumb" /></span>
            <span className="cp-toggle-label">{form.activo ? 'Producto activo' : 'Producto inactivo'}</span>
          </label>

          {errors.global && <div className="cp-alert-err">❌ {errors.global}</div>}

          <div className="cp-modal-actions">
            <button type="button" className="cp-btn-secondary" onClick={onClose}>Cancelar</button>
            <button id="cp-producto-save" type="submit" className="cp-btn-primary" disabled={loading}>
              {loading ? <span className="cp-spinner" /> : isEdit ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Componente principal: ComercioPanel ──────────────────────────────────────
export default function ComercioPanel({ session }) {
  // ── Perfil del comercio ─────────────────────────────────────────
  const [perfil, setPerfil]     = useState(null);
  const [perfilForm, setPerfilForm] = useState({ nombre_completo: '', telefono: '', nombre_comercial: '', rif: '', direccion: '', categoria: 'otro' });
  const [perfilErrors, setPerfilErrors] = useState({});
  const [perfilLoading, setPerfilLoading] = useState(false);
  const [perfilStatus, setPerfilStatus] = useState(null);

  // ── Productos ───────────────────────────────────────────────────
  const [productos, setProductos] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [modal, setModal]   = useState(null); // null | 'new' | producto object
  const [deletingId, setDeletingId] = useState(null);
  const [searchProd, setSearchProd] = useState('');

  // ── Ventas ──────────────────────────────────────────────────────
  const [ventas, setVentas] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [loadingVentas, setLoadingVentas] = useState(true);

  const [activeTab, setActiveTab] = useState('perfil'); // 'perfil' | 'productos' | 'ventas'

  // ── Cargar perfil ───────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    const load = async () => {
      const uid = session.user.id;
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('nombre_completo, telefono').eq('id', uid).single(),
        supabase.from('comercios_datos').select('*').eq('profile_id', uid).single(),
      ]);
      setPerfil(c);
      setPerfilForm({
        nombre_completo:  p?.nombre_completo  ?? '',
        telefono:         p?.telefono          ?? '',
        nombre_comercial: c?.nombre_comercial  ?? '',
        rif:              c?.rif               ?? '',
        direccion:        c?.direccion         ?? '',
        categoria:        c?.categoria         ?? 'otro',
      });
    };
    load();
  }, [session]);

  // ── Cargar productos ────────────────────────────────────────────
  const fetchProductos = useCallback(async () => {
    if (!perfil?.id) return;
    setLoadingProd(true);
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('comercio_id', perfil.id)
      .order('created_at', { ascending: false });
    setProductos(data ?? []);
    setLoadingProd(false);
  }, [perfil?.id]);

  useEffect(() => { if (perfil?.id) fetchProductos(); }, [fetchProductos, perfil]);

  // ── Cargar ventas ───────────────────────────────────────────────
  const fetchVentas = useCallback(async () => {
    if (!perfil?.id) return;
    setLoadingVentas(true);
    const [{ data: resumen }, { data: listaPedidos }] = await Promise.all([
      supabase.from('comercio_ventas_resumen').select('*').eq('comercio_id', perfil.id).single(),
      supabase.from('pedidos_entregas')
        .select('id, estado, total_usd, created_at, profiles!pedidos_entregas_cliente_id_fkey(nombre_completo), reportes_pago(metodo, estado, referencia)')
        .eq('comercio_id', perfil.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setVentas(resumen);
    setPedidos(listaPedidos ?? []);
    setLoadingVentas(false);
  }, [perfil?.id]);

  useEffect(() => { if (perfil?.id && activeTab === 'ventas') fetchVentas(); }, [fetchVentas, perfil, activeTab]);

  // ── Guardar perfil ──────────────────────────────────────────────
  const savePerfil = async (e) => {
    e.preventDefault();
    const ve = {};
    if (!perfilForm.nombre_comercial.trim()) ve.nombre_comercial = 'Nombre comercial requerido.';
    if (!RIF_REGEX.test(perfilForm.rif))      ve.rif = 'Formato: J-12345678-9';
    if (!perfilForm.direccion.trim())          ve.direccion = 'Dirección requerida.';
    if (Object.keys(ve).length) { setPerfilErrors(ve); return; }

    setPerfilLoading(true);
    setPerfilStatus(null);
    try {
      const uid = session.user.id;
      const { error: pErr } = await supabase.from('profiles')
        .update({ nombre_completo: perfilForm.nombre_completo, telefono: perfilForm.telefono })
        .eq('id', uid);
      if (pErr) throw pErr;

      const { error: cErr } = await supabase.from('comercios_datos').upsert(
        { profile_id: uid, nombre_comercial: perfilForm.nombre_comercial, rif: perfilForm.rif, direccion: perfilForm.direccion, categoria: perfilForm.categoria },
        { onConflict: 'profile_id' }
      );
      if (cErr) throw cErr;

      setPerfilStatus('ok');
      // Refrescar perfil id para activar productos y ventas
      const { data: c } = await supabase.from('comercios_datos').select('*').eq('profile_id', uid).single();
      setPerfil(c);
    } catch (err) {
      setPerfilStatus('err');
    } finally {
      setPerfilLoading(false);
    }
  };

  // ── Eliminar producto ───────────────────────────────────────────
  const deleteProducto = async (id) => {
    if (!confirm('¿Eliminar este producto?')) return;
    setDeletingId(id);
    await supabase.from('productos').delete().eq('id', id);
    setProductos(prev => prev.filter(p => p.id !== id));
    setDeletingId(null);
  };

  // ── Toggle activo producto ──────────────────────────────────────
  const toggleActivo = async (prod) => {
    const { error } = await supabase.from('productos').update({ activo: !prod.activo }).eq('id', prod.id);
    if (!error) setProductos(prev => prev.map(p => p.id === prod.id ? { ...p, activo: !p.activo } : p));
  };

  const filteredProductos = productos.filter(p =>
    p.nombre.toLowerCase().includes(searchProd.toLowerCase())
  );

  const ESTADO_BADGE = { pendiente:'#f59e0b', confirmado:'#6c63ff', en_preparacion:'#3b82f6', en_camino:'#8b5cf6', entregado:'#10b981', cancelado:'#f87171' };

  // ── JSX ─────────────────────────────────────────────────────────
  return (
    <div className="cp-wrapper">
      {/* Tabs */}
      <div className="cp-tabs" role="tablist">
        {[['perfil','🏪 Mi Comercio'],['productos','📦 Productos'],['ventas','💰 Ventas']].map(([id, label]) => (
          <button key={id} id={`cptab-${id}`} role="tab" aria-selected={activeTab === id}
            className={`cp-tab ${activeTab === id ? 'cp-tab--active' : ''}`}
            onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {/* ═══ TAB: PERFIL ═══ */}
      {activeTab === 'perfil' && (
        <div className="cp-section">
          <div className="cp-section-header">
            <span className="cp-section-icon">🏪</span>
            <div><h2 className="cp-section-title">Perfil del Comercio</h2><p className="cp-section-sub">Información pública de tu negocio</p></div>
          </div>

          <form className="cp-form" onSubmit={savePerfil} noValidate>
            <div className="cp-row2">
              <div className="cp-field">
                <label htmlFor="cppf-nombre">Nombre del responsable</label>
                <input id="cppf-nombre" name="nombre_completo" type="text" value={perfilForm.nombre_completo}
                  onChange={e => setPerfilForm(p => ({ ...p, nombre_completo: e.target.value }))} placeholder="Tu nombre" />
              </div>
              <div className="cp-field">
                <label htmlFor="cppf-tel">Teléfono</label>
                <input id="cppf-tel" name="telefono" type="tel" value={perfilForm.telefono}
                  onChange={e => setPerfilForm(p => ({ ...p, telefono: e.target.value }))} placeholder="04121234567" maxLength={11} />
              </div>
            </div>

            <div className={`cp-field ${perfilErrors.nombre_comercial ? 'cp-field--err' : ''}`}>
              <label htmlFor="cppf-comercio">Nombre comercial</label>
              <input id="cppf-comercio" name="nombre_comercial" type="text" value={perfilForm.nombre_comercial}
                onChange={e => setPerfilForm(p => ({ ...p, nombre_comercial: e.target.value }))} placeholder="Ej: Pizzería Los Alpes" />
              {perfilErrors.nombre_comercial && <span className="cp-error">{perfilErrors.nombre_comercial}</span>}
            </div>

            <div className="cp-row2">
              <div className={`cp-field ${perfilErrors.rif ? 'cp-field--err' : ''}`}>
                <label htmlFor="cppf-rif">RIF</label>
                <input id="cppf-rif" name="rif" type="text" value={perfilForm.rif}
                  onChange={e => setPerfilForm(p => ({ ...p, rif: e.target.value }))} placeholder="J-12345678-9" />
                {perfilErrors.rif
                  ? <span className="cp-error">{perfilErrors.rif}</span>
                  : <span className="cp-helper">Formato: J/V/G/E-XXXXXXXX-D</span>}
              </div>
              <div className="cp-field">
                <label htmlFor="cppf-cat">Categoría</label>
                <select id="cppf-cat" value={perfilForm.categoria}
                  onChange={e => setPerfilForm(p => ({ ...p, categoria: e.target.value }))}>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className={`cp-field ${perfilErrors.direccion ? 'cp-field--err' : ''}`}>
              <label htmlFor="cppf-dir">Dirección del local</label>
              <textarea id="cppf-dir" rows={2} value={perfilForm.direccion}
                onChange={e => setPerfilForm(p => ({ ...p, direccion: e.target.value }))} placeholder="Av. / Calle, Local, Ciudad" />
              {perfilErrors.direccion && <span className="cp-error">{perfilErrors.direccion}</span>}
            </div>

            {perfilStatus === 'ok'  && <div className="cp-alert-ok">✅ Perfil guardado.</div>}
            {perfilStatus === 'err' && <div className="cp-alert-err">❌ Error al guardar.</div>}

            <button id="cp-perfil-save" type="submit" className="cp-btn-primary" disabled={perfilLoading}>
              {perfilLoading ? <span className="cp-spinner" /> : '💾 Guardar perfil'}
            </button>
          </form>
        </div>
      )}

      {/* ═══ TAB: PRODUCTOS ═══ */}
      {activeTab === 'productos' && (
        <div className="cp-section">
          <div className="cp-section-header">
            <span className="cp-section-icon">📦</span>
            <div><h2 className="cp-section-title">Catálogo de productos</h2>
              <p className="cp-section-sub">{productos.length} producto{productos.length !== 1 ? 's' : ''}</p></div>
            <button id="cp-nuevo-producto" className="cp-btn-primary cp-btn-sm" onClick={() => setModal('new')}>
              + Nuevo
            </button>
          </div>

          {!perfil?.id && (
            <div className="cp-info-box">⚠️ Guarda primero el perfil del comercio para gestionar productos.</div>
          )}

          {perfil?.id && (
            <>
              <input className="cp-search" type="search" placeholder="🔍 Buscar producto…"
                value={searchProd} onChange={e => setSearchProd(e.target.value)} />

              {loadingProd ? (
                <div className="cp-center"><span className="cp-loader" /></div>
              ) : filteredProductos.length === 0 ? (
                <div className="cp-empty"><span>📭</span><p>No hay productos. ¡Agrega uno!</p></div>
              ) : (
                <div className="cp-prod-table-wrap">
                  <table className="cp-prod-table" aria-label="Catálogo de productos">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="cp-th-r">Precio USD</th>
                        <th className="cp-th-r">Stock</th>
                        <th className="cp-th-c">Estado</th>
                        <th className="cp-th-c">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProductos.map(prod => (
                        <tr key={prod.id} className={!prod.activo ? 'cp-row-inactive' : ''}>
                          <td className="cp-td-prod">
                            {prod.imagen_url && <img src={prod.imagen_url} alt={prod.nombre} className="cp-prod-thumb" />}
                            <div>
                              <p className="cp-prod-name">{prod.nombre}</p>
                              {prod.descripcion && <p className="cp-prod-desc">{prod.descripcion}</p>}
                            </div>
                          </td>
                          <td className="cp-td-r cp-price">${prod.precio_usd?.toFixed(2)}</td>
                          <td className="cp-td-r">
                            <span className={`cp-stock ${prod.stock === 0 ? 'cp-stock--empty' : prod.stock <= 5 ? 'cp-stock--low' : ''}`}>
                              {prod.stock}
                            </span>
                          </td>
                          <td className="cp-td-c">
                            <button className={`cp-status-pill ${prod.activo ? 'cp-status-pill--on' : 'cp-status-pill--off'}`}
                              onClick={() => toggleActivo(prod)} aria-label={`${prod.activo ? 'Desactivar' : 'Activar'} ${prod.nombre}`}>
                              {prod.activo ? 'Activo' : 'Inactivo'}
                            </button>
                          </td>
                          <td className="cp-td-c cp-actions">
                            <button id={`cp-edit-${prod.id}`} className="cp-btn-icon cp-btn-icon--edit"
                              onClick={() => setModal(prod)} aria-label={`Editar ${prod.nombre}`}>✏️</button>
                            <button id={`cp-del-${prod.id}`} className="cp-btn-icon cp-btn-icon--del"
                              onClick={() => deleteProducto(prod.id)} disabled={deletingId === prod.id}
                              aria-label={`Eliminar ${prod.nombre}`}>
                              {deletingId === prod.id ? <span className="cp-spinner-sm" /> : '🗑'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: VENTAS ═══ */}
      {activeTab === 'ventas' && (
        <div className="cp-section">
          <div className="cp-section-header">
            <span className="cp-section-icon">💰</span>
            <div><h2 className="cp-section-title">Ventas e Ingresos</h2>
              <p className="cp-section-sub">Resumen de actividad del comercio</p></div>
            <button className="cp-btn-icon" onClick={fetchVentas} aria-label="Refrescar">↻</button>
          </div>

          {loadingVentas ? (
            <div className="cp-center"><span className="cp-loader" /></div>
          ) : (
            <>
              {/* KPIs */}
              {ventas && (
                <div className="cp-kpis">
                  {[
                    { label: 'Ingresos USD', value: `$${(ventas.ingresos_usd ?? 0).toFixed(2)}`, color: '#10b981', icon: '💵' },
                    { label: 'Completados',   value: ventas.pedidos_completados ?? 0,             color: '#6c63ff', icon: '✅' },
                    { label: 'Total pedidos', value: ventas.total_pedidos ?? 0,                   color: '#3b82f6', icon: '📦' },
                    { label: 'Cancelados',    value: ventas.pedidos_cancelados ?? 0,              color: '#f87171', icon: '❌' },
                  ].map(k => (
                    <div key={k.label} className="cp-kpi" style={{ '--kpi-color': k.color }}>
                      <span className="cp-kpi-icon">{k.icon}</span>
                      <p className="cp-kpi-value">{k.value}</p>
                      <p className="cp-kpi-label">{k.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Tabla de pedidos */}
              {pedidos.length === 0 ? (
                <div className="cp-empty"><span>🛒</span><p>Aún no hay pedidos registrados.</p></div>
              ) : (
                <div className="cp-prod-table-wrap">
                  <table className="cp-prod-table" aria-label="Historial de ventas">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Pago</th>
                        <th className="cp-th-c">Estado</th>
                        <th className="cp-th-r">Total USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidos.map(p => (
                        <tr key={p.id}>
                          <td className="cp-td-date">{new Date(p.created_at).toLocaleDateString('es-VE', { day:'2-digit', month:'short', year:'numeric' })}</td>
                          <td>{p.profiles?.nombre_completo ?? '—'}</td>
                          <td className="cp-td-pago">
                            {p.reportes_pago?.[0]
                              ? <><span>{p.reportes_pago[0].metodo?.replace('_',' ')}</span>
                                  <span className={`cp-pago-dot cp-pago-dot--${p.reportes_pago[0].estado}`} /></>
                              : <span className="cp-muted">Sin reporte</span>}
                          </td>
                          <td className="cp-td-c">
                            <span className="cp-badge" style={{ '--badge-color': ESTADO_BADGE[p.estado] ?? '#64748b' }}>
                              {p.estado?.replace('_',' ')}
                            </span>
                          </td>
                          <td className="cp-td-r cp-price">${p.total_usd?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal de producto */}
      {modal && (
        <ProductoModal
          producto={modal === 'new' ? null : modal}
          comercioId={perfil?.id}
          onClose={() => setModal(null)}
          onSaved={fetchProductos}
        />
      )}
    </div>
  );
}
