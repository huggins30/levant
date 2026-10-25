import { supabase } from './supabase';
import { notifyRepartidorAsignado } from '../components/repartidor/RepartidorAlertas';

/**
 * Obtiene la capacidad en kg del vehículo de un repartidor
 */
export function getCapacidadRepartidor(rep) {
  if (rep?.tipos_vehiculo?.capacidad_peso_kg) {
    return Number(rep.tipos_vehiculo.capacidad_peso_kg);
  }
  const v = (rep?.vehiculo || '').toLowerCase();
  if (v === 'carro' || v.includes('auto') || v.includes('sedan')) return 150;
  if (v.includes('van') || v.includes('furgoneta')) return 800;
  if (v.includes('camion')) return 1500;
  return 20; // Default motocicleta
}

/**
 * Obtiene el nombre del vehículo
 */
export function getVehiculoNombreRepartidor(rep) {
  return rep?.tipos_vehiculo?.nombre || (rep?.vehiculo ? rep.vehiculo.toUpperCase() : 'MOTOCICLETA');
}

/**
 * Busca el mejor repartidor disponible en tiempo real según el peso/tamaño del producto.
 * Prioriza el vehículo de menor tamaño que cumpla con la capacidad para mayor eficiencia.
 */
export async function buscarMejorRepartidorDisponible(pesoTotal = 1.0) {
  try {
    const { data: reps, error } = await supabase
      .from('repartidores_datos')
      .select(`
        id, vehiculo, placa, disponible, tipos_vehiculo_id,
        tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
        profiles ( id, nombre_completo, telefono )
      `)
      .eq('disponible', true);

    if (error || !reps || reps.length === 0) {
      return null;
    }

    // 1. Filtrar repartidores con capacidad suficiente para el peso del pedido
    const aptos = reps.filter(r => getCapacidadRepartidor(r) >= pesoTotal);

    // 2. Si hay aptos, ordenar de menor a mayor capacidad para usar el vehículo óptimo
    // Si no hay ninguno con capacidad suficiente, usar el de mayor capacidad disponible
    if (aptos.length > 0) {
      aptos.sort((a, b) => getCapacidadRepartidor(a) - getCapacidadRepartidor(b));
      return aptos[0];
    } else {
      reps.sort((a, b) => getCapacidadRepartidor(b) - getCapacidadRepartidor(a));
      return reps[0];
    }
  } catch (err) {
    console.warn('[AsignacionPedidos] Error buscando repartidor disponible:', err);
    return null;
  }
}

/**
 * Asigna un repartidor a un pedido y lo marca como no disponible.
 * No genera preguntas ni confirmaciones en pantalla.
 */
export async function autoAsignarPedido(pedidoId, pesoTotal = 1.0) {
  if (!pedidoId) return { success: false, error: 'ID de pedido inválido' };

  try {
    // ── REGLA OBLIGATORIA: No asignar repartidor hasta que el cliente haya cargado el comprobante de pago ──
    const { data: pagos, error: errPago } = await supabase
      .from('reportes_pago')
      .select('id, comprobante_url, referencia')
      .eq('pedido_id', pedidoId);

    const tieneComprobante = Boolean(pagos && pagos.length > 0 && pagos.some(p => p.comprobante_url));
    if (errPago || !tieneComprobante) {
      console.warn('[AsignacionPedidos] Asignación bloqueada: el pedido', pedidoId, 'aún no tiene imagen de comprobante registrada.');
      return { 
        success: false, 
        error: 'El cliente debe cargar la imagen del pago y registrar el pago antes de asignar un repartidor.' 
      };
    }

    const mejorRep = await buscarMejorRepartidorDisponible(pesoTotal);
    if (!mejorRep) {
      return { success: false, error: 'No hay repartidores disponibles en este momento' };
    }

    // Asignar el pedido
    const { error: errPedido } = await supabase
      .from('pedidos_entregas')
      .update({
        repartidor_id: mejorRep.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', pedidoId);

    if (errPedido) {
      return { success: false, error: errPedido.message };
    }

    // Notificar al repartidor asignado inmediatamente
    notifyRepartidorAsignado({
      orderId: pedidoId,
      repartidorId: mejorRep.id
    });

    // Marcar al repartidor como no disponible
    await supabase
      .from('repartidores_datos')
      .update({ disponible: false })
      .eq('id', mejorRep.id);

    return {
      success: true,
      repartidor: mejorRep
    };
  } catch (err) {
    console.error('[AsignacionPedidos] Error en autoAsignarPedido:', err);
    return { success: false, error: err.message };
  }
}
