import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, AiNote } from '../src/components/ui.jsx'
import { apiGet, apiPost, errorText } from '../src/services/api.js'
import { classLabel } from '../src/services/classes.js'

const PILL_LABEL = { on_track:'status_on_track', at_risk:'status_at_risk', watch:'status_watch' };
const PILL_CLASS = { on_track:'pill-good', at_risk:'pill-bad', watch:'pill-warn' };
const STATUS_ORDER = { at_risk:0, watch:1, on_track:2 };

// The teacher's own classes from the backend, each with its learners and whether they are at
// risk. The status comes from the learner's first try at this teacher's tests (or the check-in
// quiz until they have taken one); each learner's line says what it rests on. Learners in other
// teachers' classes never show here. Below: feedback the principal sent this teacher.
export default function ClassCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const s = state.teacher;
  const token = state.auth.token;
  const [data, setData] = useState(null); // { classes, learners } once loaded
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/teacher/class', token), apiGet('/teacher/feedback', token)]).then(([cr, fr])=>{
      if(cancelled) return;
      if(cr.error){ setError(errorText(t, cr.error)); setData({ classes:[], learners:[] }); return; }
      setData(cr.data);
      if(fr.data) setFeedback(fr.data.feedback);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  const myClasses = data ? data.classes : [];
  const filter = myClasses.some(c=>c.id===s.classFilter) ? s.classFilter : 'all';
  const shown = filter==='all' ? myClasses : myClasses.filter(c=>c.id===filter);
  const setFilter = (f)=>update(st=>{ st.teacher.classFilter = f; });
  const learnerById = (id)=>data.learners.find(l=>l.id===id);

  // what the status rests on, in words
  function basisText(l){
    if(l.statusBasis==='tests') return t('teacher_basis_tests',{ pct:l.quizAverage, taken:l.quizAttempts, set:l.testsSet });
    if(l.statusBasis==='checkin') return t('teacher_basis_checkin',{ score:l.checkin.score, total:l.checkin.total });
    return l.testsSet>0 ? t('teacher_basis_none_set',{ n:l.testsSet }) : t('teacher_learner_no_data');
  }

  async function suggestIntervention(learner){
    update(st=>{ st.teacher.suggestion[learner.id] = t('chat_thinking'); });
    const { data: res, error: err } = await apiPost(`/teacher/class/${learner.id}/suggestion`, { lang }, token);
    update(st=>{
      if(res && res.suggestion) st.teacher.suggestion[learner.id] = res.suggestion;
      else st.teacher.suggestion[learner.id] = errorText(t, err || { code:'ai_unavailable' });
    });
  }

  return (
    <>
      <div className="card card-teacher">
        <SectionHead icon="cap" title={t('teacher_dashboard_title')} aside={data ? t('teacher_classes_count',{ n:myClasses.length }) : null}/>
        {error && <p className="field-error">{error}</p>}
        {!data && <p className="muted">{t('online_loading')}</p>}
        {data && myClasses.length===0 && !error && <p className="muted">{t('teacher_no_classes')}</p>}
        {data && myClasses.length>0 && <p className="muted" style={{ fontSize:11.5, marginTop:-4 }}>{t('teacher_status_hint')}</p>}
        {myClasses.length>1 && (
          <div className="subject-filter">
            <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('teacher_classes_filter_all')}</button>
            {myClasses.map(c=><button key={c.id} className={filter===c.id?'active':''} onClick={()=>setFilter(c.id)}>{classLabel(c, t)}</button>)}
          </div>
        )}
        {shown.map(c=>{
          // learners most in need of help first
          const learners = c.learnerIds.map(learnerById).filter(Boolean)
            .sort((a,b)=>(STATUS_ORDER[a.status] ?? 3)-(STATUS_ORDER[b.status] ?? 3));
          return (
            <div key={c.id} className="class-block">
              <div className="class-block-head">
                <b>{classLabel(c, t)}</b>
                <span className="meta">{t('teacher_class_meta',{ grade:t('grade_'+c.grade), n:learners.length })}</span>
              </div>
              {learners.length===0 && <p className="muted" style={{ margin:'6px 0' }}>{t('teacher_class_empty')}</p>}
              {learners.map(l=>(
                <div key={l.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
                  <div className="row" style={{ border:'none', padding:0 }}>
                    <div><b>{l.shortName}</b><div className="meta">{basisText(l)}</div></div>
                    {l.status
                      ? <span className={'pill '+PILL_CLASS[l.status]}>{t(PILL_LABEL[l.status])}</span>
                      : <span className="pill">{t('teacher_status_none')}</span>}
                  </div>
                  {l.status && l.status!=='on_track' && (
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <button className="btn btn-primary" onClick={()=>suggestIntervention(l)}>{t('teacher_suggest_btn')}</button>
                    </div>
                  )}
                  {s.suggestion[l.id] && <AiNote label={t('teacher_ai_prefix')}>{s.suggestion[l.id]}</AiNote>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {feedback.length>0 && (
        <div className="card card-teacher" style={{ marginTop:14 }}>
          <SectionHead icon="inbox" title={t('teacher_principal_feedback_title')}/>
          {feedback.map(f=>(
            <div key={f.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:2 }}>
              <p style={{ margin:0 }}>{f.message}</p>
              {f.from && <span className="meta">{f.from}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
