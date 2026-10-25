/**
 * repartidorAlertSound.js
 * Generador de alertas sonoras y notificaciones para Repartidores utilizando Web Audio API nativo.
 * Produce sonidos limpios, vibrantes y sin latencia para avisar sobre nuevos pedidos y valoraciones.
 */

let sharedAudioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    console.warn('[AudioContext Repartidor] No disponible:', e);
    return null;
  }
}

// Desbloquear AudioContext en la primera interacción de usuario
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Ignorar
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

export function isRepartidorSoundEnabled() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('levant_repartidor_sound_enabled') !== 'false';
}

export function setRepartidorSoundEnabled(enabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('levant_repartidor_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * Alerta Sonora: "Nuevo Pedido Asignado"
 * Timbre enérgico de 4 notas ascendentes (Re5, Fa#5, La5, Re6) con tono brillante para captar la atención inmediata del repartidor.
 */
export function playRepartidorPedidoAsignadoSound() {
  if (!isRepartidorSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, start: 0.00, dur: 0.25, gain: 0.24, type: 'triangle' }, // Re5
      { freq: 739.99, start: 0.10, dur: 0.28, gain: 0.26, type: 'sine' },     // Fa#5
      { freq: 880.00, start: 0.20, dur: 0.32, gain: 0.28, type: 'sine' },     // La5
      { freq: 1174.66, start: 0.30, dur: 0.60, gain: 0.32, type: 'triangle' },// Re6
    ];

    notes.forEach(({ freq, start, dur, gain, type }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0.001, now + start);
      gainNode.gain.linearRampToValueAtTime(gain, now + start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch (err) {
    console.warn('⚠️ Error al reproducir sonido de pedido asignado a repartidor:', err);
  }
}

/**
 * Alerta Sonora: "Nueva Valoración Recibida"
 * Acorde armónico dorado de 4 tonos con campana brillante (Mi5, Sol#5, Si5, Mi6) celebrando la calificación del cliente.
 */
export function playRepartidorValoracionSound() {
  if (!isRepartidorSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, start: 0.00, dur: 0.30, gain: 0.22, type: 'sine' },      // Mi5
      { freq: 830.61, start: 0.10, dur: 0.32, gain: 0.25, type: 'sine' },      // Sol#5
      { freq: 987.77, start: 0.20, dur: 0.38, gain: 0.28, type: 'sine' },      // Si5
      { freq: 1318.51, start: 0.32, dur: 0.65, gain: 0.30, type: 'triangle' }, // Mi6
    ];

    notes.forEach(({ freq, start, dur, gain, type }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0.001, now + start);
      gainNode.gain.linearRampToValueAtTime(gain, now + start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch (err) {
    console.warn('⚠️ Error al reproducir sonido de valoración de repartidor:', err);
  }
}

/**
 * Solicitar permiso para notificaciones en escritorio
 */
export async function requestDesktopNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}

/**
 * Mostrar notificación del sistema en escritorio
 */
export function showDesktopNotification(title, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const notif = new Notification(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: options.tag || 'levant-repartidor-alert',
      renotify: true,
      ...options,
    });

    if (options.onClick) {
      notif.onclick = () => {
        window.focus();
        options.onClick();
        notif.close();
      };
    }

    setTimeout(() => {
      try { notif.close(); } catch { /* noop */ }
    }, 9000);

    return notif;
  } catch (e) {
    console.warn('No se pudo mostrar la notificación de escritorio:', e);
    return null;
  }
}

/**
 * Función para probar sonidos desde el panel o centro de alertas
 */
export function testSound(tipo = 'asignado') {
  if (tipo === 'valoracion') {
    playRepartidorValoracionSound();
  } else {
    playRepartidorPedidoAsignadoSound();
  }
}
