-- ==============================================================================
-- LEVANT — FASE 2: ESQUEMA SQL OPTIMIZADO PARA SUPABASE (POSTGRESQL)
-- Arquitectura de Tiempo Real: Perfiles, Catálogo, Pedidos, Chat & Políticas RLS
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONES BÁSICAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TIPOS ENUMERADOS (IDEMPOTENTES)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('cliente', 'comercio', 'repartidor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categoria_comercio') THEN
    CREATE TYPE categoria_comercio AS ENUM (
      'restaurante', 'farmacia', 'supermercado', 'tecnologia',
      'ropa', 'ferreteria', 'panaderia', 'licoreria', 'otro'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_vehiculo') THEN
    CREATE TYPE tipo_vehiculo AS ENUM ('moto', 'carro', 'bicicleta', 'a_pie');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pedido') THEN
    CREATE TYPE estado_pedido AS ENUM (
      'pendiente', 'confirmado', 'en_preparacion',
      'en_camino', 'entregado', 'cancelado'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA: PROFILES (Perfiles vinculados 1:1 con auth.users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL UNIQUE,
  nombre_completo  TEXT NOT NULL CHECK (char_length(nombre_completo) >= 2),
  telefono         TEXT,
  rol              user_role NOT NULL DEFAULT 'cliente',
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles(rol);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLAS DE DATOS ESPECÍFICOS POR ROL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes_datos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  direccion         TEXT NOT NULL,
  punto_referencia  TEXT,
  ciudad            TEXT NOT NULL DEFAULT 'Caracas',
  estado            TEXT NOT NULL DEFAULT 'Distrito Capital',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comercios_datos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  nombre_comercial  TEXT NOT NULL CHECK (char_length(nombre_comercial) >= 2),
  rif               TEXT,
  direccion         TEXT NOT NULL,
  categoria         categoria_comercio NOT NULL DEFAULT 'otro',
  logo_url          TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comercios_activo ON public.comercios_datos(activo);
CREATE INDEX IF NOT EXISTS idx_comercios_profile ON public.comercios_datos(profile_id);

CREATE TABLE IF NOT EXISTS public.repartidores_datos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  cedula       TEXT,
  vehiculo     tipo_vehiculo NOT NULL DEFAULT 'moto',
  placa        TEXT,
  disponible   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repartidores_disponible ON public.repartidores_datos(disponible);
CREATE INDEX IF NOT EXISTS idx_repartidores_profile ON public.repartidores_datos(profile_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABLA: PRODUCTOS (Catálogo e Inventario)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.productos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id  UUID NOT NULL REFERENCES public.comercios_datos(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL CHECK (char_length(nombre) >= 2),
  descripcion  TEXT,
  precio_usd   NUMERIC(10, 2) NOT NULL CHECK (precio_usd >= 0),
  stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  imagen_url   TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_comercio ON public.productos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos(activo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TABLA: PEDIDOS_ENTREGAS (Ciclo de Vida del Pedido en Tiempo Real)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pedidos_entregas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  comercio_id       UUID NOT NULL REFERENCES public.comercios_datos(id) ON DELETE RESTRICT,
  repartidor_id     UUID REFERENCES public.repartidores_datos(id) ON DELETE SET NULL,
  estado            estado_pedido NOT NULL DEFAULT 'pendiente',
  total_usd         NUMERIC(10, 2) NOT NULL CHECK (total_usd >= 0),
  direccion_entrega TEXT NOT NULL,
  punto_referencia  TEXT,
  valoracion        SMALLINT CHECK (valoracion BETWEEN 1 AND 5),
  comentario        TEXT CHECK (char_length(comentario) <= 500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente    ON public.pedidos_entregas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_comercio   ON public.pedidos_entregas(comercio_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_repartidor ON public.pedidos_entregas(repartidor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado     ON public.pedidos_entregas(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos_entregas(created_at DESC);

-- Ítems individuales dentro de cada pedido
CREATE TABLE IF NOT EXISTS public.pedido_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id    UUID NOT NULL REFERENCES public.pedidos_entregas(id) ON DELETE CASCADE,
  producto_id  UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  precio_usd   NUMERIC(10, 2) NOT NULL CHECK (precio_usd >= 0),
  subtotal_usd NUMERIC(10, 2) GENERATED ALWAYS AS (cantidad * precio_usd) STORED
);

CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON public.pedido_items(pedido_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TABLA: CHAT_MESSAGES (Mensajería en Tiempo Real para Pedidos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id       UUID NOT NULL REFERENCES public.pedidos_entregas(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_rol      user_role NOT NULL,
  sender_nombre   TEXT NOT NULL,
  mensaje         TEXT NOT NULL CHECK (char_length(trim(mensaje)) > 0),
  attachment_url  TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de alto rendimiento para lecturas instantáneas y orden cronológico
CREATE INDEX IF NOT EXISTS idx_chat_messages_pedido_created 
  ON public.chat_messages(pedido_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_unread 
  ON public.chat_messages(pedido_id) WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender 
  ON public.chat_messages(sender_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FUNCIONES DE AYUDA Y SEGURIDAD (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────

-- Obtener rol del usuario autenticado de forma eficiente
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid();
$$;

-- Obtener el ID de comercio del usuario autenticado (si aplica)
CREATE OR REPLACE FUNCTION public.get_my_comercio_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.comercios_datos WHERE profile_id = auth.uid() LIMIT 1;
$$;

-- Obtener el ID de repartidor del usuario autenticado (si aplica)
CREATE OR REPLACE FUNCTION public.get_my_repartidor_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.repartidores_datos WHERE profile_id = auth.uid() LIMIT 1;
$$;

-- Verifica si el usuario autenticado es participante directo del pedido (Cliente, Comercio o Repartidor)
CREATE OR REPLACE FUNCTION public.is_pedido_participant(p_pedido_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cliente_id UUID;
  v_comercio_profile UUID;
  v_repartidor_profile UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT 
    pe.cliente_id,
    cd.profile_id,
    rd.profile_id
  INTO 
    v_cliente_id,
    v_comercio_profile,
    v_repartidor_profile
  FROM public.pedidos_entregas pe
  LEFT JOIN public.comercios_datos cd ON cd.id = pe.comercio_id
  LEFT JOIN public.repartidores_datos rd ON rd.id = pe.repartidor_id
  WHERE pe.id = p_pedido_id;

  RETURN (
    v_uid = v_cliente_id OR 
    v_uid = v_comercio_profile OR 
    v_uid = v_repartidor_profile
  );
END;
$$;

-- RPC: Marcar mensajes de un pedido como leídos
CREATE OR REPLACE FUNCTION public.marcar_mensajes_leidos(p_pedido_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_pedido_participant(p_pedido_id) THEN
    RAISE EXCEPTION 'No autorizado para actualizar este pedido';
  END IF;

  UPDATE public.chat_messages
  SET is_read = TRUE,
      read_at = NOW()
  WHERE pedido_id = p_pedido_id
    AND sender_id <> auth.uid()
    AND is_read = FALSE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. TRIGGERS AUTOMÁTICOS DE AUDITORÍA (updated_at)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles', 'clientes_datos', 'comercios_datos', 
    'repartidores_datos', 'productos', 'pedidos_entregas'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. POLÍTICAS DE SEGURIDAD A NIVEL DE FILA (ROW LEVEL SECURITY - RLS)
-- ─────────────────────────────────────────────────────────────────────────────

-- Activar RLS en todas las tablas clave
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_datos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercios_datos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repartidores_datos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ── RLS: PROFILES ──
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles 
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_participants" ON public.profiles;
CREATE POLICY "profiles_select_participants" ON public.profiles 
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles 
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── RLS: PRODUCTOS ──
DROP POLICY IF EXISTS "productos_select_public" ON public.productos;
CREATE POLICY "productos_select_public" ON public.productos 
  FOR SELECT USING (activo = TRUE AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "productos_comercio_manage" ON public.productos;
CREATE POLICY "productos_comercio_manage" ON public.productos 
  FOR ALL USING (comercio_id = public.get_my_comercio_id())
  WITH CHECK (comercio_id = public.get_my_comercio_id());

-- ── RLS: PEDIDOS_ENTREGAS ──
-- Lectura: El cliente dueño, el comercio asignado o el repartidor asignado
DROP POLICY IF EXISTS "pedidos_select_participant" ON public.pedidos_entregas;
CREATE POLICY "pedidos_select_participant" ON public.pedidos_entregas
  FOR SELECT USING (
    cliente_id = auth.uid() OR
    comercio_id = public.get_my_comercio_id() OR
    repartidor_id = public.get_my_repartidor_id() OR
    -- Repartidores disponibles pueden ver pedidos pendientes de asignación
    (repartidor_id IS NULL AND public.get_my_role() = 'repartidor' AND estado IN ('confirmado', 'en_preparacion'))
  );

-- Inserción: Solo clientes autenticados
DROP POLICY IF EXISTS "pedidos_insert_cliente" ON public.pedidos_entregas;
CREATE POLICY "pedidos_insert_cliente" ON public.pedidos_entregas
  FOR INSERT WITH CHECK (
    cliente_id = auth.uid() AND 
    public.get_my_role() = 'cliente'
  );

-- Actualización por Cliente: solo valoración al entregar
DROP POLICY IF EXISTS "pedidos_update_cliente" ON public.pedidos_entregas;
CREATE POLICY "pedidos_update_cliente" ON public.pedidos_entregas
  FOR UPDATE USING (cliente_id = auth.uid() AND estado = 'entregado')
  WITH CHECK (cliente_id = auth.uid());

-- Actualización por Comercio: confirmación, preparación o cancelación
DROP POLICY IF EXISTS "pedidos_update_comercio" ON public.pedidos_entregas;
CREATE POLICY "pedidos_update_comercio" ON public.pedidos_entregas
  FOR UPDATE USING (comercio_id = public.get_my_comercio_id());

-- Actualización por Repartidor: autoasignación, en camino o entregado
DROP POLICY IF EXISTS "pedidos_update_repartidor" ON public.pedidos_entregas;
CREATE POLICY "pedidos_update_repartidor" ON public.pedidos_entregas
  FOR UPDATE USING (
    repartidor_id = public.get_my_repartidor_id() OR
    (repartidor_id IS NULL AND public.get_my_role() = 'repartidor')
  );

-- ── RLS: PEDIDO_ITEMS ──
DROP POLICY IF EXISTS "pedido_items_select" ON public.pedido_items;
CREATE POLICY "pedido_items_select" ON public.pedido_items
  FOR SELECT USING (public.is_pedido_participant(pedido_id));

DROP POLICY IF EXISTS "pedido_items_insert" ON public.pedido_items;
CREATE POLICY "pedido_items_insert" ON public.pedido_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedidos_entregas
      WHERE id = pedido_id AND cliente_id = auth.uid()
    )
  );

-- ── RLS: CHAT_MESSAGES (MÁXIMA SEGURIDAD Y TIEMPO REAL) ──
-- Lectura: Solo participantes del pedido asociado
DROP POLICY IF EXISTS "chat_messages_select_participant" ON public.chat_messages;
CREATE POLICY "chat_messages_select_participant" ON public.chat_messages
  FOR SELECT USING (public.is_pedido_participant(pedido_id));

-- Inserción: Solo si el emisor es el usuario autenticado y es participante
DROP POLICY IF EXISTS "chat_messages_insert_sender" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_sender" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    public.is_pedido_participant(pedido_id)
  );

-- Actualización: Permite marcar como leído a los participantes del pedido
DROP POLICY IF EXISTS "chat_messages_update_read" ON public.chat_messages;
CREATE POLICY "chat_messages_update_read" ON public.chat_messages
  FOR UPDATE USING (public.is_pedido_participant(pedido_id))
  WITH CHECK (public.is_pedido_participant(pedido_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. HABILITAR PUBLICACIÓN SUPABASE REALTIME (POSTGRES REPLICATION)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos_entregas REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  -- Agregar tablas a la publicación de Supabase Realtime si no están ya agregadas
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_entregas;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
