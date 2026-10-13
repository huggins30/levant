import { useState, useEffect, useCallback } from 'react';
import { supabase, registrarUsuarioAdmin } from '../../lib/supabase';
import {
  Users, Store, Bike, Plus, Search, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Loader2, AlertTriangle, Eye,
  ShieldCheck, RefreshCw, UserPlus, Building2, Truck,
  IdCard, Car,
} from 'lucide-react';
import './AdminPanel.css';

// ── Helpers ───────────────────────────────────────────────────────────────
const CATEGORIA_LABEL = {
  restaurante:  '🍽️ Restaurante',
  farmacia:     '💊 Farmacia',
  supermercado: '🛒 Supermercado',
  tecnologia:   '💻 Tecnología',
  ropa:         '👕 Ropa',
  ferreteria:   '🔧 Ferretería',
  panaderia:    '🥐 Panadería',
  licoreria:    '🍷 Licorería',
  otro:         '📦 Otro',
};

const CATEGORIAS = Object.keys(CATEGORIA_LABEL);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

function Badge({ color, children }) {
  const palettes = {
    green:  { bg: 'rgba(16,185,129,.15)', border: 'rgba(16,185,129,.3)',  text: '#6ee7b7' },
    red:    { bg: 'rgba(248,113,113,.15)', border: 'rgba(248,113,113,.3)', text: '#fca5a5' },
    blue:   { bg: 'rgba(59,130,246,.15)', border: 'rgba(59,130,246,.3)',  text: '#93c5fd' },
    purple: { bg: 'rgba(139,92,246,.15)', border: 'rgba(139,92,246,.3)',  text: '#c4b5fd' },
    yellow: { bg: 'rgba(245,158,11,.15)', border: 'rgba(245,158,11,.3)',  text: '#fcd34d' },
    cyan:   { bg: 'rgba(6,182,212,.15)',  border: 'rgba(6,182,212,.3)',   text: '#67e8f9' },
  };
  const p = palettes[color] || palettes.blue;
  return (
    <span
      className="adm-badge"
      style={{ background: p.bg, border: `1px solid ${p.border}`, color: p.text }}
    >
      {children}
    </span>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, iconBg }) {
  return (
    <div className="adm-stat">
      <div className="adm-stat-icon" style={{ background: iconBg, borderColor: `${color}44` }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <p className="adm-stat-label">{label}</p>
        <p className="adm-stat-value" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}

// ── Modal genérico ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal-card" onClick={e => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3 className="adm-modal-title">{title}</h3>
          <button className="adm-modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="adm-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Formulario: Crear Comercio ───────────────────────────────────────────────
function FormCrearComercio({ onClose, onSuccess }) {
  const [step, setStep]           = useState(1); // 1: usuario, 2: datos comercio
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [nombre, setNombre]       = useState('');
  const [createdId, setCreatedId] = useState(null);

  const [nomCom, setNomCom]       = useState('');
  const [rif, setRif]             = useState('');
  const [direccion, setDireccion] = useState('');
  const [categoria, setCategoria] = useState('restaurante');

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  // Paso 1: Registrar usuario con rol comercio
  const handleCrearUsuario = async () => {
    setError(null);
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      setError('Completa todos los campos del usuario.');
      return;
    }
    setLoading(true);
    try {
      // Registrar usuario con rol comercio sin alterar la sesión del admin
      const newUser = await registrarUsuarioAdmin({
        email: email.trim(),
        password: password.trim(),
        nombreCompleto: nombre.trim(),
        rol: 'comercio',
      });
      setCreatedId(newUser.id);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: Completar datos del comercio
  const handleCompletarComercio = async () => {
    setError(null);
    if (!nomCom.trim() || !direccion.trim()) {
      setError('Nombre comercial y dirección son obligatorios.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.rpc('admin_completar_comercio', {
        p_profile_id:       createdId,
        p_nombre_comercial: nomCom.trim(),
        p_direccion:        direccion.trim(),
        p_categoria:        categoria,
        p_rif:              rif.trim() || null,
      });
      if (err) throw err;
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-form">
      {/* Indicador de pasos */}
      <div className="adm-steps">
        <div className={`adm-step ${step >= 1 ? 'adm-step--active' : ''}`}>
          <span>1</span> Usuario
        </div>
        <div className="adm-step-line" />
        <div className={`adm-step ${step >= 2 ? 'adm-step--active' : ''}`}>
          <span>2</span> Comercio
        </div>
      </div>

      {step === 1 && (
        <>
          <div className="adm-field">
            <label>Nombre completo</label>
            <input type="text" placeholder="Ej: María González" value={nombre}
              onChange={e => setNombre(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Correo electrónico</label>
            <input type="email" placeholder="comercio@email.com" value={email}
              onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Contraseña temporal</label>
            <input type="password" placeholder="Mínimo 6 caracteres" value={password}
              onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <div className="adm-form-error"><AlertTriangle size={14}/> {error}</div>}
          <button className="adm-btn adm-btn--primary" onClick={handleCrearUsuario} disabled={loading}>
            {loading ? <Loader2 size={16} className="adm-spin" /> : <UserPlus size={16} />}
            Crear usuario
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="adm-field">
            <label>Nombre del comercio *</label>
            <input type="text" placeholder="Ej: Pizzería Bella Napoli" value={nomCom}
              onChange={e => setNomCom(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>RIF (opcional)</label>
            <input type="text" placeholder="J-12345678-9" value={rif}
              onChange={e => setRif(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Dirección *</label>
            <input type="text" placeholder="Av. Principal, Local 5, Caracas" value={direccion}
              onChange={e => setDireccion(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}>
              {CATEGORIAS.map(c => (
                <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
              ))}
            </select>
          </div>
          {error && <div className="adm-form-error"><AlertTriangle size={14}/> {error}</div>}
          <div className="adm-form-actions">
            <button className="adm-btn adm-btn--ghost" onClick={() => setStep(1)}>
              ← Atrás
            </button>
            <button className="adm-btn adm-btn--success" onClick={handleCompletarComercio} disabled={loading}>
              {loading ? <Loader2 size={16} className="adm-spin" /> : <CheckCircle2 size={16} />}
              Registrar Comercio
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Formulario: Crear Repartidor ─────────────────────────────────────────────
function FormCrearRepartidor({ tiposVehiculo, onClose, onSuccess }) {
  const [step, setStep]           = useState(1);
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [nombre, setNombre]       = useState('');
  const [createdId, setCreatedId] = useState(null);

  const [cedula, setCedula]             = useState('');
  const [tipoVehId, setTipoVehId]       = useState(tiposVehiculo[0]?.id ?? '');
  const [placa, setPlaca]               = useState('');
  const [marcaModelo, setMarcaModelo]   = useState('');
  const [color, setColor]               = useState('');

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  // Paso 1: Crear usuario repartidor
  const handleCrearUsuario = async () => {
    setError(null);
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      setError('Completa todos los campos del usuario.');
      return;
    }
    setLoading(true);
    try {
      // Registrar usuario con rol repartidor sin alterar la sesión del admin
      const newUser = await registrarUsuarioAdmin({
        email: email.trim(),
        password: password.trim(),
        nombreCompleto: nombre.trim(),
        rol: 'repartidor',
      });
      setCreatedId(newUser.id);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: Completar datos del repartidor y su vehículo
  const handleCompletarRepartidor = async () => {
    setError(null);
    if (!cedula.trim()) { setError('La cédula es obligatoria.'); return; }
    if (!placa.trim() || !marcaModelo.trim()) { setError('Placa y marca/modelo son obligatorios.'); return; }

    setLoading(true);
    try {
      // 1. Completar perfil repartidor via RPC admin
      const { error: errRep } = await supabase.rpc('admin_completar_repartidor', {
        p_profile_id:         createdId,
        p_cedula:             cedula.trim(),
        p_tipos_vehiculo_id:  tipoVehId ? parseInt(tipoVehId) : null,
      });
      if (errRep) throw errRep;

      // 2. Obtener el repartidor_datos.id para registrar el vehículo
      const { data: repDatos, error: errGet } = await supabase
        .from('repartidores_datos')
        .select('id')
        .eq('profile_id', createdId)
        .single();
      if (errGet) throw errGet;

      // 3. Registrar vehículo
      const { error: errVeh } = await supabase
        .from('vehiculo')
        .insert({
          placa:           placa.trim().toUpperCase(),
          marca_modelo:    marcaModelo.trim(),
          color:           color.trim() || null,
          tipo_vehiculo_id: parseInt(tipoVehId),
          repartidor_id:   repDatos.id,
        });
      if (errVeh) throw errVeh;

      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const tipoSeleccionado = tiposVehiculo.find(t => t.id === parseInt(tipoVehId));

  return (
    <div className="adm-form">
      <div className="adm-steps">
        <div className={`adm-step ${step >= 1 ? 'adm-step--active' : ''}`}>
          <span>1</span> Usuario
        </div>
        <div className="adm-step-line" />
        <div className={`adm-step ${step >= 2 ? 'adm-step--active' : ''}`}>
          <span>2</span> Datos
        </div>
      </div>

      {step === 1 && (
        <>
          <div className="adm-field">
            <label>Nombre completo</label>
            <input type="text" placeholder="Ej: Carlos Rodríguez" value={nombre}
              onChange={e => setNombre(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Correo electrónico</label>
            <input type="email" placeholder="repartidor@email.com" value={email}
              onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Contraseña temporal</label>
            <input type="password" placeholder="Mínimo 6 caracteres" value={password}
              onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <div className="adm-form-error"><AlertTriangle size={14}/> {error}</div>}
          <button className="adm-btn adm-btn--primary" onClick={handleCrearUsuario} disabled={loading}>
            {loading ? <Loader2 size={16} className="adm-spin" /> : <UserPlus size={16} />}
            Crear usuario
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="adm-field">
            <label><IdCard size={13}/> Cédula de identidad *</label>
            <input type="text" placeholder="V-12345678" value={cedula}
              onChange={e => setCedula(e.target.value)} />
          </div>

          <div className="adm-field">
            <label><Car size={13}/> Tipo de vehículo *</label>
            <select value={tipoVehId} onChange={e => setTipoVehId(e.target.value)}>
              {tiposVehiculo.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
            {tipoSeleccionado && (
              <div className="adm-vehicle-hint">
                <span>⚖️ {tipoSeleccionado.capacidad_peso_kg} kg</span>
                <span>📦 {tipoSeleccionado.capacidad_volumen_m3} m³</span>
              </div>
            )}
          </div>

          <div className="adm-form-grid">
            <div className="adm-field">
              <label>Placa *</label>
              <input type="text" placeholder="AB123CD" value={placa}
                onChange={e => setPlaca(e.target.value)} />
            </div>
            <div className="adm-field">
              <label>Color</label>
              <input type="text" placeholder="Negro" value={color}
                onChange={e => setColor(e.target.value)} />
            </div>
          </div>
          <div className="adm-field">
            <label>Marca / Modelo *</label>
            <input type="text" placeholder="Honda CB 190R 2022" value={marcaModelo}
              onChange={e => setMarcaModelo(e.target.value)} />
          </div>

          {error && <div className="adm-form-error"><AlertTriangle size={14}/> {error}</div>}
          <div className="adm-form-actions">
            <button className="adm-btn adm-btn--ghost" onClick={() => setStep(1)}>
              ← Atrás
            </button>
            <button className="adm-btn adm-btn--success" onClick={handleCompletarRepartidor} disabled={loading}>
              {loading ? <Loader2 size={16} className="adm-spin" /> : <CheckCircle2 size={16} />}
              Registrar Repartidor
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tabla Comercios ──────────────────────────────────────────────────────────
function TablaComercio({ comercios, onToggle }) {
  const [busqueda, setBusqueda] = useState('');
  const filtrados = comercios.filter(c =>
    c.nombre_comercial.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.profiles?.email?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="adm-table-wrap">
      <div className="adm-table-toolbar">
        <div className="adm-search-box">
          <Search size={14} className="adm-search-icon" />
          <input
            type="text"
            placeholder="Buscar comercio o email…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <span className="adm-table-count">{filtrados.length} registros</span>
      </div>

      <div className="adm-table-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Comercio</th>
              <th>Email / RIF</th>
              <th>Categoría</th>
              <th>Registro</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={6} className="adm-table-empty">Sin comercios registrados</td></tr>
            )}
            {filtrados.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="adm-table-name">
                    <div className="adm-table-avatar" style={{ background: 'rgba(45,212,191,.15)', color: '#2dd4bf' }}>
                      <Store size={14} />
                    </div>
                    <div>
                      <span className="adm-table-main">{c.nombre_comercial}</span>
                      <span className="adm-table-sub">{c.profiles?.nombre_completo}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="adm-table-main">{c.profiles?.email}</span>
                  {c.rif && <span className="adm-table-sub">{c.rif}</span>}
                </td>
                <td><Badge color="cyan">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</Badge></td>
                <td className="adm-table-date">{formatDate(c.created_at)}</td>
                <td>
                  {c.activo
                    ? <Badge color="green"><CheckCircle2 size={12}/> Activo</Badge>
                    : <Badge color="red"><XCircle size={12}/> Inactivo</Badge>
                  }
                </td>
                <td>
                  <button
                    className={`adm-toggle-btn ${c.activo ? 'adm-toggle-btn--off' : 'adm-toggle-btn--on'}`}
                    onClick={() => onToggle('comercio', c.id, c.activo)}
                    title={c.activo ? 'Desactivar' : 'Activar'}
                  >
                    {c.activo ? <XCircle size={13}/> : <CheckCircle2 size={13}/>}
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tabla Repartidores ───────────────────────────────────────────────────────
function TablaRepartidor({ repartidores, tiposVehiculo, onToggle }) {
  const [busqueda, setBusqueda] = useState('');
  const filtrados = repartidores.filter(r =>
    r.profiles?.nombre_completo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.profiles?.email?.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.cedula?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const getTipoNombre = (id) => tiposVehiculo.find(t => t.id === id)?.nombre ?? '—';

  return (
    <div className="adm-table-wrap">
      <div className="adm-table-toolbar">
        <div className="adm-search-box">
          <Search size={14} className="adm-search-icon" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o cédula…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <span className="adm-table-count">{filtrados.length} registros</span>
      </div>

      <div className="adm-table-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Repartidor</th>
              <th>Cédula</th>
              <th>Tipo Vehículo</th>
              <th>Registro</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={6} className="adm-table-empty">Sin repartidores registrados</td></tr>
            )}
            {filtrados.map(r => (
              <tr key={r.id}>
                <td>
                  <div className="adm-table-name">
                    <div className="adm-table-avatar" style={{ background: 'rgba(249,115,22,.15)', color: '#fb923c' }}>
                      <Bike size={14} />
                    </div>
                    <div>
                      <span className="adm-table-main">{r.profiles?.nombre_completo}</span>
                      <span className="adm-table-sub">{r.profiles?.email}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge color="yellow">{r.cedula || '—'}</Badge>
                </td>
                <td>
                  <div className="adm-vehicle-cell">
                    <Truck size={13} style={{ color: '#67e8f9' }}/>
                    <span>{getTipoNombre(r.tipo_vehiculo_id)}</span>
                  </div>
                </td>
                <td className="adm-table-date">{formatDate(r.created_at)}</td>
                <td>
                  {r.disponible
                    ? <Badge color="green">🟢 Disponible</Badge>
                    : <Badge color="red">🔴 Ocupado</Badge>
                  }
                </td>
                <td>
                  <button
                    className="adm-toggle-btn adm-toggle-btn--off"
                    onClick={() => onToggle('repartidor', r.id, r.disponible)}
                    title="Cambiar disponibilidad"
                  >
                    <RefreshCw size={13}/>
                    Disponibilidad
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PANEL ADMIN — Componente Principal
// ════════════════════════════════════════════════════════════════════════════
export default function AdminPanel({ session, currentTab, onTabChange }) {
  const tabToInternal = (t) => (t === 'panel' ? 'overview' : (t || 'overview'));
  const internalToTab = (t) => (t === 'overview' ? 'panel' : t);

  const [activeTab, setActiveTab]         = useState(() => tabToInternal(currentTab));
  const [comercios, setComercio]          = useState([]);
  const [repartidores, setRepartidores]   = useState([]);
  const [tiposVehiculo, setTiposVehiculo] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(null); // 'comercio' | 'repartidor'

  // Sincronizar cuando cambia la navegación desde la barra lateral
  useEffect(() => {
    if (currentTab) {
      setActiveTab(tabToInternal(currentTab));
    }
  }, [currentTab]);

  const handleSelectTab = (newTabId) => {
    setActiveTab(newTabId);
    if (onTabChange) {
      onTabChange(internalToTab(newTabId));
    }
  };

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    const [{ data: coms }, { data: reps }, { data: tipos }] = await Promise.all([
      supabase
        .from('comercios_datos')
        .select('*, profiles(email, nombre_completo, rol)')
        .order('created_at', { ascending: false }),
      supabase
        .from('repartidores_datos')
        .select('*, profiles(email, nombre_completo, rol)')
        .order('created_at', { ascending: false }),
      supabase
        .from('tipos_vehiculo')
        .select('*')
        .eq('activo', true)
        .order('capacidad_peso_kg', { ascending: true }),
    ]);
    setComercio(coms ?? []);
    setRepartidores(reps ?? []);
    setTiposVehiculo(tipos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const handleToggle = async (tipo, id, currentValue) => {
    if (tipo === 'comercio') {
      await supabase.from('comercios_datos').update({ activo: !currentValue }).eq('id', id);
    } else {
      await supabase.from('repartidores_datos').update({ disponible: !currentValue }).eq('id', id);
    }
    cargarDatos();
  };

  const stats = {
    totalComercios:    comercios.length,
    activeComercios:   comercios.filter(c => c.activo).length,
    totalRepartidores: repartidores.length,
    disponibles:       repartidores.filter(r => r.disponible).length,
  };

  const tabs = [
    { id: 'overview',     label: 'Resumen',      icon: ShieldCheck },
    { id: 'comercios',    label: 'Comercios',     icon: Store },
    { id: 'repartidores', label: 'Repartidores',  icon: Bike },
    { id: 'vehiculos',    label: 'Tipos Vehículo', icon: Car },
  ];

  return (
    <div className="adm-root">
      {/* Hero */}
      <div className="adm-hero">
        <div className="adm-hero-left">
          <div className="adm-hero-icon">
            <ShieldCheck size={28} color="#818cf8" />
          </div>
          <div>
            <h1 className="adm-hero-title">Panel Administrador</h1>
            <p className="adm-hero-sub">Gestión de comercios, repartidores y plataforma Levant</p>
          </div>
        </div>
        <button className="adm-refresh-btn" onClick={cargarDatos} title="Actualizar datos">
          <RefreshCw size={15} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid">
        <StatCard icon={Store}  label="Total Comercios"    value={stats.totalComercios}    color="#2dd4bf" iconBg="rgba(45,212,191,.12)" />
        <StatCard icon={CheckCircle2} label="Comercios Activos" value={stats.activeComercios} color="#10b981" iconBg="rgba(16,185,129,.12)" />
        <StatCard icon={Bike}   label="Total Repartidores" value={stats.totalRepartidores} color="#fb923c" iconBg="rgba(249,115,22,.12)" />
        <StatCard icon={Users}  label="Disponibles"        value={stats.disponibles}        color="#818cf8" iconBg="rgba(129,140,248,.12)" />
      </div>

      {/* Tabs */}
      <div className="adm-tabs">
        {tabs.map(t => {
          const IconComp = t.icon;
          return (
            <button
              key={t.id}
              className={`adm-tab ${activeTab === t.id ? 'adm-tab--active' : ''}`}
              onClick={() => handleSelectTab(t.id)}
            >
              <IconComp size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="adm-loading">
          <Loader2 size={32} className="adm-spin" />
          <p>Cargando datos de la plataforma…</p>
        </div>
      ) : (
        <div className="adm-content">
          {/* ── RESUMEN ── */}
          {activeTab === 'overview' && (
            <div className="adm-overview">
              <div className="adm-overview-cards">
                {/* Card Comercios */}
                <div className="adm-ov-card" onClick={() => handleSelectTab('comercios')}>
                  <div className="adm-ov-card-header" style={{ borderColor: 'rgba(45,212,191,.3)' }}>
                    <div className="adm-ov-icon" style={{ background: 'rgba(45,212,191,.12)' }}>
                      <Store size={22} color="#2dd4bf" />
                    </div>
                    <div>
                      <p className="adm-ov-label">Comercios</p>
                      <p className="adm-ov-value" style={{ color: '#2dd4bf' }}>{stats.totalComercios}</p>
                    </div>
                  </div>
                  <div className="adm-ov-progress-bar">
                    <div
                      className="adm-ov-progress-fill"
                      style={{
                        width: stats.totalComercios ? `${(stats.activeComercios / stats.totalComercios) * 100}%` : '0%',
                        background: 'linear-gradient(90deg, #2dd4bf, #06b6d4)',
                      }}
                    />
                  </div>
                  <p className="adm-ov-sub">{stats.activeComercios} activos · {stats.totalComercios - stats.activeComercios} inactivos</p>
                </div>

                {/* Card Repartidores */}
                <div className="adm-ov-card" onClick={() => handleSelectTab('repartidores')}>
                  <div className="adm-ov-card-header" style={{ borderColor: 'rgba(249,115,22,.3)' }}>
                    <div className="adm-ov-icon" style={{ background: 'rgba(249,115,22,.12)' }}>
                      <Bike size={22} color="#fb923c" />
                    </div>
                    <div>
                      <p className="adm-ov-label">Repartidores</p>
                      <p className="adm-ov-value" style={{ color: '#fb923c' }}>{stats.totalRepartidores}</p>
                    </div>
                  </div>
                  <div className="adm-ov-progress-bar">
                    <div
                      className="adm-ov-progress-fill"
                      style={{
                        width: stats.totalRepartidores ? `${(stats.disponibles / stats.totalRepartidores) * 100}%` : '0%',
                        background: 'linear-gradient(90deg, #f97316, #fb923c)',
                      }}
                    />
                  </div>
                  <p className="adm-ov-sub">{stats.disponibles} disponibles · {stats.totalRepartidores - stats.disponibles} ocupados</p>
                </div>
              </div>

              {/* Acciones rápidas */}
              <div className="adm-quick-actions">
                <h3 className="adm-section-title">Acciones Rápidas</h3>
                <div className="adm-quick-grid">
                  <button className="adm-quick-btn" onClick={() => setShowModal('comercio')}>
                    <div className="adm-quick-icon" style={{ background: 'rgba(45,212,191,.15)' }}>
                      <Building2 size={22} color="#2dd4bf" />
                    </div>
                    <span className="adm-quick-label">Crear Comercio</span>
                    <span className="adm-quick-sub">Registrar nuevo establecimiento</span>
                    <Plus size={16} className="adm-quick-plus" />
                  </button>
                  <button className="adm-quick-btn" onClick={() => setShowModal('repartidor')}>
                    <div className="adm-quick-icon" style={{ background: 'rgba(249,115,22,.15)' }}>
                      <Bike size={22} color="#fb923c" />
                    </div>
                    <span className="adm-quick-label">Crear Repartidor</span>
                    <span className="adm-quick-sub">Registrar mensajero con vehículo</span>
                    <Plus size={16} className="adm-quick-plus" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── COMERCIOS ── */}
          {activeTab === 'comercios' && (
            <div>
              <div className="adm-section-header">
                <h3 className="adm-section-title">
                  <Store size={17} /> Comercios Registrados
                </h3>
                <button className="adm-btn adm-btn--primary" onClick={() => setShowModal('comercio')}>
                  <Plus size={15} /> Nuevo Comercio
                </button>
              </div>
              <TablaComercio comercios={comercios} onToggle={handleToggle} />
            </div>
          )}

          {/* ── REPARTIDORES ── */}
          {activeTab === 'repartidores' && (
            <div>
              <div className="adm-section-header">
                <h3 className="adm-section-title">
                  <Bike size={17} /> Repartidores Registrados
                </h3>
                <button className="adm-btn adm-btn--primary" onClick={() => setShowModal('repartidor')}>
                  <Plus size={15} /> Nuevo Repartidor
                </button>
              </div>
              <TablaRepartidor
                repartidores={repartidores}
                tiposVehiculo={tiposVehiculo}
                onToggle={handleToggle}
              />
            </div>
          )}

          {/* ── TIPOS VEHÍCULO ── */}
          {activeTab === 'vehiculos' && (
            <div>
              <div className="adm-section-header">
                <h3 className="adm-section-title">
                  <Car size={17} /> Clasificación de Vehículos
                </h3>
              </div>
              <div className="adm-vehicle-cards">
                {tiposVehiculo.map((tv) => {
                  const icons = ['🛵', '🚗', '🚐', '🚛'];
                  const colors = ['#fb923c', '#818cf8', '#2dd4bf', '#f59e0b'];
                  const idx = tv.id - 1;
                  return (
                    <div
                      key={tv.id}
                      className="adm-vcard"
                      style={{ borderColor: `${colors[idx % 4]}33` }}
                    >
                      <div className="adm-vcard-icon" style={{ background: `${colors[idx % 4]}18` }}>
                        <span style={{ fontSize: '1.8rem' }}>{icons[idx % 4]}</span>
                      </div>
                      <h4 className="adm-vcard-title" style={{ color: colors[idx % 4] }}>
                        {tv.nombre}
                      </h4>
                      <p className="adm-vcard-desc">{tv.descripcion}</p>
                      <div className="adm-vcard-caps">
                        <div className="adm-vcard-cap">
                          <span className="adm-vcard-cap-label">⚖️ Peso máx.</span>
                          <span className="adm-vcard-cap-value" style={{ color: colors[idx % 4] }}>
                            {tv.capacidad_peso_kg} kg
                          </span>
                        </div>
                        <div className="adm-vcard-cap">
                          <span className="adm-vcard-cap-label">📦 Volumen máx.</span>
                          <span className="adm-vcard-cap-value" style={{ color: colors[idx % 4] }}>
                            {tv.capacidad_volumen_m3} m³
                          </span>
                        </div>
                      </div>
                      <div className={`adm-vcard-status ${tv.activo ? 'adm-vcard-status--active' : 'adm-vcard-status--inactive'}`}>
                        {tv.activo ? '✓ Activo' : '✗ Inactivo'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Info funciones de asignación */}
              <div className="adm-algo-box">
                <h4 className="adm-algo-title">
                  <Truck size={16} color="#67e8f9" /> Lógica de Asignación: <code>evaluar_tipo_vehiculo_requerido(peso, volumen)</code>
                </h4>
                <p className="adm-algo-desc">
                  Esta función RPC en Supabase recibe el <strong>peso total (kg)</strong> y <strong>volumen total (m³)</strong>
                  del pedido acumulado y retorna el <strong>tipo de vehículo mínimo recomendado</strong>.
                  El algoritmo selecciona el tipo de menor capacidad que aún supera los umbrales.
                  Si ninguno alcanza, retorna el de mayor capacidad disponible.
                </p>
                <div className="adm-algo-example">
                  <code>
                    {`-- Ejemplo de uso desde el frontend:\nawait supabase.rpc('evaluar_tipo_vehiculo_requerido', {\n  p_peso_total_kg: 12.5,\n  p_volumen_total_m3: 0.03\n})\n// → { nombre: 'Motocicleta', capacidad_peso_kg: 20, ... }`}
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      {showModal === 'comercio' && (
        <Modal title="🏪 Registrar Nuevo Comercio" onClose={() => setShowModal(null)}>
          <FormCrearComercio
            onClose={() => setShowModal(null)}
            onSuccess={cargarDatos}
          />
        </Modal>
      )}

      {showModal === 'repartidor' && (
        <Modal title="🛵 Registrar Nuevo Repartidor" onClose={() => setShowModal(null)}>
          <FormCrearRepartidor
            tiposVehiculo={tiposVehiculo}
            onClose={() => setShowModal(null)}
            onSuccess={cargarDatos}
          />
        </Modal>
      )}
    </div>
  );
}
