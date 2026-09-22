import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import './ComercioPanel.css';

const CATEGORIAS = [
  'restaurante','farmacia','supermercado','tecnologia',
  'ropa','ferreteria','panaderia','licoreria','otro',
];

const CATEGORIAS_PRODUCTO = [
  { id: 'comida', label: '🍔 Comida' },
  { id: 'bebidas', label: '🥤 Bebidas' },
  { id: 'postres', label: '🍰 Postres' },
  { id: 'viveres', label: '🛒 Víveres / Supermercado' },
  { id: 'tecnologia', label: '📱 Tecnología' },
  { id: 'ropa', label: '👕 Ropa & Moda' },
  { id: 'salud_belleza', label: '💊 Salud & Belleza' },
  { id: 'ferreteria', label: '🛠 Ferretería' },
  { id: 'hogar', label: '🏠 Hogar' },
  { id: 'otro', label: '📦 Otro' },
];

const RIF_REGEX = /^(J|V|G|E)-[0-9]{8}-[0-9]$/;

// ─── Sub-componente: Modal de Producto ────────────────────────────────────────
function ProductoModal({ producto, comercioId, onClose, onSaved }) {
  const isEdit = Boolean(producto?.id);
  const [form, setForm]     = useState({
    nombre:      producto?.nombre      ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria:   producto?.categoria   ?? 'comida',
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
    if (!comercioId) {
      setErrors({ global: 'No se encontró el ID del comercio. Por favor guarda primero el perfil en "Mi Comercio".' });
      return;
    }
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
        categoria:   form.categoria,
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

          {/* Categoría */}
          <div className="cp-field">
            <label htmlFor="cp-categoria">Categoría del producto</label>
            <select id="cp-categoria" name="categoria" value={form.categoria} onChange={handleChange}>
              {CATEGORIAS_PRODUCTO.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
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

  // ── Gestión de Pedidos ──────────────────────────────────────────
  const [gPedidos, setGPedidos]           = useState([]);
  const [loadingGPedidos, setLoadingGPedidos] = useState(true);
  const [filtroEstado, setFiltroEstado]   = useState('todos');
  const [pedidoDetalle, setPedidoDetalle] = useState(null);
  const [updatingEstado, setUpdatingEstado] = useState(null);
  const [repartidoresActivos, setRepartidoresActivos] = useState([]);
  const [loadingRepartidores, setLoadingRepartidores] = useState(false);
  const [assigningRepartidor, setAssigningRepartidor] = useState(null);

  const [activeTab, setActiveTab] = useState('perfil'); // 'perfil' | 'productos' | 'pedidos' | 'ventas'

  // ── Cargar perfil ───────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    const load = async () => {
      const uid = session.user.id;
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('nombre_completo, telefono').eq('id', uid).single(),
        supabase.from('comercios_datos').select('*').eq('profile_id', uid).maybeSingle(),
      ]);

      let comerData = c;

      // Si no existe registro en comercios_datos aún para este usuario, lo creamos automáticamente
      if (!comerData) {
        const defaultName = p?.nombre_completo ? `Comercio de ${p.nombre_completo}` : 'Mi Comercio';
        const { data: newCom } = await supabase
          .from('comercios_datos')
          .insert({
            profile_id: uid,
            nombre_comercial: defaultName,
            direccion: 'Dirección por definir',
            categoria: 'otro',
            rif: 'J-00000000-0',
          })
          .select('*')
          .maybeSingle();

        if (newCom) {
          comerData = newCom;
        }
      }

      setPerfil(comerData);
      setPerfilForm({
        nombre_completo:  p?.nombre_completo  ?? '',
        telefono:         p?.telefono          ?? '',
        nombre_comercial: comerData?.nombre_comercial  ?? '',
        rif:              comerData?.rif               ?? '',
        direccion:        comerData?.direccion         ?? '',
        categoria:        comerData?.categoria         ?? 'otro',
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

  // ── Cargar pedidos para gestión ─────────────────────────────────
  const fetchGPedidos = useCallback(async () => {
    if (!perfil?.id) return;
    setLoadingGPedidos(true);
    const { data, error } = await supabase
      .from('pedidos_entregas')
      .select(`
        id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
        profiles!pedidos_entregas_cliente_id_fkey(nombre_completo, telefono),
        repartidores_datos (
          id, vehiculo, placa, disponible,
          profiles ( id, nombre_completo, telefono )
        ),
        pedido_items (
          id, cantidad, precio_usd, subtotal_usd,
          productos ( nombre, imagen_url )
        )
      `)
      .eq('comercio_id', perfil.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('Error cargando pedidos:', error);
    setGPedidos(data ?? []);
    setLoadingGPedidos(false);
  }, [perfil?.id]);

  // ── Cargar repartidores activos ─────────────────────────────────
  const fetchRepartidoresActivos = useCallback(async () => {
    setLoadingRepartidores(true);
    try {
      const { data, error } = await supabase
        .from('repartidores_datos')
        .select(`
          id, vehiculo, placa, disponible,
          profiles ( id, nombre_completo, telefono )
        `);

      if (error) {
        console.error('Error cargando repartidores:', error);
      } else {
        setRepartidoresActivos(data ?? []);
      }
    } catch (err) {
      console.error('Error inesperado al cargar repartidores:', err);
    } finally {
      setLoadingRepartidores(false);
    }
  }, []);

  useEffect(() => {
    if (perfil?.id && activeTab === 'pedidos') {
      fetchGPedidos();
      fetchRepartidoresActivos();
    }
  }, [fetchGPedidos, fetchRepartidoresActivos, perfil, activeTab]);

  // ── Asignar repartidor a pedido ─────────────────────────────────
  const assignRepartidor = async (pedidoId, repartidorId) => {
    setAssigningRepartidor(pedidoId);
    try {
      const repIdVal = (repartidorId && repartidorId.trim() !== '') ? repartidorId : null;

      const { error } = await supabase
        .from('pedidos_entregas')
        .update({ 
          repartidor_id: repIdVal, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', pedidoId)
        .eq('comercio_id', perfil.id);

      if (error) {
        console.error('Error asignando repartidor:', error);
        alert('Error al asignar repartidor: ' + error.message);
        return;
      }

      const repObj = repIdVal ? repartidoresActivos.find(r => r.id === repIdVal) : null;
      const formattedRep = repObj ? {
        id: repObj.id,
        vehiculo: repObj.vehiculo,
        placa: repObj.placa,
        disponible: repObj.disponible,
        profiles: repObj.profiles
      } : null;

      setGPedidos(prev => prev.map(p => {
        if (p.id !== pedidoId) return p;
        return {
          ...p,
          repartidor_id: repIdVal,
          repartidores_datos: repIdVal ? (formattedRep || p.repartidores_datos) : null
        };
      }));

      if (pedidoDetalle?.id === pedidoId) {
        setPedidoDetalle(prev => ({
          ...prev,
          repartidor_id: repIdVal,
          repartidores_datos: repIdVal ? (formattedRep || prev?.repartidores_datos) : null
        }));
      }
    } catch (err) {
      console.error('Error inesperado al asignar repartidor:', err);
      alert('Error inesperado al asignar repartidor.');
    } finally {
      setAssigningRepartidor(null);
    }
  };

  // ── Cambiar estado de pedido ────────────────────────────────────
  const updateEstadoPedido = async (pedidoId, nuevoEstado) => {
    setUpdatingEstado(pedidoId);
    const { error } = await supabase
      .from('pedidos_entregas')
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', pedidoId)
      .eq('comercio_id', perfil.id);
    if (error) {
      console.error('Error actualizando estado:', error);
      alert('Error al actualizar el estado: ' + error.message);
    } else {
      setGPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: nuevoEstado } : p));
      if (pedidoDetalle?.id === pedidoId) setPedidoDetalle(prev => ({ ...prev, estado: nuevoEstado }));
    }
    setUpdatingEstado(null);
  };

  // ── Guardar perfil ──────────────────────────────────────────────
  const TELEFONO_REGEX = /^(0412|0414|0424|0416|0426)\d{7}$/;

  const savePerfil = async (e) => {
    e.preventDefault();
    const ve = {};
    if (!perfilForm.nombre_comercial.trim()) ve.nombre_comercial = 'Nombre comercial requerido.';
    if (!RIF_REGEX.test(perfilForm.rif))      ve.rif = 'Formato: J-12345678-9';
    if (!perfilForm.direccion.trim())          ve.direccion = 'Dirección requerida.';
    if (perfilForm.telefono.trim() && !TELEFONO_REGEX.test(perfilForm.telefono.trim())) {
      ve.telefono = 'Formato inválido. Ej: 04121234567 (0412/0414/0424/0416/0426)';
    }
    if (Object.keys(ve).length) { setPerfilErrors(ve); return; }

    setPerfilLoading(true);
    setPerfilStatus(null);
    try {
      const uid = session.user.id;
      const tel = perfilForm.telefono.trim() ? perfilForm.telefono.trim() : null;

      const { error: pErr } = await supabase.from('profiles')
        .update({ nombre_completo: perfilForm.nombre_completo.trim(), telefono: tel })
        .eq('id', uid);
      if (pErr) throw pErr;

      const payload = {
        profile_id:       uid,
        nombre_comercial: perfilForm.nombre_comercial.trim(),
        rif:              perfilForm.rif.trim(),
        direccion:        perfilForm.direccion.trim(),
        categoria:        perfilForm.categoria,
      };

      if (perfil?.id) {
        payload.id = perfil.id;
      }

      const { error: cErr } = await supabase.from('comercios_datos').upsert(
        payload,
        { onConflict: 'profile_id' }
      );
      if (cErr) throw cErr;

      setPerfilStatus('ok');
      // Refrescar perfil id para activar productos y ventas
      const { data: c } = await supabase.from('comercios_datos').select('*').eq('profile_id', uid).single();
      setPerfil(c);
    } catch (err) {
      console.error('Error guardando perfil:', err);
      setPerfilStatus(err.message || 'Error al guardar.');
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

  const listaRepartidores = [...repartidoresActivos].sort((a, b) => {
    if (a.disponible === b.disponible) {
      const nameA = a.profiles?.nombre_completo || '';
      const nameB = b.profiles?.nombre_completo || '';
      return nameA.localeCompare(nameB);
    }
    return a.disponible ? -1 : 1;
  });

  // ── JSX ─────────────────────────────────────────────────────────
  return (
    <div className="cp-wrapper">
      {/* Tabs */}
      <div className="cp-tabs" role="tablist">
        {[['perfil','🏪 Mi Comercio'],['productos','📦 Productos'],['pedidos','📋 Pedidos'],['ventas','💰 Ventas']].map(([id, label]) => (
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
              <div className={`cp-field ${perfilErrors.telefono ? 'cp-field--err' : ''}`}>
                <label htmlFor="cppf-tel">Teléfono</label>
                <input id="cppf-tel" name="telefono" type="tel" value={perfilForm.telefono}
                  onChange={e => {
                    setPerfilForm(p => ({ ...p, telefono: e.target.value }));
                    if (perfilErrors.telefono) setPerfilErrors(p => ({ ...p, telefono: '' }));
                  }} placeholder="04121234567" maxLength={11} />
                {perfilErrors.telefono && <span className="cp-error">{perfilErrors.telefono}</span>}
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

            {perfilStatus === 'ok' && <div className="cp-alert-ok">✅ Perfil guardado.</div>}
            {perfilStatus && perfilStatus !== 'ok' && <div className="cp-alert-err">❌ {perfilStatus}</div>}

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

      {/* ═══ TAB: PEDIDOS (GESTIÓN) ═══ */}
      {activeTab === 'pedidos' && (
        <div className="cp-section">
          <div className="cp-section-header">
            <span className="cp-section-icon">📋</span>
            <div><h2 className="cp-section-title">Gestión de Pedidos</h2>
              <p className="cp-section-sub">Administra los pedidos de tus clientes</p></div>
            <button className="cp-btn-icon" onClick={fetchGPedidos} aria-label="Refrescar">↻</button>
          </div>

          {/* Filtros de estado */}
          <div className="cp-pedidos-filtros">
            {[
              { id: 'todos',          label: '📋 Todos' },
              { id: 'pendiente',      label: '🕐 Pendientes' },
              { id: 'confirmado',     label: '✅ Confirmados' },
              { id: 'en_preparacion', label: '👨‍🍳 En preparación' },
              { id: 'en_camino',      label: '🚚 En camino' },
              { id: 'entregado',      label: '📦 Entregados' },
              { id: 'cancelado',      label: '❌ Cancelados' },
            ].map(f => (
              <button key={f.id}
                className={`cp-filtro-btn ${filtroEstado === f.id ? 'cp-filtro-btn--active' : ''}`}
                onClick={() => setFiltroEstado(f.id)}>
                {f.label}
                {f.id !== 'todos' && (
                  <span className="cp-filtro-count">
                    {gPedidos.filter(p => p.estado === f.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loadingGPedidos ? (
            <div className="cp-center"><span className="cp-loader" /></div>
          ) : (() => {
            const pedidosFiltrados = filtroEstado === 'todos'
              ? gPedidos
              : gPedidos.filter(p => p.estado === filtroEstado);

            return pedidosFiltrados.length === 0 ? (
              <div className="cp-empty"><span>📭</span><p>No hay pedidos {filtroEstado !== 'todos' ? `con estado "${filtroEstado.replace('_',' ')}"` : 'registrados'}.</p></div>
            ) : (
              <div className="cp-pedidos-grid">
                {pedidosFiltrados.map(ped => (
                  <div key={ped.id} className="cp-pedido-card" onClick={() => setPedidoDetalle(ped)}>
                    <div className="cp-pedido-card-top">
                      <div className="cp-pedido-card-id">#{ped.id.slice(0,8)}</div>
                      <span className="cp-badge" style={{ '--badge-color': ESTADO_BADGE[ped.estado] ?? '#64748b' }}>
                        {ped.estado?.replace('_',' ')}
                      </span>
                    </div>

                    <div className="cp-pedido-card-content">
                      <div className="cp-pedido-card-body">
                        <div className="cp-pedido-card-row">
                          <span>👤</span>
                          <span>{ped.profiles?.nombre_completo ?? 'Cliente'}</span>
                        </div>
                        <div className="cp-pedido-card-row">
                          <span>📍</span>
                          <span className="cp-pedido-card-dir">{ped.direccion_entrega}</span>
                        </div>
                        <div className="cp-pedido-card-row">
                          <span>📦</span>
                          <span>{ped.pedido_items?.length ?? 0} producto{(ped.pedido_items?.length ?? 0) !== 1 ? 's' : ''}</span>
                        </div>
                      </div>

                      {/* Repartidor Slot: Exactamente en el espacio indicado en la imagen */}
                      <div className="cp-card-rep-box" onClick={e => e.stopPropagation()}>
                        <div className="cp-card-rep-label">
                          <span>🛵 Repartidor</span>
                          {ped.repartidores_datos && (
                            <span className="cp-rep-dot-active" title="Asignado">●</span>
                          )}
                        </div>
                        <select
                          className={`cp-rep-select ${ped.repartidor_id ? 'cp-rep-select--assigned' : ''}`}
                          value={ped.repartidor_id || ''}
                          disabled={ped.estado === 'entregado' || ped.estado === 'cancelado' || assigningRepartidor === ped.id}
                          onChange={(e) => assignRepartidor(ped.id, e.target.value)}
                        >
                          <option value="">
                            {loadingRepartidores ? 'Cargando...' : 'Seleccionar repartidor'}
                          </option>
                          {listaRepartidores.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.disponible ? '🟢' : '⚪'} {r.profiles?.nombre_completo || 'Repartidor'} ({r.vehiculo || 'Moto'})
                            </option>
                          ))}
                          {ped.repartidores_datos && !listaRepartidores.some(r => r.id === ped.repartidor_id) && (
                            <option value={ped.repartidor_id}>
                              🛵 {ped.repartidores_datos.profiles?.nombre_completo || 'Asignado'}
                            </option>
                          )}
                        </select>
                        {assigningRepartidor === ped.id && (
                          <div className="cp-card-rep-status">Guardando...</div>
                        )}
                        {ped.repartidores_datos?.profiles?.nombre_completo && !assigningRepartidor && (
                          <div className="cp-card-rep-name" title={ped.repartidores_datos.profiles.nombre_completo}>
                            ✓ {ped.repartidores_datos.profiles.nombre_completo}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="cp-pedido-card-footer">
                      <span className="cp-pedido-card-date">
                        {new Date(ped.created_at).toLocaleDateString('es-VE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </span>
                      <span className="cp-pedido-card-total">${ped.total_usd?.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Modal detalle de pedido ── */}
      {pedidoDetalle && (
        <div className="cp-overlay" onClick={() => setPedidoDetalle(null)}>
          <div className="cp-modal cp-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3>📋 Pedido #{pedidoDetalle.id.slice(0,8)}</h3>
              <button className="cp-modal-close" onClick={() => setPedidoDetalle(null)}>✕</button>
            </div>
            <div className="cp-modal-form">
              {/* Info del cliente */}
              <div className="cp-pedido-info-grid">
                <div className="cp-pedido-info-item">
                  <span className="cp-pedido-info-label">👤 Cliente</span>
                  <span className="cp-pedido-info-value">{pedidoDetalle.profiles?.nombre_completo ?? '—'}</span>
                </div>
                <div className="cp-pedido-info-item">
                  <span className="cp-pedido-info-label">📞 Teléfono</span>
                  <span className="cp-pedido-info-value">{pedidoDetalle.profiles?.telefono ?? 'No disponible'}</span>
                </div>
                <div className="cp-pedido-info-item">
                  <span className="cp-pedido-info-label">📍 Dirección</span>
                  <span className="cp-pedido-info-value">{pedidoDetalle.direccion_entrega}</span>
                </div>
                <div className="cp-pedido-info-item">
                  <span className="cp-pedido-info-label">📅 Fecha</span>
                  <span className="cp-pedido-info-value">
                    {new Date(pedidoDetalle.created_at).toLocaleDateString('es-VE', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
              </div>

              {/* Sección Repartidor en el Modal */}
              <div className="cp-modal-rep-section">
                <div className="cp-modal-rep-header">
                  <span className="cp-modal-rep-label">🛵 Repartidor asignado:</span>
                  {pedidoDetalle.repartidores_datos?.profiles?.telefono && (
                    <a
                      href={`tel:${pedidoDetalle.repartidores_datos.profiles.telefono}`}
                      className="cp-modal-rep-phone"
                      target="_blank"
                      rel="noreferrer"
                    >
                      📞 {pedidoDetalle.repartidores_datos.profiles.telefono}
                    </a>
                  )}
                </div>
                <div className="cp-modal-rep-row">
                  <select
                    className="cp-rep-select cp-rep-select--modal"
                    value={pedidoDetalle.repartidor_id || ''}
                    disabled={pedidoDetalle.estado === 'entregado' || pedidoDetalle.estado === 'cancelado' || assigningRepartidor === pedidoDetalle.id}
                    onChange={(e) => assignRepartidor(pedidoDetalle.id, e.target.value)}
                  >
                    <option value="">-- Sin repartidor asignado (Seleccionar activo) --</option>
                    {listaRepartidores.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.disponible ? '🟢 Activo: ' : '⚪ Inactivo: '}
                        {r.profiles?.nombre_completo || 'Repartidor'} ({r.vehiculo || 'Moto'}{r.placa ? ` · ${r.placa}` : ''})
                      </option>
                    ))}
                    {pedidoDetalle.repartidores_datos && !listaRepartidores.some(r => r.id === pedidoDetalle.repartidor_id) && (
                      <option value={pedidoDetalle.repartidor_id}>
                        🛵 Asignado: {pedidoDetalle.repartidores_datos.profiles?.nombre_completo || 'Repartidor'}
                      </option>
                    )}
                  </select>
                  {pedidoDetalle.repartidor_id && pedidoDetalle.estado !== 'entregado' && pedidoDetalle.estado !== 'cancelado' && (
                    <button
                      type="button"
                      className="cp-rep-unassign-btn"
                      title="Desasignar repartidor"
                      disabled={assigningRepartidor === pedidoDetalle.id}
                      onClick={() => assignRepartidor(pedidoDetalle.id, '')}
                    >
                      ✕ Quitar
                    </button>
                  )}
                </div>
                {assigningRepartidor === pedidoDetalle.id && (
                  <span className="cp-rep-saving-modal">Guardando asignación...</span>
                )}
              </div>

              {/* Estado actual + acciones */}
              <div className="cp-pedido-estado-section">
                <span className="cp-pedido-estado-label">Estado actual:</span>
                <span className="cp-badge cp-badge--lg" style={{ '--badge-color': ESTADO_BADGE[pedidoDetalle.estado] ?? '#64748b' }}>
                  {pedidoDetalle.estado?.replace('_',' ')}
                </span>
              </div>

              {/* Botones de cambio de estado */}
              {pedidoDetalle.estado !== 'entregado' && pedidoDetalle.estado !== 'cancelado' && (
                <div className="cp-pedido-acciones">
                  <span className="cp-pedido-acciones-label">Cambiar estado:</span>
                  <div className="cp-pedido-acciones-btns">
                    {pedidoDetalle.estado === 'pendiente' && (
                      <>
                        <button className="cp-estado-btn cp-estado-btn--confirmar"
                          disabled={updatingEstado === pedidoDetalle.id}
                          onClick={() => updateEstadoPedido(pedidoDetalle.id, 'confirmado')}>
                          {updatingEstado === pedidoDetalle.id ? <span className="cp-spinner" /> : '✅ Confirmar'}
                        </button>
                        <button className="cp-estado-btn cp-estado-btn--cancelar"
                          disabled={updatingEstado === pedidoDetalle.id}
                          onClick={() => { if(confirm('¿Cancelar este pedido?')) updateEstadoPedido(pedidoDetalle.id, 'cancelado'); }}>
                          ❌ Cancelar
                        </button>
                      </>
                    )}
                    {pedidoDetalle.estado === 'confirmado' && (
                      <button className="cp-estado-btn cp-estado-btn--preparar"
                        disabled={updatingEstado === pedidoDetalle.id}
                        onClick={() => updateEstadoPedido(pedidoDetalle.id, 'en_preparacion')}>
                        {updatingEstado === pedidoDetalle.id ? <span className="cp-spinner" /> : '👨‍🍳 En preparación'}
                      </button>
                    )}
                    {pedidoDetalle.estado === 'en_preparacion' && (
                      <button className="cp-estado-btn cp-estado-btn--enviar"
                        disabled={updatingEstado === pedidoDetalle.id}
                        onClick={() => updateEstadoPedido(pedidoDetalle.id, 'en_camino')}>
                        {updatingEstado === pedidoDetalle.id ? <span className="cp-spinner" /> : '🚚 Enviar / En camino'}
                      </button>
                    )}
                    {pedidoDetalle.estado === 'en_camino' && (
                      <button className="cp-estado-btn cp-estado-btn--entregar"
                        disabled={updatingEstado === pedidoDetalle.id}
                        onClick={() => updateEstadoPedido(pedidoDetalle.id, 'entregado')}>
                        {updatingEstado === pedidoDetalle.id ? <span className="cp-spinner" /> : '📦 Marcar entregado'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Items del pedido */}
              <div className="cp-pedido-items-section">
                <h4 className="cp-pedido-items-title">🛒 Productos del pedido</h4>
                <div className="cp-pedido-items-list">
                  {(pedidoDetalle.pedido_items ?? []).map(item => (
                    <div key={item.id} className="cp-pedido-item">
                      {item.productos?.imagen_url
                        ? <img src={item.productos.imagen_url} alt={item.productos?.nombre} className="cp-pedido-item-img" />
                        : <div className="cp-pedido-item-placeholder">📦</div>
                      }
                      <div className="cp-pedido-item-info">
                        <p className="cp-pedido-item-name">{item.productos?.nombre ?? 'Producto'}</p>
                        <p className="cp-pedido-item-meta">Cant: {item.cantidad} × ${item.precio_usd?.toFixed(2)}</p>
                      </div>
                      <span className="cp-pedido-item-sub">${item.subtotal_usd?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="cp-pedido-total-final">
                  <span>Total del pedido</span>
                  <span className="cp-pedido-total-value">${pedidoDetalle.total_usd?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
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
