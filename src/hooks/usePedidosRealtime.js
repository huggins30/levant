import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { playNewOrderSound, triggerDesktopNotification } from '../components/comercio/comercioAlertSound';
import { sendNativeNotification, clearNativeAppBadge } from '../lib/nativeNotifications';

/**
 * usePedidosRealtime
 * 
 * Hook de React 19 para gestionar alertas auditivas y visuales en tiempo real
 * de nuevos pedidos conectándose a Supabase Realtime (evento INSERT), BroadcastChannel y eventos del sistema.
 * 
 * @param {Object} [options]
 * @param {string} [options.table='pedidos_entregas'] - Nombre de la tabla de pedidos
 * @param {string} [options.schema='public'] - Esquema PostgreSQL en Supabase
 * @param {string} [options.filter] - Filtro opcional de Supabase (ej. `comercio_id=eq.${id}`)
 * @param {boolean} [options.enabled=true] - Habilitar o suspender la suscripción
 * @param {boolean} [options.playSound=true] - Reproducir sonido al entrar un nuevo pedido
 * @param {Function} [options.onNewOrder] - Callback opcional ejecutado al insertar un pedido
 */
export function usePedidosRealtime({
  table = 'pedidos_entregas',
  schema = 'public',
  filter = undefined,
  enabled = true,
  playSound = true,
  onNewOrder = null,
} = {}) {
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState(null);

  const alertedOrdersRef = useRef(new Set());
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  const handleIncomingOrder = useCallback((orderData) => {
    if (!orderData?.id) return;
    if (alertedOrdersRef.current.has(orderData.id)) return;
    alertedOrdersRef.current.add(orderData.id);

    // Actualizar estados reactivos
    setHasNewOrder(true);
    setNewOrdersCount((prev) => prev + 1);
    setLatestOrder(orderData);

    // 1. Sonido en tiempo real
    if (playSound) {
      playNewOrderSound();
    }

    // 2. Notificación en escritorio y nativa en Android APK
    const shortId = orderData.id.slice(0, 8);
    const totalStr = orderData.total_usd ? ` por $${Number(orderData.total_usd).toFixed(2)} USD` : '';
    triggerDesktopNotification('🛍️ ¡Nuevo Pedido en Levant!', {
      body: `Pedido #${shortId}${totalStr}. Revisa tu panel para gestionarlo.`,
      tag: `nuevo-pedido-${orderData.id}`,
    });

    sendNativeNotification({
      id: orderData.id,
      title: '🛍️ ¡Nuevo Pedido en Levant!',
      body: `Pedido #${shortId}${totalStr}. Revisa tu panel para gestionarlo.`,
      data: { orderId: orderData.id },
    });

    // 3. Callback externo
    if (typeof onNewOrderRef.current === 'function') {
      onNewOrderRef.current(orderData);
    }
  }, [playSound]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let bc = null;

    // 1. Canal Cross-Tab para notificación instantánea (0ms)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('levant_orders_channel');
        bc.onmessage = (evt) => {
          if (!isMounted || !evt.data?.order) return;
          handleIncomingOrder(evt.data.order);
        };
      } catch {
        // ignore
      }
    }

    // 2. Evento global en ventana
    const handleGlobalOrderEvent = (e) => {
      if (!isMounted || !e.detail?.order) return;
      handleIncomingOrder(e.detail.order);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('levant_nuevo_pedido_global', handleGlobalOrderEvent);
    }

    // 3. Supabase Realtime (INSERT en pedidos_entregas)
    const channelId = `realtime-pedidos-badge-${Math.random().toString(36).slice(2, 9)}`;
    const changeConfig = {
      event: 'INSERT',
      schema,
      table,
      ...(filter ? { filter } : {}),
    };

    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', changeConfig, (payload) => {
        if (!isMounted) return;
        const orderData = payload.new || {};
        handleIncomingOrder(orderData);
      })
      .subscribe((status, error) => {
        if (error) {
          console.warn('[Realtime Orders] Error en canal de pedidos:', error);
        }
      });

    return () => {
      isMounted = false;
      if (bc) bc.close();
      if (typeof window !== 'undefined') {
        window.removeEventListener('levant_nuevo_pedido_global', handleGlobalOrderEvent);
      }
      supabase.removeChannel(channel);
    };
  }, [enabled, table, schema, filter, handleIncomingOrder]);

  /**
   * Restablece el badge y el contador cuando el usuario visualiza la sección de pedidos
   */
  const resetNotification = useCallback(() => {
    setHasNewOrder(false);
    setNewOrdersCount(0);
    clearNativeAppBadge();
  }, []);

  return {
    hasNewOrder,
    newOrdersCount,
    latestOrder,
    resetNotification,
    setHasNewOrder,
    setNewOrdersCount,
  };
}
