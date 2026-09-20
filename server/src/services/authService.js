import { supabase } from '../config/supabase.js';

/**
 * Microservicio de Autenticación y Perfiles
 * Gestión de usuarios, roles ('cliente', 'comercio', 'repartidor') y persistencia con Supabase Auth.
 */
export const authService = {
  /**
   * Valida un token JWT emitido por Supabase y retorna el usuario autenticado junto a su perfil.
   * @param {string} token 
   * @returns {Promise<{ user: object, profile: object }>}
   */
  async verifyUserToken(token) {
    if (!token) {
      throw new Error('Token de autenticación no proporcionado');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error(authError?.message || 'Token inválido o expirado');
    }

    // Obtener perfil base con rol
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Perfil de usuario no encontrado en la base de datos');
    }

    return { user, profile };
  },

  /**
   * Obtiene los datos detallados según el rol del usuario (cliente, comercio o repartidor).
   * @param {string} profileId 
   * @param {'cliente' | 'comercio' | 'repartidor'} rol 
   */
  async getRoleDetails(profileId, rol) {
    let tableName = '';
    if (rol === 'cliente') tableName = 'clientes_datos';
    else if (rol === 'comercio') tableName = 'comercios_datos';
    else if (rol === 'repartidor') tableName = 'repartidores_datos';
    else return null;

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('profile_id', profileId)
      .single();

    if (error) {
      console.warn(`No se encontraron datos específicos para ${rol} (${profileId}):`, error.message);
      return null;
    }
    return data;
  }
};
