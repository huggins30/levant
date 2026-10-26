import React from 'react';

/**
 * PedidosRealtimeBadge
 * 
 * Indicador visual en tiempo real (estilo app de delivery) para nuevos pedidos.
 * Diseñado con Tailwind CSS v4, animaciones nativas (animate-pulse + animate-ping)
 * y posición relativa/absoluta sobre cualquier icono o botón.
 * 
 * @param {boolean} active - Si el badge debe mostrarse
 * @param {number} [count=0] - Número de pedidos acumulados (opcional)
 * @param {'dot' | 'counter'} [variant='dot'] - 'dot' para punto rojo con ping, 'counter' para número
 * @param {string} [className=''] - Clases adicionales de Tailwind
 */
export default function PedidosRealtimeBadge({
  active = false,
  count = 0,
  variant = 'dot',
  className = '',
}) {
  if (!active) return null;

  // Variante con contador numérico si hay más de 1 pedido
  if (variant === 'counter' || count > 1) {
    return (
      <span
        className={`absolute -top-1.5 -right-2.5 z-20 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white shadow-lg shadow-red-600/60 ring-2 ring-gray-950/80 animate-pulse transition-all ${className}`}
        aria-label={`${count} nuevos pedidos`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  // Variante punto rojo pulsante clásico de apps de delivery (Uber Eats / PedidosYa / Rappi)
  return (
    <span
      className={`absolute -top-1 -right-1 z-20 flex h-3 w-3 items-center justify-center ${className}`}
      aria-label="Nuevo pedido pendiente"
    >
      {/* Halo de pulso expansivo */}
      <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-80 animate-ping" />
      {/* Punto rojo brillante */}
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600 shadow-md shadow-red-500/70 ring-1 ring-white/30 animate-pulse" />
    </span>
  );
}
