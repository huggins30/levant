import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './ClienteForm.css';

const ESTADOS_VENEZUELA = [
  'Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo',
  'Cojedes','Delta Amacuro','Dependencias Federales','Distrito Capital',
  'Falcón','Guárico','Lara','Mérida','Miranda','Monagas','Nueva Esparta',
  'Portuguesa','Sucre','Táchira','Trujillo','Vargas','Yaracuy','Zulia',
];

const TELEFONO_REGEX = /^(0412|0414|0424|0416|0426)\d{7}$/;

const defaultForm = {
  nombre_completo: '',
  telefono: '',
  direccion: '',
  punto_referencia: '',
  ciudad: '',
  estado: '',
};

export default function ClienteForm({ session, onSaved }) {
  const [form, setForm]       = useState(defaultForm);
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null); // 'success' | 'error'

  // Cargar datos existentes
  useEffect(() => {
    if (!session?.user) return;

    const loadProfile = async () => {
      const userId = session.user.id;

      const [{ data: profile }, { data: clienteDatos }] = await Promise.all([
        supabase.from('profiles').select('nombre_completo, telefono').eq('id', userId).single(),
        supabase.from('clientes_datos').select('*').eq('profile_id', userId).single(),
      ]);

      setForm({
        nombre_completo:  profile?.nombre_completo  ?? '',
        telefono:         profile?.telefono          ?? '',
        direccion:        clienteDatos?.direccion         ?? '',
        punto_referencia: clienteDatos?.punto_referencia  ?? '',
        ciudad:           clienteDatos?.ciudad            ?? '',
        estado:           clienteDatos?.estado            ?? '',
      });
    };

    loadProfile();
  }, [session]);

  // ── Validación ─────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.nombre_completo.trim() || form.nombre_completo.trim().length < 3)
      e.nombre_completo = 'El nombre debe tener al menos 3 caracteres.';

    if (!form.telefono)
      e.telefono = 'El teléfono es obligatorio.';
    else if (!TELEFONO_REGEX.test(form.telefono))
      e.telefono = 'Formato inválido. Ej: 04121234567 (0412/0414/0424/0416/0426)';

    if (!form.direccion.trim())
      e.direccion = 'La dirección es obligatoria.';
    if (!form.ciudad.trim())
      e.ciudad = 'La ciudad es obligatoria.';
    if (!form.estado)
      e.estado = 'Selecciona un estado.';

    return e;
  };

  // ── Handlers ───────────────────────────────────────────────────
  const handleChange = ({ target: { name, value } }) => {
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const userId = session.user.id;

      // Upsert profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ nombre_completo: form.nombre_completo.trim(), telefono: form.telefono })
        .eq('id', userId);

      if (profileErr) throw profileErr;

      // Upsert clientes_datos
      const { error: datosErr } = await supabase
        .from('clientes_datos')
        .upsert(
          {
            profile_id:       userId,
            direccion:        form.direccion.trim(),
            punto_referencia: form.punto_referencia.trim() || null,
            ciudad:           form.ciudad.trim(),
            estado:           form.estado,
          },
          { onConflict: 'profile_id' }
        );

      if (datosErr) throw datosErr;

      setStatus('success');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="cf-wrapper">
      <div className="cf-card">
        <div className="cf-header">
          <span className="cf-icon">👤</span>
          <div>
            <h2 className="cf-title">Mi Perfil</h2>
            <p className="cf-subtitle">Datos de entrega y contacto</p>
          </div>
        </div>

        <form className="cf-form" onSubmit={handleSubmit} noValidate>

          {/* ── Nombre ── */}
          <div className={`cf-field ${errors.nombre_completo ? 'cf-field--error' : ''}`}>
            <label htmlFor="cf-nombre">Nombre completo</label>
            <input
              id="cf-nombre"
              name="nombre_completo"
              type="text"
              placeholder="Ej: María González"
              value={form.nombre_completo}
              onChange={handleChange}
              autoComplete="name"
            />
            {errors.nombre_completo && <span className="cf-error">{errors.nombre_completo}</span>}
          </div>

          {/* ── Teléfono ── */}
          <div className={`cf-field ${errors.telefono ? 'cf-field--error' : ''}`}>
            <label htmlFor="cf-telefono">Teléfono</label>
            <div className="cf-input-hint">
              <input
                id="cf-telefono"
                name="telefono"
                type="tel"
                placeholder="04121234567"
                value={form.telefono}
                onChange={handleChange}
                maxLength={11}
                autoComplete="tel"
              />
              <span className="cf-hint-badge">VE</span>
            </div>
            {errors.telefono
              ? <span className="cf-error">{errors.telefono}</span>
              : <span className="cf-helper">Operadoras: 0412 · 0414 · 0424 · 0416 · 0426</span>
            }
          </div>

          <div className="cf-divider">
            <span>Dirección de entrega</span>
          </div>

          {/* ── Dirección ── */}
          <div className={`cf-field ${errors.direccion ? 'cf-field--error' : ''}`}>
            <label htmlFor="cf-direccion">Dirección</label>
            <textarea
              id="cf-direccion"
              name="direccion"
              placeholder="Av. Principal, Urbanización, Casa/Apto…"
              value={form.direccion}
              onChange={handleChange}
              rows={2}
            />
            {errors.direccion && <span className="cf-error">{errors.direccion}</span>}
          </div>

          {/* ── Punto de referencia ── */}
          <div className="cf-field">
            <label htmlFor="cf-referencia">Punto de referencia <span className="cf-optional">(opcional)</span></label>
            <input
              id="cf-referencia"
              name="punto_referencia"
              type="text"
              placeholder="Ej: Frente al Farmatodo de Las Mercedes"
              value={form.punto_referencia}
              onChange={handleChange}
            />
          </div>

          {/* ── Ciudad y Estado ── */}
          <div className="cf-row">
            <div className={`cf-field ${errors.ciudad ? 'cf-field--error' : ''}`}>
              <label htmlFor="cf-ciudad">Ciudad</label>
              <input
                id="cf-ciudad"
                name="ciudad"
                type="text"
                placeholder="Ej: Caracas"
                value={form.ciudad}
                onChange={handleChange}
              />
              {errors.ciudad && <span className="cf-error">{errors.ciudad}</span>}
            </div>

            <div className={`cf-field ${errors.estado ? 'cf-field--error' : ''}`}>
              <label htmlFor="cf-estado">Estado</label>
              <select
                id="cf-estado"
                name="estado"
                value={form.estado}
                onChange={handleChange}
              >
                <option value="">Seleccionar…</option>
                {ESTADOS_VENEZUELA.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
              {errors.estado && <span className="cf-error">{errors.estado}</span>}
            </div>
          </div>

          {/* ── Status messages ── */}
          {status === 'success' && (
            <div className="cf-alert cf-alert--success">
              ✅ Perfil guardado exitosamente.
            </div>
          )}
          {status === 'error' && (
            <div className="cf-alert cf-alert--error">
              ❌ Error al guardar. Intenta de nuevo.
            </div>
          )}

          {/* ── Submit ── */}
          <button
            id="cf-submit"
            type="submit"
            className="cf-btn-primary"
            disabled={loading}
          >
            {loading ? <span className="cf-spinner" /> : '💾 Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}
