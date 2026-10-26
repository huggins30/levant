import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * usePedidosRealtime
 * 
 * Hook personalizado de React 19 para gestionar alertas visuales en tiempo real
 * de nuevos pedidos conectándose a Supabase Realtime (evento INSERT).
 * 
 * @param {Object} [options]
 * @param {string} [options.table='pedidos_entregas'] - Nombre de la tabla de pedidos
 * @param {string} [options.schema='public'] - Esquema PostgreSQL en Supabase
 * @param {string} [options.filter] - Filtro opcional de Supabase (ej. `comercio_id=eq.${id}`)
 * @param {boolean} [options.enabled=true] - Habilitar o suspender la suscripción
 * @param {Function} [options.onNewOrder] - Callback opcional ejecutado al insertar un pedido
 */
export function usePedidosRealtime({
  table = 'pedidos_entregas',
  schema = 'public',
  filter = undefined,
  enabled = true,
  onNewOrder = null,
} = {}) {
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    // Nombre único para evitar colisiones entre múltiples instancias
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
        const orderData = payload.new || {};
        
        // Actualizar estados reactivos
        setHasNewOrder(true);
        setNewOrdersCount((prev) => prev + 1);
        setLatestOrder(orderData);

        // Invocar callback opcional
        if (typeof onNewOrder === 'function') {
          onNewOrder(orderData);
        }
      })
      .subscribe((status, error) => {
        if (error) {
          console.warn('[Realtime Badge] Error en canal de pedidos:', error);
        }
      });

    // React 19 cleanup: remover el canal al desmontar el componente o cambiar dependencias
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, table, schema, filter, onNewOrder]);

  /**
   * Restablece el badge y el contador cuando el usuario visualiza la sección de pedidos
   */
  const resetNotification = useCallback(() => {
    setHasNewOrder(false);
    setNewOrdersCount(0);
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
