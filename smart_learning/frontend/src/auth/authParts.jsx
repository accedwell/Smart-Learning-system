// Pieces shared by the log-in, sign-up and forgot-password screens.
import { useI18n } from '../i18n/I18nContext.jsx'
import { DEPARTMENTS, ROLES } from '../data/seed.js'
import { LanguageSelect } from '../components/ui.jsx'

export function AuthLangBar(){
  const { lang, setLanguage, translating } = useI18n();
  return (
    <div className="login-lang">
      <LanguageSelect value={lang} onChange={setLanguage}/>
      {translating && <div className="spin" style={{ borderColor:'var(--border)', borderTopColor:'var(--brand)' }}/>}
    </div>
  );
}

export function RoleSelect({ id, value, onChange, roles=ROLES }){
  const { t } = useI18n();
  return (
    <select id={id} value={value} onChange={(e)=>onChange(e.target.value)}>
      {roles.map(r=><option key={r} value={r}>{t('tab_'+r)}</option>)}
    </select>
  );
}

export function DeptSelect({ id, value, onChange }){
  const { t } = useI18n();
  return (
    <select id={id} value={value} onChange={(e)=>onChange(e.target.value)}>
      {DEPARTMENTS.map(d=><option key={d.id} value={d.id}>{t(d.labelKey)}</option>)}
    </select>
  );
}

export function LinkButton({ onClick, className, children }){
  return <a href="#" className={className} onClick={(e)=>{ e.preventDefault(); onClick(); }}>{children}</a>;
}
