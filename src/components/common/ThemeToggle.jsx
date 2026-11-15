import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import './ThemeToggle.css';

export default function ThemeToggle({ showLabel = false, size = 'md', className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle-btn theme-toggle-btn--${size} ${isDark ? 'theme-toggle-btn--dark' : 'theme-toggle-btn--light'} ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      <div className="theme-toggle-icon-wrap">
        {isDark ? (
          <Sun size={size === 'sm' ? 14 : 16} className="theme-toggle-icon theme-toggle-icon--sun" />
        ) : (
          <Moon size={size === 'sm' ? 14 : 16} className="theme-toggle-icon theme-toggle-icon--moon" />
        )}
      </div>
      {showLabel && (
        <span className="theme-toggle-label">
          {isDark ? 'Modo Claro' : 'Modo Oscuro'}
        </span>
      )}
    </button>
  );
}
