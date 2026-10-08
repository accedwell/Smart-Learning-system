// Small presentational building blocks shared by every role's dashboard.
import { GRADES, LANGUAGES, SUBJECT_GROUPS } from '../data/seed.js'
import { useI18n } from '../i18n/I18nContext.jsx'

// clean-line icon from the sprite in index.html
export function Icon({ name }){
  return (
    <span className="icon-inline">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <use href={'#icon-'+name}/>
      </svg>
    </span>
  );
}

export function HeroIllustration({ className='hero-illustration', label }){
  return (
    <svg className={className} viewBox="0 0 520 280" role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:'true'}>
      <use href="#proactHero"/>
    </svg>
  );
}

export function BrandMark({ size=32 }){
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex:'none' }}>
      <rect width="32" height="32" rx="9" fill="rgba(255,255,255,.16)"/>
      <path d="M7,14 L16,9 L25,14 L16,19 Z" fill="#fff"/>
      <path d="M16,19 L16,23" stroke="#fff" strokeWidth="1.6"/>
      <path d="M10,16 v4 q6,4 12,0 v-4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// card header: icon badge + title, with an optional muted caption and extra controls
export function SectionHead({ icon, title, titleExtra, aside, children }){
  return (
    <div className="section-head">
      <h2><span className="icon-badge"><Icon name={icon}/></span>{title}{titleExtra}</h2>
      {aside!=null && <span className="muted">{aside}</span>}
      {children}
    </div>
  );
}

// sidebar (desktop) / pill bar (mobile) that switches a role's sections
export function SectionNav({ tabs, active, onSelect }){
  const { t } = useI18n();
  return (
    <div className="section-nav">
      {tabs.map(tb=>(
        <button key={tb.id} className={active===tb.id?'active':''} onClick={()=>onSelect(tb.id)}>
          <span className="nav-icon"><Icon name={tb.icon}/></span><span>{t(tb.labelKey)}</span>
          {tb.count!=null && <span className="count">{String(tb.count)}</span>}
        </button>
      ))}
    </div>
  );
}

export function AiNote({ label, children, style }){
  return (
    <div className="ai-note" style={style}>
      {label && <b><Icon name="bot"/> {label}</b>}
      {children}
    </div>
  );
}

// big score ring shown after a quiz
export function ResultRing({ score, total }){
  const pct = score/total;
  const color = pct>=0.8 ? 'var(--good)' : (pct>=0.5 ? 'var(--warn)' : 'var(--bad)');
  return (
    <div className="ring" style={{ background:`color-mix(in srgb, ${color} 18%, transparent)`, border:`3px solid ${color}`, color }}>
      <span className="num">{score+'/'+total}</span>
    </div>
  );
}

export function GradeSelect({ value, onChange, id }){
  const { t } = useI18n();
  return (
    <select id={id} value={value} onChange={(e)=>onChange(e.target.value)}>
      {GRADES.map(g=><option key={g} value={g}>{t('grade_'+g)}</option>)}
    </select>
  );
}

// every Grade 10–12 subject, grouped by learning area
export function SubjectSelect({ value, onChange, id }){
  const { t } = useI18n();
  return (
    <select id={id} value={value} onChange={(e)=>onChange(e.target.value)}>
      {SUBJECT_GROUPS.map(g=>(
        <optgroup key={g.labelKey} label={t(g.labelKey)}>
          {g.subjects.map(k=><option key={k} value={k}>{t(k)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function LanguageSelect({ value, onChange, id, includeSystem, style }){
  const { t } = useI18n();
  const known = value==='__system' || LANGUAGES.some(l=>l.value===value);
  return (
    <select id={id} value={known ? value : 'English'} onChange={(e)=>onChange(e.target.value)} style={style}>
      {includeSystem && <option value="__system">{t('chat_lang_system')}</option>}
      {LANGUAGES.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}
    </select>
  );
}
