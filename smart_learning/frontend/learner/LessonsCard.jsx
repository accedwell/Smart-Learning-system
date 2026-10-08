import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ASSESSMENTS_BANK } from '../src/data/seed.js'
import { SectionHead, Icon, AiNote } from '../src/components/ui.jsx'
import { askOneLiner, langNote } from '../src/services/ai.js'

export default function LessonsCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const s = state.learner;
  const assessList = ASSESSMENTS_BANK[state.auth.grade] || [];

  async function completeLesson(lesson){
    update(st=>{
      const l = st.learner.lessons.find(x=>x.id===lesson.id);
      l.progress = 100; l.done = true;
      st.learner.recommendation = t('learner_ai_thinking');
    });
    const text = await askOneLiner(`A learner just completed the lesson "${t(lesson.key)}" on an education platform called Smart Learning. In ONE short sentence (max 25 words), recommend the next best personalised learning activity for them, warmly and specifically.${langNote(lang)}`);
    update(st=>{ st.learner.recommendation = text; });
  }

  function toggleAssessment(lesson, expanded){
    update(st=>{
      st.learner.expandedAssessment = expanded ? null : lesson.id;
      st.learner.lessons.find(x=>x.id===lesson.id).assessmentViewed = true;
    });
  }

  return (
    <div className="card card-learner">
      <SectionHead icon="book" title={t('learner_lessons_title')} aside={t('grade_'+state.auth.grade)+' · '+s.teacherName}/>
      {s.lessons.map((l,i)=>{
        const assessment = assessList[i];
        const expanded = s.expandedAssessment===l.id;
        return (
          <div key={l.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div style={{ flex:1 }}>
                <div>{t(l.key)}</div>
                <div className="bar"><span style={{ width:l.progress+'%', background:l.progress===100?'var(--good)':'var(--learner)' }}/></div>
              </div>
              <button className={'btn'+(l.done?'':' btn-primary')} disabled={l.done || !l.assessmentViewed} onClick={()=>completeLesson(l)}>
                {l.done ? t('learner_completed') : t('learner_mark_complete')}
              </button>
            </div>
            {assessment && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <button className="btn" style={{ fontSize:11.5, padding:'5px 10px' }} onClick={()=>toggleAssessment(l, expanded)}>
                    {expanded ? t('assess_hide_btn') : t('assess_view_btn')}
                  </button>
                  <span className="meta">{t(assessment.titleKey)+' · '+t('assess_due',{ date:assessment.due })}</span>
                </div>
                {expanded && <p className="muted" style={{ margin:'2px 0 0' }}>{t(assessment.descKey)}</p>}
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
