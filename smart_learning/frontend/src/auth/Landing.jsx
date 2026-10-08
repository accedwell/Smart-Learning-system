import { useI18n } from '../i18n/I18nContext.jsx'
import { BrandMark } from '../components/ui.jsx'

export default function Landing({ onLogin, onSignup }){
  const { t } = useI18n();
  return (
    <div className="landing-wrap">
      <div className="landing-topbar">
        <div className="landing-logo">
          <BrandMark size={30}/>
          <b>{t('app_title').replace(/\s*[–-]\s*Prototype$/i, '')}</b>
        </div>
        <div className="landing-topbar-actions">
          <button className="btn landing-btn-outline" onClick={onLogin}>{t('landing_login_btn')}</button>
          <button className="btn btn-primary" onClick={onSignup}>{t('landing_signup_btn')}</button>
        </div>
      </div>
      <div className="landing-hero">
        <span className="hero-badge">{t('landing_badge')}</span>
        <h1>{t('landing_headline_pre')}<span className="highlight">{t('landing_headline_highlight')}</span>{t('landing_headline_post')}</h1>
        <p>{t('landing_subtitle')}</p>
        <div className="landing-cta-row">
          <button className="btn btn-primary landing-cta" onClick={onSignup}>{t('landing_get_started_btn')}</button>
          <span className="landing-already">
            <span>{t('landing_already_account')}</span>
            <a href="#" onClick={(e)=>{ e.preventDefault(); onLogin(); }}>{t('landing_already_login_link')}</a>
          </span>
        </div>
        <div className="landing-features">
          <div className="landing-feature">
            <span className="landing-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.5 3 L12.2 8.3 L17.5 10 L12.2 11.7 L10.5 17 L8.8 11.7 L3.5 10 L8.8 8.3 Z" fill="currentColor" stroke="currentColor"/>
                <path d="M17.5 14 L18.3 16.3 L20.5 17 L18.3 17.7 L17.5 20 L16.7 17.7 L14.5 17 L16.7 16.3 Z" fill="currentColor" stroke="currentColor"/>
              </svg>
            </span>
            <div>
              <b>{t('landing_feat2_title')}</b>
              <span>{t('landing_feat2_sub')}</span>
            </div>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <path d="M3 12 h18"/>
                <path d="M12 3 a13 13 0 0 1 0 18 a13 13 0 0 1 0 -18 Z"/>
              </svg>
            </span>
            <div>
              <b>{t('landing_feat3_title')}</b>
              <span>{t('landing_feat3_sub')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
