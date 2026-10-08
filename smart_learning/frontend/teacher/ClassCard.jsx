import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, AiNote } from '../src/components/ui.jsx'
import { askOneLiner, langNote } from '../src/services/ai.js'

const PILL_LABEL = { on_track:'status_on_track', at_risk:'status_at_risk', watch:'status_watch' };
const PILL_CLASS = { on_track:'pill-good', at_risk:'pill-bad', watch:'pill-warn' };

// the class list plus any feedback the principal has sent this teacher
export default function ClassCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const s = state.teacher;

  async function suggestIntervention(learner){
    update(st=>{ st.teacher.suggestion[learner.id] = t('chat_thinking'); });
    const text = await askOneLiner(`Learner ${learner.name} is flagged "${learner.status.replace('_',' ')}" on a school platform. Context: ${learner.noteText || t(learner.noteKey)}. In ONE short, practical sentence (max 25 words), suggest a concrete classroom intervention a teacher could assign today.${langNote(lang)}`);
    update(st=>{
      if(text) st.teacher.suggestion[learner.id] = text;
      else delete st.teacher.suggestion[learner.id];
    });
  }

  // Mrs. Dlamini is the shared demo persona for the logged-in teacher across roles
  const me = state.principal.teachers.find(tc=>tc.name==='Mrs. Dlamini');

  return (
    <>
      <div className="card card-teacher">
        <SectionHead icon="cap" title={t('teacher_dashboard_title')} aside={t('teacher_dashboard_sub')}/>
        {s.learners.map(l=>(
          <div key={l.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div><b>{l.name}</b><div className="meta">{l.noteText || t(l.noteKey)}</div></div>
              <span className={'pill '+PILL_CLASS[l.status]}>{t(PILL_LABEL[l.status])}</span>
            </div>
            {l.status!=='on_track' && (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button className="btn btn-primary" onClick={()=>suggestIntervention(l)}>{t('teacher_suggest_btn')}</button>
              </div>
            )}
            {s.suggestion[l.id] && <AiNote label={t('teacher_ai_prefix')}>{s.suggestion[l.id]}</AiNote>}
          </div>
        ))}
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
