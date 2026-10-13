import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, AiNote } from '../src/components/ui.jsx'
import { askOneLiner, langNote } from '../src/services/ai.js'
import { classesOfTeacher, classLabel } from '../src/services/classes.js'
import { shortName } from '../learner/quizState.js'

const PILL_LABEL = { on_track:'status_on_track', at_risk:'status_at_risk', watch:'status_watch' };
const PILL_CLASS = { on_track:'pill-good', at_risk:'pill-bad', watch:'pill-warn' };

// the teacher's own classes, each with its learners, plus any feedback the principal has
// sent this teacher. Learners in other teachers' classes never show here.
export default function ClassCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const s = state.teacher;
  const myClasses = classesOfTeacher(state, state.auth.userId);
  const filter = myClasses.some(c=>c.id===s.classFilter) ? s.classFilter : 'all';
  const shown = filter==='all' ? myClasses : myClasses.filter(c=>c.id===filter);
  const setFilter = (f)=>update(st=>{ st.teacher.classFilter = f; });
  const learnerById = (id)=>state.admin.users.find(u=>u.id===id && u.role==='learner');
  const noteOf = (l)=>l.noteText || (l.noteKey ? t(l.noteKey) : t('teacher_learner_no_data'));

  async function suggestIntervention(learner){
    update(st=>{ st.teacher.suggestion[learner.id] = t('chat_thinking'); });
    const text = await askOneLiner(`Learner ${shortName(learner.name)} is flagged "${learner.status.replace('_',' ')}" on a school platform. Context: ${noteOf(learner)}. In ONE short, practical sentence (max 25 words), suggest a concrete classroom intervention a teacher could assign today.${langNote(lang)}`);
    update(st=>{
      if(text) st.teacher.suggestion[learner.id] = text;
      else delete st.teacher.suggestion[learner.id];
    });
  }

  // the principal's feedback to this teacher
  const me = state.principal.teachers.find(tc=>tc.name===state.auth.name);

  return (
    <>
      <div className="card card-teacher">
        <SectionHead icon="cap" title={t('teacher_dashboard_title')} aside={t('teacher_classes_count',{ n:myClasses.length })}/>
        {myClasses.length===0 && <p className="muted">{t('teacher_no_classes')}</p>}
        {myClasses.length>1 && (
          <div className="subject-filter">
            <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('teacher_classes_filter_all')}</button>
            {myClasses.map(c=><button key={c.id} className={filter===c.id?'active':''} onClick={()=>setFilter(c.id)}>{classLabel(c, t)}</button>)}
          </div>
        )}
        {shown.map(c=>{
          const learners = c.learnerIds.map(learnerById).filter(Boolean);
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
                    <div><b>{shortName(l.name)}</b><div className="meta">{noteOf(l)}</div></div>
                    {l.status && <span className={'pill '+PILL_CLASS[l.status]}>{t(PILL_LABEL[l.status])}</span>}
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
      {me && me.feedbackSent && me.feedback.trim() && (
        <div className="card card-teacher" style={{ marginTop:14 }}>
          <SectionHead icon="inbox" title={t('teacher_principal_feedback_title')}/>
          <p>{me.feedback}</p>
        </div>
      )}
    </>
  );
}
