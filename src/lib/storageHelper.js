import { supabase } from './supabase';

/**
 * Extrae la ruta relativa del archivo dentro del bucket 'pagos'.
 * Soporta rutas directas ('userId/file.jpg'), rutas heredadas ('comprobantes/userId/file.jpg')
 * y URLs absolutas públicas o previamente firmadas.
 *
 * @param {string} comprobanteRef - Ruta o URL del comprobante
 * @returns {string|null} - Ruta relativa dentro del bucket
 */
export function extraerRutaBucketPagos(comprobanteRef) {
  if (!comprobanteRef || typeof comprobanteRef !== 'string') return null;

  // Si es un Blob URI o base64 de vista previa local
  if (comprobanteRef.startsWith('blob:') || comprobanteRef.startsWith('data:')) {
    return null;
  }

  let path = comprobanteRef.trim();

  // Caso: URL firmada o pública de Supabase Storage
  if (path.includes('/storage/v1/object/public/pagos/')) {
    path = path.split('/storage/v1/object/public/pagos/')[1];
  } else if (path.includes('/storage/v1/object/sign/pagos/')) {
    path = path.split('/storage/v1/object/sign/pagos/')[1];
  } else if (path.startsWith('http://') || path.startsWith('https://')) {
    const match = path.match(/\/pagos\/(.+?)(\?|$)/);
    if (match && match[1]) {
      path = match[1];
    }
  }

  // Quitar parámetros de query si los tiene (ej: ?token=...)
  if (path.includes('?')) {
    path = path.split('?')[0];
  }

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Genera una URL firmada segura (createSignedUrl) para acceder a un comprobante
 * en el bucket privado 'pagos'. Solo autorizados (comercio asignado, admin o dueño)
 * pueden generarla mediante las políticas RLS.
 *
 * @param {string} comprobanteRef - Ruta o URL del comprobante
 * @param {number} expiresIn - Tiempo de validez en segundos (por defecto 3600 = 1 hora)
 * @returns {Promise<string|null>} - URL firmada accesible
 */
export async function getComprobanteSignedUrl(comprobanteRef, expiresIn = 3600) {
  if (!comprobanteRef || typeof comprobanteRef !== 'string') return null;

  // Si ya es un blob local de vista previa inmediata
  if (comprobanteRef.startsWith('blob:') || comprobanteRef.startsWith('data:')) {
    return comprobanteRef;
  }

  const path = extraerRutaBucketPagos(comprobanteRef);
  if (!path) {
    // Si no se pudo extraer path y parece una URL externa, retornarla directamente
    return comprobanteRef;
  }

  try {
    const { data, error } = await supabase.storage
      .from('pagos')
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.warn('[StorageHelper] Error al generar URL firmada para pagos:', error.message);
      // Fallback: si falla por alguna razón pero el comprobanteRef original tiene token, retornarlo
      return comprobanteRef;
    }

    return data?.signedUrl || comprobanteRef;
  } catch (err) {
    console.error('[StorageHelper] Excepción al invocar createSignedUrl:', err);
    return comprobanteRef;
  }
}
