import http from 'http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config/env.js';
import { initializeSockets } from './sockets/index.js';

// Crear servidor HTTP integrado con Express
const httpServer = http.createServer(app);

// Inicializar Socket.io con configuración CORS
const io = new Server(httpServer, {
  cors: {
    origin: [config.corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

// Vincular eventos y manejadores de sockets
initializeSockets(io);

// Iniciar servidor
const PORT = config.port;
httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 [Levant Server] Microservicio en Tiempo Real Activo`);
  console.log(`📡 HTTP & REST API: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Server: ws://localhost:${PORT}`);
  console.log(`🩺 Health Check:    http://localhost:${PORT}/health`);
  console.log(`====================================================`);
});

// Cierre elegante
function handleGracefulShutdown(signal) {
  console.log(`\n🛑 Recibida señal ${signal}. Cerrando servidor de forma segura...`);
  io.close(() => {
    console.log('🔌 Conexiones de Socket.io cerradas.');
    httpServer.close(() => {
      console.log('🏁 Servidor HTTP detenido.');
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
