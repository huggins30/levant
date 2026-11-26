import { useState, useEffect } from 'react';
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

  // Rate Limiting & Protección contra Fuerza Bruta
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Temporizador de enfriamiento
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds(prev => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Verificación de bloqueo por intentos fallidos
    if (lockoutSeconds > 0) {
      setError(`Demasiados intentos de acceso fallidos. Por seguridad, espera ${lockoutSeconds} segundos antes de reintentar.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { data: authData, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;

        // Éxito: reiniciar contador de intentos fallidos
        setFailedAttempts(0);
        setLockoutSeconds(0);

        // Si es comercio o repartidor, verificar si su correo ha sido activado por el administrador
        if (authData?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (prof && (prof.rol === 'comercio' || prof.rol === 'repartidor')) {
            if (prof.correo_activado === false) {
              await supabase.auth.signOut();
              throw new Error(
                `Tu cuenta de ${prof.rol === 'comercio' ? 'Comercio' : 'Repartidor'} está registrada pero pendiente de activación por el Administrador. Podrás ingresar en cuanto tu correo sea activado.`
              );
            }
          }
        }
      } else {
        if (!nombre.trim() || nombre.length < 3) throw new Error('Ingresa un nombre válido (mín. 3 letras)');
        
        const allowedRoles = ['cliente', 'comercio', 'repartidor'];
        const safeRol = allowedRoles.includes(rol) ? rol : 'cliente';

        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              nombre_completo: nombre.trim(),
              rol: safeRol,
            },
          },
        });
        if (err) throw err;

        setFailedAttempts(0);
        setLockoutSeconds(0);

        if (safeRol === 'cliente') {
          alert('¡Registro exitoso! Revisa tu correo electrónico para confirmar tu cuenta y poder ingresar.');
        } else {
          alert(
            `¡Registro exitoso como ${rol === 'comercio' ? 'Comercio' : 'Repartidor'}!\n\nTus datos han sido registrados en la lista del Administrador. Podrás ingresar a la plataforma una vez que el Administrador active tu correo.`
          );
        }
        setIsLogin(true);
      }
    } catch (err) {
      if (isLogin) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          setLockoutSeconds(30);
          setError('⚠️ Demasiados intentos fallidos (5 de 5). Por seguridad y prevención de bots/fuerza bruta, el acceso se ha bloqueado temporalmente por 30 segundos.');
          return;
        }
      }

      if (err.message && err.message.toLowerCase().includes('email not confirmed')) {
        setError('El correo electrónico no ha sido activado todavía. Por favor revisa tu bandeja de entrada o espera la activación del administrador.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">
            <div className="auth-logo-circle">
              <img src="/logo.png" alt="Levant" className="auth-logo-img" />
            </div>
            <span className="auth-logo-text">Levant</span>
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

          <button type="submit" className="auth-btn" disabled={loading || lockoutSeconds > 0}>
            {loading ? (
              <span className="auth-spinner" />
            ) : lockoutSeconds > 0 ? (
              `⏳ Espera ${lockoutSeconds}s (Pausa de seguridad)`
            ) : isLogin ? (
              'Ingresar'
            ) : (
              'Registrarse'
            )}
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
