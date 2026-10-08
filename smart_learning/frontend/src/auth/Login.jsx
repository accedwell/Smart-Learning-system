import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { HeroIllustration } from '../components/ui.jsx'
import { AuthLangBar, LinkButton, PasswordInput } from './authParts.jsx'

// LOG IN: returning-user screen, email + password only. The role (and a learner's
// grade) come from the account itself, so there is nothing else to pick.
// onSubmit returns an error ({ key, vars }) or null when the login went through.
export default function Login({ onSubmit, onSignup, onForgot }){
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  function submit(e){
    e.preventDefault();
    setError(onSubmit({ email:email.trim(), password }));
  }

  return (
    <div className="login-wrap auth-bg">
      <div className="login-card">
        <AuthLangBar/>
        <div className="login-head">
          <HeroIllustration label="Illustration of a book opening into a digital learning dashboard, under a graduation cap and rising sun"/>
          <span className="hero-badge">SMART LEARNING</span>
          <h1>{t('login_title')}</h1>
          <p>{t('login_subtitle')}</p>
        </div>
        <form className="login-body" onSubmit={submit}>
          <div className="field">
            <label htmlFor="loginEmail">{t('login_email_label')}</label>
            <input type="text" id="loginEmail" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder={t('login_email_placeholder')} autoComplete="username" required/>
          </div>
          <div className="field">
            <label htmlFor="loginPassword">{t('login_password_label')}</label>
            <PasswordInput id="loginPassword" value={password} onChange={setPassword} autoComplete="current-password" required/>
          </div>
          {error && <p className="field-error">{t(error.key, error.vars)}</p>}
          <p className="forgot-pw-line"><LinkButton onClick={onForgot}>{t('forgot_password_link')}</LinkButton></p>
          <button type="submit" className="btn btn-primary" style={{ padding:10, fontSize:13 }}>{t('login_button')}</button>
          <p className="auth-toggle-line"><span>{t('auth_toggle_to_signup')}</span><LinkButton onClick={onSignup}>{t('auth_toggle_to_signup_link')}</LinkButton></p>
        </form>
      </div>
    </div>
  );
}
