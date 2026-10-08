import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { HeroIllustration, GradeSelect } from '../components/ui.jsx'
import { ADMIN_CREATED_ROLES } from '../services/accounts.js'
import { AuthLangBar, RoleSelect, LinkButton } from './authParts.jsx'

// LOG IN: returning-user screen, identity + password only, no registration fields.
// onSubmit returns an error ({ key, vars }) or null when the login went through.
export default function Login({ onSubmit, onSignup, onForgot, onHome }){
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('learner');
  const [grade, setGrade] = useState('10');
  const [staffNumber, setStaffNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  function submit(e){
    e.preventDefault();
    // a teacher must give their staff number (a learner's ID number is captured at sign-up)
    const extra = {};
    if(role==='teacher') extra.staffNumber = staffNumber.trim();
    setError(onSubmit({ email:email.trim(), role, grade, password, extra }));
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
            <label htmlFor="loginRole">{t('login_role_label')}</label>
            <RoleSelect id="loginRole" value={role} onChange={(r)=>{ setRole(r); setError(null); }}/>
          </div>
          {ADMIN_CREATED_ROLES.includes(role) && <p className="muted" style={{ margin:'-6px 0 0', fontSize:11.5 }}>{t('login_staff_note')}</p>}
          {role==='learner' && (
            <div className="field">
              <label htmlFor="loginGrade">{t('login_grade_label')}</label>
              <GradeSelect id="loginGrade" value={grade} onChange={setGrade}/>
            </div>
          )}
          {role==='teacher' && (
            <div className="field">
              <label htmlFor="loginStaff">{t('login_staff_label')}</label>
              <input type="text" id="loginStaff" value={staffNumber} onChange={(e)=>setStaffNumber(e.target.value)} placeholder={t('login_staff_placeholder')} required/>
            </div>
          )}
          <div className="field">
            <label htmlFor="loginPassword">{t('login_password_label')}</label>
            <input type="password" id="loginPassword" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password"/>
          </div>
          {error && <p className="field-error">{t(error.key, error.vars)}</p>}
          <p className="forgot-pw-line"><LinkButton onClick={onForgot}>{t('forgot_password_link')}</LinkButton></p>
          <button type="submit" className="btn btn-primary" style={{ padding:10, fontSize:13 }}>{t('login_button')}</button>
          <p className="auth-toggle-line"><span>{t('auth_toggle_to_signup')}</span><LinkButton onClick={onSignup}>{t('auth_toggle_to_signup_link')}</LinkButton></p>
          <LinkButton className="back-home-link" onClick={onHome}>{t('back_to_home_link')}</LinkButton>
        </form>
      </div>
    </div>
  );
}
