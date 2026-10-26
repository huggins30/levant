import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Bell, BellRing, CheckCircle2 } from 'lucide-react';
import {
  playRepartidorPedidoAsignadoSound,
  playRepartidorValoracionSound,
  showDesktopNotification,
  requestDesktopNotificationPermission,
  isRepartidorSoundEnabled,
  setRepartidorSoundEnabled
} from './repartidorAlertSound';
import { sendNativeNotification } from '../../lib/nativeNotifications';
import '../comercio/ComercioAlertas.css';
import './RepartidorAlertas.css';

/**
 * ── Gestión centralizada de pedidos leídos y alertados por el Repartidor ──────────
 */
const alertedInMemory = new Set();

export function hasRepartidorBeenAlerted(orderId, tipo = 'asignado') {
  if (!orderId) return true;
  const key = `${orderId}-${tipo}`;
  if (alertedInMemory.has(key)) return true;
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('levant_rep_alerted_keys');
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

export function markRepartidorAlerted(orderId, tipo = 'asignado') {
  if (!orderId) return;
  const key = `${orderId}-${tipo}`;
  alertedInMemory.add(key);
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('levant_rep_alerted_keys');
      const set = new Set(raw ? JSON.parse(raw) : []);
      set.add(key);
      sessionStorage.setItem('levant_rep_alerted_keys', JSON.stringify([...set]));
    } catch {
      // ignore
    }
  }
}

export function getRepartidorReadOrderIds() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('levant_repartidor_read_order_ids');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function isRepartidorOrderRead(orderId, tipo = 'asignado') {
  if (!orderId) return true;
  const readIds = getRepartidorReadOrderIds();
  const key = `${orderId}-${tipo}`;
  return readIds.has(key);
}

export function markRepartidorOrderAsRead(orderId, tipo = 'asignado') {
  if (!orderId || typeof window === 'undefined') return;
  try {
    const readIds = getRepartidorReadOrderIds();
    readIds.add(`${orderId}-${tipo}`);
    localStorage.setItem('levant_repartidor_read_order_ids', JSON.stringify([...readIds]));
    markRepartidorAlerted(orderId, tipo);
    window.dispatchEvent(new CustomEvent('levant_repartidor_read_orders_updated', { detail: { orderId, tipo } }));
  } catch (err) {
    console.warn('Error al guardar alerta de repartidor como leída:', err);
  }
}

export function markAllRepartidorOrdersAsRead(notifications = []) {
  if (typeof window === 'undefined') return;
  try {
    const readIds = getRepartidorReadOrderIds();
    notifications.forEach((n) => {
      if (n.orderId) {
        const t = n.tipo || 'asignado';
        readIds.add(`${n.orderId}-${t}`);
        markRepartidorAlerted(n.orderId, t);
      }
    });
    localStorage.setItem('levant_repartidor_read_order_ids', JSON.stringify([...readIds]));
    window.dispatchEvent(new CustomEvent('levant_repartidor_read_orders_updated'));
  } catch (err) {
    console.warn('Error al marcar todas las alertas de repartidor como leídas:', err);
  }
}

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
 * Componente Toasts Flotantes para Repartidor
 */
export function RepartidorAlertToasts({ toasts, onDismiss, onGoToPedidos, onGoToHistorial }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="ra-toasts-container" aria-live="polite">
      {toasts.map((toast) => {
        const isVal = toast.tipo === 'valoracion';

        return (
          <div
            key={toast.id}
            className={`ra-toast ${isVal ? 'ra-toast--valoracion' : 'ra-toast--pedido'}`}
            role="alert"
          >
            <div className="ra-toast-top-glow" />
            <div className="ra-toast-main">
              <div className="ra-toast-icon-wrap">
                <span className="ra-toast-pulse" />
                <span>{isVal ? '⭐' : '🛵'}</span>
              </div>

              <div className="ra-toast-content">
                <div className="ra-toast-meta">
                  <span className="ra-toast-badge">
                    {isVal ? 'Nueva Valoración' : 'Pedido Asignado'}
                  </span>
                  <button
                    type="button"
                    className="ra-toast-close"
                    onClick={() => onDismiss(toast.id)}
                    title="Cerrar alerta"
                    aria-label="Cerrar alerta"
                  >
                    ✕
                  </button>
                </div>

                <h4 className="ra-toast-title">
                  {isVal ? '¡Recibiste una valoración de cliente!' : '¡Se te ha asignado un nuevo pedido!'}
                </h4>

                <p className="ra-toast-desc">{toast.desc}</p>

                {isVal && toast.stars && (
                  <div className="ra-toast-stars-box">
                    <span>{'★'.repeat(toast.stars)}{'☆'.repeat(Math.max(0, 5 - toast.stars))}</span>
                    <strong>{toast.stars}.0 / 5.0</strong>
                  </div>
                )}

                <div className="ra-toast-actions">
                  <button
                    type="button"
                    className="ra-toast-btn-primary"
                    onClick={() => {
                      onDismiss(toast.id);
                      if (isVal) {
                        onGoToHistorial?.();
                      } else {
                        onGoToPedidos?.(toast.orderId);
                      }
                    }}
                  >
                    <span>{isVal ? '⭐ Ver Valoraciones' : '📦 Ver Pedidos Asignados'}</span>
                  </button>
                  <button
                    type="button"
                    className="ra-toast-btn-secondary"
                    onClick={() => onDismiss(toast.id)}
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ── Campana y Centro Desplegable de Alertas para Repartidor ───────────
 */
export function RepartidorAlertCenter({
  notifications = [],
  unreadCount = 0,
  isOpen = false,
  onToggleOpen,
  onClose,
  onMarkAllAsRead,
  onMarkItemAsRead,
  onClearHistory,
  onGoToPedidos,
  onGoToHistorial,
}) {
  const [filter, setFilter] = useState('todos'); // 'todos' | 'asignado' | 'valoracion'
  const [soundActive, setSoundActive] = useState(isRepartidorSoundEnabled());
  const [notifPerm, setNotifPerm] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    setSoundActive(isRepartidorSoundEnabled());
  }, [isOpen]);

  const toggleSound = () => {
    const next = !soundActive;
    setRepartidorSoundEnabled(next);
    setSoundActive(next);
    if (next) {
      playRepartidorPedidoAsignadoSound();
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
      {/* Botón de Campana en el encabezado de Repartidor */}
      <button
        type="button"
        id="rp-bell-button"
        className={`cp-bell-btn ${isOpen ? 'cp-bell-btn--active' : ''} ${unreadCount > 0 ? 'cp-bell-btn--has-unread' : ''}`}
        title={unreadCount > 0 ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer` : 'Centro de alertas de repartidor'}
        onClick={onToggleOpen}
        aria-label="Alertas de repartidor"
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
                <div className="cp-alert-title-icon-box" style={{ background: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                  <BellRing size={18} strokeWidth={2.2} className="cp-alert-title-icon" style={{ color: '#fbbf24' }} />
                </div>
                <h3>Alertas de Repartidor</h3>
                {unreadCount > 0 && (
                  <span className="cp-alert-center-unread-pill" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
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
                  title="Probar sonido de pedido asignado"
                  onClick={() => playRepartidorPedidoAsignadoSound()}
                >
                  🛵 Pedido
                </button>

                <button
                  type="button"
                  className="cp-test-sound-btn"
                  title="Probar sonido de valoración"
                  onClick={() => playRepartidorValoracionSound()}
                >
                  ⭐ Valoración
                </button>
              </div>

              {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
                <button
                  type="button"
                  className="cp-notif-perm-btn"
                  onClick={handleRequestPerm}
                  title="Permite recibir avisos aunque tengas la ventana minimizada"
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
                className={`cp-alert-filter-pill ${filter === 'asignado' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('asignado')}
              >
                Pedidos Asignados ({(notifications || []).filter((n) => n.unread && n.tipo === 'asignado').length})
              </button>
              <button
                type="button"
                className={`cp-alert-filter-pill ${filter === 'valoracion' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('valoracion')}
              >
                Valoraciones ({(notifications || []).filter((n) => n.unread && n.tipo === 'valoracion').length})
              </button>
            </div>

            {/* Lista de Alertas */}
            <div className="cp-alert-list">
              {filteredNotifs.length === 0 ? (
                <div className="cp-alert-empty">
                  <div className="cp-alert-empty-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}>
                    <CheckCircle2 size={32} strokeWidth={2} className="cp-alert-empty-icon" />
                  </div>
                  <p>¡No hay alertas pendientes!</p>
                  <span style={{ fontSize: '0.78rem' }}>
                    Cuando se te asigne un pedido o un cliente te califique, se te notificará aquí con sonido y alerta en tiempo real.
                  </span>
                </div>
              ) : (
                filteredNotifs.map((item) => {
                  const isVal = item.tipo === 'valoracion';

                  return (
                    <div
                      key={item.id}
                      className={`cp-alert-item ${isVal ? 'cp-alert-item--entregado' : 'cp-alert-item--nuevo'} ${item.unread ? 'cp-alert-item--unread' : ''}`}
                      onClick={() => {
                        onMarkItemAsRead?.(item.orderId, item.tipo);
                        if (isVal) {
                          onGoToHistorial?.();
                        } else {
                          onGoToPedidos?.(item.orderId);
                        }
                        onClose();
                      }}
                    >
                      <div className="cp-alert-item-icon">
                        <span>{isVal ? '⭐' : '🛵'}</span>
                      </div>

                      <div className="cp-alert-item-content">
                        <div className="cp-alert-item-top">
                          <h5 className="cp-alert-item-title">
                            {item.unread && <span className="cp-alert-unread-dot" style={{ background: isVal ? '#fbbf24' : '#38bdf8', boxShadow: `0 0 8px ${isVal ? '#fbbf24' : '#38bdf8'}` }} />}
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
                          ) : item.stars ? (
                            <span className="cp-alert-item-total" style={{ color: '#fbbf24' }}>
                              {'★'.repeat(item.stars)} ({item.stars}.0)
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
                            <span className="cp-alert-item-cta" style={{ color: isVal ? '#fbbf24' : '#38bdf8' }}>
                              {isVal ? 'Ver Historial →' : 'Ver Pedido →'}
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
                ⚡ Monitoreo de carreras y valoraciones activo
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
 * Componente principal: Administra la detección en tiempo real de pedidos asignados y valoraciones recibidas para Repartidor
 */
export default function RepartidorAlertas({ session, rol, onGoToPedidos, onGoToHistorial }) {
  const [toasts, setToasts] = useState([]);
  const repIdRef = useRef(null);
  const knownOrdersMapRef = useRef(new Map()); // id -> { assigned: bool, valoracion: number }
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    if (session?.user?.id && rol === 'repartidor') {
      requestDesktopNotificationPermission().catch(() => {});
    }
  }, [session, rol]);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const triggerAsignadoAlert = async (orderId, rawData = null) => {
    if (!orderId) return;
    // Si ya fue alertado previamente o ya fue leído, NO repetir
    if (hasRepartidorBeenAlerted(orderId, 'asignado') || isRepartidorOrderRead(orderId, 'asignado')) return;

    // Marcar INMEDIATAMENTE como alertado para evitar repetición por polling o eventos concurrentes
    markRepartidorAlerted(orderId, 'asignado');

    let orderData = rawData;
    if (!orderData || !orderData.comercios_datos) {
      try {
        const { data } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, direccion_entrega, created_at, updated_at,
            comercios_datos ( id, nombre_comercial, direccion ),
            profiles!pedidos_entregas_cliente_id_fkey ( id, nombre_completo, telefono )
          `)
          .eq('id', orderId)
          .maybeSingle();

        if (data) orderData = data;
      } catch (e) {
        console.warn('Error obteniendo orden asignada:', e);
      }
    }

    const shortId = orderId ? orderId.slice(0, 8) : '--------';
    const comercio = orderData?.comercios_datos?.nombre_comercial || 'Comercio';
    const direccion = orderData?.direccion_entrega || 'Dirección de entrega';
    const cliente = orderData?.profiles?.nombre_completo || 'Cliente';

    // 1. Sonido vibrante una sola vez
    playRepartidorPedidoAsignadoSound();

    // 2. Notificación en escritorio y APK nativa Android
    showDesktopNotification('🛵 ¡Nuevo Pedido Asignado!', {
      body: `Pedido #${shortId} de ${comercio} para ${cliente}. Entrega: ${direccion}`,
      tag: `rep-asignado-${orderId}`,
      onClick: () => onGoToPedidos?.(orderId),
    });

    sendNativeNotification({
      id: orderId,
      title: '🛵 ¡Nuevo Pedido Asignado!',
      body: `Pedido #${shortId} de ${comercio} para ${cliente}. Entrega: ${direccion}`,
      data: { orderId },
    });

    // 3. Toast en UI
    const newToast = {
      id: `toast-rep-asig-${orderId}-${Date.now()}`,
      orderId,
      tipo: 'asignado',
      shortId,
      comercio,
      direccion,
      total: orderData?.total_usd,
      desc: `Comercio: ${comercio} · Destino: ${direccion}`,
      timestamp: new Date().toISOString(),
    };

    setToasts((prev) => [newToast, ...prev.slice(0, 2)]);

    // 4. Emitir evento global
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('levant_repartidor_alert_event', {
          detail: { tipo: 'asignado', orderId, orderData },
        })
      );
    }

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 14000);
  };

  const triggerValoracionAlert = async (orderId, stars, rawData = null) => {
    if (!orderId) return;
    // Si ya fue alertado previamente o ya fue leído, NO repetir
    if (hasRepartidorBeenAlerted(orderId, 'valoracion') || isRepartidorOrderRead(orderId, 'valoracion')) return;

    // Marcar INMEDIATAMENTE como alertado
    markRepartidorAlerted(orderId, 'valoracion');

    let orderData = rawData;
    if (!orderData || !orderData.profiles) {
      try {
        const { data } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, total_usd, valoracion, comentario, updated_at,
            comercios_datos ( nombre_comercial ),
            profiles!pedidos_entregas_cliente_id_fkey ( nombre_completo )
          `)
          .eq('id', orderId)
          .maybeSingle();

        if (data) orderData = data;
      } catch (e) {
        console.warn('Error obteniendo orden valorada:', e);
      }
    }

    const shortId = orderId ? orderId.slice(0, 8) : '--------';
    const cliente = orderData?.profiles?.nombre_completo || 'Un cliente';
    const comment = orderData?.comentario ? ` "${orderData.comentario}"` : '';

    // 1. Sonido de estrellas / triunfo una sola vez
    playRepartidorValoracionSound();

    // 2. Notificación en escritorio
    showDesktopNotification('⭐ ¡Nueva Valoración Recibida!', {
      body: `${cliente} te calificó con ${stars} estrellas en el pedido #${shortId}.${comment}`,
      tag: `rep-valoracion-${orderId}`,
      onClick: () => onGoToHistorial?.(),
    });

    // 3. Toast en UI
    const newToast = {
      id: `toast-rep-val-${orderId}-${Date.now()}`,
      orderId,
      tipo: 'valoracion',
      shortId,
      stars,
      desc: `${cliente} te calificó con ${stars} estrellas.${comment}`,
      timestamp: new Date().toISOString(),
    };

    setToasts((prev) => [newToast, ...prev.slice(0, 2)]);

    // 4. Emitir evento global
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('levant_repartidor_alert_event', {
          detail: { tipo: 'valoracion', orderId, stars, orderData },
        })
      );
    }

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 14000);
  };

  useEffect(() => {
    if (!session?.user?.id || rol !== 'repartidor') return;

    let isMounted = true;
    let activeInterval = null;
    let activeChannel = null;
    let broadcastChannel = null;
    let bc = null;

    // Escuchador de evento CustomEvent en la ventana
    const handleLocalAlert = (e) => {
      if (!isMounted || !e.detail) return;
      const { tipo, orderId, repartidorId, orderData } = e.detail;
      if (repartidorId && repIdRef.current && repartidorId !== repIdRef.current) return;
      if (tipo === 'asignado' || !tipo) {
        triggerAsignadoAlert(orderId, orderData);
      } else if (tipo === 'valoracion') {
        triggerValoracionAlert(orderId, e.detail.stars || 5, orderData);
      }
    };
    window.addEventListener('levant_repartidor_alert_event', handleLocalAlert);
    window.addEventListener('levant_repartidor_asignado_global', handleLocalAlert);

    async function setupRepartidorListener() {
      try {
        // 1. Obtener ID del repartidor
        let { data: rep } = await supabase
          .from('repartidores_datos')
          .select('id')
          .eq('profile_id', session.user.id)
          .maybeSingle();

        if (!rep?.id) {
          const { data: repFallback } = await supabase
            .from('repartidores_datos')
            .select('id')
            .eq('id', session.user.id)
            .maybeSingle();
          if (repFallback?.id) rep = repFallback;
        }

        if (!isMounted || !rep?.id) return;
        repIdRef.current = rep.id;

        // 2. BroadcastChannel para sincronización instantánea entre pestañas del mismo navegador
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            bc = new BroadcastChannel('levant_repartidor_channel');
            bc.onmessage = (evt) => {
              if (!isMounted || !evt.data) return;
              if (evt.data.type === 'pedido_asignado') {
                if (!evt.data.repartidorId || evt.data.repartidorId === rep.id) {
                  triggerAsignadoAlert(evt.data.orderId, evt.data.orderData);
                }
              }
            };
          } catch {
            // ignore
          }
        }

        // 3. Carga inicial de órdenes para alimentar estado conocido
        const { data: initialOrders } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, valoracion, comentario, updated_at, created_at, direccion_entrega,
            comercios_datos ( id, nombre_comercial, direccion ),
            profiles!pedidos_entregas_cliente_id_fkey ( id, nombre_completo, telefono )
          `)
          .eq('repartidor_id', rep.id)
          .neq('estado', 'cancelado')
          .order('created_at', { ascending: false })
          .limit(20);

        if (!isMounted) return;

        if (initialOrders) {
          initialOrders.forEach((o) => {
            knownOrdersMapRef.current.set(o.id, {
              estado: o.estado,
              valoracion: o.valoracion,
            });

            // Si ya fue leído en localStorage o ya fue finalizado, marcarlo como alertado
            if (isRepartidorOrderRead(o.id, 'asignado') || o.estado === 'entregado') {
              markRepartidorAlerted(o.id, 'asignado');
            } else {
              // Es un pedido asignado activo y no leído: si no se ha alertado aún en esta sesión, disparar alerta
              if (!hasRepartidorBeenAlerted(o.id, 'asignado')) {
                triggerAsignadoAlert(o.id, o);
              }
            }

            if (o.valoracion) {
              if (isRepartidorOrderRead(o.id, 'valoracion')) {
                markRepartidorAlerted(o.id, 'valoracion');
              }
            }
          });
        }

        initialLoadedRef.current = true;

        // 4. Canal Realtime con Supabase (cambios en tabla pedidos_entregas)
        activeChannel = supabase
          .channel(`repartidor-alerts-${rep.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pedidos_entregas',
            },
            async (payload) => {
              if (!isMounted || !payload.new) return;
              const newRow = payload.new;

              // Comprobar si pertenece a este repartidor
              if (newRow.repartidor_id === rep.id) {
                const prev = knownOrdersMapRef.current.get(newRow.id);

                if (!prev && newRow.estado !== 'cancelado') {
                  knownOrdersMapRef.current.set(newRow.id, {
                    estado: newRow.estado,
                    valoracion: newRow.valoracion,
                  });
                  triggerAsignadoAlert(newRow.id, newRow);
                } else if (prev) {
                  // Si no había sido alertado o cambió de asignación
                  if (!hasRepartidorBeenAlerted(newRow.id, 'asignado') && newRow.estado !== 'cancelado' && newRow.estado !== 'entregado') {
                    triggerAsignadoAlert(newRow.id, newRow);
                  }
                  if (newRow.valoracion && newRow.valoracion !== prev.valoracion) {
                    prev.valoracion = newRow.valoracion;
                    triggerValoracionAlert(newRow.id, newRow.valoracion, newRow);
                  }
                  prev.estado = newRow.estado;
                }
              }
            }
          )
          .subscribe();

        // 5. Canal Broadcast dedicado de Supabase Realtime (garantía de entrega sin depender de WAL)
        broadcastChannel = supabase
          .channel(`rep-broadcast-${rep.id}`)
          .on('broadcast', { event: 'pedido_asignado' }, (payload) => {
            if (!isMounted || !payload.payload) return;
            const { orderId, orderData } = payload.payload;
            triggerAsignadoAlert(orderId, orderData);
          })
          .subscribe();

        // 6. Sondeo rápido de respaldo inteligente cada 3.5 segundos
        activeInterval = setInterval(async () => {
          if (!isMounted || !repIdRef.current || !initialLoadedRef.current) return;
          try {
            const { data: latest } = await supabase
              .from('pedidos_entregas')
              .select(`
                id, estado, total_usd, valoracion, comentario, updated_at, created_at, direccion_entrega,
                comercios_datos ( id, nombre_comercial, direccion ),
                profiles!pedidos_entregas_cliente_id_fkey ( id, nombre_completo, telefono )
              `)
              .eq('repartidor_id', repIdRef.current)
              .neq('estado', 'cancelado')
              .order('updated_at', { ascending: false })
              .limit(10);

            if (!isMounted || !latest) return;

            for (const o of latest) {
              const prev = knownOrdersMapRef.current.get(o.id);
              if (!prev) {
                knownOrdersMapRef.current.set(o.id, { estado: o.estado, valoracion: o.valoracion });
                if (o.estado !== 'entregado' && !hasRepartidorBeenAlerted(o.id, 'asignado') && !isRepartidorOrderRead(o.id, 'asignado')) {
                  triggerAsignadoAlert(o.id, o);
                }
                if (o.valoracion && !hasRepartidorBeenAlerted(o.id, 'valoracion') && !isRepartidorOrderRead(o.id, 'valoracion')) {
                  triggerValoracionAlert(o.id, o.valoracion, o);
                }
              } else {
                if (o.estado !== 'entregado' && !hasRepartidorBeenAlerted(o.id, 'asignado') && !isRepartidorOrderRead(o.id, 'asignado')) {
                  triggerAsignadoAlert(o.id, o);
                }
                if (o.valoracion && o.valoracion !== prev.valoracion && !hasRepartidorBeenAlerted(o.id, 'valoracion') && !isRepartidorOrderRead(o.id, 'valoracion')) {
                  prev.valoracion = o.valoracion;
                  triggerValoracionAlert(o.id, o.valoracion, o);
                }
                prev.estado = o.estado;
              }
            }
          } catch (e) {
            console.warn('Error en sondeo de repartidor:', e);
          }
        }, 3500);
      } catch (err) {
        console.warn('Error en setupRepartidorListener:', err);
      }
    }

    setupRepartidorListener();

    return () => {
      isMounted = false;
      window.removeEventListener('levant_repartidor_alert_event', handleLocalAlert);
      window.removeEventListener('levant_repartidor_asignado_global', handleLocalAlert);
      if (activeInterval) clearInterval(activeInterval);
      if (activeChannel) supabase.removeChannel(activeChannel);
      if (broadcastChannel) supabase.removeChannel(broadcastChannel);
      if (bc) {
        try { bc.close(); } catch { /* noop */ }
      }
    };
  }, [session?.user?.id, rol]);

  if (toasts.length === 0) return null;

  return (
    <RepartidorAlertToasts
      toasts={toasts}
      onDismiss={dismissToast}
      onGoToPedidos={onGoToPedidos}
      onGoToHistorial={onGoToHistorial}
    />
  );
}

/**
 * ── Emisor centralizado de alertas para Repartidores ───────────────────
 * Se invoca cuando un comercio asigna un repartidor (manual o automático).
 * Dispara transmisión instantánea en 3 vías: BroadcastChannel, CustomEvent y Supabase Realtime Broadcast.
 */
export async function notifyRepartidorAsignado({ orderId, repartidorId, orderData = null }) {
  if (!orderId || !repartidorId) return;

  const payload = {
    orderId,
    repartidorId,
    orderData,
    tipo: 'asignado',
    timestamp: new Date().toISOString()
  };

  // 1. Cross-tab instantáneo vía BroadcastChannel
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('levant_repartidor_channel');
      bc.postMessage({ type: 'pedido_asignado', ...payload });
      bc.close();
    } catch {
      // ignore
    }
  }

  // 2. CustomEvent en la ventana actual
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('levant_repartidor_alert_event', {
        detail: { tipo: 'asignado', orderId, repartidorId, orderData }
      })
    );
    window.dispatchEvent(
      new CustomEvent('levant_repartidor_asignado_global', {
        detail: { orderId, repartidorId, orderData }
      })
    );
  }

  // 3. Supabase Realtime Broadcast a través de internet/dispositivos remotos
  try {
    const channel = supabase.channel(`rep-broadcast-${repartidorId}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'pedido_asignado',
          payload
        }).then(() => {
          setTimeout(() => {
            try { supabase.removeChannel(channel); } catch { /* noop */ }
          }, 2500);
        }).catch(() => {
          try { supabase.removeChannel(channel); } catch { /* noop */ }
        });
      }
    });
  } catch (err) {
    console.warn('Error enviando broadcast realtime a repartidor:', err);
  }
}
