-- =============================================================================
-- LEVANT: Activación de Correo y Aprobación de Comercios y Repartidores
-- =============================================================================
-- Permite que los clientes se registren y activen su correo normalmente (autoservicio),
-- mientras que los repartidores y comercios quedan registrados en una lista para que
-- el Administrador active su correo electrónico y les permita ingresar.

-- 1. Agregar columna correo_activado a profiles si no existe
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS correo_activado BOOLEAN DEFAULT FALSE;

-- 2. Asegurar que clientes y admins existentes tengan correo_activado = TRUE
UPDATE public.profiles 
SET correo_activado = TRUE 
WHERE rol IN ('cliente', 'admin') OR correo_activado IS NULL;

-- 3. Actualizar función trigger handle_new_user para inicializar el estado correcto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw_rol TEXT;
  v_rol user_role;
  v_nombre TEXT;
  v_activado BOOLEAN;
BEGIN
  v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', 'Sin nombre');
  v_raw_rol := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'rol', 'cliente')));
  
  -- SEGURIDAD: Solo se permiten roles de auto-registro ('cliente', 'comercio', 'repartidor').
  -- El rol 'admin' NUNCA puede ser auto-asignado; si se intenta, se degrada a 'cliente'.
  IF v_raw_rol IN ('comercio', 'repartidor') THEN
    v_rol := v_raw_rol::user_role;
  ELSE
    v_rol := 'cliente'::user_role;
  END IF;

  -- Solo los clientes tienen correo_activado = TRUE de inicio; comercios y repartidores requieren activación del admin
  v_activado := (v_rol = 'cliente');

  INSERT INTO public.profiles (id, email, nombre_completo, rol, correo_activado)
  VALUES (
    NEW.id,
    NEW.email,
    v_nombre,
    v_rol,
    v_activado
  )
  ON CONFLICT (id) DO UPDATE
    SET email           = EXCLUDED.email,
        nombre_completo = EXCLUDED.nombre_completo;
        -- NOTA: Se excluye 'rol' y 'correo_activado' para prevenir sobreescrituras no autorizadas

  -- Si es comercio, crear su registro base en comercios_datos para que aparezca de inmediato en la administración
  IF v_rol = 'comercio' THEN
    INSERT INTO public.comercios_datos (profile_id, nombre_comercial, direccion, categoria, activo)
    VALUES (NEW.id, v_nombre, 'Dirección por definir', 'otro', FALSE)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  -- Si es repartidor, crear su registro base en repartidores_datos para que aparezca de inmediato
  IF v_rol = 'repartidor' THEN
    INSERT INTO public.repartidores_datos (profile_id, disponible)
    VALUES (NEW.id, FALSE)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Asegurar que el trigger esté asignado a auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3.1. Trigger de Seguridad: Proteger columnas críticas ('rol' y 'correo_activado') en public.profiles
CREATE OR REPLACE FUNCTION public.proteger_rol_perfil()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_service_role BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  -- Verificar si la operación viene del service_role o procesos internos de Postgres
  v_is_service_role := (
    current_user IN ('postgres', 'supabase_admin') OR
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    auth.uid() IS NULL
  );

  -- Verificar si el usuario autenticado tiene rol de admin legítimo
  v_is_admin := v_is_service_role OR public.is_admin();

  -- Impedir modificación del rol por usuarios no autorizados
  IF OLD.rol IS DISTINCT FROM NEW.rol THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Acceso denegado: solo un administrador puede modificar el rol de un usuario.';
    END IF;
  END IF;

  -- Impedir modificación de correo_activado por usuarios no autorizados
  IF OLD.correo_activado IS DISTINCT FROM NEW.correo_activado THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Acceso denegado: solo un administrador puede activar o desactivar cuentas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_rol_perfil ON public.profiles;
CREATE TRIGGER trg_proteger_rol_perfil
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_rol_perfil();

-- 4. RPC: Activar o desactivar correo de un usuario (Admin)
CREATE OR REPLACE FUNCTION public.admin_activar_correo_usuario(
  p_user_id UUID,
  p_activar BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_rol user_role;
  v_email TEXT;
BEGIN
  -- Verificar que quien llama sea administrador
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden activar o desactivar usuarios';
  END IF;

  SELECT rol, email INTO v_rol, v_email FROM public.profiles WHERE id = p_user_id;
  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado en la plataforma';
  END IF;

  IF p_activar THEN
    -- 1. Confirmar el correo electrónico en auth.users para permitir el inicio de sesión
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 2. Marcar correo_activado en profiles
    UPDATE public.profiles
    SET correo_activado = TRUE,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 3. Si es comercio, activar también en comercios_datos
    IF v_rol = 'comercio' THEN
      UPDATE public.comercios_datos
      SET activo = TRUE,
          updated_at = NOW()
      WHERE profile_id = p_user_id;
    END IF;
  ELSE
    -- 1. Desactivar correo en auth.users si se suspende
    UPDATE auth.users
    SET email_confirmed_at = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 2. Desmarcar correo_activado en profiles
    UPDATE public.profiles
    SET correo_activado = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 3. Si es comercio, desactivar
    IF v_rol = 'comercio' THEN
      UPDATE public.comercios_datos
      SET activo = FALSE,
          updated_at = NOW()
      WHERE profile_id = p_user_id;
    END IF;

    -- 4. Si es repartidor, poner en no disponible
    IF v_rol = 'repartidor' THEN
      UPDATE public.repartidores_datos
      SET disponible = FALSE,
          updated_at = NOW()
      WHERE profile_id = p_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'email', v_email,
    'rol', v_rol,
    'correo_activado', p_activar
  );
END;
$$;

-- 5. RPC: Obtener el listado completo de repartidores y comercios para el Admin
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios_registro()
RETURNS TABLE (
  id UUID,
  email TEXT,
  nombre_completo TEXT,
  rol user_role,
  telefono TEXT,
  correo_activado BOOLEAN,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  comercio_id UUID,
  nombre_comercial TEXT,
  categoria categoria_comercio,
  comercio_activo BOOLEAN,
  repartidor_id UUID,
  cedula TEXT,
  tipo_vehiculo TEXT,
  repartidor_disponible BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ver este listado';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.nombre_completo,
    p.rol,
    p.telefono,
    COALESCE(p.correo_activado, (u.email_confirmed_at IS NOT NULL), FALSE) AS correo_activado,
    u.email_confirmed_at,
    COALESCE(p.created_at, u.created_at) AS created_at,
    cd.id AS comercio_id,
    cd.nombre_comercial,
    cd.categoria,
    cd.activo AS comercio_activo,
    rd.id AS repartidor_id,
    rd.cedula,
    rd.vehiculo::TEXT AS tipo_vehiculo,
    rd.disponible AS repartidor_disponible
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.comercios_datos cd ON cd.profile_id = p.id
  LEFT JOIN public.repartidores_datos rd ON rd.profile_id = p.id
  WHERE p.rol IN ('comercio', 'repartidor')
  ORDER BY p.created_at DESC;
END;
$$;

-- 6. Políticas de seguridad y permisos
GRANT EXECUTE ON FUNCTION public.admin_activar_correo_usuario(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios_registro() TO authenticated;

-- 7. ASIGNAR O ACTIVAR TU USUARIO ADMIN (reemplaza con tu correo):
-- UPDATE public.profiles 
-- SET rol = 'admin', correo_activado = TRUE 
-- WHERE email = 'tu_correo_admin@email.com';
-- 
-- UPDATE auth.users 
-- SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) 
-- WHERE email = 'tu_correo_admin@email.com';
