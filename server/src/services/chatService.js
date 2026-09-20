import { supabase } from '../config/supabase.js';

/**
 * Microservicio de Chat en Tiempo Real (Chat Service)
 * Persistencia y despacho de mensajes entre Cliente, Repartidor y Comercio.
 * Cuenta con resiliencia: persiste en Supabase (tabla chat_messages) con fallback en memoria
 * para garantizar operatividad durante el ciclo de desarrollo.
 */
const inMemoryMessages = new Map();

export const chatService = {
  /**
   * Guarda un mensaje de chat para un pedido específico.
   * @param {object} params
   * @param {string} params.pedidoId
   * @param {string} params.senderId
   * @param {'cliente' | 'comercio' | 'repartidor'} params.senderRol
   * @param {string} params.senderNombre
   * @param {string} params.mensaje
   * @param {string} [params.attachmentUrl]
   */
  async saveMessage({ pedidoId, senderId, senderRol, senderNombre, mensaje, attachmentUrl = null }) {
    const messagePayload = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pedido_id: pedidoId,
      sender_id: senderId,
      sender_rol: senderRol,
      sender_nombre: senderNombre,
      mensaje,
      attachment_url: attachmentUrl,
      created_at: new Date().toISOString()
    };

    // Intentar persistir en Supabase
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([
          {
            pedido_id: pedidoId,
            sender_id: senderId,
            sender_rol: senderRol,
            sender_nombre: senderNombre,
            mensaje,
            attachment_url: attachmentUrl
          }
        ])
        .select()
        .single();

      if (!error && data) {
        return data;
      }
    } catch {
      // Si la tabla aún no existe (FASE 2 pendiente), usamos la caché en memoria
    }

    // Fallback en memoria
    if (!inMemoryMessages.has(pedidoId)) {
      inMemoryMessages.set(pedidoId, []);
    }
    const orderChat = inMemoryMessages.get(pedidoId);
    orderChat.push(messagePayload);
    // Limitar histórico en memoria a 200 mensajes por pedido
    if (orderChat.length > 200) orderChat.shift();

    return messagePayload;
  },

  /**
   * Recupera el historial de chat de un pedido.
   * @param {string} pedidoId 
   */
  async getMessagesByOrder(pedidoId) {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch {
      // Ignorar error de tabla no creada aún
    }

    return inMemoryMessages.get(pedidoId) || [];
  }
};
