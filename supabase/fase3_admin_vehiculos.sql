-- ==============================================================================
-- LEVANT — FASE 3: MÓDULO ADMIN + CLASIFICACIÓN DE VEHÍCULOS
-- Nuevas entidades: TiposVehiculo (tabla), Vehiculo
-- Nuevo rol: admin — puede crear comercios y repartidores
-- NOTA: El ENUM tipo_vehiculo ya existe en Fase 2 ('moto','carro','bicicleta','a_pie')
--       Por eso la TABLA se llama tipos_vehiculo (plural) para evitar conflicto.
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENDER ENUM user_role PARA INCLUIR 'admin'
--    (Ejecutar primero este bloque por separado si falla el DO block)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: TIPOS_VEHICULO (Catálogo de vehículos de reparto)
--    Nombre en plural para no conflictuar con el ENUM tipo_vehiculo de Fase 2
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tipos_vehiculo (
  id                   SERIAL PRIMARY KEY,
  nombre               TEXT NOT NULL CHECK (char_length(nombre) >= 2),
  capacidad_peso_kg    NUMERIC(10, 2) NOT NULL CHECK (capacidad_peso_kg > 0),
  capacidad_volumen_m3 NUMERIC(10, 4) NOT NULL CHECK (capacidad_volumen_m3 > 0),
  descripcion          TEXT,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tipos_vehiculo_activo ON public.tipos_vehiculo(activo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DATOS INICIALES: TIPOS DE VEHÍCULO
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tipos_vehiculo (nombre, capacidad_peso_kg, capacidad_volumen_m3, descripcion)
SELECT * FROM (VALUES
  (
    'Motocicleta',
    20.00::NUMERIC,
    0.0500::NUMERIC,
    'Ideal para pedidos pequeños y urgentes: comida rápida, medicamentos, documentos. Alta agilidad en tráfico urbano.'
  ),
  (
    'Automóvil / Sedán',
    150.00::NUMERIC,
    0.4000::NUMERIC,
    'Apto para pedidos medianos: paquetería, ropa, electrónicos pequeños. Buena relación capacidad/costo.'
  ),
  (
    'Van / Furgoneta de Carga',
    800.00::NUMERIC,
    3.5000::NUMERIC,
    'Para pedidos de volumen alto: electrodomésticos, múltiples bultos, mercancía de supermercado.'
  ),
  (
    'Camioneta de Carga 3.5T',
    1500.00::NUMERIC,
    8.0000::NUMERIC,
    'Máxima capacidad de carga. Ideal para mudanzas, materiales de construcción, distribución masiva.'
  )
) AS v(nombre, capacidad_peso_kg, capacidad_volumen_m3, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_vehiculo LIMIT 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: VEHICULO (Vehículos registrados de cada repartidor)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehiculo (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  placa            TEXT NOT NULL CHECK (char_length(placa) >= 4),
  marca_modelo     TEXT NOT NULL CHECK (char_length(marca_modelo) >= 2),
  color            TEXT,
  tipo_vehiculo_id INTEGER NOT NULL REFERENCES public.tipos_vehiculo(id) ON DELETE RESTRICT,
  repartidor_id    UUID NOT NULL REFERENCES public.repartidores_datos(id) ON DELETE CASCADE,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehiculo_repartidor ON public.vehiculo(repartidor_id);
CREATE INDEX IF NOT EXISTS idx_vehiculo_tipo       ON public.vehiculo(tipo_vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_vehiculo_activo     ON public.vehiculo(activo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehiculo_placa ON public.vehiculo(placa);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. EXTENDER repartidores_datos
--    Agregar FK tipos_vehiculo_id para asignación rápida del tipo de vehículo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.repartidores_datos
  ADD COLUMN IF NOT EXISTS tipos_vehiculo_id INTEGER
    REFERENCES public.tipos_vehiculo(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. FUNCIÓN handle_updated_at (idempotente — no falla si ya existe en Fase 2)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TRIGGER updated_at para nuevas tablas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tipos_vehiculo', 'vehiculo']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FUNCIONES HELPER DE FASE 2 (idempotentes — CREATE OR REPLACE)
--    Se incluyen aquí por si fase2 no fue ejecutada en este proyecto.
-- ─────────────────────────────────────────────────────────────────────────────

-- Obtener rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid();
$$;

-- Obtener el ID de comercio del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_my_comercio_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.comercios_datos WHERE profile_id = auth.uid() LIMIT 1;
$$;

-- Obtener el ID de repartidor del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_my_repartidor_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.repartidores_datos WHERE profile_id = auth.uid() LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FUNCIÓN DE SERVICIO: evaluar_tipo_vehiculo_requerido
--    Retorna la fila de tipos_vehiculo mínima que cubre peso y volumen dados.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluar_tipo_vehiculo_requerido(
  p_peso_total_kg    NUMERIC,
  p_volumen_total_m3 NUMERIC
)
RETURNS public.tipos_vehiculo LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  resultado public.tipos_vehiculo;
BEGIN
  -- El tipo más pequeño que aún soporta peso y volumen del pedido
  SELECT * INTO resultado
  FROM public.tipos_vehiculo
  WHERE activo = TRUE
    AND capacidad_peso_kg    >= p_peso_total_kg
    AND capacidad_volumen_m3 >= p_volumen_total_m3
  ORDER BY capacidad_peso_kg ASC, capacidad_volumen_m3 ASC
  LIMIT 1;

  -- Fallback: si ninguno alcanza, devolver el de mayor capacidad
  IF resultado IS NULL THEN
    SELECT * INTO resultado
    FROM public.tipos_vehiculo
    WHERE activo = TRUE
    ORDER BY capacidad_peso_kg DESC, capacidad_volumen_m3 DESC
    LIMIT 1;
  END IF;

  RETURN resultado;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FUNCIÓN HELPER: is_admin()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY — Nuevas tablas
-- ─────────────────────────────────────────────────────────────────────────────

-- TIPOS_VEHICULO: Lectura para todos los autenticados; escritura solo admin
ALTER TABLE public.tipos_vehiculo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tipos_vehiculo_select_auth"  ON public.tipos_vehiculo;
CREATE POLICY "tipos_vehiculo_select_auth" ON public.tipos_vehiculo
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "tipos_vehiculo_manage_admin" ON public.tipos_vehiculo;
CREATE POLICY "tipos_vehiculo_manage_admin" ON public.tipos_vehiculo
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- VEHICULO: El repartidor dueño o el admin
ALTER TABLE public.vehiculo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehiculo_select_auth" ON public.vehiculo;
CREATE POLICY "vehiculo_select_auth" ON public.vehiculo
  FOR SELECT USING (
    repartidor_id = public.get_my_repartidor_id() OR public.is_admin()
  );

DROP POLICY IF EXISTS "vehiculo_manage_admin" ON public.vehiculo;
CREATE POLICY "vehiculo_manage_admin" ON public.vehiculo
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vehiculo_insert_repartidor" ON public.vehiculo;
CREATE POLICY "vehiculo_insert_repartidor" ON public.vehiculo
  FOR INSERT WITH CHECK (
    repartidor_id = public.get_my_repartidor_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS EXTENDIDO — Admin puede gestionar todo
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_admin_all"     ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "comercios_admin_all"    ON public.comercios_datos;
CREATE POLICY "comercios_admin_all" ON public.comercios_datos
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "repartidores_admin_all" ON public.repartidores_datos;
CREATE POLICY "repartidores_admin_all" ON public.repartidores_datos
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pedidos_admin_all"      ON public.pedidos_entregas;
CREATE POLICY "pedidos_admin_all" ON public.pedidos_entregas
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RPC: admin_completar_repartidor
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_completar_repartidor(
  p_profile_id        UUID,
  p_cedula            TEXT,
  p_tipos_vehiculo_id INTEGER DEFAULT NULL
)
RETURNS public.repartidores_datos LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  resultado public.repartidores_datos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden ejecutar esta función';
  END IF;

  INSERT INTO public.repartidores_datos (profile_id, cedula, tipos_vehiculo_id, vehiculo)
  VALUES (p_profile_id, p_cedula, p_tipos_vehiculo_id, 'moto')
  ON CONFLICT (profile_id) DO UPDATE
    SET cedula           = EXCLUDED.cedula,
        tipos_vehiculo_id = EXCLUDED.tipos_vehiculo_id,
        updated_at       = NOW()
  RETURNING * INTO resultado;

  RETURN resultado;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. RPC: admin_completar_comercio
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_completar_comercio(
  p_profile_id       UUID,
  p_nombre_comercial TEXT,
  p_direccion        TEXT,
  p_categoria        categoria_comercio DEFAULT 'otro',
  p_rif              TEXT DEFAULT NULL
)
RETURNS public.comercios_datos LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  resultado public.comercios_datos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden ejecutar esta función';
  END IF;

  INSERT INTO public.comercios_datos (profile_id, nombre_comercial, direccion, categoria, rif)
  VALUES (p_profile_id, p_nombre_comercial, p_direccion, p_categoria, p_rif)
  ON CONFLICT (profile_id) DO UPDATE
    SET nombre_comercial = EXCLUDED.nombre_comercial,
        direccion        = EXCLUDED.direccion,
        categoria        = EXCLUDED.categoria,
        rif              = EXCLUDED.rif,
        updated_at       = NOW()
  RETURNING * INTO resultado;

  RETURN resultado;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. REALTIME en nuevas tablas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tipos_vehiculo REPLICA IDENTITY FULL;
ALTER TABLE public.vehiculo       REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tipos_vehiculo;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vehiculo;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. ASIGNAR ROL ADMIN (editar email antes de ejecutar)
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.profiles SET rol = 'admin' WHERE email = 'tu_admin@email.com';
