import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { HeroIllustration, Icon } from '../components/ui.jsx'
import { MIN_PASSWORD_LENGTH } from '../services/accounts.js'
import { apiPost } from '../services/api.js'
import { LinkButton, PasswordInput } from './authParts.jsx'

// opened from the link in the password-reset email (?reset=<token>)
export default function ResetPassword({ token, onLogin, onForgot }){
  const { t } = useI18n();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e){
    e.preventDefault();
    if(next.length < MIN_PASSWORD_LENGTH) return setError({ code:'pw_error_short', vars:{ n:MIN_PASSWORD_LENGTH } });
    if(next!==confirm) return setError({ code:'signup_password_mismatch' });
    setSaving(true);
    const { error } = await apiPost('/auth/reset-password', { token, newPassword:next });
    setSaving(false);
    if(error) setError(error);
    else setDone(true);
  }

  return (
    <div className="login-wrap auth-bg">
      <div className="login-card">
        <div className="login-head">
          <HeroIllustration/>
          <span className="hero-badge">SMART LEARNING</span>
          <h1>{t('reset_title')}</h1>
          <p>{t('reset_subtitle')}</p>
        </div>
        {done ? (
          <div className="login-body">
            <div className="forgot-success">
              <span className="icon-badge"><Icon name="check"/></span>
              <h3>{t('reset_success_title')}</h3>
              <p>{t('reset_success_note')}</p>
            </div>
            <button type="button" className="btn btn-primary" style={{ padding:10, fontSize:13 }} onClick={onLogin}>{t('login_button')}</button>
          </div>
        ) : (
          <form className="login-body" onSubmit={submit}>
            <div className="field">
              <label htmlFor="resetNew">{t('pw_new_label')}</label>
              <PasswordInput id="resetNew" value={next} onChange={setNext} autoComplete="new-password" required/>
            </div>
            <div className="field">
              <label htmlFor="resetConfirm">{t('pw_confirm_label')}</label>
              <PasswordInput id="resetConfirm" value={confirm} onChange={setConfirm} autoComplete="new-password" required/>
            </div>
            {error && <p className="field-error">{t(error.code, error.vars)}</p>}
            {error && error.code==='reset_link_invalid' && <p className="forgot-pw-line"><LinkButton onClick={onForgot}>{t('reset_request_new_link')}</LinkButton></p>}
            <button type="submit" className="btn btn-primary" style={{ padding:10, fontSize:13 }} disabled={saving}>{t('pw_save_btn')}</button>
            <p className="auth-toggle-line"><span>{t('forgot_back_to_login')}</span><LinkButton onClick={onLogin}>{t('forgot_back_to_login_link')}</LinkButton></p>
          </form>
        )}
      </div>
    </div>
  );
}
