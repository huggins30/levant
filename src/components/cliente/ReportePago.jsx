import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './ReportePago.css';

const BANCOS_VE = [
  'Banco de Venezuela','Banesco','Mercantil','BBVA Provincial','Bicentenario',
  'BNC','Banco Exterior','Sofitasa','Fondo Común','Banplus','100% Banco',
  'Bancamiga','Bancaribe','Plaza Bank','Del Sur','BOD','Bancrecer','Banfanb',
];

const METODOS = [
  { value: 'pago_movil',    label: '📱 Pago Móvil' },
  { value: 'zelle',         label: '💵 Zelle' },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'efectivo_usd',  label: '💵 Efectivo USD' },
  { value: 'efectivo_bs',   label: '💴 Efectivo Bs' },
];

const defaultForm = {
  metodo: 'pago_movil',
  banco_origen: '',
  banco_destino: '',
  referencia: '',
  monto_bs: '',
  monto_usd: '',
  tasa_bcv: '',
  notas: '',
};

export default function ReportePago({ session, pedidoId, onReported }) {
  const [form, setForm]       = useState(defaultForm);
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null); // 'success' | 'error'
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);

  const isPagoMovil   = form.metodo === 'pago_movil';
  const isTransferencia = form.metodo === 'transferencia';
  const isZelle       = form.metodo === 'zelle';
  const needsBanks    = isPagoMovil || isTransferencia;

  // Preview de comprobante
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Validación ──────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.referencia.trim())
      e.referencia = 'El número de referencia es obligatorio.';

    if (needsBanks && !form.banco_origen)
      e.banco_origen = 'Selecciona el banco de origen.';
    if (needsBanks && !form.banco_destino)
      e.banco_destino = 'Selecciona el banco de destino.';

    if (!form.monto_bs && !form.monto_usd)
      e.monto = 'Ingresa al menos el monto en Bs o USD.';

    if (form.monto_bs && isNaN(parseFloat(form.monto_bs)))
      e.monto_bs = 'Monto en Bs inválido.';
    if (form.monto_usd && isNaN(parseFloat(form.monto_usd)))
      e.monto_usd = 'Monto en USD inválido.';
    if (form.tasa_bcv && isNaN(parseFloat(form.tasa_bcv)))
      e.tasa_bcv = 'Tasa BCV inválida.';

    return e;
  };

  // ── Handlers ───────────────────────────────────────────────────
  const handleChange = ({ target: { name, value } }) => {
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name] || errors.monto) setErrors(prev => ({ ...prev, [name]: '', monto: '' }));
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f && f.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, file: 'El archivo no debe superar 5 MB.' }));
      return;
    }
    setFile(f ?? null);
    setErrors(prev => ({ ...prev, file: '' }));
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
      let comprobante_url = null;

      // Upload comprobante si existe
      if (file) {
        const ext  = file.name.split('.').pop();
        const path = `comprobantes/${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('pagos')
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage.from('pagos').getPublicUrl(path);
        comprobante_url = urlData.publicUrl;
      }

      const payload = {
        pedido_id:      pedidoId,
        cliente_id:     session.user.id,
        metodo:         form.metodo,
        banco_origen:   form.banco_origen   || null,
        banco_destino:  form.banco_destino  || null,
        referencia:     form.referencia.trim(),
        monto_bs:       form.monto_bs  ? parseFloat(form.monto_bs)  : null,
        monto_usd:      form.monto_usd ? parseFloat(form.monto_usd) : null,
        tasa_bcv:       form.tasa_bcv  ? parseFloat(form.tasa_bcv)  : null,
        notas:          form.notas.trim() || null,
        comprobante_url,
      };

      const { error } = await supabase.from('reportes_pago').insert(payload);
      if (error) throw error;

      setStatus('success');
      setForm(defaultForm);
      setFile(null);
      onReported?.();
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="rp-wrapper">
      <div className="rp-card">
        <div className="rp-header">
          <span className="rp-icon">💳</span>
          <div>
            <h2 className="rp-title">Reportar Pago</h2>
            <p className="rp-subtitle">Registra tu comprobante de pago</p>
          </div>
        </div>

        <form className="rp-form" onSubmit={handleSubmit} noValidate>

          {/* ── Método de pago ── */}
          <div className="rp-field">
            <label>Método de pago</label>
            <div className="rp-methods">
              {METODOS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  id={`rp-metodo-${m.value}`}
                  className={`rp-method-btn ${form.metodo === m.value ? 'rp-method-btn--active' : ''}`}
                  onClick={() => setForm(prev => ({ ...prev, metodo: m.value, banco_origen: '', banco_destino: '' }))}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Bancos (solo Pago Móvil y Transferencia) ── */}
          {needsBanks && (
            <div className="rp-row">
              <div className={`rp-field ${errors.banco_origen ? 'rp-field--error' : ''}`}>
                <label htmlFor="rp-banco-origen">Banco origen</label>
                <select id="rp-banco-origen" name="banco_origen" value={form.banco_origen} onChange={handleChange}>
                  <option value="">Seleccionar…</option>
                  {BANCOS_VE.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {errors.banco_origen && <span className="rp-error">{errors.banco_origen}</span>}
              </div>

              <div className={`rp-field ${errors.banco_destino ? 'rp-field--error' : ''}`}>
                <label htmlFor="rp-banco-destino">Banco destino</label>
                <select id="rp-banco-destino" name="banco_destino" value={form.banco_destino} onChange={handleChange}>
                  <option value="">Seleccionar…</option>
                  {BANCOS_VE.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {errors.banco_destino && <span className="rp-error">{errors.banco_destino}</span>}
              </div>
            </div>
          )}

          {/* ── Referencia ── */}
          <div className={`rp-field ${errors.referencia ? 'rp-field--error' : ''}`}>
            <label htmlFor="rp-referencia">
              {isZelle ? 'ID / Memo de Zelle' : 'Número de referencia'}
            </label>
            <input
              id="rp-referencia"
              name="referencia"
              type="text"
              placeholder={isZelle ? 'Ej: 4a8f2c…' : 'Ej: 012345678'}
              value={form.referencia}
              onChange={handleChange}
            />
            {errors.referencia && <span className="rp-error">{errors.referencia}</span>}
          </div>

          {/* ── Montos ── */}
          <div className="rp-row">
            <div className={`rp-field ${errors.monto_bs || errors.monto ? 'rp-field--error' : ''}`}>
              <label htmlFor="rp-monto-bs">Monto en Bs</label>
              <div className="rp-input-prefix">
                <span>Bs</span>
                <input id="rp-monto-bs" name="monto_bs" type="number" min="0" step="0.01"
                  placeholder="0.00" value={form.monto_bs} onChange={handleChange} />
              </div>
              {errors.monto_bs && <span className="rp-error">{errors.monto_bs}</span>}
            </div>

            <div className={`rp-field ${errors.monto_usd || errors.monto ? 'rp-field--error' : ''}`}>
              <label htmlFor="rp-monto-usd">Monto en USD</label>
              <div className="rp-input-prefix">
                <span>$</span>
                <input id="rp-monto-usd" name="monto_usd" type="number" min="0" step="0.01"
                  placeholder="0.00" value={form.monto_usd} onChange={handleChange} />
              </div>
              {errors.monto_usd && <span className="rp-error">{errors.monto_usd}</span>}
            </div>
          </div>
          {errors.monto && <span className="rp-error rp-error--global">{errors.monto}</span>}

          {/* ── Tasa BCV ── */}
          <div className={`rp-field ${errors.tasa_bcv ? 'rp-field--error' : ''}`}>
            <label htmlFor="rp-tasa">Tasa BCV <span className="rp-optional">(opcional)</span></label>
            <div className="rp-input-prefix">
              <span>Bs/$</span>
              <input id="rp-tasa" name="tasa_bcv" type="number" min="0" step="0.0001"
                placeholder="Ej: 36.50" value={form.tasa_bcv} onChange={handleChange} />
            </div>
            {errors.tasa_bcv && <span className="rp-error">{errors.tasa_bcv}</span>}
          </div>

          {/* ── Notas ── */}
          <div className="rp-field">
            <label htmlFor="rp-notas">Notas <span className="rp-optional">(opcional)</span></label>
            <textarea id="rp-notas" name="notas" rows={2} placeholder="Información adicional…"
              value={form.notas} onChange={handleChange} />
          </div>

          {/* ── Comprobante ── */}
          <div className={`rp-field ${errors.file ? 'rp-field--error' : ''}`}>
            <label>Comprobante <span className="rp-optional">(imagen, máx. 5 MB)</span></label>
            <label htmlFor="rp-file" className="rp-file-label">
              {preview
                ? <img src={preview} alt="comprobante" className="rp-preview" />
                : <><span className="rp-file-icon">📎</span><span>Adjuntar imagen</span></>
              }
            </label>
            <input id="rp-file" type="file" accept="image/*,.pdf" onChange={handleFile} className="rp-file-hidden" />
            {errors.file && <span className="rp-error">{errors.file}</span>}
          </div>

          {/* ── Alerts ── */}
          {status === 'success' && (
            <div className="rp-alert rp-alert--success">✅ Pago reportado. Esperando verificación del comercio.</div>
          )}
          {status === 'error' && (
            <div className="rp-alert rp-alert--error">❌ Error al enviar el reporte. Intenta de nuevo.</div>
          )}

          {/* ── Submit ── */}
          <button id="rp-submit" type="submit" className="rp-btn-primary" disabled={loading}>
            {loading ? <span className="rp-spinner" /> : '📤 Enviar reporte de pago'}
          </button>
        </form>
      </div>
    </div>
  );
}
