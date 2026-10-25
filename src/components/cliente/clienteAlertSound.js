/**
 * clienteAlertSound.js
 * Generador de alertas sonoras y notificaciones para Clientes usando Web Audio API nativo.
 * Produce un timbre limpio, moderno y elegante al asignarse un repartidor.
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
    console.warn('[AudioContext Cliente] No disponible:', e);
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

export function isClientSoundEnabled() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('levant_cliente_sound_enabled') !== 'false';
}

export function setClientSoundEnabled(enabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('levant_cliente_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * Alerta Sonora: "Repartidor Asignado"
 * Acorde alegre y futurista de 4 notas ascendentes (F5 -> A5 -> C6 -> F6)
 * con envolvente suave y resonancia tipo campana de notificación premium.
 */
export function playRepartidorAsignadoSound() {
  if (!isClientSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 698.46, start: 0.00, dur: 0.28, gain: 0.22, type: 'sine' },     // Fa5
      { freq: 880.00, start: 0.10, dur: 0.30, gain: 0.24, type: 'sine' },     // La5
      { freq: 1046.50, start: 0.20, dur: 0.35, gain: 0.26, type: 'sine' },    // Do6
      { freq: 1396.91, start: 0.32, dur: 0.55, gain: 0.30, type: 'triangle' },// Fa6
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
    console.warn('⚠️ Error al reproducir sonido de repartidor asignado:', err);
  }
}

/**
 * Solicitar permiso para notificaciones de escritorio en el navegador
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
 * Enviar notificación al sistema / escritorio
 */
export function showDesktopNotification(title, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const notif = new Notification(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: options.tag || 'levant-repartidor-asignado',
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
