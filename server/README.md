# Levant — Servidor de Microservicios en Tiempo Real

Servidor modular basado en **Node.js**, **Express**, **Socket.io** y **Supabase** diseñado para gestionar el ciclo de vida de pedidos, telemetría y chat directo cliente-repartidor-comercio.

---

## 🏗️ Arquitectura de Servicios

```
server/
├── src/
│   ├── config/
│   │   ├── env.js           # Variables de entorno y validación
│   │   └── supabase.js      # Conexión persistente con Supabase PostgreSQL
│   ├── services/
│   │   ├── authService.js   # Microservicio 1: Autenticación, JWT y roles
│   │   ├── catalogService.js# Microservicio 2: Catálogo e inventario
│   │   ├── orderService.js  # Microservicio 3: Ciclo de vida y transición de pedidos
│   │   └── chatService.js   # Microservicio 4: Persistencia y despacho de mensajería
│   ├── sockets/
│   │   ├── index.js         # Bootstrap de Socket.io y Middleware de autenticación
│   │   ├── orderSocket.js   # Canales en tiempo real para estados de pedidos y GPS
│   │   └── chatSocket.js    # Canales en tiempo real para chat directo y escritura
│   ├── app.js               # Instancia Express, CORS, parseo y endpoints REST
│   └── server.js            # Punto de entrada HTTP + WebSocket Server
├── .env                     # Variables de entorno locales
├── .env.example             # Plantilla de configuración
└── package.json
```

---

## ⚡ Especificación de Eventos WebSocket (Socket.io)

### 1. Autenticación y Handshake
Al conectarse con `socket.io-client`:
```javascript
const socket = io("http://localhost:4000", {
  auth: {
    token: supabaseAccessToken // o { user: { id, nombre, rol } }
  }
});
```

### 2. Eventos de Pedidos (`orderSocket`)
| Evento (Emit) | Payload | Destinatario | Descripción |
|---|---|---|---|
| `order:join` | `{ orderId }` | Servidor | Se une a la sala `order:${orderId}`. Responde con `order:joined` |
| `order:leave` | `{ orderId }` | Servidor | Abandona la sala del pedido |
| `order:status_update` | `{ orderId, nuevoEstado, nota }` | Servidor | Actualiza estado (`pendiente` ➔ `confirmado` ➔ `en_preparacion` ➔ `en_camino` ➔ `entregado`) |
| `order:location_update` | `{ orderId, coords: { lat, lng } }` | Servidor | El repartidor emite coordenadas GPS en vivo |

**Eventos Escuchados por el Cliente:**
- `order:joined`: Recibe el estado actual y detalles completos del pedido.
- `order:status_changed`: Broadcast en sala cuando cambia el estado del pedido.
- `order:location_received`: Broadcast con las coordenadas del repartidor en movimiento.
- `order:user_connected`: Notifica cuando el cliente, repartidor o comercio entran a la sala.
- `order:error`: Reporta errores de validación de estado o permisos.

---

### 3. Eventos de Chat (`chatSocket`)
| Evento (Emit) | Payload | Destinatario | Descripción |
|---|---|---|---|
| `chat:join` | `{ orderId }` | Servidor | Se une a la sala `chat:${orderId}` y recibe `chat:history` |
| `chat:send_message` | `{ orderId, mensaje, attachmentUrl }` | Servidor | Envía mensaje directo. Persiste y despacha a la sala |
| `chat:typing` | `{ orderId, isTyping: true/false }` | Servidor | Emite indicador "escribiendo..." en vivo |
| `chat:mark_read` | `{ orderId }` | Servidor | Marca los mensajes como leídos |

**Eventos Escuchados por el Cliente:**
- `chat:history`: Lista de mensajes previos del pedido.
- `chat:new_message`: Nuevo mensaje recibido en tiempo real.
- `chat:user_typing`: Notifica que otro participante está redactando.
- `chat:messages_read`: Confirmación de lectura.

---

## 🚀 Puesta en Marcha

### En desarrollo:
```bash
cd server
npm run dev
```

### En producción:
```bash
cd server
npm start
```
