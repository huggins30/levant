import { createClient } from '@supabase/supabase-js';

// Lectura estricta de variables de entorno (.env) sin credenciales hardcodeadas
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Configuración incompleta: Las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son obligatorias y deben estar definidas en tu archivo .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Registra un usuario (comercio o repartidor) desde el panel admin
 * usando un cliente aislado sin persistencia de sesión para no desloguear al admin actual
 * y evitando 'User not allowed' que ocurre al invocar supabase.auth.admin con la clave anon.
 */
export async function registrarUsuarioAdmin({ email, password, nombreCompleto, rol }) {
  const tempAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await tempAuthClient.auth.signUp({
    email: email.trim(),
    password: password.trim(),
    options: {
      data: {
        nombre_completo: nombreCompleto.trim(),
        rol: rol,
      },
    },
  });

  if (error) throw error;
  if (data?.user?.identities && data.user.identities.length === 0) {
    throw new Error('Ya existe una cuenta registrada con este correo electrónico.');
  }
  if (!data?.user?.id) {
    throw new Error('No se pudo crear el usuario. Por favor verifica los datos.');
  }

  // Si el usuario fue creado por el administrador desde el panel, activamos su correo de inmediato
  try {
    await activarCorreoUsuarioAdmin({ userId: data.user.id, activar: true });
  } catch (err) {
    console.warn('Autoactivación tras creación manual omitida/con error:', err.message);
  }

  return data.user;
}

/**
 * Activa o desactiva el correo de un repartidor o comercio desde el panel de administración
 */
export async function activarCorreoUsuarioAdmin({ userId, activar = true }) {
  if (!userId) throw new Error('ID de usuario requerido');

  // 1. Intentar mediante RPC con privilegios de administrador (actualiza auth.users y public.profiles)
  const { data, error: rpcErr } = await supabase.rpc('admin_activar_correo_usuario', {
    p_user_id: userId,
    p_activar: activar,
  });

  if (!rpcErr) {
    return data;
  }

  console.warn('RPC admin_activar_correo_usuario no disponible, usando fallback directo:', rpcErr.message);

  // 2. Fallback directo a profiles
  const { error: pErr } = await supabase
    .from('profiles')
    .update({ correo_activado: activar, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (pErr) throw pErr;

  // Si es comercio, sincronizar con su estado activo en comercios_datos
  if (activar) {
    await supabase
      .from('comercios_datos')
      .update({ activo: true, updated_at: new Date().toISOString() })
      .eq('profile_id', userId);
  }

  return { success: true, user_id: userId, correo_activado: activar };
}

/**
 * Obtiene el listado de comercios y repartidores registrados para el administrador
 */
export async function obtenerUsuariosRegistroAdmin() {
  // 1. Intentar mediante RPC completa
  const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_listar_usuarios_registro');
  if (!rpcErr && rpcData) {
    return rpcData;
  }

  // 2. Fallback consultando profiles y tablas relacionadas
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*, comercios_datos(*), repartidores_datos(*)')
    .in('rol', ['comercio', 'repartidor'])
    .order('created_at', { ascending: false });

  if (pErr) throw pErr;

  return (profiles || []).map(p => {
    const com = Array.isArray(p.comercios_datos) ? p.comercios_datos[0] : p.comercios_datos;
    const rep = Array.isArray(p.repartidores_datos) ? p.repartidores_datos[0] : p.repartidores_datos;

    return {
      id: p.id,
      email: p.email,
      nombre_completo: p.nombre_completo,
      rol: p.rol,
      telefono: p.telefono,
      correo_activado: p.correo_activado !== false, // si es null/undefined y ya estaba registrado, fallback
      email_confirmed_at: null,
      created_at: p.created_at,
      comercio_id: com?.id ?? null,
      nombre_comercial: com?.nombre_comercial ?? p.nombre_completo,
      categoria: com?.categoria ?? 'otro',
      comercio_activo: com?.activo ?? false,
      repartidor_id: rep?.id ?? null,
      cedula: rep?.cedula ?? null,
      tipo_vehiculo: rep?.vehiculo ?? 'moto',
      repartidor_disponible: rep?.disponible ?? false,
    };
  });
}

