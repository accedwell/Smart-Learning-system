import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon, AiNote } from '../src/components/ui.jsx'
import { apiGet, apiPost, errorText } from '../src/services/api.js'

// The learner's lessons and assessments come from the backend (/api/learner/lessons), so
// completing one is saved, counts towards their progress and is told to their parents.
export default function LessonsCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const token = state.auth.token;
  const s = state.learner;
  const [lessons, setLessons] = useState(null); // null while loading
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/learner/lessons', token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err){ setError(errorText(t, err)); setLessons([]); return; }
      setLessons(data.lessons);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  async function completeLesson(lesson){
    setBusyId(lesson.id);
    setError(null);
    update(st=>{ st.learner.recommendation = t('learner_ai_thinking'); });
    const { data, error: err } = await apiPost(`/learner/lessons/${lesson.id}/complete`, { lang }, token);
    setBusyId(null);
    if(err){ setError(errorText(t, err)); update(st=>{ st.learner.recommendation = null; }); return; }
    setLessons(data.lessons);
    update(st=>{ st.learner.recommendation = data.recommendation; });
  }

  async function toggleAssessment(lesson, expanded){
    update(st=>{ st.learner.expandedAssessment = expanded ? null : lesson.id; });
    if(lesson.assessmentViewed) return;
    const { data, error: err } = await apiPost(`/learner/lessons/${lesson.id}/assessment-viewed`, {}, token);
    if(err) setError(errorText(t, err));
    else setLessons(data.lessons);
  }

  return (
    <div className="card card-learner">
      <SectionHead icon="book" title={t('learner_lessons_title')} aside={t('grade_'+state.auth.grade)}/>
      {error && <p className="field-error">{error}</p>}
      {lessons===null && <p className="muted">{t('online_loading')}</p>}
      {lessons && lessons.map(l=>{
        const assessment = l.assessment;
        const expanded = s.expandedAssessment===l.id;
        return (
          <div key={l.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div style={{ flex:1 }}>
                {l.subjectKey && <div className="meta" style={{ fontWeight:700, color:'var(--learner)' }}>{t(l.subjectKey)}</div>}
                <div>{t(l.key,{ subject:t(l.subjectKey) })}</div>
                <div className="bar"><span style={{ width:l.progress+'%', background:l.progress===100?'var(--good)':'var(--learner)' }}/></div>
              </div>
              <button className={'btn'+(l.done?'':' btn-primary')} disabled={l.done || !l.assessmentViewed || busyId!=null} onClick={()=>completeLesson(l)}>
                {l.done ? t('learner_completed') : t('learner_mark_complete')}
              </button>
            </div>
            {assessment && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <button className="btn" style={{ fontSize:11.5, padding:'5px 10px' }} onClick={()=>toggleAssessment(l, expanded)}>
                    {expanded ? t('assess_hide_btn') : t('assess_view_btn')}
                  </button>
                  <span className="meta">{t(assessment.titleKey,{ subject:t(assessment.subjectKey) })+' · '+t('assess_due',{ date:assessment.due })}</span>
                </div>
                {expanded && <p className="muted" style={{ margin:'2px 0 0' }}>{t(assessment.descKey,{ subject:t(assessment.subjectKey) })}</p>}
                {!l.done && (
                  <p className="muted" style={{ margin:'2px 0 0', fontSize:11 }}>
                    <Icon name={l.assessmentViewed?'check':'lock'}/>{' '+(l.assessmentViewed ? t('assess_viewed_note') : t('assess_gate_note'))}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      {s.recommendation
        ? <AiNote label={t('learner_ai_prefix')}>{s.recommendation}</AiNote>
        : <p className="muted" style={{ marginTop:10 }}>{t('learner_ai_placeholder')}</p>}
    </div>
  );
}
