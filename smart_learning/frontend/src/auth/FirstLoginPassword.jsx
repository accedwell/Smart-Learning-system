import { useI18n } from '../i18n/I18nContext.jsx'
import { HeroIllustration } from '../components/ui.jsx'
import ChangePasswordForm from './ChangePasswordForm.jsx'

// shown straight after someone logs in with the temporary password the administrator emailed them
export default function FirstLoginPassword({ account, onSave, onCancel }){
  const { t } = useI18n();
  return (
    <div className="login-wrap auth-bg">
      <div className="login-card">
        <div className="login-head">
          <HeroIllustration/>
          <span className="hero-badge">SMART LEARNING</span>
          <h1>{t('pw_change_title')}</h1>
          <p>{t('pw_change_forced_sub')}</p>
        </div>
        <ChangePasswordForm account={account} onSave={onSave} onCancel={onCancel}/>
      </div>
    </div>
  );
}
