-- ==============================================================================
-- LEVANT — FASE 4: ASIGNACIÓN DE REPARTIDORES SEGÚN EL PESO DEL PRODUCTO
-- Agrega columna peso_kg a la tabla productos y actualiza las funciones de asignación
-- ==============================================================================

-- 1. Agregar columna peso_kg a la tabla productos (por defecto 1.0 kg)
ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (peso_kg > 0);

COMMENT ON COLUMN public.productos.peso_kg IS 'Peso unitario en kilogramos (kg) para cálculo y asignación de vehículo de reparto adecuado.';

-- 2. Asegurar que tipos_vehiculo_id exista en repartidores_datos
ALTER TABLE public.repartidores_datos
ADD COLUMN IF NOT EXISTS tipos_vehiculo_id INTEGER
REFERENCES public.tipos_vehiculo(id) ON DELETE SET NULL;

-- 3. Función auxiliar para calcular el peso total de un pedido
CREATE OR REPLACE FUNCTION public.calcular_peso_pedido(p_pedido_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_peso_total NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(pi.cantidad * COALESCE(p.peso_kg, 1.0)), 1.0)
  INTO v_peso_total
  FROM public.pedido_items pi
  JOIN public.productos p ON p.id = pi.producto_id
  WHERE pi.pedido_id = p_pedido_id;

  RETURN COALESCE(v_peso_total, 1.0);
END;
$$;
