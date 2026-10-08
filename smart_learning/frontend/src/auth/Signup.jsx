import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { HeroIllustration, GradeSelect } from '../components/ui.jsx'
import { SELF_SIGNUP_ROLES } from '../services/accounts.js'
import { AuthLangBar, RoleSelect, LinkButton, PasswordInput } from './authParts.jsx'

// SIGN UP: new-account screen for learners and school administrators only;
// every other role is created by the administrator from the admin dashboard.
// onSubmit returns an error ({ key }) or null when the account was created.
export default function Signup({ onSubmit, onLogin, onHome }){
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('learner');
  const [grade, setGrade] = useState('10');
  const [idNumber, setIdNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);

  function submit(e){
    e.preventDefault();
    if(password!==confirm){ setError({ key:'signup_password_mismatch' }); return; }
    const extra = role==='learner' ? { idNumber:idNumber.trim() } : {};
    setError(onSubmit({ name:name.trim() || t('signup_name_placeholder'), email:email.trim(), role, grade, password, extra }));
  }

  return (
    <div className="login-wrap auth-bg">
      <div className="login-card login-card-signup">
        <AuthLangBar/>
        <div className="login-head login-head-signup">
          <HeroIllustration/>
          <span className="hero-badge">JOIN SMART LEARNING</span>
          <h1>{t('signup_title')}</h1>
          <p>{t('signup_subtitle')}</p>
        </div>
        <form className="login-body" onSubmit={submit}>
          <div className="field">
            <label htmlFor="signupName">{t('signup_name_label')}</label>
            <input type="text" id="signupName" value={name} onChange={(e)=>setName(e.target.value)} placeholder={t('signup_name_placeholder')} required/>
          </div>
          <div className="field">
            <label htmlFor="signupEmail">{t('signup_email_label')}</label>
            <input type="email" id="signupEmail" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder={t('signup_email_placeholder')} autoComplete="email" required/>
          </div>
          <div className="field">
            <label htmlFor="signupRole">{t('signup_role_label')}</label>
            <RoleSelect id="signupRole" value={role} onChange={setRole} roles={SELF_SIGNUP_ROLES}/>
          </div>
          <p className="muted" style={{ margin:'-6px 0 0', fontSize:11.5 }}>{t('signup_staff_note')}</p>
          {role==='learner' && (
            <div className="field">
              <label htmlFor="signupGrade">{t('signup_grade_label')}</label>
              <GradeSelect id="signupGrade" value={grade} onChange={setGrade}/>
            </div>
          )}
          {role==='learner' && (
            <div className="field">
              <label htmlFor="signupId">{t('login_id_label')}</label>
              <input type="text" id="signupId" value={idNumber} onChange={(e)=>setIdNumber(e.target.value)} placeholder={t('login_id_placeholder')} required/>
            </div>
          )}
          <div className="field">
            <label htmlFor="signupPassword">{t('signup_password_label')}</label>
            <PasswordInput id="signupPassword" value={password} onChange={setPassword} placeholder={t('signup_password_placeholder')} autoComplete="new-password" required/>
          </div>
          <div className="field">
            <label htmlFor="signupConfirmPassword">{t('signup_confirm_label')}</label>
            <PasswordInput id="signupConfirmPassword" value={confirm} onChange={setConfirm} placeholder={t('signup_confirm_placeholder')} autoComplete="new-password" required/>
          </div>
          {error && <p className="field-error">{t(error.key, error.vars)}</p>}
          <button type="submit" className="btn btn-primary" style={{ padding:10, fontSize:13 }}>{t('signup_button')}</button>
          <p className="auth-toggle-line"><span>{t('auth_toggle_to_login')}</span><LinkButton onClick={onLogin}>{t('auth_toggle_to_login_link')}</LinkButton></p>
          <LinkButton className="back-home-link" onClick={onHome}>{t('back_to_home_link')}</LinkButton>
        </form>
      </div>
    </div>
  );
}
