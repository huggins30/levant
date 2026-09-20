import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

let socketInstance = null;

/**
 * Obtiene o inicializa la instancia singleton de Socket.io
 * @param {object} options
 * @param {string} [options.token]
 * @param {object} [options.user]
 */
export function getSocket({ token, user } = {}) {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
      auth: {
        token: token || null,
        user: user || null
      }
    });
  } else if (token || user) {
    socketInstance.auth = {
      token: token || socketInstance.auth?.token,
      user: user || socketInstance.auth?.user
    };
  }

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
