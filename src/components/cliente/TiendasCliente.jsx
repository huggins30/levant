import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
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

export default function TiendasCliente({ session }) {
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

  // ── Ejecutar compra ──
  const handleOrder = async () => {
    if (!direccion.trim()) {
      setOrderResult('Debes indicar una dirección de entrega.');
      return;
    }
    if (cartItems.length === 0) return;

    setOrdering(true);
    setOrderResult(null);

    try {
      // 1. Crear pedido en pedidos_entregas
      const payload = {
        cliente_id:       session.user.id,
        comercio_id:      selected.id,
        total_usd:        parseFloat(cartTotal.toFixed(2)),
        direccion_entrega: direccion.trim(),
      };

      const { data: pedido, error: pedErr } = await supabase
        .from('pedidos_entregas')
        .insert(payload)
        .select('id')
        .single();

      if (pedErr) throw pedErr;

      // 2. Insertar items del pedido
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

      setOrderResult('ok');
      setCart({});
    } catch (err) {
      console.error('Error al crear pedido:', err);
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
                  <h3 className="tc-checkout-title">🛒 Confirmar pedido</h3>

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
                      <span>Total</span>
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

                  {/* Resultado */}
                  {orderResult === 'ok' && (
                    <div className="tc-alert-ok">
                      ✅ ¡Pedido creado exitosamente! El comercio recibirá tu orden. Puedes verlo en <strong>📦 Mis Pedidos</strong>.
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
                        <button id="tc-confirm-order" className="tc-btn-buy" onClick={handleOrder} disabled={ordering}>
                          {ordering ? <span className="tc-spinner" /> : '💳 Confirmar compra'}
                        </button>
                      </>
                    )}
                    {orderResult === 'ok' && (
                      <button className="tc-btn-buy" onClick={closeStore}>Cerrar</button>
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
