import { chatService } from '../services/chatService.js';

/**
 * Manejador de eventos en tiempo real para Chat directo Cliente <-> Repartidor / Comercio
 * @param {import('socket.io').Server} io 
 * @param {import('socket.io').Socket} socket 
 */
export function registerChatHandlers(io, socket) {
  const user = socket.data.user || { id: 'anon', nombre: 'Invitado', rol: 'cliente' };

  /**
   * Unirse a la sala de chat de un pedido.
   * Sala: `chat:${orderId}`
   */
  socket.on('chat:join', async ({ orderId }) => {
    if (!orderId) {
      return socket.emit('chat:error', { message: 'orderId es requerido para el chat' });
    }

    const roomName = `chat:${orderId}`;
    socket.join(roomName);

    console.log(`💬 [ChatSocket] ${user.nombre || user.id} se unió a ${roomName}`);

    // Enviar el historial de mensajes al usuario que recién entra
    try {
      const messages = await chatService.getMessagesByOrder(orderId);
      socket.emit('chat:history', {
        orderId,
        messages
      });
    } catch (err) {
      console.error(`❌ [ChatSocket] Error al cargar mensajes: ${err.message}`);
      socket.emit('chat:history', {
        orderId,
        messages: []
      });
    }
  });

  /**
   * Enviar un mensaje de chat dentro del pedido.
   */
  socket.on('chat:send_message', async ({ orderId, mensaje, attachmentUrl }) => {
    if (!orderId || !mensaje || !mensaje.trim()) {
      return socket.emit('chat:error', { message: 'orderId y mensaje son obligatorios' });
    }

    const roomName = `chat:${orderId}`;

    try {
      const savedMessage = await chatService.saveMessage({
        pedidoId: orderId,
        senderId: user.id,
        senderRol: user.rol,
        senderNombre: user.nombre || 'Usuario',
        mensaje: mensaje.trim(),
        attachmentUrl: attachmentUrl || null
      });

      // Emitir el mensaje a todos los participantes en la sala del chat
      io.to(roomName).emit('chat:new_message', {
        orderId,
        message: savedMessage
      });

      console.log(`📨 [ChatSocket] Mensaje enviado en ${roomName} por ${user.nombre || user.rol}`);
    } catch (err) {
      console.error(`❌ [ChatSocket] Error al enviar mensaje: ${err.message}`);
      socket.emit('chat:error', { message: 'No se pudo enviar el mensaje' });
    }
  });

  /**
   * Indicador de "escribiendo..." en tiempo real.
   */
  socket.on('chat:typing', ({ orderId, isTyping }) => {
    if (!orderId) return;
    const roomName = `chat:${orderId}`;

    socket.to(roomName).emit('chat:user_typing', {
      orderId,
      userId: user.id,
      nombre: user.nombre || 'Alguien',
      rol: user.rol,
      isTyping: !!isTyping
    });
  });

  /**
   * Confirmación de lectura de mensajes.
   */
  socket.on('chat:mark_read', ({ orderId }) => {
    if (!orderId) return;
    const roomName = `chat:${orderId}`;

    socket.to(roomName).emit('chat:messages_read', {
      orderId,
      readBy: user.id,
      timestamp: Date.now()
    });
  });
}
