import { orderService } from '../services/orderService.js';

/**
 * Manejador de eventos en tiempo real para Pedidos y Tracking
 * @param {import('socket.io').Server} io 
 * @param {import('socket.io').Socket} socket 
 */
export function registerOrderHandlers(io, socket) {
  const user = socket.data.user || { id: 'anon', nombre: 'Invitado', rol: 'cliente' };

  /**
   * Unirse a la sala de seguimiento de un pedido específico.
   * Sala: `order:${orderId}`
   */
  socket.on('order:join', async ({ orderId }) => {
    if (!orderId) {
      return socket.emit('order:error', { message: 'orderId es requerido para unirse' });
    }

    const roomName = `order:${orderId}`;
    socket.join(roomName);

    console.log(`📡 [OrderSocket] ${user.nombre || user.id} (${user.rol}) se unió a ${roomName}`);

    // Notificar a la sala que un usuario está conectado
    socket.to(roomName).emit('order:user_connected', {
      orderId,
      userId: user.id,
      rol: user.rol,
      nombre: user.nombre
    });

    // Enviar confirmación y estado inicial al cliente solicitante
    try {
      const order = await orderService.getOrderById(orderId);
      socket.emit('order:joined', {
        orderId,
        order
      });
    } catch {
      socket.emit('order:joined', {
        orderId,
        order: null
      });
    }
  });

  /**
   * Salir de la sala del pedido.
   */
  socket.on('order:leave', ({ orderId }) => {
    if (!orderId) return;
    const roomName = `order:${orderId}`;
    socket.leave(roomName);
    console.log(`🔌 [OrderSocket] Usuario abandonó ${roomName}`);
  });

  /**
   * Actualización del estado del pedido (Pendiente -> En preparación -> En camino -> Entregado).
   * Emitido por Comercio o Repartidor.
   */
  socket.on('order:status_update', async ({ orderId, nuevoEstado, nota }) => {
    if (!orderId || !nuevoEstado) {
      return socket.emit('order:error', { message: 'orderId y nuevoEstado son requeridos' });
    }

    const roomName = `order:${orderId}`;
    console.log(`🔄 [OrderSocket] Solicitud de cambio de estado a '${nuevoEstado}' para ${orderId} por ${user.rol}`);

    try {
      const result = await orderService.updateOrderStatus(orderId, nuevoEstado, {
        id: user.id,
        rol: user.rol,
        nombre: user.nombre
      });

      const payload = {
        orderId,
        estadoAnterior: result.estadoAnterior,
        nuevoEstado: result.nuevoEstado,
        updatedAt: result.updatedAt,
        nota: nota || null,
        actor: {
          id: user.id,
          rol: user.rol,
          nombre: user.nombre
        }
      };

      // Emitir a todos en la sala del pedido (Cliente, Comercio y Repartidor)
      io.to(roomName).emit('order:status_changed', payload);

      // Notificación global a paneles de repartidores/comercios si aplica
      io.emit('order:broadcast_status', {
        orderId,
        nuevoEstado
      });

      console.log(`✅ [OrderSocket] Pedido ${orderId} actualizado a '${nuevoEstado}'`);
    } catch (err) {
      console.error(`❌ [OrderSocket] Error al actualizar estado: ${err.message}`);
      socket.emit('order:error', {
        orderId,
        message: err.message
      });
    }
  });

  /**
   * Telemetría GPS en tiempo real enviada por el repartidor en camino.
   */
  socket.on('order:location_update', ({ orderId, coords }) => {
    if (!orderId || !coords) return;

    const roomName = `order:${orderId}`;
    // Reenviar coordenadas inmediatamente al cliente y comercio sin retraso
    socket.to(roomName).emit('order:location_received', {
      orderId,
      repartidorId: user.id,
      coords: {
        lat: coords.lat,
        lng: coords.lng,
        heading: coords.heading || 0,
        speed: coords.speed || 0,
        timestamp: Date.now()
      }
    });
  });
}
