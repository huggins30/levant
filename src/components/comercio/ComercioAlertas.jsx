import { useState, useEffect } from 'react';
import { Bell, BellRing, CheckCircle2 } from 'lucide-react';
import {
  isSoundEnabled,
  setSoundEnabled,
  testSound,
  requestDesktopNotificationPermission
} from './comercioAlertSound';
import './ComercioAlertas.css';

/**
 * ── Gestión centralizada de pedidos leídos y alertados para Comercio ──
 */
const alertedComercioInMemory = new Set();

export function hasComercioBeenAlerted(orderId, tipo = 'nuevo') {
  if (!orderId) return true;
  const key = `${orderId}-${tipo}`;
  if (alertedComercioInMemory.has(key)) return true;
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('levant_comercio_alerted_keys');
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

export function markComercioAlerted(orderId, tipo = 'nuevo') {
  if (!orderId) return;
  const key = `${orderId}-${tipo}`;
  alertedComercioInMemory.add(key);
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('levant_comercio_alerted_keys');
      const set = new Set(raw ? JSON.parse(raw) : []);
      set.add(key);
      sessionStorage.setItem('levant_comercio_alerted_keys', JSON.stringify([...set]));
    } catch {
      // ignore
    }
  }
}

export function getReadOrderIds() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('levant_read_order_ids');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function isOrderRead(orderId, tipo = 'nuevo') {
  if (!orderId) return true;
  const readIds = getReadOrderIds();
  const key = tipo === 'entregado' ? `${orderId}-entregado` : orderId;
  return readIds.has(key);
}

export function markOrderAsRead(orderId, tipo = 'nuevo') {
  if (!orderId || typeof window === 'undefined') return;
  try {
    const readIds = getReadOrderIds();
    const key = tipo === 'entregado' ? `${orderId}-entregado` : orderId;
    readIds.add(key);
    if (tipo === 'nuevo') readIds.add(orderId);
    localStorage.setItem('levant_read_order_ids', JSON.stringify([...readIds]));
    markComercioAlerted(orderId, tipo);
    window.dispatchEvent(new CustomEvent('levant_read_orders_updated', { detail: { orderId, tipo } }));
  } catch (err) {
    console.warn('Error al guardar pedido como leído:', err);
  }
}

export function markAllOrdersAsRead(notifications = []) {
  if (typeof window === 'undefined') return;
  try {
    const readIds = getReadOrderIds();
    notifications.forEach((n) => {
      if (n.orderId) {
        const t = n.tipo || 'nuevo';
        readIds.add(n.orderId);
        if (t === 'entregado') readIds.add(`${n.orderId}-entregado`);
        markComercioAlerted(n.orderId, t);
      }
    });
    localStorage.setItem('levant_read_order_ids', JSON.stringify([...readIds]));
    window.dispatchEvent(new CustomEvent('levant_read_orders_updated'));
  } catch (err) {
    console.warn('Error al marcar todas las órdenes como leídas:', err);
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
 * Componente de Toasts Flotantes Superpuestos
 */
export function ComercioAlertToasts({ toasts, onDismiss, onViewOrder }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="cp-toasts-container" aria-live="polite">
      {toasts.map((toast) => {
        const isNuevo = toast.tipo === 'nuevo';
        return (
          <div
            key={toast.id}
            className={`cp-toast ${isNuevo ? 'cp-toast--nuevo' : 'cp-toast--entregado'}`}
            role="alert"
          >
            <div className="cp-toast-main">
              <div className="cp-toast-icon-wrap">
                <span className="cp-toast-pulse-ring" />
                <span>{isNuevo ? '🛍️' : '✅'}</span>
              </div>

              <div className="cp-toast-body">
                <div className="cp-toast-header">
                  <span className="cp-toast-badge">
                    {isNuevo ? 'Nuevo Pedido' : 'Pedido Entregado'}
                  </span>
                  <span className="cp-toast-time">{formatRelativeTime(toast.timestamp)}</span>
                </div>

                <h4 className="cp-toast-title">
                  {toast.title || (isNuevo ? '¡Nuevo pedido recibido!' : '¡Pedido entregado con éxito!')}
                </h4>

                <p className="cp-toast-desc">{toast.desc}</p>

                {toast.total !== undefined && toast.total !== null && (
                  <span className="cp-toast-amount">${Number(toast.total).toFixed(2)} USD</span>
                )}
              </div>

              <button
                type="button"
                className="cp-toast-close"
                title="Cerrar y marcar como leído"
                onClick={() => onDismiss(toast.id, toast.orderId, toast.tipo)}
              >
                ✕
              </button>
            </div>

            <div className="cp-toast-actions">
              <button
                type="button"
                className="cp-toast-btn-dismiss"
                onClick={() => onDismiss(toast.id, toast.orderId, toast.tipo)}
              >
                Descartar
              </button>
              <button
                type="button"
                className="cp-toast-btn-view"
                onClick={() => {
                  onViewOrder(toast.pedido, toast.orderId, toast.tipo);
                  onDismiss(toast.id, toast.orderId, toast.tipo);
                }}
              >
                <span>👉 Ver Pedido</span>
              </button>
            </div>

            <div className="cp-toast-progress-track">
              <div className="cp-toast-progress-bar" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Componente: Botón de Campana y Centro Desplegable de Notificaciones
 */
export function ComercioAlertCenter({
  notifications,
  unreadCount,
  isOpen,
  onToggleOpen,
  onClose,
  onMarkAllAsRead,
  onMarkItemAsRead,
  onClearHistory,
  onViewOrder,
}) {
  const [filter, setFilter] = useState('todos'); // 'todos' | 'nuevo' | 'entregado'
  const [soundActive, setSoundActive] = useState(isSoundEnabled());
  const [notifPerm, setNotifPerm] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    setSoundActive(isSoundEnabled());
  }, [isOpen]);

  const toggleSound = () => {
    const next = !soundActive;
    setSoundEnabled(next);
    setSoundActive(next);
    if (next) {
      testSound('nuevo');
    }
  };

  const handleRequestPerm = async () => {
    const res = await requestDesktopNotificationPermission();
    setNotifPerm(res);
  };

  const filteredNotifs = (notifications || []).filter((n) => {
    if (!n.unread) return false;          // solo no leídas
    if (filter === 'todos') return true;
    return n.tipo === filter;
  });

  return (
    <>
      {/* Botón de Campana para el encabezado */}
      <button
        type="button"
        id="cp-bell-button"
        className={`cp-bell-btn ${isOpen ? 'cp-bell-btn--active' : ''} ${unreadCount > 0 ? 'cp-bell-btn--has-unread' : ''}`}
        title={unreadCount > 0 ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer` : 'Centro de alertas de pedidos'}
        onClick={onToggleOpen}
        aria-label="Alertas de pedidos"
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

      {/* Flyout / Panel Desplegable */}
      {isOpen && (
        <>
          <div className="cp-alert-center-backdrop" onClick={onClose} />
          <div className="cp-alert-center" role="dialog" aria-modal="true">
            {/* Header */}
            <div className="cp-alert-center-header">
              <div className="cp-alert-center-title-group">
                <div className="cp-alert-title-wrap">
                  <div className="cp-alert-title-icon-box">
                    <BellRing size={18} strokeWidth={2.2} className="cp-alert-title-icon" />
                  </div>
                  <h3>Alertas de Pedidos</h3>
                </div>
                {unreadCount > 0 && (
                  <span className="cp-alert-center-unread-pill">
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

            {/* Toolbar: Sonido y Notificaciones */}
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
                  title="Probar sonido de nuevo pedido"
                  onClick={() => testSound('nuevo')}
                >
                  🛍️ Probar
                </button>

                <button
                  type="button"
                  className="cp-test-sound-btn"
                  title="Probar sonido de pedido entregado"
                  onClick={() => testSound('entregado')}
                >
                  ✅ Probar
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
                className={`cp-alert-filter-pill ${filter === 'nuevo' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('nuevo')}
              >
                Nuevos ({(notifications || []).filter((n) => n.unread && n.tipo === 'nuevo').length})
              </button>
              <button
                type="button"
                className={`cp-alert-filter-pill ${filter === 'entregado' ? 'cp-alert-filter-pill--active' : ''}`}
                onClick={() => setFilter('entregado')}
              >
                Entregados ({(notifications || []).filter((n) => n.unread && n.tipo === 'entregado').length})
              </button>
            </div>

            {/* Lista de Notificaciones */}
            <div className="cp-alert-list">
              {filteredNotifs.length === 0 ? (
                <div className="cp-alert-empty">
                  <div className="cp-alert-empty-icon-wrap">
                    <CheckCircle2 size={32} strokeWidth={2} className="cp-alert-empty-icon" />
                  </div>
                  <p>¡No hay alertas pendientes!</p>
                  <span style={{ fontSize: '0.78rem' }}>
                    Todas las alertas han sido leídas. Cuando llegue un nuevo pedido o se complete una entrega, aparecerá aquí inmediatamente.
                  </span>
                </div>
              ) : (
                filteredNotifs.map((item) => {
                  const isNuevo = item.tipo === 'nuevo';
                  return (
                    <div
                      key={item.id}
                      className={`cp-alert-item ${isNuevo ? 'cp-alert-item--nuevo' : 'cp-alert-item--entregado'} ${item.unread ? 'cp-alert-item--unread' : ''}`}
                      onClick={() => {
                        onMarkItemAsRead?.(item.orderId, item.tipo);
                        onViewOrder(item.pedido, item.orderId, item.tipo);
                        onClose();
                      }}
                    >
                      <div className="cp-alert-item-icon">
                        <span>{isNuevo ? '🛍️' : '✅'}</span>
                      </div>

                      <div className="cp-alert-item-content">
                        <div className="cp-alert-item-top">
                          <h5 className="cp-alert-item-title">
                            {item.unread && <span className="cp-alert-unread-dot" />}
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
                                title="Marcar como leída para no volver a verla"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMarkItemAsRead(item.orderId, item.tipo);
                                }}
                              >
                                ✓ Leída
                              </button>
                            )}
                            <span className="cp-alert-item-cta">
                              Ver detalles →
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
