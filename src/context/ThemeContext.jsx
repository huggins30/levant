import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = window.localStorage ? window.localStorage.getItem('levant_theme') : null;
        if (saved === 'dark' || saved === 'light') return saved;
        if (window.matchMedia && typeof window.matchMedia === 'function') {
          const mq = window.matchMedia('(prefers-color-scheme: dark)');
          if (mq && mq.matches) return 'dark';
        }
      }
    } catch (e) {
      console.warn('[ThemeContext] Error al leer tema inicial:', e);
    }
    return 'light';
  });

  const applyTheme = (newTheme) => {
    try {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      if (!root) return;
      root.setAttribute('data-theme', newTheme);
      if (newTheme === 'dark') {
        root.classList.add('dark');
        if (root.style) root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        if (root.style) root.style.colorScheme = 'light';
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('levant_theme', newTheme);
      }
    } catch (e) {
      console.warn('[ThemeContext] Error al aplicar tema:', e);
    }
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Escuchar cambios automáticos del sistema si no hay preferencia manual
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.matchMedia || typeof window.matchMedia !== 'function') return;
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (!mediaQuery) return;

      const handleChange = (e) => {
        try {
          const saved = window.localStorage ? window.localStorage.getItem('levant_theme') : null;
          if (!saved) {
            setThemeState(e.matches ? 'dark' : 'light');
          }
        } catch (_) {}
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        // Compatibilidad con Android WebViews antiguos
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    } catch (e) {
      console.warn('[ThemeContext] Error configurando listener de tema:', e);
    }
  }, []);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (t) => {
    if (t === 'dark' || t === 'light') {
      setThemeState(t);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'light',
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
}
