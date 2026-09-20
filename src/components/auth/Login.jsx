import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import './Login.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre]     = useState('');
  const [rol, setRol]           = useState('cliente');
  
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
      } else {
        if (!nombre.trim() || nombre.length < 3) throw new Error('Ingresa un nombre válido (mín. 3 letras)');
        
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre_completo: nombre.trim(),
              rol: rol,
            },
          },
        });
        if (err) throw err;
        alert('¡Registro exitoso! (Si tienes confirmación por email activada en Supabase, revisa tu correo)');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">
            <img src="/logo.png" alt="Levant" className="auth-logo-img" />
            Levant
          </span>
          <h2>{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
          <p>{isLogin ? 'Ingresa tus credenciales para continuar' : 'Únete a la plataforma de delivery'}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div className="auth-field">
                <label>Nombre completo</label>
                <input 
                  type="text" 
                  placeholder="Ej: María González" 
                  value={nombre} 
                  onChange={e => setNombre(e.target.value)} 
                  required 
                />
              </div>

              <div className="auth-field">
                <label>Tipo de cuenta</label>
                <div className="auth-roles">
                  {[
                    { id: 'cliente', label: '👤 Cliente' },
                    { id: 'comercio', label: '🏪 Comercio' },
                    { id: 'repartidor', label: '🛵 Repartidor' }
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      className={`auth-role-btn ${rol === r.id ? 'auth-role-btn--active' : ''}`}
                      onClick={() => setRol(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="auth-field">
            <label>Correo electrónico</label>
            <input 
              type="email" 
              placeholder="tu@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>

          <div className="auth-field">
            <label>Contraseña</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : (isLogin ? 'Ingresar' : 'Registrarse')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
            <button className="auth-switch" onClick={() => { setIsLogin(!isLogin); setError(null); }}>
              {isLogin ? 'Regístrate aquí' : 'Inicia sesión'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
