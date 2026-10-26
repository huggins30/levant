import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getSocket } from '../../lib/socket';
import { buscarMejorRepartidorDisponible } from '../../lib/asignacionPedidos';
import { 
  ComercioAlertToasts, 
  ComercioAlertCenter,
  getReadOrderIds,
  isOrderRead,
  markOrderAsRead,
  markAllOrdersAsRead,
  hasComercioBeenAlerted,
  markComercioAlerted
} from './ComercioAlertas';
import { playNewOrderSound, playOrderDeliveredSound, triggerDesktopNotification } from './comercioAlertSound';
import { notifyRepartidorAsignado } from '../repartidor/RepartidorAlertas';
import PedidosRealtimeBadge from '../common/PedidosRealtimeBadge';
import './ComercioPanel.css';
import '../dashboard/Dashboard.css';

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

// ─── Helpers de Peso y Clasificación de Vehículo ────────────────────────────
export function calcularPesoTotalPedido(ped) {
  if (!ped?.pedido_items || ped.pedido_items.length === 0) return 1.0;
  const total = ped.pedido_items.reduce((sum, item) => {
    const qty = Number(item.cantidad) || 1;
    const pesoUnit = Number(item.productos?.peso_kg) || 1.0;
    return sum + (qty * pesoUnit);
  }, 0);
  return Number(total.toFixed(2));
}

export function getTipoVehiculoRequerido(pesoKg) {
  if (pesoKg <= 20) {
    return {
      nombre: 'Motocicleta',
      maxKg: 20,
      icon: '🛵',
      color: '#10b981',
      badgeClass: 'cp-veh-moto',
    };
  }
  if (pesoKg <= 150) {
    return {
      nombre: 'Automóvil / Sedán',
      maxKg: 150,
      icon: '🚗',
      color: '#3b82f6',
      badgeClass: 'cp-veh-auto',
    };
  }
  if (pesoKg <= 800) {
    return {
      nombre: 'Van / Furgoneta',
      maxKg: 800,
      icon: '🚐',
      color: '#f59e0b',
      badgeClass: 'cp-veh-van',
    };
  }
  return {
    nombre: 'Camioneta de Carga 3.5T',
    maxKg: 1500,
    icon: '🚚',
    color: '#ef4444',
    badgeClass: 'cp-veh-carga',
  };
}

export function getCapacidadRepartidor(rep) {
  if (rep?.tipos_vehiculo?.capacidad_peso_kg) {
    return Number(rep.tipos_vehiculo.capacidad_peso_kg);
  }
  const v = (rep?.vehiculo || '').toLowerCase();
  if (v === 'carro' || v.includes('auto') || v.includes('sedan')) return 150;
  if (v.includes('van') || v.includes('furgoneta')) return 800;
  if (v.includes('camion')) return 1500;
  return 20; // Default motocicleta
}

export function getVehiculoNombreRepartidor(rep) {
  return rep?.tipos_vehiculo?.nombre || (rep?.vehiculo ? rep.vehiculo.toUpperCase() : 'MOTO');
}

// ─── Sub-componente: Modal de Producto ────────────────────────────────────────
function ProductoModal({ producto, comercioId, onClose, onSaved }) {
  const isEdit = Boolean(producto?.id);
  const [form, setForm]     = useState({
    nombre:      producto?.nombre      ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria:   producto?.categoria   ?? 'comida',
    precio_usd:  producto?.precio_usd  ?? '',
    stock:       producto?.stock       ?? 0,
    peso_kg:     producto?.peso_kg     ?? '1.0',
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
    if (form.peso_kg !== undefined && form.peso_kg !== '' && (isNaN(parseFloat(form.peso_kg)) || parseFloat(form.peso_kg) <= 0))
      e.peso_kg = 'Peso inválido (mín 0.01 kg).';
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
        peso_kg:     parseFloat(form.peso_kg || 1.0),
        activo:      form.activo,
        imagen_url,
      };

      let { error } = isEdit
        ? await supabase.from('productos').update(payload).eq('id', producto.id)
        : await supabase.from('productos').insert(payload);

      // Si la columna peso_kg aún no existe en Supabase, reintentar sin ese campo
      if (error && error.message?.includes('peso_kg')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.peso_kg;
        const resFallback = isEdit
          ? await supabase.from('productos').update(fallbackPayload).eq('id', producto.id)
          : await supabase.from('productos').insert(fallbackPayload);
        error = resFallback.error;
      }

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

          {/* Precio, Stock y Peso */}
          <div className="cp-row3">
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

            <div className={`cp-field ${errors.peso_kg ? 'cp-field--err' : ''}`}>
              <label htmlFor="cp-peso" title="Peso del producto para asignar el vehículo adecuado">
                Peso (kg) <span className="cp-opt">⚖️</span>
              </label>
              <div className="cp-prefix">
                <span>kg</span>
                <input id="cp-peso" name="peso_kg" type="number" min="0.01" step="0.1"
                  placeholder="1.0" value={form.peso_kg} onChange={handleChange} />
              </div>
              {errors.peso_kg && <span className="cp-error">{errors.peso_kg}</span>}
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

  // ── Alertas en Tiempo Real para Comercio (Pedidos hechos & entregados) ──
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
  const knownOrdersRef = useRef(new Map());
  const initialLoadedRef = useRef(false);
  const autoAssigningSetRef = useRef(new Set());
  const alertedEventsRef = useRef(new Set((() => {
    try {
      const raw = sessionStorage.getItem('levant_comercio_alerted_keys');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })()));

  // Guardar notificaciones en localStorage
  useEffect(() => {
    try {
      localStorage.setItem('levant_comercio_notifs', JSON.stringify(alertNotifications.slice(0, 50)));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [alertNotifications]);

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
        .select(`
          id, estado, total_usd, created_at, confirmacion_cliente, valoracion,
          profiles!pedidos_entregas_cliente_id_fkey(nombre_completo),
          pedido_items (
            cantidad, precio_usd, subtotal_usd,
            productos ( id, nombre, imagen_url, precio_usd )
          ),
          reportes_pago(metodo, estado, referencia)
        `)
        .eq('comercio_id', perfil.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    setVentas(resumen);
    setPedidos(listaPedidos ?? []);
    setLoadingVentas(false);
  }, [perfil?.id]);

  useEffect(() => { if (perfil?.id && activeTab === 'ventas') fetchVentas(); }, [fetchVentas, perfil, activeTab]);

  // ── Top Productos Más Vendidos del Comercio ──
  const topProductosVendidos = useMemo(() => {
    const map = new Map();
    (pedidos || []).forEach(p => {
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
  }, [pedidos]);

  const maxVendidos = topProductosVendidos[0]?.totalVendidos || 1;

  // ── Cargar pedidos para gestión ─────────────────────────────────
  const fetchGPedidos = useCallback(async () => {
    if (!perfil?.id) return;
    setLoadingGPedidos(true);
    let { data, error } = await supabase
      .from('pedidos_entregas')
      .select(`
        id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
        confirmacion_cliente, valoracion,
        profiles!pedidos_entregas_cliente_id_fkey(nombre_completo, telefono),
        repartidores_datos (
          id, vehiculo, placa, disponible, tipos_vehiculo_id,
          tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
          profiles ( id, nombre_completo, telefono )
        ),
        pedido_items (
          id, cantidad, precio_usd, subtotal_usd,
          productos ( id, nombre, imagen_url, peso_kg )
        ),
        reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
      `)
      .eq('comercio_id', perfil.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error && error.message?.includes('peso_kg')) {
      const resFallback = await supabase
        .from('pedidos_entregas')
        .select(`
          id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
          confirmacion_cliente, valoracion,
          profiles!pedidos_entregas_cliente_id_fkey(nombre_completo, telefono),
          repartidores_datos (
            id, vehiculo, placa, disponible, tipos_vehiculo_id,
            tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
            profiles ( id, nombre_completo, telefono )
          ),
          pedido_items (
            id, cantidad, precio_usd, subtotal_usd,
            productos ( id, nombre, imagen_url )
          ),
          reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
        `)
        .eq('comercio_id', perfil.id)
        .order('created_at', { ascending: false })
        .limit(100);
      data = resFallback.data;
      error = resFallback.error;
    }

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
          id, vehiculo, placa, disponible, tipos_vehiculo_id,
          tipos_vehiculo ( id, nombre, capacidad_peso_kg, capacidad_volumen_m3 ),
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

  // ── Helper para cargar un pedido individual con sus relaciones ────
  const fetchSingleOrder = useCallback(async (orderId) => {
    try {
      const { data, error } = await supabase
        .from('pedidos_entregas')
        .select(`
          id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
          confirmacion_cliente, valoracion,
          profiles!pedidos_entregas_cliente_id_fkey(nombre_completo, telefono),
          repartidores_datos (
            id, vehiculo, placa, disponible, tipos_vehiculo_id,
            tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
            profiles ( id, nombre_completo, telefono )
          ),
          pedido_items (
            id, cantidad, precio_usd, subtotal_usd,
            productos ( id, nombre, imagen_url )
          ),
          reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (!error && data) return data;
    } catch (err) {
      console.warn('Error al obtener datos del pedido:', err);
    }
    return null;
  }, []);

  // ── Disparar alerta de Nuevo Pedido Hecho ────────────────────────
  const notifyNuevoPedido = useCallback((pedido) => {
    if (!pedido?.id) return;
    // Si ya fue alertado previamente o ya fue leído, NO repetir
    if (hasComercioBeenAlerted(pedido.id, 'nuevo') || isOrderRead(pedido.id, 'nuevo')) return;

    // Marcar INMEDIATAMENTE como alertado
    markComercioAlerted(pedido.id, 'nuevo');
    knownOrdersRef.current.set(pedido.id, pedido.estado || 'pendiente');

    // 1. Sonido alegre de caja / retail una sola vez
    playNewOrderSound();

    const clientName = pedido.profiles?.nombre_completo || 'Cliente';
    const totalUsd = Number(pedido.total_usd || 0).toFixed(2);
    const shortId = pedido.id.slice(0, 8);
    const nowStr = new Date().toISOString();
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 2. Toast emergente flotante (evitando duplicar el mismo pedido)
    const toastItem = {
      id: toastId,
      tipo: 'nuevo',
      title: `¡Nuevo Pedido Hecho! #${shortId}`,
      desc: `De ${clientName} · ${pedido.direccion_entrega || 'Dirección no especificada'}`,
      total: pedido.total_usd,
      orderId: pedido.id,
      pedido,
      timestamp: nowStr,
    };
    setAlertToasts((prev) => {
      if (prev.some((t) => t.orderId === pedido.id && t.tipo === 'nuevo')) return prev;
      return [toastItem, ...prev.slice(0, 2)];
    });

    // 3. Notificación persistente en el centro de alertas
    const notifItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tipo: 'nuevo',
      title: `Nuevo Pedido #${shortId}`,
      desc: `Cliente: ${clientName} · ${pedido.direccion_entrega || 'Sin dirección'}`,
      total: pedido.total_usd,
      orderId: pedido.id,
      pedido,
      timestamp: nowStr,
      unread: true,
    };
    setAlertNotifications((prev) => [notifItem, ...prev.slice(0, 49)]);

    // 4. Notificación de escritorio nativa
    triggerDesktopNotification({
      title: `🛍️ ¡Nuevo Pedido Recibido! (#${shortId})`,
      body: `Cliente: ${clientName} · Total: $${totalUsd} USD`,
      onClick: () => {
        setActiveTab('pedidos');
        setPedidoDetalle(pedido);
      },
    });

    // Auto-descartar toast a los 8 segundos
    setTimeout(() => {
      setAlertToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 8000);

    // Actualizar pedidos y ventas
    fetchGPedidos();
    fetchVentas();
  }, [fetchGPedidos, fetchVentas]);

  // ── Disparar alerta de Pedido Entregado ──────────────────────────
  const notifyPedidoEntregado = useCallback((pedido) => {
    if (!pedido?.id) return;
    // Si ya fue alertado previamente o ya fue leído, NO repetir
    if (hasComercioBeenAlerted(pedido.id, 'entregado') || isOrderRead(pedido.id, 'entregado')) return;

    // Marcar INMEDIATAMENTE como alertado
    markComercioAlerted(pedido.id, 'entregado');
    knownOrdersRef.current.set(pedido.id, 'entregado');

    // 1. Sonido de entrega completada una sola vez
    playOrderDeliveredSound();

    const clientName = pedido.profiles?.nombre_completo || 'Cliente';
    const totalUsd = Number(pedido.total_usd || 0).toFixed(2);
    const shortId = pedido.id.slice(0, 8);
    const nowStr = new Date().toISOString();
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 2. Toast emergente flotante (evitando duplicar el mismo pedido)
    const toastItem = {
      id: toastId,
      tipo: 'entregado',
      title: `¡Pedido Entregado con Éxito! #${shortId}`,
      desc: `El pedido de ${clientName} ha sido entregado exitosamente.`,
      total: pedido.total_usd,
      orderId: pedido.id,
      pedido,
      timestamp: nowStr,
    };
    setAlertToasts((prev) => {
      if (prev.some((t) => t.orderId === pedido.id && t.tipo === 'entregado')) return prev;
      return [toastItem, ...prev.slice(0, 2)];
    });

    // 3. Notificación persistente
    const notifItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tipo: 'entregado',
      title: `Pedido Entregado #${shortId}`,
      desc: `Entregado a ${clientName} · Total: $${totalUsd} USD`,
      total: pedido.total_usd,
      orderId: pedido.id,
      pedido,
      timestamp: nowStr,
      unread: true,
    };
    setAlertNotifications((prev) => [notifItem, ...prev.slice(0, 49)]);

    // 4. Notificación de escritorio
    triggerDesktopNotification({
      title: `✅ ¡Pedido Entregado! (#${shortId})`,
      body: `El pedido de ${clientName} ($${totalUsd} USD) fue entregado con éxito.`,
      onClick: () => {
        setActiveTab('pedidos');
        setPedidoDetalle(pedido);
      },
    });

    // Auto-descartar toast a los 8 segundos
    setTimeout(() => {
      setAlertToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 8000);

    // Actualizar pedidos y ventas
    fetchGPedidos();
    fetchVentas();
  }, [fetchGPedidos, fetchVentas]);

  // ── Ver detalle de pedido desde una alerta o notificación ────────
  const handleViewOrderFromAlert = useCallback(async (pedido, orderId, tipo) => {
    setActiveTab('pedidos');
    const targetId = pedido?.id || orderId;
    if (targetId) {
      markOrderAsRead(targetId, tipo || pedido?.tipo || (pedido?.estado === 'entregado' ? 'entregado' : 'nuevo'));
      setAlertNotifications((prev) => prev.filter((n) => n.orderId !== targetId));
      setAlertToasts((prev) => prev.filter((t) => t.orderId !== targetId));
    }
    if (pedido?.id && pedido.pedido_items) {
      setPedidoDetalle(pedido);
      return;
    }
    if (!targetId) return;

    const inList = gPedidos.find((p) => p.id === targetId);
    if (inList) {
      setPedidoDetalle(inList);
      return;
    }

    const fetched = await fetchSingleOrder(targetId);
    if (fetched) {
      setPedidoDetalle(fetched);
    }
  }, [gPedidos, fetchSingleOrder]);

  const handleMarkItemAsRead = useCallback((orderId, tipo = 'nuevo') => {
    if (!orderId) return;
    markOrderAsRead(orderId, tipo);
    setAlertNotifications((prev) => prev.filter((n) => n.orderId !== orderId));
    setAlertToasts((prev) => prev.filter((t) => t.orderId !== orderId));
  }, []);

  const handleMarkAllAsRead = useCallback(() => {
    markAllOrdersAsRead(alertNotifications);
    setAlertNotifications([]);
    setAlertToasts([]);
  }, [alertNotifications]);

  // ── Carga inicial de pedidos y repartidores ───────────────────────
  useEffect(() => {
    if (perfil?.id) {
      fetchGPedidos();
      fetchRepartidoresActivos();
    }
  }, [fetchGPedidos, fetchRepartidoresActivos, perfil]);

  // ── Abrir pedido si se hizo clic desde la alerta del Dashboard ────
  useEffect(() => {
    const pendingOrderId = localStorage.getItem('levant_comercio_selected_order');
    if (pendingOrderId && perfil?.id) {
      localStorage.removeItem('levant_comercio_selected_order');
      handleViewOrderFromAlert(null, pendingOrderId);
    }
  }, [perfil?.id, handleViewOrderFromAlert]);

  // ── Sincronizar pedidos con alertas: SOLO los pedidos NO LEÍDOS aparecen ──
  useEffect(() => {
    if (!gPedidos || gPedidos.length === 0) {
      setAlertNotifications([]);
      return;
    }

    const readIds = getReadOrderIds();
    const notifs = [];
    gPedidos.forEach((p) => {
      const estadoNorm = (p.estado || '').toLowerCase();
      const isPendiente = estadoNorm === 'pendiente' || estadoNorm === 'confirmado';
      const isEntregado = estadoNorm === 'entregado' || p.confirmacion_cliente === true;
      const clientName = p.profiles?.nombre_completo || 'Cliente';
      const shortId = p.id ? p.id.slice(0, 8) : '--------';

      if (isPendiente && !readIds.has(p.id)) {
        notifs.push({
          id: `cp-order-pend-${p.id}`,
          orderId: p.id,
          tipo: 'nuevo',
          title: `Pedido Hecho #${shortId}`,
          desc: `Cliente: ${clientName} · ${p.direccion_entrega || 'Sin dirección'}`,
          total: p.total_usd,
          pedido: p,
          timestamp: p.created_at,
          unread: true,
        });
      } else if (isEntregado && !readIds.has(`${p.id}-entregado`)) {
        notifs.push({
          id: `cp-order-entr-${p.id}`,
          orderId: p.id,
          tipo: 'entregado',
          title: `Pedido Entregado #${shortId}`,
          desc: `Entregado exitosamente a ${clientName}`,
          total: p.total_usd,
          pedido: p,
          timestamp: p.updated_at || p.created_at,
          unread: true,
        });
      }
    });

    setAlertNotifications(notifs);
  }, [gPedidos]);

  // ── Escuchar cambios de lectura de alertas en tiempo real ────────
  useEffect(() => {
    const handleReadUpdated = () => {
      const readIds = getReadOrderIds();
      setAlertNotifications((prev) =>
        prev.filter((n) => {
          const key = n.tipo === 'entregado' ? `${n.orderId}-entregado` : n.orderId;
          return !readIds.has(key);
        })
      );
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

  // ── Auto-asignación SILENCIOSA (sin confirm) al registrar pago ───
  const silentAutoAssign = useCallback(async (pedido) => {
    if (!pedido?.id || !perfil?.id) return;
    // Si ya tiene repartidor asignado o ya se está procesando, no hacer nada
    if (pedido.repartidor_id) return;
    if (autoAssigningSetRef.current.has(pedido.id)) return;
    autoAssigningSetRef.current.add(pedido.id);

    // ── REGLA DE NEGOCIO: No asignar repartidor hasta que se registre el pago con comprobante ──
    let tienePago = Boolean(pedido.reportes_pago && pedido.reportes_pago.some(p => Boolean(p.comprobante_url)));
    if (!tienePago) {
      try {
        const { data: pagos } = await supabase
          .from('reportes_pago')
          .select('id, comprobante_url')
          .eq('pedido_id', pedido.id);
        tienePago = Boolean(pagos && pagos.length > 0 && pagos.some(p => Boolean(p.comprobante_url)));
      } catch (errP) {
        console.warn('Error verificando pago con comprobante para auto-asignación:', errP);
      }
    }

    if (!tienePago) {
      // Liberar para cuando el cliente registre el pago y comprobante más adelante
      autoAssigningSetRef.current.delete(pedido.id);
      return;
    }

    let pesoTotal = calcularPesoTotalPedido(pedido);

    // Si pedido_items no viene en el payload (ej. en evento realtime), consultar items para tener el peso real
    if (!pedido.pedido_items || pedido.pedido_items.length === 0) {
      try {
        const { data: items } = await supabase
          .from('pedido_items')
          .select('cantidad, productos ( peso_kg )')
          .eq('pedido_id', pedido.id);

        if (items && items.length > 0) {
          pesoTotal = items.reduce((sum, item) => {
            const qty = Number(item.cantidad) || 1;
            const pUnit = Number(item.productos?.peso_kg) || 1.0;
            return sum + (qty * pUnit);
          }, 0);
          pesoTotal = Number(pesoTotal.toFixed(2));
        }
      } catch (err) {
        console.warn('[AutoAsign] Error calculando peso desde items:', err);
      }
    }

    // Buscar el mejor repartidor disponible según capacidad de vehículo y peso del producto
    const seleccionado = await buscarMejorRepartidorDisponible(pesoTotal);
    if (!seleccionado) {
      console.warn('[AutoAsign] No hay repartidores disponibles para el pedido', pedido.id, `(peso: ${pesoTotal}kg)`);
      return;
    }

    console.log('[AutoAsign] Asignando automáticamente a', seleccionado.profiles?.nombre_completo, 'al pedido', pedido.id);

    // Asignar repartidor en pedidos_entregas
    const { error: assignErr } = await supabase
      .from('pedidos_entregas')
      .update({ repartidor_id: seleccionado.id, updated_at: new Date().toISOString() })
      .eq('id', pedido.id);

    if (assignErr) {
      console.error('[AutoAsign] Error asignando repartidor:', assignErr);
      return;
    }

    // Emitir alerta inmediata al repartidor asignado (multicanal: BroadcastChannel, CustomEvent y Realtime)
    notifyRepartidorAsignado({
      orderId: pedido.id,
      repartidorId: seleccionado.id,
      orderData: pedido
    });

    // Marcar repartidor como no disponible
    await supabase
      .from('repartidores_datos')
      .update({ disponible: false })
      .eq('id', seleccionado.id);

    // Actualizar estado local
    setRepartidoresActivos(prev => prev.map(r =>
      r.id === seleccionado.id ? { ...r, disponible: false } : r
    ));

    // Refrescar lista de pedidos
    fetchGPedidos();
  }, [perfil?.id, fetchGPedidos]);

  // ── Sincronización en Tiempo Real y Sondeo Inteligente ───────────
  useEffect(() => {
    if (!perfil?.id) return;

    let isMounted = true;

    // 1. Carga inicial de órdenes para alimentar el mapa de estados sin alertar pedidos viejos
    const initializeKnownOrders = async () => {
      try {
        const { data } = await supabase
          .from('pedidos_entregas')
          .select('id, estado, confirmacion_cliente')
          .eq('comercio_id', perfil.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (isMounted && data) {
          data.forEach((p) => {
            const effectiveStatus = (p.estado === 'entregado' || p.confirmacion_cliente) ? 'entregado' : (p.estado || 'pendiente');
            knownOrdersRef.current.set(p.id, effectiveStatus);
            // Marcar pedidos pre-existentes como ya alertados para que no suenen ni alerten en bucle al abrir/recargar
            markComercioAlerted(p.id, 'nuevo');
            if (effectiveStatus === 'entregado') {
              markComercioAlerted(p.id, 'entregado');
            }
          });
          initialLoadedRef.current = true;
        }
      } catch (err) {
        console.warn('Error inicializando estados de pedidos:', err);
      }
    };

    initializeKnownOrders();

    // 2. Canal Supabase Realtime (INSERT y UPDATE en tiempo real)
    const channel = supabase
      .channel(`comercio-pedidos-rt-${perfil.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pedidos_entregas',
          filter: `comercio_id=eq.${perfil.id}`
        },
        async (payload) => {
          if (!isMounted || !payload.new) return;
          if (hasComercioBeenAlerted(payload.new.id, 'nuevo') || isOrderRead(payload.new.id, 'nuevo')) return;
          knownOrdersRef.current.set(payload.new.id, payload.new.estado || 'pendiente');
          const fullOrder = await fetchSingleOrder(payload.new.id);
          const order = fullOrder || payload.new;
          notifyNuevoPedido(order);
          // → Auto-asignar repartidor SOLO si ya tiene pago registrado
          const tienePago = order.reportes_pago && order.reportes_pago.length > 0;
          if (tienePago && !order.repartidor_id) {
            silentAutoAssign(order);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reportes_pago',
        },
        async (payload) => {
          if (!isMounted || !payload.new?.pedido_id) return;
          // Refrescar lista de pedidos cuando el cliente registra el pago
          fetchGPedidos();
          const fullOrder = await fetchSingleOrder(payload.new.pedido_id);
          if (fullOrder && !fullOrder.repartidor_id && fullOrder.estado !== 'entregado' && fullOrder.estado !== 'cancelado') {
            console.log('[Realtime Pago] Pago registrado para pedido', fullOrder.id, '→ Auto-asignando repartidor...');
            silentAutoAssign(fullOrder);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos_entregas',
          filter: `comercio_id=eq.${perfil.id}`
        },
        async (payload) => {
          if (!isMounted || !payload.new) return;
          const newRow = payload.new;
          const prevEstado = knownOrdersRef.current.get(newRow.id);
          const isEntregado = newRow.estado === 'entregado' || newRow.confirmacion_cliente === true;

          if (isEntregado && prevEstado !== 'entregado') {
            knownOrdersRef.current.set(newRow.id, 'entregado');
            if (hasComercioBeenAlerted(newRow.id, 'entregado') || isOrderRead(newRow.id, 'entregado')) {
              return;
            }
            const fullOrder = await fetchSingleOrder(newRow.id);
            notifyPedidoEntregado(fullOrder || newRow);
          } else {
            knownOrdersRef.current.set(newRow.id, newRow.estado);
            fetchGPedidos();
          }
        }
      )
      .subscribe();

    // 3. Respaldo de sondeo inteligente periódico (cada 4 segundos)
    const pollInterval = setInterval(async () => {
      if (!isMounted || !perfil?.id || !initialLoadedRef.current) return;
      try {
        const { data: latestOrders } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
            confirmacion_cliente, valoracion,
            profiles!pedidos_entregas_cliente_id_fkey(nombre_completo, telefono),
            pedido_items ( id, cantidad, precio_usd, subtotal_usd, productos ( id, nombre, imagen_url ) ),
            reportes_pago ( metodo, estado, referencia, monto_bs, monto_usd )
          `)
          .eq('comercio_id', perfil.id)
          .order('created_at', { ascending: false })
          .limit(30);

        if (!isMounted || !latestOrders) return;

        for (const ord of latestOrders) {
          const prevStatus = knownOrdersRef.current.get(ord.id);
          const isEntregado = ord.estado === 'entregado' || ord.confirmacion_cliente === true;
          const tienePago = ord.reportes_pago && ord.reportes_pago.length > 0;

          if (prevStatus === undefined) {
            // Nuevo pedido hecho detectado: REGISTRAR INMEDIATAMENTE para que no vuelva a entrar en 4 segundos
            knownOrdersRef.current.set(ord.id, ord.estado || 'pendiente');
            if (!hasComercioBeenAlerted(ord.id, 'nuevo') && !isOrderRead(ord.id, 'nuevo')) {
              notifyNuevoPedido(ord);
              // → Auto-asignar repartidor ÚNICAMENTE si ya tiene pago registrado
              if (tienePago && !ord.repartidor_id) silentAutoAssign(ord);
            }
          } else if (isEntregado && prevStatus !== 'entregado') {
            // Pedido entregado detectado: REGISTRAR INMEDIATAMENTE para que no repita
            knownOrdersRef.current.set(ord.id, 'entregado');
            if (!hasComercioBeenAlerted(ord.id, 'entregado') && !isOrderRead(ord.id, 'entregado')) {
              notifyPedidoEntregado(ord);
            }
          } else {
            knownOrdersRef.current.set(ord.id, ord.estado);
            // Si el pedido ya existía, acaba de recibir pago y no tiene repartidor, auto-asignar
            if (tienePago && !ord.repartidor_id && ord.estado !== 'entregado' && ord.estado !== 'cancelado') {
              silentAutoAssign(ord);
            }
          }
        }
      } catch (err) {
        console.warn('Error en sondeo de pedidos:', err);
      }
    }, 4000);

    // 4. Socket.io broadcast listener (si el servidor de sockets está activo)
    let socket = null;
    try {
      socket = getSocket();
      if (!socket.connected) socket.connect();
      const onBroadcast = ({ orderId, nuevoEstado }) => {
        if (!isMounted) return;
        if (nuevoEstado === 'entregado') {
          const prevStatus = knownOrdersRef.current.get(orderId);
          if (prevStatus && prevStatus !== 'entregado') {
            fetchSingleOrder(orderId).then((full) => {
              if (full && full.comercio_id === perfil.id) {
                notifyPedidoEntregado(full);
              }
            });
          }
        }
      };
      socket.on('order:broadcast_status', onBroadcast);
    } catch {
      // Ignorar si sockets no están disponibles
    }

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      if (socket) {
        socket.off('order:broadcast_status');
      }
    };
  }, [perfil?.id, notifyNuevoPedido, notifyPedidoEntregado, fetchGPedidos, fetchSingleOrder, silentAutoAssign]);

  // ── Asignar repartidor a pedido ─────────────────────────────────
  const assignRepartidor = async (pedidoId, repartidorId) => {
    setAssigningRepartidor(pedidoId);
    try {
      const repIdVal = (repartidorId && repartidorId.trim() !== '') ? repartidorId : null;

      // Buscar el pedido actual para saber si había un repartidor anterior
      const pedidoActual = gPedidos.find(p => p.id === pedidoId);
      const repAnteriorId = pedidoActual?.repartidor_id ?? null;

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

      // Notificar al repartidor asignado de inmediato
      if (repIdVal) {
        notifyRepartidorAsignado({
          orderId: pedidoId,
          repartidorId: repIdVal,
          orderData: pedidoActual
        });
      }

      // ── Actualizar disponibilidad automáticamente ──────────────
      // Si se asigna un nuevo repartidor → marcarlo como NO disponible
      if (repIdVal) {
        await supabase
          .from('repartidores_datos')
          .update({ disponible: false })
          .eq('id', repIdVal);
      }
      // Si había un repartidor anterior y fue reemplazado/removido → restaurar disponibilidad
      if (repAnteriorId && repAnteriorId !== repIdVal) {
        await supabase
          .from('repartidores_datos')
          .update({ disponible: true })
          .eq('id', repAnteriorId);
      }

      const repObj = repIdVal ? repartidoresActivos.find(r => r.id === repIdVal) : null;
      const formattedRep = repObj ? {
        id: repObj.id,
        vehiculo: repObj.vehiculo,
        placa: repObj.placa,
        disponible: false,
        tipos_vehiculo_id: repObj.tipos_vehiculo_id,
        tipos_vehiculo: repObj.tipos_vehiculo,
        profiles: repObj.profiles
      } : null;

      // Actualizar estado local de repartidoresActivos para reflejar la nueva disponibilidad
      setRepartidoresActivos(prev => prev.map(r => {
        if (r.id === repIdVal) return { ...r, disponible: false };
        if (r.id === repAnteriorId && repAnteriorId !== repIdVal) return { ...r, disponible: true };
        return r;
      }));

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

  // ── Selección manual de repartidor (sin diálogo de confirmación) ──
  const handleSelectRepartidor = async (pedidoId, repartidorId, ped) => {
    if (!repartidorId) {
      await assignRepartidor(pedidoId, '');
      return;
    }
    // Asignación directa sin ventanas emergentes de confirmación
    await assignRepartidor(pedidoId, repartidorId);
  };

  // ── Auto-asignación inteligente de repartidor según peso y vehículo ──────
  const autoAssignRepartidorPorPeso = async (ped) => {
    // ── REGLA DE NEGOCIO: No asignar repartidor hasta que se registre el pago ──
    const tienePago = (ped.reportes_pago && ped.reportes_pago.length > 0);
    if (!tienePago) {
      alert('⚠️ No se puede asignar repartidor: El cliente aún no ha registrado el comprobante de pago de este pedido.');
      return;
    }

    const pesoTotal = calcularPesoTotalPedido(ped);
    const reqVeh = getTipoVehiculoRequerido(pesoTotal);

    setAssigningRepartidor(ped.id);
    try {
      // Buscar directamente en base de datos para obtener el repartidor óptimo disponible
      const seleccionado = await buscarMejorRepartidorDisponible(pesoTotal);

      if (!seleccionado) {
        console.warn(`[AutoAsign] No hay repartidores disponibles para ${pesoTotal} kg.`);
        alert(`No hay repartidores disponibles en línea en este momento para vehículo ${reqVeh.nombre} (${pesoTotal} kg).`);
        return;
      }

      // Asignar directamente sin confirmación
      await assignRepartidor(ped.id, seleccionado.id);
    } catch (err) {
      console.error('Error en auto-asignación:', err);
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
      // Si el pedido se marca entregado o cancelado, liberar la disponibilidad del repartidor
      const pedidoObj = gPedidos.find(p => p.id === pedidoId);
      if (pedidoObj?.repartidor_id && (nuevoEstado === 'entregado' || nuevoEstado === 'cancelado')) {
        await supabase
          .from('repartidores_datos')
          .update({ disponible: true })
          .eq('id', pedidoObj.repartidor_id);
        
        setRepartidoresActivos(prev => prev.map(r => 
          r.id === pedidoObj.repartidor_id ? { ...r, disponible: true } : r
        ));
      }

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

  const getEstadoBadge = (ped) => {
    if (!ped) return { label: '—', color: '#64748b' };
    const clienteConfirmo = Boolean(
      ped.confirmacion_cliente === true ||
      ped.valoracion
    );
    if (ped.estado === 'entregado') {
      if (clienteConfirmo) {
        return { label: 'entregado', color: '#10b981' };
      } else {
        return { label: 'pendiente confirmacion de entrega por cliente', color: '#f59e0b' };
      }
    }
    return {
      label: ped.estado?.replace('_', ' ') ?? '—',
      color: ESTADO_BADGE[ped.estado] ?? '#64748b'
    };
  };

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
      {/* Toasts de Alertas Flotantes */}
      <ComercioAlertToasts
        toasts={alertToasts}
        onDismiss={(id, orderId, tipo) => {
          if (orderId) {
            handleMarkItemAsRead(orderId, tipo);
          } else {
            setAlertToasts((prev) => prev.filter((t) => t.id !== id));
          }
        }}
        onViewOrder={handleViewOrderFromAlert}
      />

      {/* Tabs de Navegación y Centro de Alertas */}
      <div className="cp-tabs-header-row">
        <div className="cp-tabs-inner" role="tablist">
          {[
            ['perfil', '🏪 Mi Comercio'],
            ['productos', '📦 Productos'],
            ['pedidos', '📋 Pedidos'],
            ['ventas', '💰 Ventas'],
          ].map(([id, label]) => {
            const isPedidos = id === 'pedidos';
            const pedidosPendientesCount = gPedidos.filter(
              (p) => p.estado === 'pendiente' || p.estado === 'confirmado'
            ).length;
            const tieneAlertasNuevas = alertNotifications.some(
              (n) => n.tipo === 'nuevo' && n.unread
            );

            return (
              <button
                key={id}
                id={`cptab-${id}`}
                role="tab"
                aria-selected={activeTab === id}
                className={`cp-tab relative ${activeTab === id ? 'cp-tab--active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <span>{label}</span>
                {isPedidos && (
                  <PedidosRealtimeBadge
                    active={pedidosPendientesCount > 0 || tieneAlertasNuevas}
                    count={pedidosPendientesCount}
                    className="-top-1 -right-1"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="cp-alerts-controls">
          <ComercioAlertCenter
            notifications={alertNotifications}
            unreadCount={alertNotifications.length}
            isOpen={showNotifCenter}
            onToggleOpen={() => setShowNotifCenter((prev) => !prev)}
            onClose={() => setShowNotifCenter(false)}
            onMarkAllAsRead={handleMarkAllAsRead}
            onMarkItemAsRead={handleMarkItemAsRead}
            onClearHistory={handleMarkAllAsRead}
            onViewOrder={handleViewOrderFromAlert}
          />
        </div>
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
                        <th className="cp-th-c">Peso</th>
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
                          <td className="cp-td-c">
                            <span className="cp-badge-peso" title="Peso unitario del producto">
                              ⚖️ {prod.peso_kg ?? 1.0} kg
                            </span>
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
                {pedidosFiltrados.map(ped => {
                  const tienePago = ped.reportes_pago && ped.reportes_pago.length > 0;
                  const estadoInfo = getEstadoBadge(ped);
                  const pesoTotal = calcularPesoTotalPedido(ped);
                  const vehReq = getTipoVehiculoRequerido(pesoTotal);

                  return (
                    <div
                      key={ped.id}
                      className="cp-pedido-card"
                      onClick={() => {
                        setPedidoDetalle(ped);
                        markOrderAsRead(ped.id, ped.estado === 'entregado' ? 'entregado' : 'nuevo');
                      }}
                    >
                      <div className="cp-pedido-card-top">
                        <div className="cp-pedido-card-id">#{ped.id.slice(0,8)}</div>
                        <div className="cp-pedido-card-badges">
                          <span className="cp-badge" style={{ '--badge-color': estadoInfo.color }}>
                            {estadoInfo.label}
                          </span>
                          <span className={`cp-badge-pago ${tienePago ? 'cp-badge-pago--pagado' : 'cp-badge-pago--pendiente'}`}>
                            {tienePago ? '✅ Pagado' : '⏳ Pendiente por Pagar'}
                          </span>
                        </div>
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
                        <div className="cp-pedido-card-row cp-peso-badge-row">
                          <span>⚖️</span>
                          <span className="cp-pedido-peso-badge" title="Peso total del pedido">
                            {pesoTotal} kg
                          </span>
                          <span className={`cp-veh-badge ${vehReq.badgeClass}`} title={`Requiere vehículo tipo ${vehReq.nombre}`}>
                            {vehReq.icon} {vehReq.nombre}
                          </span>
                        </div>
                      </div>

                      {/* Repartidor Slot con lógica de peso */}
                      <div className="cp-card-rep-box" onClick={e => e.stopPropagation()}>
                        <div className="cp-card-rep-label">
                          <span>🛵 Repartidor</span>
                          {ped.repartidores_datos && (
                            <span className="cp-rep-dot-active" title="Asignado">●</span>
                          )}
                        </div>

                        {ped.estado !== 'entregado' && ped.estado !== 'cancelado' && (
                          <button
                            type="button"
                            className="cp-btn-auto-peso"
                            title={tienePago ? `Asignar repartidor automáticamente para ${pesoTotal} kg` : 'Esperando que el cliente registre el pago de este pedido'}
                            disabled={assigningRepartidor === ped.id || !tienePago}
                            onClick={() => autoAssignRepartidorPorPeso(ped)}
                            style={!tienePago ? { opacity: 0.65, cursor: 'not-allowed' } : {}}
                          >
                            {tienePago ? '⚡ Auto por Peso' : '⏳ Esperando Pago'}
                          </button>
                        )}

                        <select
                          className={`cp-rep-select ${ped.repartidor_id ? 'cp-rep-select--assigned' : ''}`}
                          value={ped.repartidor_id || ''}
                          disabled={ped.estado === 'entregado' || ped.estado === 'cancelado' || assigningRepartidor === ped.id}
                          onChange={(e) => handleSelectRepartidor(ped.id, e.target.value, ped)}
                        >
                          <option value="">
                            {loadingRepartidores ? 'Cargando...' : '-- Repartidor --'}
                          </option>
                          {(() => {
                            const aptos = listaRepartidores.filter(r => getCapacidadRepartidor(r) >= pesoTotal);
                            const noAptos = listaRepartidores.filter(r => getCapacidadRepartidor(r) < pesoTotal);
                            return (
                              <>
                                {aptos.length > 0 && (
                                  <optgroup label="✅ Aptos para este peso">
                                    {aptos.map(r => {
                                      const cap = getCapacidadRepartidor(r);
                                      const veh = getVehiculoNombreRepartidor(r);
                                      return (
                                        <option key={r.id} value={r.id}>
                                          {r.disponible ? '🟢' : '⚪'} {r.profiles?.nombre_completo || 'Repartidor'} ({veh} · {cap}kg)
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}
                                {noAptos.length > 0 && (
                                  <optgroup label="⚠️ Capacidad Insuficiente">
                                    {noAptos.map(r => {
                                      const cap = getCapacidadRepartidor(r);
                                      const veh = getVehiculoNombreRepartidor(r);
                                      return (
                                        <option key={r.id} value={r.id}>
                                          ⚠️ {r.profiles?.nombre_completo || 'Repartidor'} ({veh} · máx {cap}kg &lt; {pesoTotal}kg)
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
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
                  );
                })}
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

              {/* Desglose de Peso y Vehículo Requerido en Modal */}
              {(() => {
                const pesoModal = calcularPesoTotalPedido(pedidoDetalle);
                const reqVehModal = getTipoVehiculoRequerido(pesoModal);
                return (
                  <div className="cp-modal-peso-box">
                    <div className="cp-modal-peso-header">
                      <div className="cp-modal-peso-title-group">
                        <span style={{ fontSize: '1.25rem' }}>⚖️</span>
                        <div>
                          <p className="cp-modal-peso-title">
                            Peso total del pedido: <strong>{pesoModal} kg</strong>
                          </p>
                          <p className="cp-modal-peso-desc">
                            Vehículo recomendado: <span className={`cp-veh-badge ${reqVehModal.badgeClass}`}>{reqVehModal.icon} {reqVehModal.nombre} (soporta hasta {reqVehModal.maxKg} kg)</span>
                          </p>
                        </div>
                      </div>
                      {pedidoDetalle.estado !== 'entregado' && pedidoDetalle.estado !== 'cancelado' && (
                        <button
                          type="button"
                          className="cp-btn-auto-peso cp-btn-auto-peso--modal"
                          onClick={() => autoAssignRepartidorPorPeso(pedidoDetalle)}
                          disabled={assigningRepartidor === pedidoDetalle.id}
                        >
                          ⚡ Auto-asignar según peso
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                    onChange={(e) => handleSelectRepartidor(pedidoDetalle.id, e.target.value, pedidoDetalle)}
                  >
                    <option value="">-- Sin repartidor asignado (Seleccionar activo) --</option>
                    {(() => {
                      const pesoM = calcularPesoTotalPedido(pedidoDetalle);
                      const aptosM = listaRepartidores.filter(r => getCapacidadRepartidor(r) >= pesoM);
                      const noAptosM = listaRepartidores.filter(r => getCapacidadRepartidor(r) < pesoM);
                      return (
                        <>
                          {aptosM.length > 0 && (
                            <optgroup label="✅ Repartidores Aptos para este peso">
                              {aptosM.map(r => {
                                const cap = getCapacidadRepartidor(r);
                                const veh = getVehiculoNombreRepartidor(r);
                                return (
                                  <option key={r.id} value={r.id}>
                                    {r.disponible ? '🟢 Activo: ' : '⚪ Inactivo: '}
                                    {r.profiles?.nombre_completo || 'Repartidor'} ({veh} · {cap}kg)
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                          {noAptosM.length > 0 && (
                            <optgroup label="⚠️ Capacidad Insuficiente">
                              {noAptosM.map(r => {
                                const cap = getCapacidadRepartidor(r);
                                const veh = getVehiculoNombreRepartidor(r);
                                return (
                                  <option key={r.id} value={r.id}>
                                    ⚠️ {r.profiles?.nombre_completo || 'Repartidor'} ({veh} · máx {cap}kg &lt; {pesoM}kg)
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
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

              {/* Estado actual + Pago */}
              <div className="cp-pedido-estado-section">
                <span className="cp-pedido-estado-label">Estado actual:</span>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(() => {
                    const estadoInfo = getEstadoBadge(pedidoDetalle);
                    return (
                      <span className="cp-badge cp-badge--lg" style={{ '--badge-color': estadoInfo.color }}>
                        {estadoInfo.label}
                      </span>
                    );
                  })()}
                  <span className={`cp-badge-pago ${(pedidoDetalle.reportes_pago?.length > 0) ? 'cp-badge-pago--pagado' : 'cp-badge-pago--pendiente'}`}>
                    {(pedidoDetalle.reportes_pago?.length > 0) ? '✅ Pagado' : '⏳ Pendiente por Pagar'}
                  </span>
                </div>
              </div>

              {/* Información de Pago */}
              <div className="cp-modal-pago-section">
                <span className="cp-modal-rep-label">💳 Reporte de pago:</span>
                {pedidoDetalle.reportes_pago?.[0] ? (
                  <div className="cp-pago-info-box">
                    <span className="cp-badge-pago cp-badge-pago--pagado">✅ Registrado</span>
                    <span className="cp-pago-info-text">
                      Método: <strong>{pedidoDetalle.reportes_pago[0].metodo?.replace('_', ' ')}</strong>
                      {pedidoDetalle.reportes_pago[0].referencia ? ` · Ref: ${pedidoDetalle.reportes_pago[0].referencia}` : ''}
                      {pedidoDetalle.reportes_pago[0].monto_bs ? ` · Bs. ${pedidoDetalle.reportes_pago[0].monto_bs}` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="cp-pago-info-box">
                    <span className="cp-badge-pago cp-badge-pago--pendiente">⏳ Sin reporte</span>
                    <span className="cp-pago-info-text">El cliente no ha registrado su pago todavía.</span>
                  </div>
                )}
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
                        <p className="cp-pedido-item-meta">
                          Cant: {item.cantidad} × ${item.precio_usd?.toFixed(2)}
                          <span className="cp-item-peso-tag"> · ⚖️ {((item.productos?.peso_kg ?? 1.0) * item.cantidad).toFixed(1)} kg ({item.productos?.peso_kg ?? 1.0} kg c/u)</span>
                        </p>
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

              {/* Top Productos Más Vendidos */}
              {topProductosVendidos.length > 0 && (
                <div className="db-top-section db-top-section--comercio" style={{ margin: '1.25rem 0' }}>
                  <div className="db-top-header">
                    <div className="db-top-header-left">
                      <div className="db-top-badge-title">
                        <span className="db-top-header-icon">🔥</span>
                        <h2 className="db-top-title">Top Productos Más Vendidos</h2>
                      </div>
                      <p className="db-top-sub">
                        Artículos con mayor demanda y facturación en tu catálogo
                      </p>
                    </div>
                  </div>

                  <div className="db-top-grid">
                    {topProductosVendidos.slice(0, 5).map((prod, idx) => {
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
                            {(() => {
                              const eb = getEstadoBadge(p);
                              return (
                                <span className="cp-badge" style={{ '--badge-color': eb.color }}>
                                  {eb.label}
                                </span>
                              );
                            })()}
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
