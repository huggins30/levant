import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#0F1115',
          color: '#F3F4F6'
        }}>
          <div style={{
            maxWidth: '420px',
            backgroundColor: '#181B20',
            border: '1px solid #2B303A',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              Ocurrió un problema inesperado
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#9CA3AF', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              La aplicación no pudo cargar correctamente este componente.
            </p>
            {this.state.error && (
              <pre style={{
                background: '#0F1115',
                color: '#EF4444',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '1.5rem',
                border: '1px solid #262B34'
              }}>
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              style={{
                background: '#F3F4F6',
                color: '#111827',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Reintentar / Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
