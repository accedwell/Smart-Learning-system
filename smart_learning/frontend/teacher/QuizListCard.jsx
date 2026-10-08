import { useStore } from '../src/store/AppStore.jsx'
import { scoreClass } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead } from '../src/components/ui.jsx'

// quizzes this teacher has published, with each learner's mark
export default function QuizListCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.teacher;

  return (
    <div className="card card-teacher" style={{ marginTop:14 }}>
      <SectionHead icon="clipboard" title={t('teacher_quiz_list_title')}/>
      {s.quizzes.length===0 && <p className="muted">{t('teacher_quiz_list_empty')}</p>}
      {s.quizzes.map(quiz=>{
        const showing = s.showResultsFor===quiz.id;
        const results = s.quizResults[quiz.id] || [];
        return (
          <div key={quiz.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div>
                <b>{quiz.title}</b>
                <div className="meta">
                  {t('teacher_quiz_list_item_meta',{ grade:t('grade_'+quiz.grade), subject:t(quiz.subjectKey), n:quiz.questions.length })
                    + (quiz.timeLimitMin ? ' · '+t('teacher_quiz_time_limit_pill',{ n:quiz.timeLimitMin }) : '')}
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className={'btn'+(showing?' btn-primary':'')} style={{ fontSize:11, padding:'5px 10px' }}
                  onClick={()=>update(st=>{ st.teacher.showResultsFor = showing ? null : quiz.id; })}>
                  {showing ? t('teacher_quiz_results_hide_btn') : t('teacher_quiz_results_show_btn')}
                </button>
                <button className="btn" style={{ fontSize:11, padding:'5px 10px' }}
                  onClick={()=>update(st=>{ st.teacher.quizzes = st.teacher.quizzes.filter(q=>q.id!==quiz.id); })}>
                  {t('teacher_quiz_delete_btn')}
                </button>
              </div>
            </div>
            {showing && (
              <div style={{ marginTop:2, padding:'8px 10px', background:'var(--tint,#f6f6f8)', borderRadius:8 }}>
                {results.length===0 && <p className="muted" style={{ margin:0 }}>{t('teacher_quiz_results_empty')}</p>}
                {results.map(r=>(
                  <div key={r.learner} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0' }}>
                    <span>{r.learner}</span>
                    <span className={'pill pill-'+scoreClass(r.score/r.total)}>{t('teacher_quiz_results_row',{ score:r.score, total:r.total })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
