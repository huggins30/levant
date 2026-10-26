import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Badge } from '@capawesome/capacitor-badge';

let isChannelCreated = false;

/**
 * Inicializa el canal de notificaciones nativas de Android y solicita permisos.
 * El canal 'levant_orders' se configura con IMPORTANCE HIGH (5) y vibración para
 * garantizar que el launcher de Android muestre el punto o número rojo de alerta
 * sobre el icono de la APK en la pantalla de inicio.
 */
export async function initNativeNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // 1. Solicitar permisos de notificación en Android 13+
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }

    // 2. Crear canal de notificaciones en Android
    if (!isChannelCreated) {
      await LocalNotifications.createChannel({
        id: 'levant_orders_channel',
        name: 'Pedidos y Asignaciones Levant',
        description: 'Notificaciones en tiempo real para nuevos pedidos y asignación de repartidores',
        importance: 5, // IMPORTANCE_HIGH (muestra alerta emergente y badge en el icono)
        visibility: 1, // VISIBILITY_PUBLIC
        sound: undefined, // Sonido predeterminado del sistema
        vibration: true,
        lights: true,
        lightColor: '#ef4444',
      });
      isChannelCreated = true;
    }
  } catch (err) {
    console.warn('[NativeNotifications] Advertencia inicializando notificaciones nativas:', err);
  }
}

/**
 * Muestra una notificación nativa en Android / iOS y activa el badge
 * en el icono de la aplicación en la pantalla de inicio del teléfono.
 */
export async function sendNativeNotification({ title, body, id, data = {} }) {
  // 1. Si estamos en APK nativa (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();

      const notifId = typeof id === 'number'
        ? id
        : Math.abs(hashCode(String(id || Date.now()))) % 2147483647;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: title || 'Levant',
            body: body || 'Tienes una nueva actualización en tu pedido',
            channelId: 'levant_orders_channel',
            schedule: { at: new Date(Date.now() + 100) }, // Inmediato
            extra: data,
          },
        ],
      });

      // Incrementar el badge en el icono de la app en la pantalla de inicio
      try {
        const isSupported = await Badge.isSupported();
        if (isSupported.isSupported) {
          await Badge.increase();
        }
      } catch (e) {
        console.warn('[NativeNotifications] No se pudo incrementar badge:', e);
      }
      return;
    } catch (err) {
      console.warn('[NativeNotifications] Error enviando notificación nativa:', err);
    }
  }

  // 2. Si estamos en navegador Web / PWA, fallback a Notification API del navegador
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: id ? String(id) : undefined,
      });
    } catch {
      // Ignorar fallback web
    }
  }
}

/**
 * Fija el número exacto del badge (globo / punto rojo) en el icono de la APK
 */
export async function setNativeAppBadge(count) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const isSupported = await Badge.isSupported();
    if (!isSupported.isSupported) return;

    if (count > 0) {
      await Badge.set({ count: Number(count) });
    } else {
      await Badge.clear();
    }
  } catch (err) {
    console.warn('[NativeNotifications] Error actualizando badge:', err);
  }
}

/**
 * Limpia el badge del icono de la aplicación cuando el usuario abre la sección de pedidos
 */
export async function clearNativeAppBadge() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const isSupported = await Badge.isSupported();
    if (isSupported.isSupported) {
      await Badge.clear();
    }
  } catch (err) {
    console.warn('[NativeNotifications] Error limpiando badge:', err);
  }
}

/**
 * Hash simple para convertir strings (como UUID de Supabase) a entero para el ID de notificación nativa
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
