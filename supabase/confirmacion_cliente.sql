-- ============================================================
-- LEVANT: Confirmación de Entrega por el Cliente
-- ============================================================

-- 1. Agregar columna para registrar la confirmación del cliente
ALTER TABLE public.pedidos_entregas 
ADD COLUMN IF NOT EXISTS confirmacion_cliente BOOLEAN DEFAULT FALSE;

-- 2. Asegurar que las políticas RLS permitan al cliente actualizar confirmacion_cliente y valoracion
DROP POLICY IF EXISTS "pedidos_cliente_update_valoracion" ON public.pedidos_entregas;
DROP POLICY IF EXISTS "pedidos_update_cliente" ON public.pedidos_entregas;

CREATE POLICY "pedidos_update_cliente" ON public.pedidos_entregas
  FOR UPDATE
  USING (cliente_id = auth.uid())
  WITH CHECK (cliente_id = auth.uid());
