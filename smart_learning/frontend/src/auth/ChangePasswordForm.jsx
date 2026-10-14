import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { PasswordInput } from './authParts.jsx'
import { MIN_PASSWORD_LENGTH } from '../services/accounts.js'

// new password + confirmation. Asks for the current password too unless the
// person has just logged in with it (the forced first-login change).
export default function ChangePasswordForm({ account, requireCurrent, onSave, onCancel, className='login-body' }){
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);

  // onSave may return (or resolve to) an error message, e.g. when the server rejects the password
  async function submit(e){
    e.preventDefault();
    // a demo account checks here; a backend account's current password is checked by the server
    if(requireCurrent && account.password!=null && current!==account.password) return setError(t('pw_error_current'));
    if(next.length < MIN_PASSWORD_LENGTH) return setError(t('pw_error_short',{ n:MIN_PASSWORD_LENGTH }));
    if(account.password!=null && next===account.password) return setError(t('pw_error_same'));
    if(next!==confirm) return setError(t('signup_password_mismatch'));
    setError(null);
    const err = await onSave(next, current);
    if(err) setError(err);
  }

  return (
    <form className={className} onSubmit={submit}>
      {requireCurrent && (
        <div className="field">
          <label htmlFor="pwCurrent">{t('pw_current_label')}</label>
          <PasswordInput id="pwCurrent" value={current} onChange={setCurrent} autoComplete="current-password" required/>
        </div>
      )}
      <div className="field">
        <label htmlFor="pwNew">{t('pw_new_label')}</label>
        <PasswordInput id="pwNew" value={next} onChange={setNext} autoComplete="new-password" required/>
      </div>
      <div className="field">
        <label htmlFor="pwConfirm">{t('pw_confirm_label')}</label>
        <PasswordInput id="pwConfirm" value={confirm} onChange={setConfirm} autoComplete="new-password" required/>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button type="submit" className="btn btn-primary">{t('pw_save_btn')}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>{t('pw_cancel_btn')}</button>}
      </div>
    </form>
  );
}
