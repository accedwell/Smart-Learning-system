import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, apiRequest, errorText } from '../src/services/api.js'

// The learner rates the teachers of their own classes (from /api/learner/teachers). One
// rating per teacher, saved in the database; rating again replaces it.
export default function RateTeacherCard(){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [teachers, setTeachers] = useState(null); // null while loading
  const [justRated, setJustRated] = useState(null); // id of the teacher rated last
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/learner/teachers', token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err){ setError(errorText(t, err)); setTeachers([]); return; }
      setTeachers(data.teachers);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  async function rate(teacher, rating){
    setError(null);
    const { error: err } = await apiRequest('PUT', `/learner/teachers/${teacher.id}/rating`, { token, body:{ rating } });
    if(err){ setError(errorText(t, err)); return; }
    setTeachers(list=>list.map(tc=>tc.id===teacher.id ? { ...tc, myRating:rating } : tc));
    setJustRated(teacher.id);
  }

  return (
    <div className="card card-learner">
      <SectionHead icon="star" title={t('learner_rate_title')}/>
      {error && <p className="field-error">{error}</p>}
      {teachers===null && <p className="muted">{t('online_loading')}</p>}
      {teachers && teachers.length===0 && !error && <p className="muted">{t('learner_rate_empty')}</p>}
      {teachers && teachers.map(tc=>(
        <div key={tc.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:4 }}>
          <p className="muted" style={{ margin:0 }}>
            {t('learner_rate_sub',{ teacher:tc.name })}
            {tc.subjectKey && <span className="meta">{' · '+t(tc.subjectKey)}</span>}
          </p>
          <div className="stars">
            {[1,2,3,4,5].map(i=>(
              <button key={i} className={i<=(tc.myRating||0)?'on':''} aria-label={i+' / 5'} onClick={()=>rate(tc, i)}><Icon name="star"/></button>
            ))}
          </div>
          {justRated===tc.id && <p className="ai-note">{t('learner_rate_thanks',{ n:tc.myRating })}</p>}
        </div>
      ))}
    </div>
  );
}
