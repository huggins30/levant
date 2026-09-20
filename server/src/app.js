import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { orderService } from './services/orderService.js';
import { catalogService } from './services/catalogService.js';
import { chatService } from './services/chatService.js';

export const app = express();

// Middlewares globales
app.use(cors({
  origin: [config.corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// Verificación de estado del servicio
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Levant Real-Time Order & Chat Microservice',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// Rutas REST complementarias para microservicios
app.get('/api/orders/:orderId', async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.orderId);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

app.get('/api/catalog/:comercioId', async (req, res, next) => {
  try {
    const products = await catalogService.getProductsByComercio(req.params.comercioId);
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
});

app.get('/api/chat/:orderId', async (req, res, next) => {
  try {
    const messages = await chatService.getMessagesByOrder(req.params.orderId);
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
});

// Manejador centralizado de errores
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('❌ [API Error]:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor'
  });
});
