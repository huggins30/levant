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
