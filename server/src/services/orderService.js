import { supabase } from '../config/supabase.js';

/**
 * Microservicio de Pedidos en Tiempo Real (Real-Time Order Service)
 * Manejo del ciclo de vida del pedido, transiciones de estado y persistencia.
 */
export const ORDER_STATES = {
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  EN_PREPARACION: 'en_preparacion',
  EN_CAMINO: 'en_camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado'
};

// Flujo permitido de transiciones de estado
const ALLOWED_TRANSITIONS = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['en_preparacion', 'cancelado'],
  en_preparacion: ['en_camino', 'cancelado'],
  en_camino: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: []
};

export const orderService = {
  /**
   * Obtiene un pedido completo con cliente, comercio, repartidor e ítems.
   * @param {string} orderId 
   */
  async getOrderById(orderId) {
    const { data: order, error } = await supabase
      .from('pedidos_entregas')
      .select(`
        *,
        cliente:profiles!pedidos_entregas_cliente_id_fkey(id, nombre_completo, telefono, avatar_url),
        comercio:comercios_datos!pedidos_entregas_comercio_id_fkey(id, nombre_comercial, direccion, logo_url),
        repartidor:repartidores_datos!pedidos_entregas_repartidor_id_fkey(
          id,
          vehiculo,
          placa,
          profile:profiles!repartidores_datos_profile_id_fkey(id, nombre_completo, telefono, avatar_url)
        ),
        items:pedido_items(id, cantidad, precio_usd, subtotal_usd, producto:productos(id, nombre, imagen_url))
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      // Fallback a consulta simple si los foreign keys no coinciden exactamente
      const { data: simpleOrder, error: simpleErr } = await supabase
        .from('pedidos_entregas')
        .select('*')
        .eq('id', orderId)
        .single();

      if (simpleErr) throw new Error(`Pedido no encontrado: ${simpleErr.message}`);
      return simpleOrder;
    }

    return order;
  },

  /**
   * Valida y actualiza el estado de un pedido.
   * @param {string} orderId 
   * @param {string} nuevoEstado 
   * @param {object} actor - { id, rol, nombre }
   */
  async updateOrderStatus(orderId, nuevoEstado, actor = {}) {
    const currentOrder = await this.getOrderById(orderId);
    if (!currentOrder) {
      throw new Error(`El pedido ${orderId} no existe`);
    }

    const estadoActual = currentOrder.estado;

    // Validar transición válida
    const transicionesValidas = ALLOWED_TRANSITIONS[estadoActual] || [];
    if (!transicionesValidas.includes(nuevoEstado)) {
      throw new Error(
        `Transición no permitida: de '${estadoActual}' a '${nuevoEstado}'. Opciones permitidas: ${transicionesValidas.join(', ') || 'ninguna'}`
      );
    }

    // Reglas de negocio según rol del actor
    if (actor.rol === 'comercio') {
      if (!['confirmado', 'en_preparacion', 'cancelado'].includes(nuevoEstado)) {
        throw new Error('El comercio sólo puede confirmar, preparar o cancelar pedidos');
      }
    } else if (actor.rol === 'repartidor') {
      if (!['en_camino', 'entregado'].includes(nuevoEstado)) {
        throw new Error('El repartidor sólo puede pasar el pedido a en camino o entregado');
      }
    }

    const { data: updated, error } = await supabase
      .from('pedidos_entregas')
      .update({
        estado: nuevoEstado,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al persistir actualización de pedido: ${error.message}`);
    }

    return {
      orderId,
      estadoAnterior: estadoActual,
      nuevoEstado,
      updatedAt: updated.updated_at,
      actor
    };
  },

  /**
   * Asigna un repartidor a un pedido en curso.
   */
  async assignRepartidor(orderId, repartidorId) {
    const { data, error } = await supabase
      .from('pedidos_entregas')
      .update({
        repartidor_id: repartidorId,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new Error(`Error al asignar repartidor: ${error.message}`);
    return data;
  }
};
