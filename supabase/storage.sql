-- ============================================================
-- LEVANT — Configuración de Storage Seguro y Pagos Privados
-- ============================================================
-- Instrucciones:
-- Ejecuta este script UNA SOLA VEZ en el SQL Editor de Supabase.
-- Asegúrate de NO tener texto sombreado/seleccionado al pulsar "Run".
-- ============================================================

-- 1. CONFIGURACIÓN DEL BUCKET 'pagos' (Privado, máx 5MB, solo imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pagos',
  'pagos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'pagos';

-- 2. CONFIGURACIÓN DEL BUCKET 'productos' (Público, máx 5MB, solo imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'productos';

-- 3. LIMPIEZA DE POLÍTICAS PREVIAS DE 'pagos'
DROP POLICY IF EXISTS "Lectura pública de pagos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados suben comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados actualizan comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados eliminan comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "pagos_select_authorized" ON storage.objects;
DROP POLICY IF EXISTS "pagos_insert_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "pagos_update_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "pagos_delete_own_folder" ON storage.objects;

-- 4. POLÍTICA SELECT EN 'pagos' (URLs firmadas createSignedUrl y descarga autorizada)
CREATE POLICY "pagos_select_authorized"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pagos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] = 'comprobantes'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.reportes_pago rp
      JOIN public.pedidos_entregas pe ON pe.id = rp.pedido_id
      JOIN public.comercios_datos cd ON cd.id = pe.comercio_id
      WHERE cd.profile_id = auth.uid()
        AND (
          rp.comprobante_url LIKE '%' || name || '%'
          OR name LIKE '%' || rp.cliente_id::text || '%'
          OR (storage.foldername(name))[1] = rp.cliente_id::text
          OR (
            (storage.foldername(name))[1] = 'comprobantes'
            AND (storage.foldername(name))[2] = rp.cliente_id::text
          )
        )
    )
  )
);

-- 5. POLÍTICA INSERT EN 'pagos' (Solo en carpeta personal y formatos de imagen válidos)
CREATE POLICY "pagos_insert_own_folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pagos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] = 'comprobantes'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    OR (SELECT public.is_admin())
  )
  AND LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- 6. POLÍTICA UPDATE EN 'pagos' (Solo en carpeta personal)
CREATE POLICY "pagos_update_own_folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pagos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] = 'comprobantes'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    OR (SELECT public.is_admin())
  )
)
WITH CHECK (
  bucket_id = 'pagos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] = 'comprobantes'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    OR (SELECT public.is_admin())
  )
  AND LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- 7. POLÍTICA DELETE EN 'pagos' (Solo en carpeta personal)
CREATE POLICY "pagos_delete_own_folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pagos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] = 'comprobantes'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    OR (SELECT public.is_admin())
  )
);

-- 8. LIMPIEZA DE POLÍTICAS PREVIAS DE 'productos'
DROP POLICY IF EXISTS "Lectura pública de productos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados suben imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados actualizan imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados eliminan imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "productos_insert_comercio" ON storage.objects;
DROP POLICY IF EXISTS "productos_update_comercio" ON storage.objects;
DROP POLICY IF EXISTS "productos_delete_comercio" ON storage.objects;

-- 9. POLÍTICA SELECT EN 'productos' (Lectura pública del catálogo)
CREATE POLICY "Lectura pública de productos"
ON storage.objects FOR SELECT
USING (bucket_id = 'productos');

-- 10. POLÍTICA INSERT EN 'productos' (Solo comercios autorizados y formatos válidos)
CREATE POLICY "productos_insert_comercio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'productos'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'productos'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT public.is_admin())
  )
  AND LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- 11. POLÍTICA UPDATE EN 'productos' (Solo comercios autorizados)
CREATE POLICY "productos_update_comercio"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'productos'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'productos'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT public.is_admin())
  )
)
WITH CHECK (
  bucket_id = 'productos'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'productos'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT public.is_admin())
  )
  AND LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- 12. POLÍTICA DELETE EN 'productos' (Solo comercios autorizados)
CREATE POLICY "productos_delete_comercio"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'productos'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'productos'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.comercios_datos WHERE profile_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT public.is_admin())
  )
);
