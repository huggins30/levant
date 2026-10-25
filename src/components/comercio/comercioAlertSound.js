/**
 * comercioAlertSound.js
 * Generador de alertas sonoras para Comercio utilizando Web Audio API nativo.
 * Produce sonidos nítidos, modernos y libres de latencia sin requerir archivos mp3 externos.
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
    console.warn('[AudioContext] No disponible:', e);
    return null;
  }
}

// Desbloquear AudioContext en la primera interacción para sortear políticas de autoplay de navegadores
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

/**
 * Verifica si el sonido está habilitado en las preferencias del comercio
 */
export function isSoundEnabled() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('levant_comercio_sound_enabled') !== 'false';
}

/**
 * Guarda la preferencia de sonido (activado/desactivado)
 */
export function setSoundEnabled(enabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('levant_comercio_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * Alerta Sonora: "Nuevo Pedido Hecho"
 * Timbre ascendente de 4 notas alegres (C5, E5, G5, C6) tipo caja registradora moderna.
 */
export function playNewOrderSound() {
  if (!isSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, start: 0.00, dur: 0.30, gain: 0.20 }, // Do5
      { freq: 659.25, start: 0.10, dur: 0.32, gain: 0.22 }, // Mi5
      { freq: 783.99, start: 0.20, dur: 0.38, gain: 0.25 }, // Sol5
      { freq: 1046.50, start: 0.30, dur: 0.55, gain: 0.28 }, // Do6
    ];

    notes.forEach(({ freq, start, dur, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
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
    console.warn('⚠️ Error al reproducir sonido de nuevo pedido:', err);
  }
}

/**
 * Alerta Sonora: "Pedido Entregado"
 * Acorde de éxito / victoria suave de 4 tonos con oscilador de triángulo cálido (D5, F#5, A5, D6).
 */
export function playOrderDeliveredSound() {
  if (!isSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, start: 0.00, dur: 0.28, gain: 0.18 }, // Re5
      { freq: 739.99, start: 0.11, dur: 0.30, gain: 0.20 }, // Fa#5
      { freq: 880.00, start: 0.22, dur: 0.38, gain: 0.24 }, // La5
      { freq: 1174.66, start: 0.33, dur: 0.60, gain: 0.28 }, // Re6
    ];

    notes.forEach(({ freq, start, dur, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'triangle';
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
    console.warn('⚠️ Error al reproducir sonido de pedido entregado:', err);
  }
}

/**
 * Probar alerta sonora según el tipo
 */
export function testSound(type = 'nuevo') {
  if (type === 'nuevo') {
    playNewOrderSound();
  } else {
    playOrderDeliveredSound();
  }
}

/**
 * Disparar notificación nativa de escritorio del sistema operativo
 */
export function triggerDesktopNotification({ title, body, onClick }) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
      });
      if (onClick) {
        notif.onclick = () => {
          try {
            window.focus();
          } catch {
            // Ignorar
          }
          onClick();
          notif.close();
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ Error al lanzar notificación de escritorio:', err);
  }
}

/**
 * Solicitar permiso para notificaciones de escritorio
 */
export async function requestDesktopNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}
