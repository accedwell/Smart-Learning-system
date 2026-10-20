import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SUBJECT_GROUPS } from '../src/data/seed.js'

export const SUBJECT_COUNT = 7;

// A learner's 7 subjects, as tick-boxes grouped like the catalog (Languages, Mathematics, ...).
// The server checks the rules (two languages, one mathematics, Life Orientation, 7 in all).
export default function SubjectPicker({ value, onChange }){
  const { t } = useI18n();
  const toggle = (s)=>onChange(value.includes(s) ? value.filter(x=>x!==s) : [...value, s]);
  const full = value.length>=SUBJECT_COUNT;
  return (
    <div className="field" style={{ gridColumn:'1 / -1' }}>
      <label style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
        <span>{t('admin_subjects_label')}</span>
        <span className={'pill pill-'+(value.length===SUBJECT_COUNT ? 'good' : 'warn')}>{t('admin_subjects_count',{ n:value.length })}</span>
      </label>
      <p className="muted" style={{ margin:'0 0 8px', fontSize:11.5 }}>{t('admin_subjects_hint')}</p>
      <div style={{ display:'grid', gap:8, maxHeight:260, overflowY:'auto', border:'1px solid var(--border)', borderRadius:10, padding:10 }}>
        {SUBJECT_GROUPS.map(g=>(
          <div key={g.id}>
            <div className="meta" style={{ fontWeight:700, marginBottom:4 }}>{t(g.labelKey)}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 14px' }}>
              {g.subjects.map(s=>{
                const on = value.includes(s);
                return (
                  <label key={s} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, cursor:on || !full ? 'pointer' : 'default', opacity:on || !full ? 1 : .5 }}>
                    <input type="checkbox" checked={on} disabled={!on && full} onChange={()=>toggle(s)}/>{t(s)}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
