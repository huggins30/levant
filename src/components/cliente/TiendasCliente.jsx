import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { autoAsignarPedido, buscarMejorRepartidorDisponible } from '../../lib/asignacionPedidos';
import './TiendasCliente.css';

const CAT_ICONS = {
  restaurante:  '🍽',
  farmacia:     '💊',
  supermercado: '🛒',
  tecnologia:   '📱',
  ropa:         '👕',
  ferreteria:   '🛠',
  panaderia:    '🥖',
  licoreria:    '🍷',
  otro:         '🏪',
};

const BANCOS_VE = [
  'Banco de Venezuela', 'Banesco', 'Mercantil', 'BBVA Provincial', 'Bicentenario',
  'BNC', 'Banco Exterior', 'Sofitasa', 'Fondo Común', 'Banplus', '100% Banco',
  'Bancamiga', 'Bancaribe', 'Plaza Bank', 'Del Sur', 'BOD', 'Bancrecer', 'Banfanb',
];

const METODOS_PAGO = [
  { value: 'pago_movil',    label: '📱 Pago Móvil' },
  { value: 'zelle',         label: '💵 Zelle' },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'efectivo_usd',  label: '💵 Efectivo USD' },
  { value: 'efectivo_bs',   label: '💴 Efectivo Bs' },
];

export default function TiendasCliente({ session, onGoToPago }) {
  const [comercios, setComercios]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [catFilter, setCatFilter]       = useState('todas');
  const [selected, setSelected]         = useState(null);
  const [productos, setProductos]       = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);

  // ── Carrito ──
  const [cart, setCart]                 = useState({});   // { [productoId]: cantidad }
  const [showCheckout, setShowCheckout] = useState(false);
  const [direccion, setDireccion]       = useState('');
  const [referencia, setReferencia]     = useState('');
  const [ordering, setOrdering]         = useState(false);
  const [orderResult, setOrderResult]   = useState(null); // 'ok' | error string
  const [createdPedidoId, setCreatedPedidoId] = useState(null);

  // ── Datos de Pago (OBLIGATORIO para generar pedido) ──
  const [pagoMetodo, setPagoMetodo]           = useState('pago_movil');
  const [pagoBancoOrigen, setPagoBancoOrigen]   = useState('');
  const [pagoBancoDestino, setPagoBancoDestino] = useState('');
  const [pagoReferencia, setPagoReferencia]     = useState('');
  const [pagoMontoBs, setPagoMontoBs]           = useState('');
  const [pagoNotas, setPagoNotas]               = useState('');
  const [pagoFile, setPagoFile]                 = useState(null);
  const [pagoPreview, setPagoPreview]           = useState(null);

  // Preview de comprobante de pago
  useEffect(() => {
    if (!pagoFile) { setPagoPreview(null); return; }
    const url = URL.createObjectURL(pagoFile);
    setPagoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pagoFile]);

  const resetPagoForm = () => {
    setPagoMetodo('pago_movil');
    setPagoBancoOrigen('');
    setPagoBancoDestino('');
    setPagoReferencia('');
    setPagoMontoBs('');
    setPagoNotas('');
    setPagoFile(null);
    setPagoPreview(null);
  };

  const handlePagoFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f && f.size > 5 * 1024 * 1024) {
      setOrderResult('El archivo de imagen no debe superar los 5 MB.');
      return;
    }
    setPagoFile(f || null);
    if (orderResult && orderResult.includes('comprobante')) {
      setOrderResult(null);
    }
  };

  // ── Cargar comercios ──
  const fetchComercios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('comercios_datos')
      .select('*, profiles!comercios_datos_profile_id_fkey(nombre_completo, telefono)')
      .order('nombre_comercial', { ascending: true });
    if (error) console.error('Error cargando comercios:', error);
    setComercios(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchComercios(); }, [fetchComercios]);

  // ── Abrir tienda ──
  const openStore = async (comercio) => {
    setSelected(comercio);
    setCart({});
    setShowCheckout(false);
    setOrderResult(null);
    resetPagoForm();
    setLoadingProds(true);
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('comercio_id', comercio.id)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    setProductos(data ?? []);
    setLoadingProds(false);
  };

  const closeStore = () => {
    setSelected(null);
    setProductos([]);
    setCart({});
    setShowCheckout(false);
    setOrderResult(null);
    resetPagoForm();
  };

  // ── Filtros ──
  const categorias = [...new Set(comercios.map(c => c.categoria).filter(Boolean))];
  const filtered = comercios.filter(c => {
    const matchSearch =
      c.nombre_comercial?.toLowerCase().includes(search.toLowerCase()) ||
      c.profiles?.nombre_completo?.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === 'todas' || c.categoria === catFilter;
    return matchSearch && matchCat;
  });

  // ── Contar productos por comercio ──
  const [prodCounts, setProdCounts] = useState({});
  useEffect(() => {
    if (comercios.length === 0) return;
    const ids = comercios.map(c => c.id);
    supabase
      .from('productos')
      .select('comercio_id')
      .eq('activo', true)
      .in('comercio_id', ids)
      .then(({ data }) => {
        if (!data) return;
        const counts = {};
        data.forEach(p => { counts[p.comercio_id] = (counts[p.comercio_id] || 0) + 1; });
        setProdCounts(counts);
      });
  }, [comercios]);

  // ── Carrito helpers ──
  const addToCart = (productoId) => {
    setCart(prev => ({ ...prev, [productoId]: (prev[productoId] || 0) + 1 }));
  };

  const removeFromCart = (productoId) => {
    setCart(prev => {
      const next = { ...prev };
      if (next[productoId] > 1) next[productoId]--;
      else delete next[productoId];
      return next;
    });
  };

  const cartItems = productos.filter(p => cart[p.id]);
  const cartTotal = cartItems.reduce((sum, p) => sum + (p.precio_usd * (cart[p.id] || 0)), 0);
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

  // ── Cargar dirección guardada del cliente ──
  useEffect(() => {
    if (!showCheckout || !session?.user) return;
    supabase
      .from('clientes_datos')
      .select('direccion, punto_referencia')
      .eq('profile_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.direccion) setDireccion(data.direccion);
        if (data?.punto_referencia) setReferencia(data.punto_referencia);
      });
  }, [showCheckout, session]);

  // ── Ejecutar compra con PAGO OBLIGATORIO Y CARGA DE COMPROBANTE ──
  const handleOrder = async () => {
    if (!direccion.trim()) {
      setOrderResult('⚠️ Debes indicar una dirección de entrega.');
      return;
    }
    if (cartItems.length === 0) return;

    // VALIDACIÓN ESTRICTA DEL PAGO
    if (!pagoReferencia.trim()) {
      setOrderResult('⚠️ Debes ingresar el número de referencia del pago.');
      return;
    }

    const needsBanks = pagoMetodo === 'pago_movil' || pagoMetodo === 'transferencia';
    if (needsBanks && (!pagoBancoOrigen || !pagoBancoDestino)) {
      setOrderResult('⚠️ Debes seleccionar el banco de origen y el banco de destino.');
      return;
    }

    // Comprobante OBLIGATORIO: sin imagen de pago NO se puede generar el pedido
    if (!pagoFile) {
      setOrderResult('📸 OBLIGATORIO: Debes cargar la imagen del comprobante de pago. Sin comprobante el sistema no podrá generar el pedido ni asignar repartidor.');
      return;
    }

    setOrdering(true);
    setOrderResult(null);

    try {
      // 1. Subir imagen del comprobante al bucket 'pagos' de Supabase
      const ext = pagoFile.name.split('.').pop();
      const path = `comprobantes/${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('pagos')
        .upload(path, pagoFile, { upsert: true });

      if (upErr) throw new Error('Error al subir el comprobante de pago: ' + upErr.message);

      const { data: urlData } = supabase.storage.from('pagos').getPublicUrl(path);
      const comprobante_url = urlData?.publicUrl || null;

      if (!comprobante_url) {
        throw new Error('No se pudo generar la URL de la imagen del pago.');
      }

      // 2. Crear pedido en pedidos_entregas (inicialmente sin repartidor)
      const payload = {
        cliente_id:       session.user.id,
        comercio_id:      selected.id,
        total_usd:        parseFloat(cartTotal.toFixed(2)),
        direccion_entrega: direccion.trim() + (referencia.trim() ? ` (Ref: ${referencia.trim()})` : ''),
        repartidor_id:    null,
        estado:           'pendiente',
      };

      const { data: pedido, error: pedErr } = await supabase
        .from('pedidos_entregas')
        .insert(payload)
        .select('id, estado, total_usd, direccion_entrega, comercio_id, cliente_id, created_at')
        .single();

      if (pedErr) throw pedErr;

      // Emitir alerta inmediata de nuevo pedido a nivel local y cross-tab (0ms)
      if (typeof window !== 'undefined') {
        if ('BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('levant_orders_channel');
            bc.postMessage({ type: 'nuevo_pedido', order: pedido });
            bc.close();
          } catch {}
        }
        window.dispatchEvent(new CustomEvent('levant_nuevo_pedido_global', { detail: { order: pedido } }));
      }

      // 3. Insertar items del pedido
      const items = cartItems.map(p => ({
        pedido_id:   pedido.id,
        producto_id: p.id,
        cantidad:    cart[p.id],
        precio_usd:  p.precio_usd,
      }));

      const { error: itemsErr } = await supabase
        .from('pedido_items')
        .insert(items);

      if (itemsErr) throw itemsErr;

      // 4. Registrar el pago en reportes_pago con la imagen cargada
      const payloadPago = {
        pedido_id:       pedido.id,
        cliente_id:      session.user.id,
        metodo:          pagoMetodo,
        banco_origen:    pagoBancoOrigen || null,
        banco_destino:   pagoBancoDestino || null,
        referencia:      pagoReferencia.trim(),
        monto_usd:       parseFloat(cartTotal.toFixed(2)),
        monto_bs:        pagoMontoBs ? parseFloat(pagoMontoBs) : null,
        notas:           pagoNotas.trim() || null,
        comprobante_url: comprobante_url,
        estado:          'pendiente',
      };

      const { error: pagoErr } = await supabase
        .from('reportes_pago')
        .insert(payloadPago);

      if (pagoErr) {
        console.warn('[TiendasCliente] Advertencia registrando reporte_pago:', pagoErr);
      }

      // 5. Con comprobante verificado y registrado, auto-asignar repartidor idóneo
      let pesoTotal = cartItems.reduce((sum, p) => {
        const qty = Number(cart[p.id]) || 1;
        const pUnit = Number(p.peso_kg) || 1.0;
        return sum + (qty * pUnit);
      }, 0);
      pesoTotal = Number(pesoTotal.toFixed(2)) || 1.0;

      await autoAsignarPedido(pedido.id, pesoTotal);

      setCreatedPedidoId(pedido.id);
      setOrderResult('ok');
      setCart({});
      resetPagoForm();
    } catch (err) {
      console.error('Error al generar pedido con pago:', err);
      setOrderResult(err.message || 'Error al procesar la compra.');
    } finally {
      setOrdering(false);
    }
  };

  // ── JSX ──
  return (
    <div className="tc-wrapper">
      {/* Header */}
      <div className="tc-header">
        <span className="tc-header-icon">🏪</span>
        <div>
          <h1 className="tc-header-title">Tiendas</h1>
          <p className="tc-header-sub">
            Explora todos los comercios disponibles
            {!loading && ` · ${filtered.length} comercio${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="tc-toolbar">
        <input
          className="tc-search"
          type="search"
          placeholder="Buscar tienda o responsable…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="tc-filter-select"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="todas">📂 Todas las categorías</option>
          {categorias.map(cat => (
            <option key={cat} value={cat}>
              {CAT_ICONS[cat] ?? '📦'} {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="tc-center"><span className="tc-loader" /></div>
      ) : filtered.length === 0 ? (
        <div className="tc-empty">
          <span className="tc-empty-icon">🔍</span>
          <p>No se encontraron comercios{search ? ` para "${search}"` : ''}.</p>
        </div>
      ) : (
        <div className="tc-grid">
          {filtered.map(c => (
            <div key={c.id} className="tc-card" onClick={() => openStore(c)}>
              <div className="tc-card-banner" />
              <div className="tc-card-body">
                <div className="tc-card-top">
                  <div className="tc-card-avatar">
                    {CAT_ICONS[c.categoria] ?? '🏪'}
                  </div>
                  <div className="tc-card-info">
                    <h3 className="tc-card-name">{c.nombre_comercial}</h3>
                    <p className="tc-card-owner">
                      {c.profiles?.nombre_completo ?? 'Sin responsable'}
                    </p>
                    <span className="tc-card-cat">
                      {c.categoria?.charAt(0).toUpperCase() + c.categoria?.slice(1)}
                    </span>
                  </div>
                </div>
                <div className="tc-card-details">
                  <div className="tc-card-detail">
                    <span className="tc-card-detail-icon">📍</span>
                    <span>{c.direccion || 'Sin dirección'}</span>
                  </div>
                  {c.profiles?.telefono && (
                    <div className="tc-card-detail">
                      <span className="tc-card-detail-icon">📞</span>
                      <span>{c.profiles.telefono}</span>
                    </div>
                  )}
                </div>
                <div className="tc-card-footer">
                  <div className="tc-card-stat">
                    📦 <span className="tc-card-stat-value">{prodCounts[c.id] ?? 0}</span> productos
                  </div>
                  <button className="tc-card-btn" onClick={e => { e.stopPropagation(); openStore(c); }}>
                    Ver tienda →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de tienda ── */}
      {selected && (
        <div className="tc-overlay" onClick={closeStore}>
          <div className="tc-modal" onClick={e => e.stopPropagation()}>
            <div className="tc-modal-banner" />
            <div className="tc-modal-header">
              <h2>{selected.nombre_comercial}</h2>
              <button className="tc-modal-close" onClick={closeStore} aria-label="Cerrar">✕</button>
            </div>
            <div className="tc-modal-body">
              {/* Info del comercio */}
              <div className="tc-modal-info">
                <div className="tc-modal-row">
                  <span className="tc-modal-row-icon">👤</span>
                  <span className="tc-modal-row-label">Responsable</span>
                  <span className="tc-modal-row-value">{selected.profiles?.nombre_completo ?? '—'}</span>
                </div>
                <div className="tc-modal-row">
                  <span className="tc-modal-row-icon">📍</span>
                  <span className="tc-modal-row-label">Dirección</span>
                  <span className="tc-modal-row-value">{selected.direccion || '—'}</span>
                </div>
                {selected.profiles?.telefono && (
                  <div className="tc-modal-row">
                    <span className="tc-modal-row-icon">📞</span>
                    <span className="tc-modal-row-label">Teléfono</span>
                    <span className="tc-modal-row-value">{selected.profiles.telefono}</span>
                  </div>
                )}
                <div className="tc-modal-row">
                  <span className="tc-modal-row-icon">{CAT_ICONS[selected.categoria] ?? '🏪'}</span>
                  <span className="tc-modal-row-label">Categoría</span>
                  <span className="tc-modal-row-value">{selected.categoria?.charAt(0).toUpperCase() + selected.categoria?.slice(1)}</span>
                </div>
                {selected.rif && selected.rif !== 'J-00000000-0' && (
                  <div className="tc-modal-row">
                    <span className="tc-modal-row-icon">🆔</span>
                    <span className="tc-modal-row-label">RIF</span>
                    <span className="tc-modal-row-value">{selected.rif}</span>
                  </div>
                )}
              </div>

              {/* ── Productos disponibles ── */}
              {!showCheckout && (
                <>
                  <h3 className="tc-modal-prods-title">📦 Productos disponibles</h3>
                  {loadingProds ? (
                    <div className="tc-center"><span className="tc-loader" /></div>
                  ) : productos.length === 0 ? (
                    <div className="tc-modal-empty-prods">Este comercio aún no ha publicado productos.</div>
                  ) : (
                    <div className="tc-modal-prods">
                      {productos.map(p => (
                        <div key={p.id} className={`tc-modal-prod ${p.stock === 0 ? 'tc-modal-prod-inactive' : ''}`}>
                          {p.imagen_url
                            ? <img src={p.imagen_url} alt={p.nombre} className="tc-modal-prod-img" />
                            : <div className="tc-modal-prod-placeholder">📦</div>
                          }
                          <div className="tc-modal-prod-info">
                            <p className="tc-modal-prod-name">{p.nombre}</p>
                            {p.descripcion && <p className="tc-modal-prod-desc">{p.descripcion}</p>}
                          </div>
                          <span className="tc-modal-prod-price">${p.precio_usd?.toFixed(2)}</span>

                          {/* Controles de cantidad */}
                          {p.stock === 0 ? (
                            <span className="tc-prod-agotado">Agotado</span>
                          ) : cart[p.id] ? (
                            <div className="tc-qty-controls">
                              <button className="tc-qty-btn" onClick={() => removeFromCart(p.id)} aria-label="Quitar">−</button>
                              <span className="tc-qty-value">{cart[p.id]}</span>
                              <button className="tc-qty-btn" onClick={() => addToCart(p.id)}
                                disabled={cart[p.id] >= p.stock} aria-label="Agregar">+</button>
                            </div>
                          ) : (
                            <button className="tc-btn-add" onClick={() => addToCart(p.id)}>
                              🛒 Agregar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Barra flotante del carrito */}
                  {cartCount > 0 && (
                    <div className="tc-cart-bar">
                      <div className="tc-cart-bar-info">
                        <span className="tc-cart-bar-badge">{cartCount}</span>
                        <span>producto{cartCount !== 1 ? 's' : ''} en el carrito</span>
                      </div>
                      <div className="tc-cart-bar-right">
                        <span className="tc-cart-bar-total">${cartTotal.toFixed(2)}</span>
                        <button className="tc-cart-bar-btn" onClick={() => setShowCheckout(true)}>
                          Comprar →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Checkout / Confirmar compra ── */}
              {showCheckout && (
                <div className="tc-checkout">
                  <h3 className="tc-checkout-title">🛒 Confirmar pedido y registrar pago</h3>

                  {/* Resumen de items */}
                  <div className="tc-checkout-items">
                    {cartItems.map(p => (
                      <div key={p.id} className="tc-checkout-item">
                        <span className="tc-checkout-item-name">{p.nombre}</span>
                        <span className="tc-checkout-item-qty">×{cart[p.id]}</span>
                        <span className="tc-checkout-item-sub">${(p.precio_usd * cart[p.id]).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="tc-checkout-total-row">
                      <span>Total a pagar</span>
                      <span className="tc-checkout-total">${cartTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Dirección de entrega */}
                  <div className="tc-checkout-field">
                    <label htmlFor="tc-dir">📍 Dirección de entrega *</label>
                    <input
                      id="tc-dir"
                      type="text"
                      placeholder="Av. / Calle, Edificio, Piso…"
                      value={direccion}
                      onChange={e => setDireccion(e.target.value)}
                    />
                  </div>

                  <div className="tc-checkout-field">
                    <label htmlFor="tc-ref">🏷 Punto de referencia <span className="tc-opt">(opcional)</span></label>
                    <input
                      id="tc-ref"
                      type="text"
                      placeholder="Cerca de…"
                      value={referencia}
                      onChange={e => setReferencia(e.target.value)}
                    />
                  </div>

                  {/* ── SECCIÓN DE PAGO Y COMPROBANTE OBLIGATORIO ── */}
                  <div className="tc-payment-box">
                    <div className="tc-payment-box-header">
                      <span className="tc-payment-badge-req">OBLIGATORIO</span>
                      <h4 className="tc-payment-box-title">💳 Registro del Pago & Comprobante</h4>
                    </div>
                    <p className="tc-payment-box-sub">
                      El sistema exige cargar la imagen del comprobante de pago y registrar los datos antes de poder generar el pedido y asignar un repartidor.
                    </p>

                    {/* Método de pago */}
                    <div className="tc-checkout-field">
                      <label htmlFor="tc-pago-metodo">Método de pago *</label>
                      <select
                        id="tc-pago-metodo"
                        className="tc-checkout-select"
                        value={pagoMetodo}
                        onChange={e => setPagoMetodo(e.target.value)}
                      >
                        {METODOS_PAGO.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Bancos si aplica */}
                    {(pagoMetodo === 'pago_movil' || pagoMetodo === 'transferencia') && (
                      <div className="tc-payment-grid-2">
                        <div className="tc-checkout-field">
                          <label htmlFor="tc-banco-origen">Banco origen *</label>
                          <select
                            id="tc-banco-origen"
                            className="tc-checkout-select"
                            value={pagoBancoOrigen}
                            onChange={e => setPagoBancoOrigen(e.target.value)}
                          >
                            <option value="">Seleccionar banco...</option>
                            {BANCOS_VE.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                        <div className="tc-checkout-field">
                          <label htmlFor="tc-banco-destino">Banco destino *</label>
                          <select
                            id="tc-banco-destino"
                            className="tc-checkout-select"
                            value={pagoBancoDestino}
                            onChange={e => setPagoBancoDestino(e.target.value)}
                          >
                            <option value="">Seleccionar banco...</option>
                            {BANCOS_VE.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Referencia */}
                    <div className="tc-checkout-field">
                      <label htmlFor="tc-pago-ref">
                        {pagoMetodo === 'zelle' ? 'ID / Memo de Zelle *' : 'Número de referencia *'}
                      </label>
                      <input
                        id="tc-pago-ref"
                        type="text"
                        placeholder={pagoMetodo === 'zelle' ? 'Ej: 9b2d8e...' : 'Ej: 12345678'}
                        value={pagoReferencia}
                        onChange={e => setPagoReferencia(e.target.value)}
                      />
                    </div>

                    {/* Monto pagado */}
                    <div className="tc-payment-grid-2">
                      <div className="tc-checkout-field">
                        <label>Monto a pagar (USD)</label>
                        <input
                          type="text"
                          disabled
                          value={`$${cartTotal.toFixed(2)}`}
                          className="tc-input-total-usd"
                        />
                      </div>
                      <div className="tc-checkout-field">
                        <label htmlFor="tc-pago-bs">Monto pagado en Bs <span className="tc-opt">(opcional)</span></label>
                        <input
                          id="tc-pago-bs"
                          type="number"
                          step="0.01"
                          placeholder="Bs. 0.00"
                          value={pagoMontoBs}
                          onChange={e => setPagoMontoBs(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* CARGA OBLIGATORIA DEL COMPROBANTE DE PAGO */}
                    <div className={`tc-checkout-field tc-receipt-upload-field ${!pagoFile ? 'tc-receipt-required-box' : 'tc-receipt-ready-box'}`}>
                      <div className="tc-receipt-label-row">
                        <label htmlFor="tc-pago-file">
                          📸 Captura / Imagen del Comprobante *
                        </label>
                        {!pagoFile ? (
                          <span className="tc-tag-mandatory">OBLIGATORIO</span>
                        ) : (
                          <span className="tc-tag-ready">✓ Comprobante listo</span>
                        )}
                      </div>

                      <label htmlFor="tc-pago-file" className={`tc-file-dropzone ${pagoPreview ? 'has-preview' : ''}`}>
                        {pagoPreview ? (
                          <div className="tc-file-preview-wrap">
                            <img src={pagoPreview} alt="Comprobante cargado" className="tc-file-preview-img" />
                            <div className="tc-file-preview-info">
                              <span className="tc-file-name">{pagoFile.name}</span>
                              <span className="tc-file-size">{(pagoFile.size / 1024).toFixed(1)} KB</span>
                              <span className="tc-file-change">Toca para cambiar imagen 🔄</span>
                            </div>
                          </div>
                        ) : (
                          <div className="tc-file-placeholder">
                            <span className="tc-file-icon">📸</span>
                            <span className="tc-file-prompt">Adjuntar imagen del comprobante de pago</span>
                            <span className="tc-file-hint">JPG, PNG o WEBP (Máx. 5 MB) · Requerido para generar pedido</span>
                          </div>
                        )}
                      </label>
                      <input
                        id="tc-pago-file"
                        type="file"
                        accept="image/*"
                        className="tc-file-hidden"
                        onChange={handlePagoFileChange}
                      />
                    </div>
                  </div>

                  {/* Advertencia si no ha cargado comprobante */}
                  {!pagoFile && (
                    <div className="tc-alert-warn">
                      ⚠️ <strong>Comprobante obligatorio:</strong> Debes subir la captura de tu pago para que el sistema pueda habilitar el botón y generar tu pedido.
                    </div>
                  )}

                  {/* Resultado */}
                  {orderResult === 'ok' && (
                    <div className="tc-alert-ok">
                      🎉 <strong>¡Pedido y pago registrados con éxito!</strong><br />
                      Tu comprobante fue cargado y el sistema ya procedió a la asignación de tu repartidor.
                    </div>
                  )}
                  {orderResult && orderResult !== 'ok' && (
                    <div className="tc-alert-err">❌ {orderResult}</div>
                  )}

                  {/* Botones */}
                  <div className="tc-checkout-actions">
                    {orderResult !== 'ok' && (
                      <>
                        <button className="tc-btn-secondary" onClick={() => setShowCheckout(false)} disabled={ordering}>
                          ← Volver
                        </button>
                        <button
                          id="tc-confirm-order"
                          className={`tc-btn-buy ${!pagoFile ? 'tc-btn-buy--disabled' : ''}`}
                          onClick={handleOrder}
                          disabled={ordering || !pagoFile}
                          title={!pagoFile ? 'Debes adjuntar la imagen del comprobante de pago para continuar' : 'Generar pedido y registrar pago'}
                        >
                          {ordering ? (
                            <><span className="tc-spinner" /> Registrando pedido y pago...</>
                          ) : (
                            <>💳 Generar Pedido con Pago</>
                          )}
                        </button>
                      </>
                    )}
                    {orderResult === 'ok' && (
                      <button className="tc-btn-buy" style={{ width: '100%' }} onClick={closeStore}>
                        Listo, volver a tiendas
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
