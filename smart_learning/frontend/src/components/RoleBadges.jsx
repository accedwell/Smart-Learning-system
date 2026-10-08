import { useI18n } from '../i18n/I18nContext.jsx'

// each role's own colour pair from the design tokens (--learner / --learner-tint, ...)
const roleColor = (role)=>({ color:`var(--${role})`, background:`var(--${role}-tint)` });

function initials(name){
  const parts = (name||'').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').trim().split(/\s+/);
  return ((parts[0]||'')[0]||'').toUpperCase() + ((parts.length>1 ? parts[parts.length-1][0] : '')||'').toUpperCase();
}

export function Avatar({ name, role, large }){
  return <span className={'avatar'+(large?' avatar-lg':'')} style={roleColor(role)} aria-hidden="true">{initials(name)}</span>;
}

export function RolePill({ role }){
  const { t } = useI18n();
  return <span className="pill role-pill" style={roleColor(role)}>{t('tab_'+role)}</span>;
}
