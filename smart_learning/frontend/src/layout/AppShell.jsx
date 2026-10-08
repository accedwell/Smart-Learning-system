import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { useStore } from '../store/AppStore.jsx'
import { BrandMark, HeroIllustration, LanguageSelect } from '../components/ui.jsx'
import { Avatar } from '../components/RoleBadges.jsx'
import ProfilePage from '../profile/ProfilePage.jsx'
import LearnerDashboard from '../../learner/LearnerDashboard.jsx'
import TeacherDashboard from '../../teacher/TeacherDashboard.jsx'
import ParentDashboard from '../../parent/ParentDashboard.jsx'
import HodDashboard from '../../hod/HodDashboard.jsx'
import PrincipalDashboard from '../../principal/PrincipalDashboard.jsx'
import AdminDashboard from '../../admin/AdminDashboard.jsx'

const DASHBOARDS = {
  learner:LearnerDashboard, teacher:TeacherDashboard, parent:ParentDashboard,
  hod:HodDashboard, principal:PrincipalDashboard, admin:AdminDashboard,
};

export default function AppShell({ onLogout }){
  const { t, lang, setLanguage, translating } = useI18n();
  const { state } = useStore();
  const [showProfile, setShowProfile] = useState(false);
  const surname = (state.auth.name||'').trim().split(/\s+/).pop();
  const Dashboard = DASHBOARDS[state.role];

  return (
    <div className="app">
      <HeroIllustration className="app-bg-illustration"/>
      <div className="topbar">
        <HeroIllustration className="topbar-watermark"/>
        <div className="topbar-actions">
          <button className={'btn logout-corner profile-btn'+(showProfile?' active':'')} onClick={()=>setShowProfile(!showProfile)}>
            <Avatar name={state.auth.name} role={state.auth.role}/>{t('profile_button')}
          </button>
          <button className="btn logout-corner" onClick={onLogout}>{t('logout_button')}</button>
        </div>
        <div className="topbar-head">
          <div className="brand-mark">
            <BrandMark/>
            <h1>{t('app_title')}</h1>
          </div>
          <div className="lang-switch">
            <div className="logged-bar">
              <span>{surname ? t('tab_'+state.auth.role)+' · '+surname : t('tab_'+state.auth.role)}</span>
            </div>
            <LanguageSelect value={lang} onChange={setLanguage}/>
            {translating && <div className="spin"/>}
          </div>
        </div>
      </div>
      <div>{showProfile ? <ProfilePage onBack={()=>setShowProfile(false)}/> : <Dashboard/>}</div>
    </div>
  );
}
