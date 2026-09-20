import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getSocket } from '../../lib/socket';
import { 
  FileEditIcon, StoreIcon, UtensilsIcon, MotoIcon, 
  CheckCircleIcon, ZapIcon, ReceiptIcon, ChatIcon 
} from '../common/Icons';
import './RastreoPedidoNeumorphic.css';

// Configuración de los 5 estados del flujo en tiempo real
const TIMELINE_STEPS = [
  { key: 'pendiente', label: 'Pendiente', icon: FileEditIcon, desc: 'Esperando confirmación del comercio' },
  { key: 'confirmado', label: 'Confirmado', icon: StoreIcon, desc: 'El comercio ha aceptado el pedido' },
  { key: 'en_preparacion', label: 'En Preparación', icon: UtensilsIcon, desc: 'Preparando tus productos' },
  { key: 'en_camino', label: 'En Camino', icon: MotoIcon, desc: 'Repartidor en ruta a tu dirección' },
  { key: 'entregado', label: 'Entregado', icon: CheckCircleIcon, desc: '¡Pedido entregado con éxito!' }
];

export default function RastreoPedidoNeumorphic({ session }) {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Estados de Socket y Chat
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [socketError, setSocketError] = useState(null);

  const socketRef = useRef(null);
  const chatBottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ── 1. Cargar pedidos del cliente desde Supabase ─────────────────────────
  useEffect(() => {
    if (!session?.user?.id) return;

    async function loadClientOrders() {
      setLoadingOrders(true);
      try {
        const { data, error } = await supabase
          .from('pedidos_entregas')
          .select(`
            id, estado, total_usd, direccion_entrega, created_at,
            comercio:comercios_datos(id, nombre_comercial, logo_url),
            repartidor:repartidores_datos(
              id, vehiculo, placa,
              profile:profiles(nombre_completo, telefono)
            )
          `)
          .eq('cliente_id', session.user.id)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          setOrders(data);
          setSelectedOrderId(data[0].id);
          setActiveOrder(data[0]);
        } else {
          // Si el usuario aún no tiene pedidos en BD, proveer un pedido interactivo de demostración
          const mockOrder = {
            id: 'ord_demo_7721',
            estado: 'en_camino',
            total_usd: '14.50',
            direccion_entrega: 'Av. Francisco de Miranda, Edif. Parque Cristal',
            created_at: new Date().toISOString(),
            comercio: { nombre_comercial: 'Burger & Shake Express' },
            repartidor: {
              vehiculo: 'moto',
              placa: 'AA7B12',
              profile: { nombre_completo: 'Carlos Mendoza', telefono: '0414-1234567' }
            }
          };
          setOrders([mockOrder]);
          setSelectedOrderId(mockOrder.id);
          setActiveOrder(mockOrder);
        }
      } catch (err) {
        console.error('Error al cargar pedidos del cliente:', err);
      } finally {
        setLoadingOrders(false);
      }
    }

    loadClientOrders();
  }, [session]);

  // Actualizar pedido activo al cambiar de selector
  useEffect(() => {
    if (!selectedOrderId) return;
    const found = orders.find((o) => o.id === selectedOrderId);
    if (found) setActiveOrder(found);
  }, [selectedOrderId, orders]);

  // ── 2. Conexión WebSocket y gestión de eventos de Pedido & Chat ─────────
  useEffect(() => {
    if (!selectedOrderId) return;

    const token = session?.access_token;
    const userPayload = {
      id: session?.user?.id || 'client_anon',
      nombre: session?.user?.user_metadata?.nombre_completo || 'Cliente',
      rol: 'cliente'
    };

    const socket = getSocket({ token, user: userPayload });
    socketRef.current = socket;

    socket.connect();

    function onConnect() {
      setIsConnected(true);
      setSocketError(null);
      // Unirse a las salas del pedido y del chat
      socket.emit('order:join', { orderId: selectedOrderId });
      socket.emit('chat:join', { orderId: selectedOrderId });
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onConnectError(err) {
      setIsConnected(false);
      setSocketError(`Reconectando al servidor en tiempo real... (${err.message})`);
    }

    function onOrderJoined(data) {
      if (data?.order) {
        setActiveOrder((prev) => ({ ...prev, ...data.order }));
      }
    }

    function onOrderStatusChanged(data) {
      if (data.orderId === selectedOrderId) {
        setActiveOrder((prev) => (prev ? { ...prev, estado: data.nuevoEstado } : prev));
      }
    }

    function onLocationReceived(data) {
      if (data.orderId === selectedOrderId) {
        setDriverLocation(data.coords);
      }
    }

    function onChatHistory(data) {
      if (data.orderId === selectedOrderId) {
        setMessages(data.messages || []);
      }
    }

    function onNewMessage(data) {
      if (data.orderId === selectedOrderId) {
        setMessages((prev) => [...prev, data.message]);
      }
    }

    function onUserTyping(data) {
      if (data.orderId === selectedOrderId && data.userId !== session?.user?.id) {
        setIsTyping(data.isTyping);
      }
    }

    // Registrar listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('order:joined', onOrderJoined);
    socket.on('order:status_changed', onOrderStatusChanged);
    socket.on('order:location_received', onLocationReceived);
    socket.on('chat:history', onChatHistory);
    socket.on('chat:new_message', onNewMessage);
    socket.on('chat:user_typing', onUserTyping);

    // Si ya estaba conectado
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.emit('order:leave', { orderId: selectedOrderId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('order:joined', onOrderJoined);
      socket.off('order:status_changed', onOrderStatusChanged);
      socket.off('order:location_received', onLocationReceived);
      socket.off('chat:history', onChatHistory);
      socket.off('chat:new_message', onNewMessage);
      socket.off('chat:user_typing', onUserTyping);
    };
  }, [selectedOrderId, session]);

  // Auto-scroll al recibir mensaje
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── 3. Manejadores de envío de mensajes ─────────────────────────────────
  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || !socketRef.current) return;

    socketRef.current.emit('chat:send_message', {
      orderId: selectedOrderId,
      mensaje: inputMessage.trim()
    });

    socketRef.current.emit('chat:typing', {
      orderId: selectedOrderId,
      isTyping: false
    });

    setInputMessage('');
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (!socketRef.current) return;

    socketRef.current.emit('chat:typing', {
      orderId: selectedOrderId,
      isTyping: true
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('chat:typing', {
        orderId: selectedOrderId,
        isTyping: false
      });
    }, 1500);
  };

  const sendQuickChip = (text) => {
    if (!socketRef.current) return;
    socketRef.current.emit('chat:send_message', {
      orderId: selectedOrderId,
      mensaje: text
    });
  };

  // Simular avance de estado local (para demostración en vivo)
  const handleSimulateNextStep = () => {
    if (!activeOrder) return;
    const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === activeOrder.estado);
    const nextStep = TIMELINE_STEPS[(currentIndex + 1) % TIMELINE_STEPS.length];
    
    // Emitir al socket para que viaje en tiempo real
    if (socketRef.current && isConnected) {
      socketRef.current.emit('order:status_update', {
        orderId: selectedOrderId,
        nuevoEstado: nextStep.key,
        nota: 'Actualizado vía simulación de tiempo real'
      });
    } else {
      // Fallback local
      setActiveOrder((prev) => ({ ...prev, estado: nextStep.key }));
    }
  };

  // Cálculo del índice de progreso
  const currentStepIndex = TIMELINE_STEPS.findIndex((s) => s.key === (activeOrder?.estado || 'pendiente'));
  const progressPercent = Math.max(0, Math.min(100, (currentStepIndex / (TIMELINE_STEPS.length - 1)) * 100));

  if (loadingOrders) {
    return (
      <div className="neu-panel-container flex items-center justify-center p-12">
        <div className="neu-card rounded-3xl p-8 flex items-center gap-4">
          <span className="w-4 h-4 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-zinc-300 font-medium">Cargando panel de rastreo en tiempo real...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-panel-container p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* ── HEADER NEUMÓRFICO ── */}
      <header className="neu-card rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-4">
            <div className="neu-icon-badge-amber">
              <ZapIcon size={24} color="#f59e0b" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Rastreo en Vivo & Chat Directo
              </h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Arquitectura WebSockets con sincronización bidireccional continua
              </p>
            </div>
          </div>
        </div>

        {/* Indicador de Conexión en Tiempo Real */}
        <div className="flex items-center gap-3">
          <div className={`neu-badge-inset px-4 py-2.5 rounded-2xl flex items-center gap-3 ${
            isConnected ? 'border border-emerald-500/20' : 'border border-amber-500/20'
          }`}>
            <span className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-emerald-400 neu-pulse-active' : 'bg-amber-400 animate-pulse'
            }`} />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {isConnected ? (
                <span className="text-emerald-400">Socket.io Conectado</span>
              ) : (
                <span className="text-amber-400">Reconectando</span>
              )}
            </span>
          </div>

          {/* Selector de Pedidos */}
          {orders.length > 1 && (
            <div className="neu-card-inset px-3 py-1.5 rounded-2xl">
              <select
                value={selectedOrderId || ''}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer py-1"
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id} className="bg-[#18181b] text-white">
                    Pedido #{o.id.substring(0, 8)} ({o.estado})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {socketError && (
        <div className="neu-card rounded-2xl p-4 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
          <span>⚠️ {socketError} (Asegúrate de que el servidor en `server/` esté activo en puerto 4000)</span>
          <button
            onClick={() => socketRef.current?.connect()}
            className="neu-button px-3 py-1 rounded-xl text-white text-xs font-semibold"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── SECCIÓN 1: TIMELINE DE ESTADOS NEUMÓRFICA ── */}
      <section className="neu-card rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
              Estado de la Entrega
            </span>
            <h2 className="text-xl font-bold text-white capitalize mt-0.5">
              {TIMELINE_STEPS.find((s) => s.key === activeOrder?.estado)?.label || activeOrder?.estado}
            </h2>
          </div>

          {/* Botón de Demostración para Simular Cambio de Estado en Vivo */}
          <button
            onClick={handleSimulateNextStep}
            className="neu-button-gold px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 self-start sm:self-auto cursor-pointer"
            title="Simula la recepción de evento de WebSocket de cambio de estado"
          >
            <span>🔄 Probar Siguiente Estado</span>
          </button>
        </div>

        {/* Barra de Progreso Neumórfica */}
        <div className="relative pt-4 pb-2">
          {/* Canal cóncavo / Inset */}
          <div className="neu-card-inset h-3 w-full rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(16,185,129,0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Stepper de Nodos */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
            {TIMELINE_STEPS.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const isFuture = idx > currentStepIndex;

              return (
                <div
                  key={step.key}
                  className={`neu-card-inset rounded-2xl p-4 flex flex-col items-center text-center transition-all duration-300 ${
                    isCurrent
                      ? 'border border-emerald-500/40 bg-[#19221d] shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : isPast
                      ? 'border border-white/5 opacity-90'
                      : 'opacity-40'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-all ${
                      isCurrent
                        ? 'neu-button-emerald neu-pulse-active scale-110'
                        : isPast
                        ? 'neu-badge border-emerald-500/30'
                        : 'neu-badge-inset'
                    }`}
                  >
                    <step.icon 
                      size={22} 
                      color={isCurrent ? '#ffffff' : isPast ? '#10b981' : '#71717a'} 
                    />
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      isCurrent ? 'text-emerald-400' : isPast ? 'text-zinc-200' : 'text-zinc-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1 leading-tight line-clamp-2">
                    {step.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 2: GRID DOBLE (DETALLES Y CHAT EN VIVO) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda: Información del Pedido y Repartidor (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tarjeta de Resumen del Pedido */}
          <div className="neu-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wider text-amber-400 font-bold flex items-center gap-2">
                <ReceiptIcon size={18} color="#f59e0b" /> Resumen del Pedido
              </h3>
              <span className="neu-tag-amber">Detalle</span>
            </div>

            <div className="neu-card-inset rounded-2xl p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Identificador:</span>
                <span className="font-mono text-zinc-200 text-xs">#{activeOrder?.id?.substring(0, 12)}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Comercio:</span>
                <span className="text-white font-medium">{activeOrder?.comercio?.nombre_comercial || 'Comercio Levant'}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Monto Total:</span>
                <span className="text-emerald-400 font-bold text-base">${Number(activeOrder?.total_usd || 0).toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between items-start text-zinc-400 pt-1 border-t border-white/5">
                <span>Entrega en:</span>
                <span className="text-zinc-200 text-right max-w-[60%] text-xs font-medium">
                  {activeOrder?.direccion_entrega}
                </span>
              </div>
            </div>
          </div>

          {/* Tarjeta del Repartidor */}
          <div className="neu-card rounded-3xl p-6 space-y-4">
            <h3 className="text-sm uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-2">
              <span>🛵</span> Repartidor Asignado
            </h3>

            {activeOrder?.repartidor ? (
              <div className="neu-card-inset rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="neu-icon-badge-amber">
                    <MotoIcon size={24} color="#f59e0b" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">
                      {activeOrder.repartidor.profile?.nombre_completo || 'Repartidor Levant'}
                    </h4>
                    <p className="text-zinc-400 text-xs">
                      Vehículo: <span className="capitalize text-zinc-300">{activeOrder.repartidor.vehiculo || 'Moto'}</span> • Placa: <span className="font-mono text-amber-400 font-semibold">{activeOrder.repartidor.placa || 'En trámite'}</span>
                    </p>
                  </div>
                </div>

                {activeOrder.repartidor.profile?.telefono && (
                  <a
                    href={`tel:${activeOrder.repartidor.profile.telefono}`}
                    className="neu-button px-3.5 py-2 rounded-xl text-emerald-400 text-xs font-semibold hover:text-emerald-300"
                  >
                    📞 Llamar
                  </a>
                )}
              </div>
            ) : (
              <div className="neu-card-inset rounded-2xl p-4 text-center text-zinc-400 text-xs">
                Asignando repartidor disponible en tu zona...
              </div>
            )}

            {/* Telemetría en Vivo si está en camino */}
            {driverLocation && (
              <div className="neu-card-inset rounded-2xl p-4 space-y-2 border border-emerald-500/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Telemetría GPS Activa
                  </span>
                  <span className="text-zinc-400 font-mono text-[11px]">
                    {driverLocation.speed ? `${Math.round(driverLocation.speed)} km/h` : 'En trayecto'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 font-mono">
                  Lat: {driverLocation.lat?.toFixed(5)} | Lng: {driverLocation.lng?.toFixed(5)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Chat en Tiempo Real (7 cols) */}
        <div className="lg:col-span-7">
          <div className="neu-card rounded-3xl p-6 flex flex-col h-[560px]">
            {/* Cabecera del Chat */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="neu-icon-badge-amber">
                  <ChatIcon size={22} color="#f59e0b" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">
                    Chat con Repartidor / Comercio
                  </h3>
                  <p className="text-zinc-400 text-[11px]">
                    Canal cifrado y privado para el pedido #{activeOrder?.id?.substring(0, 8)}
                  </p>
                </div>
              </div>
              <span className="text-[11px] neu-badge px-2.5 py-1 rounded-xl text-zinc-400">
                WebSocket
              </span>
            </div>

            {/* Mensajes del Chat */}
            <div className="flex-1 overflow-y-auto neu-chat-scroll py-4 space-y-3 pr-1">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                  <span className="neu-badge w-14 h-14 rounded-2xl text-2xl mb-3">
                    ✉️
                  </span>
                  <p className="text-xs font-medium text-zinc-400">No hay mensajes previos</p>
                  <p className="text-[11px] mt-1 max-w-xs">
                    Inicia la conversación para coordinar la entrega o cualquier instrucción especial.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMine = msg.sender_id === session?.user?.id || msg.sender_rol === 'cliente';
                  return (
                    <div
                      key={msg.id || i}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] text-zinc-400 font-semibold capitalize">
                          {isMine ? 'Tú' : msg.sender_nombre || msg.sender_rol}
                        </span>
                        {!isMine && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold uppercase">
                            {msg.sender_rol}
                          </span>
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs font-normal leading-relaxed ${
                          isMine ? 'neu-bubble-client rounded-br-none' : 'neu-bubble-other rounded-bl-none'
                        }`}
                      >
                        {msg.mensaje}
                      </div>
                      <span className="text-[9px] text-zinc-500 mt-1 px-1">
                        {new Date(msg.created_at || Date.now()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  );
                })
              )}

              {/* Indicador de escritura */}
              {isTyping && (
                <div className="flex items-center gap-2 text-zinc-400 text-xs italic py-1 px-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] text-zinc-400">Repartidor está escribiendo...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Chips Rápidos */}
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1">
              {['¿Dónde te encuentras?', '¡Ya voy bajando!', 'Favor llamar al llegar'].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => sendQuickChip(chip)}
                  className="neu-button px-3 py-1 rounded-xl text-[11px] text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Formulario de Entrada */}
            <form onSubmit={handleSendMessage} className="flex gap-2 pt-2 border-t border-white/5">
              <input
                type="text"
                value={inputMessage}
                onChange={handleInputChange}
                placeholder="Escribe un mensaje en tiempo real..."
                className="neu-input flex-1 rounded-2xl px-4 py-3 text-xs focus:ring-1 focus:ring-emerald-500/50"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="neu-button-emerald px-5 py-3 rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Enviar ⚡
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
