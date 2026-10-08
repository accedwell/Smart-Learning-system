import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { HeroIllustration, Icon } from '../components/ui.jsx'
import { apiPost } from '../services/api.js'
import { LinkButton } from './authParts.jsx'

// forgot password: the backend emails a reset link to the account's address
export default function ForgotPassword({ onLogin, onHome }){
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function sendLink(address){
    setSending(true);
    setError(null);
    const { error } = await apiPost('/auth/forgot-password', { email:address });
    setSending(false);
    if(error) setError(error);
    else setSentTo(address);
  }

  const backLinks = (
    <>
      <p className="auth-toggle-line"><span>{t('forgot_back_to_login')}</span><LinkButton onClick={onLogin}>{t('forgot_back_to_login_link')}</LinkButton></p>
      <LinkButton className="back-home-link" onClick={onHome}>{t('back_to_home_link')}</LinkButton>
    </>
  );
  const errorLine = error && <p className="field-error">{t(error.code, error.vars)}</p>;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <HeroIllustration/>
          <span className="hero-badge">SMART LEARNING</span>
          <h1>{t('forgot_title')}</h1>
          <p>{t('forgot_subtitle')}</p>
        </div>
        {sentTo==null ? (
          <form className="login-body" onSubmit={(e)=>{ e.preventDefault(); sendLink(email.trim()); }}>
            <div className="field">
              <label htmlFor="forgotEmail">{t('forgot_email_label')}</label>
              <input type="email" id="forgotEmail" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder={t('forgot_email_placeholder')} autoComplete="email" required/>
            </div>
            {errorLine}
            <button type="submit" className="btn btn-primary" style={{ padding:10, fontSize:13 }} disabled={sending}>{t('forgot_submit_btn')}</button>
            {backLinks}
          </form>
        ) : (
          <div className="login-body">
            <div className="forgot-success">
              <span className="icon-badge"><Icon name="inbox"/></span>
              <h3>{t('forgot_success_title')}</h3>
              <p>{t('forgot_success_note',{ value:sentTo })}</p>
            </div>
            {errorLine}
            <button type="button" className="btn" disabled={sending} onClick={()=>sendLink(sentTo)}>{t('forgot_resend_btn')}</button>
            {backLinks}
          </div>
        )}
      </div>
    </div>
  );
}
