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
  const [showDone, setShowDone] = useState(false); // finished lessons are folded away

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

  const list = lessons || [];
  const done = list.filter(l=>l.done);
  const open = list.filter(l=>!l.done);
  const pct = list.length ? Math.round(list.reduce((a,l)=>a+l.progress, 0)/list.length) : 0;
  const firstName = (state.auth.name||'').trim().split(/\s+/)[0];
  const needsViewing = open.some(l=>l.assessment && !l.assessmentViewed);

  const lessonRow = (l)=>{
    const assessment = l.assessment;
    const subject = l.subjectKey ? t(l.subjectKey) : '';
    const expanded = s.expandedAssessment===l.id;
    return (
      <div key={l.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
        <div className="row" style={{ border:'none', padding:0 }}>
          <div style={{ flex:1 }}>
            {subject && <div className="lesson-subject">{subject}</div>}
            <div>{t(l.key,{ subject })}</div>
            <div className="bar"><span style={{ width:l.progress+'%', background:l.progress===100?'var(--good)':'var(--brand)' }}/></div>
          </div>
          {l.done
            ? <span className="pill pill-good">{t('learner_completed')}</span>
            : <button className="btn btn-primary" disabled={!l.assessmentViewed || busyId!=null} title={l.assessmentViewed ? undefined : t('assess_gate_note')}
                onClick={()=>completeLesson(l)}>{t('learner_mark_complete')}</button>}
        </div>
        {assessment && (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <button className="btn" style={{ fontSize:11.5, padding:'5px 10px' }} onClick={()=>toggleAssessment(l, expanded)}>
                {expanded ? t('assess_hide_btn') : t('assess_view_btn')}
              </button>
              <span className="meta">{t(assessment.titleKey,{ subject })+' · '+t('assess_due',{ date:assessment.due })}</span>
              {!l.done && l.assessmentViewed && <span className="meta"><Icon name="check"/></span>}
            </div>
            {expanded && <p className="muted" style={{ margin:'2px 0 0' }}>{t(assessment.descKey,{ subject })}</p>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="card card-learner">
      {/* how far the learner is this term, like the phone app's banner */}
      <div className="progress-hero">
        <p className="hello">{t('m_hello',{ name:firstName })}</p>
        <div className="caption">{t('m_my_progress')}</div>
        <div className="pct">{pct}%</div>
        <div className="bar"><span style={{ width:pct+'%' }}/></div>
        <div className="caption" style={{ marginTop:6 }}>{t('m_lessons_done',{ done:done.length, total:list.length })}</div>
      </div>

      <SectionHead icon="book" title={t('learner_lessons_title')} aside={t('grade_'+state.auth.grade)}/>
      {error && <p className="field-error">{error}</p>}
      {lessons===null && <p className="muted">{t('online_loading')}</p>}
      {/* said once, not under every lesson */}
      {needsViewing && <p className="muted" style={{ margin:'0 0 6px', fontSize:12 }}><Icon name="lock"/>{' '+t('assess_gate_note')}</p>}
      {open.map(lessonRow)}
      {done.length>0 && (
        <>
          <button className="btn fold-toggle" onClick={()=>setShowDone(v=>!v)}>
            {showDone ? t('learner_hide_completed') : t('learner_show_completed',{ n:done.length })}
          </button>
          {showDone && done.map(lessonRow)}
        </>
      )}
      {s.recommendation
        ? <AiNote label={t('learner_ai_prefix')}>{s.recommendation}</AiNote>
        : <p className="muted" style={{ marginTop:10 }}>{t('learner_ai_placeholder')}</p>}
    </div>
  );
}
