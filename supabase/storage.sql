-- ============================================================
-- LEVANT — Configuración de Storage (Supabase)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. BUCKET: PRODUCTOS (Imágenes de productos)
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) 
VALUES ('productos', 'productos', true) 
ON CONFLICT (id) DO NOTHING;

-- Políticas para 'productos'
CREATE POLICY "Lectura pública de productos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'productos');

CREATE POLICY "Usuarios autenticados suben imágenes de productos" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'productos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados actualizan imágenes de productos" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'productos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados eliminan imágenes de productos" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'productos' AND auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────
-- 2. BUCKET: PAGOS (Comprobantes de transferencias/pago móvil)
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) 
VALUES ('pagos', 'pagos', true) 
ON CONFLICT (id) DO NOTHING;

-- Políticas para 'pagos'
CREATE POLICY "Lectura pública de pagos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'pagos');

CREATE POLICY "Usuarios autenticados suben comprobantes" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'pagos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados actualizan comprobantes" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'pagos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados eliminan comprobantes" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'pagos' AND auth.uid() IS NOT NULL);
