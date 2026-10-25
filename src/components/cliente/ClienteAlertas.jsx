import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Bell, BellRing, CheckCircle2 } from 'lucide-react';
import {
  playRepartidorAsignadoSound,
  showDesktopNotification,
  requestDesktopNotificationPermission,
  isClientSoundEnabled,
  setClientSoundEnabled
} from './clienteAlertSound';
import '../comercio/ComercioAlertas.css';
import './ClienteAlertas.css';

/**
 * ── Gestión centralizada de pedidos leídos y alertados por el Cliente ─────────────
 */
const alertedClientInMemory = new Set();

export function hasClientBeenAlerted(orderId, tipo = 'repartidor') {
  if (!orderId) return true;
  const key = `${orderId}-${tipo}`;
  if (alertedClientInMemory.has(key)) return true;
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('levant_client_alerted_keys');
      if (raw) {
        const set = new Set(JSON.parse(raw));
        if (set.has(key)) return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

export function markClientAlerted(orderId, tipo = 'repartidor') {
  if (!orderId) return;
  const key = `${orderId}-${tipo}`;
  alertedClientInMemory.add(key);
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('levant_client_alerted_keys');
      const set = new Set(raw ? JSON.parse(raw) : []);
      set.add(key);
      sessionStorage.setItem('levant_client_alerted_keys', JSON.stringify([...set]));
    } catch {
      // ignore
    }
  }
}

export function getClientReadOrderIds() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('levant_client_read_order_ids');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function isClientOrderRead(orderId, tipo = 'repartidor') {
  if (!orderId) return true;
  const readIds = getClientReadOrderIds();
  const key = `${orderId}-${tipo}`;
  return readIds.has(key);
}

export function markClientOrderAsRead(orderId, tipo = 'repartidor') {
  if (!orderId || typeof window === 'undefined') return;
  try {
    const readIds = getClientReadOrderIds();
    readIds.add(`${orderId}-${tipo}`);
    localStorage.setItem('levant_client_read_order_ids', JSON.stringify([...readIds]));
    markClientAlerted(orderId, tipo);
    window.dispatchEvent(new CustomEvent('levant_client_read_orders_updated', { detail: { orderId, tipo } }));
  } catch (err) {
    console.warn('Error al guardar alerta de cliente como leída:', err);
  }
}

export function markAllClientOrdersAsRead(notifications = []) {
  if (typeof window === 'undefined') return;
  try {
    const readIds = getClientReadOrderIds();
    notifications.forEach((n) => {
      if (n.orderId) {
        const t = n.tipo || 'repartidor';
        readIds.add(`${n.orderId}-${t}`);
        markClientAlerted(n.orderId, t);
      }
    });
    localStorage.setItem('levant_client_read_order_ids', JSON.stringify([...readIds]));
    window.dispatchEvent(new CustomEvent('levant_client_read_orders_updated'));
  } catch (err) {
    console.warn('Error al marcar todas las alertas de cliente como leídas:', err);
  }
}

/**
 * Formatea una marca de tiempo a tiempo relativo legible en español
 */
function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Hace un momento';
  const now = new Date();
  const date = new Date(dateInput);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 45) return 'Hace un momento';
  if (diffSec < 90) return 'Hace 1 min';
  if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `Hace ${hours} h`;
  }
  return date.toLocaleDateString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Componente Toast Flotante para Clientes
 */
export function ClienteAlertToasts({ toasts, onDismiss, onGoToTracking }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="ca-toasts-container" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="ca-toast" role="alert">
          <div className="ca-toast-top-glow" />
          <div className="ca-toast-main">
            <div className="ca-toast-icon-wrap">
              <span className="ca-toast-pulse" />
              <span>🛵</span>
            </div>

            <div className="ca-toast-content">
              <div className="ca-toast-meta">
                <span className="ca-toast-badge">Repartidor Asignado</span>
                <button
                  type="button"
                  className="ca-toast-close"
                  onClick={() => onDismiss(toast.id)}
                  title="Cerrar alerta"
                  aria-label="Cerrar alerta"
                >
                  ✕
                </button>
              </div>

              <h4 className="ca-toast-title">
                ¡Tu pedido ya tiene repartidor!
              </h4>

              <p className="ca-toast-desc">
                {toast.comercioNombre ? (
                  <>Tu pedido de <strong>{toast.comercioNombre}</strong> (#{toast.shortId}) ha sido asignado a un repartidor.</>
                ) : (
                  <>Tu pedido #{toast.shortId} ya tiene un repartidor asignado para su entrega.</>
                )}
              </p>

              {toast.repartidorNombre && (
                <div className="ca-toast-driver-pill">
                  <span className="ca-toast-driver-name">👤 {toast.repartidorNombre}</span>
                  {toast.vehiculo && (
                    <span className="ca-toast-driver-vehicle">
                      · {toast.vehiculo.toUpperCase()} {toast.placa ? `(${toast.placa})` : ''}
                    </span>
                  )}
                </div>
              )}

              <div className="ca-toast-actions">
                <button
                  type="button"
                  className="ca-toast-btn-primary"
                  onClick={() => {
                    onDismiss(toast.id);
                    onGoToTracking?.(toast.orderId);
                  }}
                >
                  <span>🛵 Ver Rastreo &amp; Chat</span>
                </button>
                <button
                  type="button"
                  className="ca-toast-btn-secondary"
                  onClick={() => onDismiss(toast.id)}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * ── Campana y Centro Desplegable de Notificaciones para Clientes ──────
 */
export function ClienteAlertCenter({
  notifications = [],
  unreadCount = 0,
  isOpen = false,
  onToggleOpen,
  onClose,
  onMarkAllAsRead,
  onMarkItemAsRead,
  onClearHistory,
  onGoToTracking,
}) {
  const [filter, setFilter] = useState('todos'); // 'todos' | 'repartidor' | 'en_camino' | 'entregado'
  const [soundActive, setSoundActive] = useState(isClientSoundEnabled());
  const [notifPerm, setNotifPerm] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    setSoundActive(isClientSoundEnabled());
  }, [isOpen]);

  const toggleSound = () => {
    const next = !soundActive;
    setClientSoundEnabled(next);
    setSoundActive(next);
    if (next) {
      playRepartidorAsignadoSound();
    }
  };

  const handleRequestPerm = async () => {
    const res = await requestDesktopNotificationPermission();
    setNotifPerm(res);
  };

  const filteredNotifs = (notifications || []).filter((n) => {
    if (!n.unread) return false;
    if (filter === 'todos') return true;
    return n.tipo === filter;
  });

  return (
    <>
      {/* Botón de Campana en el encabezado del cliente */}
      <button
        type="button"
        id="ca-bell-button"
        className={`cp-bell-btn ${isOpen ? 'cp-bell-btn--active' : ''} ${unreadCount > 0 ? 'cp-bell-btn--has-unread' : ''}`}
        title={unreadCount > 0 ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer` : 'Centro de alertas de tus pedidos'}
        onClick={onToggleOpen}
        aria-label="Alertas de tus pedidos"
      >
        {unreadCount > 0 ? (
          <BellRing className="cp-bell-icon cp-bell-icon--ringing" size={18} strokeWidth={2.2} />
        ) : (
          <Bell className="cp-bell-icon" size={18} strokeWidth={2} />
        )}
        {unreadCount > 0 && (
          <span className="cp-bell-badge" title={`${unreadCount} alertas sin leer`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Desplegable */}
      {isOpen && (
        <>
          <div className="cp-alert-center-backdrop" onClick={onClose} />
          <div className="cp-alert-center" role="dialog" aria-modal="true">
            {/* Header */}
            <div className="cp-alert-center-header">
              <div className="cp-alert-center-title-group">
                <div className="cp-alert-title-icon-box" style={{ background: 'rgba(56, 189, 248, 0.2)', borderColor: 'rgba(56, 189, 248, 0.4)' }}>
                  <BellRing size={18} strokeWidth={2.2} className="cp-alert-title-icon" style={{ color: '#38bdf8' }} />
                </div>
                <h3>Mis Notificaciones</h3>
                {unreadCount > 0 && (
                  <span className="cp-alert-center-unread-pill" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)' }}>
                    {unreadCount} sin leer
                  </span>
                )}
              </div>

              <div className="cp-alert-center-header-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="cp-alert-center-btn-text"
                    onClick={onMarkAllAsRead}
                  >
                    Marcar leídas
                  </button>
                )}
                <button
                  type="button"
                  className="cp-alert-center-close-btn"
                  onClick={onClose}
                  title="Cerrar panel de alertas"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Toolbar: Sonido y Permisos */}
            <div className="cp-alert-toolbar">
              <div className="cp-alert-toolbar-left">
                <button
                  type="button"
                  className={`cp-sound-toggle-btn ${!soundActive ? 'cp-sound-toggle-btn--off' : ''}`}
                  onClick={toggleSound}
                  title="Activar / Silenciar alertas sonoras"
                >
                  <span>{soundActive ? '🔊 Sonido: ON' : '🔇 Sonido: OFF'}</span>
                </button>

                <button
                  type="button"
                  className="cp-test-sound-btn"
                  title="Probar sonido de alerta de repartidor"
                  onClick={() => playRepartidorAsignadoSound()}
                >
                  🛵 Probar sonido
                </button>
              </div>

              {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
                <button
                  type="button"
                  className="cp-notif-perm-btn"
                  onClick={handleRequestPerm}
                  title="Permite recibir avisos aunque no tengas la pestaña abierta"
                >
                  🖥️ Activar aviso escritorio
                </button>
              )}
            </div>

            {/* Filtros */}
            <div className="cp-alert-filters">
              <button
                type="button"
                className={`cp-alert-filter-pill ${filter === 'todos' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('todos')}
              >
                Todas ({(notifications || []).filter((n) => n.unread).length})
              </button>
              <button
                type="button"
                className={`cp-alert-filter-pill ${filter === 'repartidor' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('repartidor')}
              >
                Repartidores ({(notifications || []).filter((n) => n.unread && n.tipo === 'repartidor').length})
              </button>
              <button
                type="button"
                className={`cp-alert-filter-pill ${filter === 'en_camino' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('en_camino')}
              >
                En Camino ({(notifications || []).filter((n) => n.unread && n.tipo === 'en_camino').length})
              </button>
              <button
                type="button"
                className={`cp-alert-filter-pill ${filter === 'entregado' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('entregado')}
              >
                Entregados ({(notifications || []).filter((n) => n.unread && n.tipo === 'entregado').length})
              </button>
            </div>

            {/* Lista de Alertas */}
            <div className="cp-alert-list">
              {filteredNotifs.length === 0 ? (
                <div className="cp-alert-empty">
                  <div className="cp-alert-empty-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                    <CheckCircle2 size={32} strokeWidth={2} className="cp-alert-empty-icon" />
                  </div>
                  <p>¡No hay alertas pendientes!</p>
                  <span style={{ fontSize: '0.78rem' }}>
                    Todas las alertas han sido leídas. Cuando un repartidor tome tu pedido o esté en camino, aparecerá aquí inmediatamente.
                  </span>
                </div>
              ) : (
                filteredNotifs.map((item) => {
                  const isRep = item.tipo === 'repartidor';
                  const isCamino = item.tipo === 'en_camino';
                  const isEntregado = item.tipo === 'entregado';

                  return (
                    <div
                      key={item.id}
                      className={`cp-alert-item ${isRep ? 'cp-alert-item--nuevo' : isCamino ? 'cp-alert-item--nuevo' : 'cp-alert-item--entregado'} ${item.unread ? 'cp-alert-item--unread' : ''}`}
                      onClick={() => {
                        onMarkItemAsRead?.(item.orderId, item.tipo);
                        onGoToTracking?.(item.orderId);
                        onClose();
                      }}
                    >
                      <div className="cp-alert-item-icon">
                        <span>{isRep ? '🛵' : isCamino ? '🏍️' : '✅'}</span>
                      </div>

                      <div className="cp-alert-item-content">
                        <div className="cp-alert-item-top">
                          <h5 className="cp-alert-item-title">
                            {item.unread && <span className="cp-alert-unread-dot" style={{ background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />}
                            {item.title}
                          </h5>
                          <span className="cp-alert-item-time">
                            {formatRelativeTime(item.timestamp)}
                          </span>
                        </div>

                        <p className="cp-alert-item-desc">{item.desc}</p>

                        <div className="cp-alert-item-footer">
                          {item.total !== undefined && item.total !== null ? (
                            <span className="cp-alert-item-total">
                              ${Number(item.total).toFixed(2)} USD
                            </span>
                          ) : (
                            <span />
                          )}
                          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                            {onMarkItemAsRead && (
                              <button
                                type="button"
                                className="cp-alert-item-btn-read"
                                title="Marcar como leída"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMarkItemAsRead(item.orderId, item.tipo);
                                }}
                              >
                                ✓ Leída
                              </button>
                            )}
                            <span className="cp-alert-item-cta" style={{ color: '#38bdf8' }}>
                              Ver Rastreo →
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="cp-alert-center-footer">
              <span className="cp-alert-center-tip">
                ⚡ Sincronización en tiempo real activa
              </span>
              {(notifications || []).length > 0 && (
                <button
                  type="button"
                  className="cp-alert-center-clear-btn"
                  onClick={onClearHistory}
                >
                  Limpiar historial
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Componente principal: Administra la detección en tiempo real de asignación de repartidores para el cliente
 */
export default function ClienteAlertas({ session, rol, onGoToTracking }) {
  const [toasts, setToasts] = useState([]);
  const initialCheckDoneRef = useRef(false);
  const knownRepMapRef = useRef(new Map());

  // Solicitar permiso de notificaciones en escritorio discretamente
  useEffect(() => {
    if (session?.user?.id && rol === 'cliente') {
      requestDesktopNotificationPermission().catch(() => {});
    }
  }, [session, rol]);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const triggerAlert = async (orderId, repartidorId, rawData = null) => {
    if (!orderId) return;
    const alertKey = `${orderId}-${repartidorId || 'rep'}`;
    // Si ya fue alertado previamente o ya fue leído, NO repetir
    if (hasClientBeenAlerted(alertKey, 'repartidor') || isClientOrderRead(orderId, 'repartidor')) return;

    // Marcar INMEDIATAMENTE como alertado para evitar repetición por polling o eventos concurrentes
    markClientAlerted(alertKey, 'repartidor');

    // Obtener detalles completos del pedido, repartidor y comercio
    let orderData = rawData;
    if (!orderData || !orderData.repartidores_datos || !orderData.comercios_datos) {
      try {
        const { data } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
            comercios_datos ( id, nombre_comercial, logo_url ),
            repartidores_datos (
              id, vehiculo, placa,
              profiles ( nombre_completo, telefono )
            )
          `)
          .eq('id', orderId)
          .maybeSingle();

        if (data) orderData = data;
      } catch (err) {
        console.warn('Error obteniendo datos completos del pedido asignado:', err);
      }
    }

    const shortId = orderId ? orderId.slice(0, 8) : '--------';
    const repNombre = orderData?.repartidores_datos?.profiles?.nombre_completo || 'Repartidor Levant';
    const vehiculo = orderData?.repartidores_datos?.vehiculo || 'Vehículo';
    const placa = orderData?.repartidores_datos?.placa || '';
    const comercioNombre = orderData?.comercios_datos?.nombre_comercial || '';

    // 1. Sonido de alta fidelidad una sola vez
    playRepartidorAsignadoSound();

    // 2. Notificación del sistema / escritorio
    showDesktopNotification('🛵 ¡Repartidor Asignado a tu Pedido!', {
      body: `Tu pedido #${shortId} ${comercioNombre ? `de ${comercioNombre} ` : ''}ha sido asignado a ${repNombre} (${vehiculo}).`,
      tag: `rep-asig-${orderId}`,
      onClick: () => onGoToTracking?.(orderId),
    });

    // 3. Agregar Toast interactivo en pantalla (evitando duplicar el mismo orderId)
    const newToast = {
      id: `toast-rep-${orderId}-${Date.now()}`,
      orderId,
      shortId,
      repartidorNombre: repNombre,
      vehiculo,
      placa,
      comercioNombre,
      timestamp: new Date().toISOString(),
    };

    setToasts((prev) => {
      // Si ya hay un toast para esta orden en pantalla, no duplicarlo
      if (prev.some((t) => t.orderId === orderId)) return prev;
      return [newToast, ...prev.slice(0, 1)];
    });

    // 4. Disparar evento global para que el Dashboard u otras vistas se enteren al instante
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('levant_repartidor_asignado', {
          detail: { orderId, repartidorId, orderData },
        })
      );
    }

    // Auto-descartar después de 14 segundos
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 14000);
  };

  useEffect(() => {
    if (!session?.user?.id || rol !== 'cliente') return;

    let isMounted = true;
    const userId = session.user.id;

    // Inicializar mapa de pedidos activos y verificar asignaciones recientes
    async function initCheck() {
      try {
        const { data, error } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
            comercios_datos ( id, nombre_comercial, logo_url ),
            repartidores_datos (
              id, vehiculo, placa,
              profiles ( nombre_completo, telefono )
            )
          `)
          .eq('cliente_id', userId)
          .neq('estado', 'cancelado')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!isMounted || error || !data) return;

        data.forEach((p) => {
          if (p.repartidor_id) {
            knownRepMapRef.current.set(p.id, p.repartidor_id);
            // Marcar pedidos que ya tenían repartidor al abrir como alertados para no repetir sonido/toasts
            markClientAlerted(`${p.id}-${p.repartidor_id}`, 'repartidor');
          }
        });

        initialCheckDoneRef.current = true;
      } catch (e) {
        console.warn('Error en chequeo inicial de repartidores asignados:', e);
      }
    }

    initCheck();

    // ── Canal en Tiempo Real con Supabase Realtime ────────────────────
    const channel = supabase
      .channel(`cliente-repartidor-asignado-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos_entregas',
          filter: `cliente_id=eq.${userId}`,
        },
        async (payload) => {
          if (!isMounted || !payload.new) return;
          const newRow = payload.new;
          const prevRep = knownRepMapRef.current.get(newRow.id);

          // Si ahora tiene repartidor_id y antes no tenía o cambió:
          if (newRow.repartidor_id && newRow.repartidor_id !== prevRep) {
            knownRepMapRef.current.set(newRow.id, newRow.repartidor_id);
            const alertKey = `${newRow.id}-${newRow.repartidor_id}`;
            if (!hasClientBeenAlerted(alertKey, 'repartidor') && !isClientOrderRead(newRow.id, 'repartidor')) {
              triggerAlert(newRow.id, newRow.repartidor_id);
            }
          }
        }
      )
      .subscribe();

    // ── Sondeo de respaldo periódico (cada 6 segundos) ────────────────
    const interval = setInterval(async () => {
      if (!isMounted || !initialCheckDoneRef.current) return;
      try {
        const { data } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, direccion_entrega, created_at, updated_at, repartidor_id,
            comercios_datos ( id, nombre_comercial, logo_url ),
            repartidores_datos (
              id, vehiculo, placa,
              profiles ( nombre_completo, telefono )
            )
          `)
          .eq('cliente_id', userId)
          .neq('estado', 'cancelado')
          .neq('estado', 'entregado')
          .not('repartidor_id', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(5);

        if (!isMounted || !data) return;

        for (const p of data) {
          if (p.repartidor_id) {
            const prevRep = knownRepMapRef.current.get(p.id);
            const alertKey = `${p.id}-${p.repartidor_id}`;
            // Registrar siempre en knownRepMapRef para no repetir en el próximo ciclo
            knownRepMapRef.current.set(p.id, p.repartidor_id);

            // SOLO disparar si es un repartidor nuevo y NO ha sido alertado
            if (prevRep !== p.repartidor_id && !hasClientBeenAlerted(alertKey, 'repartidor') && !isClientOrderRead(p.id, 'repartidor')) {
              triggerAlert(p.id, p.repartidor_id, p);
            }
          }
        }
      } catch (err) {
        console.warn('Error en sondeo de repartidor asignado:', err);
      }
    }, 6000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, rol]);

  if (toasts.length === 0) return null;

  return (
    <ClienteAlertToasts
      toasts={toasts}
      onDismiss={dismissToast}
      onGoToTracking={onGoToTracking}
    />
  );
}
