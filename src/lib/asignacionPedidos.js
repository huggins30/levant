import { supabase } from './supabase';
import { notifyRepartidorAsignado } from '../components/repartidor/RepartidorAlertas';
import { notifyClienteRepartidorAsignado } from '../components/cliente/ClienteAlertas';

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
  return rep?.tipos_vehiculo?.nombre || rep?.vehiculo_nombre || (rep?.vehiculo ? rep.vehiculo.toUpperCase() : 'MOTOCICLETA');
}

/**
 * Obtiene la lista de repartidores ordenados por disponibilidad, capacidad y valoraciones.
 * Usa la RPC SECURITY DEFINER `obtener_repartidores_valorados` para consultar promedios de estrellas
 * de forma segura sin exponer pedidos de otros clientes.
 */
export async function obtenerRepartidoresValorados(pesoTotal = 1.0) {
  const peso = Number(pesoTotal) || 1.0;

  try {
    const { data: rpcList, error: rpcErr } = await supabase.rpc('obtener_repartidores_valorados', {
      p_peso_total: peso,
    });

    if (!rpcErr && Array.isArray(rpcList)) {
      return rpcList;
    }

    if (rpcErr) {
      console.warn('[AsignacionPedidos] Fallback al listar repartidores (RPC no disponible):', rpcErr.message);
    }

    // Fallback directo si la RPC aún no ha sido ejecutada en Supabase
    const { data: reps, error } = await supabase
      .from('repartidores_datos')
      .select(`
        id, vehiculo, placa, disponible, tipos_vehiculo_id,
        tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
        profiles ( id, nombre_completo, telefono, correo_activado )
      `);

    if (error || !reps) return [];

    return reps
      .filter(r => r.profiles?.correo_activado !== false)
      .map(r => {
        const cap = getCapacidadRepartidor(r);
        return {
          id: r.id,
          nombre_completo: r.profiles?.nombre_completo || 'Repartidor',
          telefono: r.profiles?.telefono || null,
          vehiculo: r.vehiculo,
          placa: r.placa,
          disponible: Boolean(r.disponible),
          vehiculo_nombre: getVehiculoNombreRepartidor(r),
          capacidad_peso_kg: cap,
          apto_peso: cap >= peso,
          promedio_valoracion: 0,
          total_valoraciones: 0,
          entregas_completadas: 0,
          repartos_activos: 0,
        };
      })
      .sort((a, b) => {
        if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
        if (a.apto_peso !== b.apto_peso) return a.apto_peso ? -1 : 1;
        return b.promedio_valoracion - a.promedio_valoracion;
      });
  } catch (err) {
    console.warn('[AsignacionPedidos] Error obteniendo repartidores valorados:', err);
    return [];
  }
}

/**
 * Busca el mejor repartidor disponible en tiempo real según el peso/tamaño del producto.
 * Prioriza el vehículo de menor tamaño que cumpla con la capacidad para mayor eficiencia.
 * Cuenta con fallback automático a repartidores registrados para garantizar asignación.
 */
export async function buscarMejorRepartidorDisponible(pesoTotal = 1.0) {
  try {
    // 1. Intentar primero con repartidores que tengan disponible = true
    let { data: reps, error } = await supabase
      .from('repartidores_datos')
      .select(`
        id, vehiculo, placa, disponible, tipos_vehiculo_id,
        tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
        profiles ( id, nombre_completo, telefono )
      `)
      .eq('disponible', true);

    // 2. Si no hay con disponible = true, consultar todos los repartidores registrados
    if (error || !reps || reps.length === 0) {
      const { data: allReps, error: errAll } = await supabase
        .from('repartidores_datos')
        .select(`
          id, vehiculo, placa, disponible, tipos_vehiculo_id,
          tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
          profiles ( id, nombre_completo, telefono )
        `);

      if (errAll || !allReps || allReps.length === 0) {
        return null;
      }
      reps = allReps;
    }

    // 3. Filtrar repartidores con capacidad suficiente para el peso del pedido
    const aptos = reps.filter(r => getCapacidadRepartidor(r) >= pesoTotal);

    // 4. Si hay aptos, ordenar de menor a mayor capacidad para usar el vehículo óptimo
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
 * Asigna un repartidor a un pedido de forma atómica y segura mediante función RPC
 * con bloqueo transaccional (SELECT ... FOR UPDATE SKIP LOCKED), evitando condiciones de carrera.
 * Notifica inmediatamente tanto al repartidor como al cliente en tiempo real.
 */
export async function autoAsignarPedido(pedidoId, pesoTotal = 1.0, repartidorId = null) {
  if (!pedidoId) return { success: false, error: 'ID de pedido inválido' };

  try {
    // 1. Invocar RPC atómica en base de datos con bloqueo FOR UPDATE SKIP LOCKED
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('auto_asignar_repartidor_pedido', {
      p_pedido_id: pedidoId,
      p_peso_total: Number(pesoTotal) || 1.0,
      p_repartidor_id: repartidorId || null,
    });

    if (!rpcErr && rpcRes) {
      if (!rpcRes.success) {
        console.warn('[AsignacionPedidos] RPC rechazó asignación:', rpcRes.error);
        return { success: false, error: rpcRes.error };
      }

      const mejorRep = rpcRes.repartidor;
      if (mejorRep) {
        const payloadNotif = {
          id: pedidoId,
          repartidor_id: mejorRep.id,
          repartidores_datos: mejorRep,
        };

        // Disparar alertas multicanal en tiempo real
        notifyRepartidorAsignado({
          orderId: pedidoId,
          repartidorId: mejorRep.id,
          orderData: payloadNotif,
        });

        notifyClienteRepartidorAsignado({
          orderId: pedidoId,
          repartidor: mejorRep,
          orderData: payloadNotif,
        });

        return {
          success: true,
          repartidor: mejorRep,
          already_assigned: Boolean(rpcRes.already_assigned),
        };
      }
    }

    if (rpcErr) {
      console.warn('[AsignacionPedidos] Fallback a asignación cliente tras error de RPC:', rpcErr.message);
    }

    // 2. Fallback resiliente en cliente si la función RPC aún no está migrada en la base de datos
    return await autoAsignarPedidoClienteFallback(pedidoId, pesoTotal, repartidorId);
  } catch (err) {
    console.error('[AsignacionPedidos] Error general en autoAsignarPedido:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fallback de asignación ejecutado en cliente si la base de datos no tiene la función RPC
 */
async function autoAsignarPedidoClienteFallback(pedidoId, pesoTotal = 1.0, repartidorId = null) {
  // ── REGLA: Verificar comprobante de pago si existe ──
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

  let mejorRep = null;
  if (repartidorId) {
    const { data: chosenRep } = await supabase
      .from('repartidores_datos')
      .select(`
        id, vehiculo, placa, disponible, tipos_vehiculo_id,
        tipos_vehiculo ( id, nombre, capacidad_peso_kg ),
        profiles ( id, nombre_completo, telefono )
      `)
      .eq('id', repartidorId)
      .maybeSingle();
    mejorRep = chosenRep;
  }

  if (!mejorRep) {
    mejorRep = await buscarMejorRepartidorDisponible(pesoTotal);
  }

  if (!mejorRep) {
    return { success: false, error: 'No hay repartidores registrados en este momento' };
  }

  // Asignar el pedido en la base de datos
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

  const payloadNotif = {
    id: pedidoId,
    repartidor_id: mejorRep.id,
    repartidores_datos: mejorRep
  };

  // 1. Notificar al repartidor asignado inmediatamente (0ms + Realtime)
  notifyRepartidorAsignado({
    orderId: pedidoId,
    repartidorId: mejorRep.id,
    orderData: payloadNotif
  });

  // 2. Notificar al cliente inmediatamente (0ms + Realtime)
  notifyClienteRepartidorAsignado({
    orderId: pedidoId,
    repartidor: mejorRep,
    orderData: payloadNotif
  });

  // Marcar al repartidor como ocupado
  await supabase
    .from('repartidores_datos')
    .update({ disponible: false })
    .eq('id', mejorRep.id);

  return {
    success: true,
    repartidor: mejorRep
  };
}
