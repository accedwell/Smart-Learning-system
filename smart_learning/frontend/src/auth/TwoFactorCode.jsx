import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { Icon } from '../components/ui.jsx'
import { AuthLangBar, LinkButton } from './authParts.jsx'

// The second sign-in step for administrators, principals and HODs: the 6-digit code emailed
// after the right password. onSubmit(code) and onResend() resolve to an error text or nothing.
export default function TwoFactorCode({ email, minutes, onSubmit, onResend, onBack }){
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e){
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const err = await onSubmit(code);
    setBusy(false);
    if(err){ setError(err); setCode(''); }
  }

  async function resend(){
    setBusy(true);
    setError(null);
    const err = await onResend();
    setBusy(false);
    if(err) setError(err);
    else{ setNote(t('two_factor_resent')); setCode(''); }
  }

  return (
    <div className="login-wrap auth-bg">
      <div className="login-card">
        <AuthLangBar/>
        <div className="login-head">
          <span className="code-badge"><Icon name="shield"/></span>
          <span className="hero-badge">SMART LEARNING</span>
          <h1>{t('two_factor_title')}</h1>
          <p>{t('two_factor_subtitle',{ email, minutes })}</p>
        </div>
        <form className="login-body" onSubmit={submit}>
          <div className="field">
            <label htmlFor="loginCode">{t('two_factor_label')}</label>
            <input id="loginCode" className="code-input" value={code} autoFocus required
              inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000"
              onChange={(e)=>setCode(e.target.value.replace(/[^\d ]/g, ''))}/>
          </div>
          {error && <p className="field-error">{error}</p>}
          {note && <p className="ai-note"><Icon name="check"/>{' '+note}</p>}
          <button type="submit" className="btn btn-primary" style={{ padding:10, fontSize:13 }} disabled={busy || code.replace(/\s/g, '').length!==6}>{t('two_factor_button')}</button>
          <p className="forgot-pw-line"><LinkButton onClick={resend}>{t('two_factor_resend')}</LinkButton></p>
          <LinkButton className="back-home-link" onClick={onBack}>{t('two_factor_back')}</LinkButton>
        </form>
      </div>
    </div>
  );
}
