import { registerOrderHandlers } from './orderSocket.js';
import { registerChatHandlers } from './chatSocket.js';
import { authService } from '../services/authService.js';

/**
 * Inicializador principal de WebSockets con Socket.io
 * @param {import('socket.io').Server} io 
 */
export function initializeSockets(io) {
  // Middleware de Autenticación de Socket.io
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const token = auth.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (token) {
        try {
          const { user, profile } = await authService.verifyUserToken(token);
          socket.data.user = {
            id: user.id,
            email: user.email,
            nombre: profile?.nombre_completo || user.email?.split('@')[0],
            rol: profile?.rol || 'cliente'
          };
          return next();
        } catch (tokenErr) {
          console.warn('⚠️ [SocketAuth] Token no válido, usando fallback:', tokenErr.message);
        }
      }

      // Soporte para pruebas locales / fallback si se envían datos directos de usuario en handshake
      if (auth.user) {
        socket.data.user = {
          id: auth.user.id || `user_${socket.id.substring(0, 5)}`,
          nombre: auth.user.nombre_completo || auth.user.nombre || 'Usuario Levant',
          rol: auth.user.rol || 'cliente',
          email: auth.user.email || ''
        };
        return next();
      }

      // Conexión anónima permitida para tracking público con ID efímero
      socket.data.user = {
        id: `anon_${socket.id.substring(0, 6)}`,
        nombre: 'Invitado',
        rol: 'cliente'
      };
      next();
    } catch (err) {
      console.error('❌ [SocketAuth] Error en handshake:', err.message);
      next(new Error('Fallo en autenticación de socket'));
    }
  });

  // Manejo de conexiones
  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`⚡ [Socket.io] Conexión establecida: Socket ID: ${socket.id} | Usuario: ${user.nombre} (${user.rol})`);

    // Registro de manejadores de eventos modulares
    registerOrderHandlers(io, socket);
    registerChatHandlers(io, socket);

    // Evento de ping/latido para verificación de estado
    socket.on('system:ping', (ack) => {
      if (typeof ack === 'function') {
        ack({ status: 'ok', serverTime: Date.now() });
      } else {
        socket.emit('system:pong', { serverTime: Date.now() });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.io] Desconectado: ${socket.id} (${user.nombre}) - Motivo: ${reason}`);
    });
  });
}
