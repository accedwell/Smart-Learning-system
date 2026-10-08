import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { MIN_PASSWORD_LENGTH } from '../services/accounts.js'

// new password + confirmation. Asks for the current password too unless the
// person has just logged in with it (the forced first-login change).
export default function ChangePasswordForm({ account, requireCurrent, onSave, onCancel, className='login-body' }){
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);

  function submit(e){
    e.preventDefault();
    if(requireCurrent && current!==account.password) return setError(t('pw_error_current'));
    if(next.length < MIN_PASSWORD_LENGTH) return setError(t('pw_error_short',{ n:MIN_PASSWORD_LENGTH }));
    if(next===account.password) return setError(t('pw_error_same'));
    if(next!==confirm) return setError(t('signup_password_mismatch'));
    setError(null);
    onSave(next);
  }

  return (
    <form className={className} onSubmit={submit}>
      {requireCurrent && (
        <div className="field">
          <label htmlFor="pwCurrent">{t('pw_current_label')}</label>
          <input type="password" id="pwCurrent" value={current} onChange={(e)=>setCurrent(e.target.value)} autoComplete="current-password" required/>
        </div>
      )}
      <div className="field">
        <label htmlFor="pwNew">{t('pw_new_label')}</label>
        <input type="password" id="pwNew" value={next} onChange={(e)=>setNext(e.target.value)} autoComplete="new-password" required/>
      </div>
      <div className="field">
        <label htmlFor="pwConfirm">{t('pw_confirm_label')}</label>
        <input type="password" id="pwConfirm" value={confirm} onChange={(e)=>setConfirm(e.target.value)} autoComplete="new-password" required/>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button type="submit" className="btn btn-primary">{t('pw_save_btn')}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>{t('pw_cancel_btn')}</button>}
      </div>
    </form>
  );
}
