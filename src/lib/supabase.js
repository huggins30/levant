import { createClient } from '@supabase/supabase-js';

// Lectura de variables de entorno con fallback al proyecto de Supabase configurado
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://itymatyeumivirdgsdgx.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0eW1hdHlldW1pdmlyZGdzZGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NjMzNjMsImV4cCI6MjEwNTQzOTM2M30.kgZ7X0Ycgt1uMcF7-4JP-TqmKYX1OsAE-lYmc3dpz74';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ [Supabase] Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
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

  return data.user;
}

