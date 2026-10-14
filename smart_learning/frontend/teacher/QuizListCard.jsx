import { useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { scoreClass } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead } from '../src/components/ui.jsx'
import { apiGet, apiRequest, errorText } from '../src/services/api.js'

// The tests this teacher has set (from the backend), each with every learner's marks: the
// first try (which counts towards being at risk), the latest and how many tries.
export default function QuizListCard({ classes, quizzes, onDeleted }){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [showing, setShowing] = useState(null); // quiz id
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const classNames = (ids)=>classes.filter(c=>ids.includes(c.id)).map(c=>c.name).join(', ');

  async function toggleResults(quiz){
    if(showing===quiz.id){ setShowing(null); return; }
    setShowing(quiz.id);
    setResults(null);
    const { data, error: err } = await apiGet(`/teacher/quizzes/${quiz.id}/results`, token);
    if(err) return setError(errorText(t, err));
    setResults(data.results);
  }

  async function remove(quiz){
    if(!window.confirm(t('teacher_quiz_delete_confirm'))) return;
    const { error: err } = await apiRequest('DELETE', `/teacher/quizzes/${quiz.id}`, { token });
    if(err) return setError(errorText(t, err));
    if(showing===quiz.id) setShowing(null);
    onDeleted(quiz.id);
  }

  return (
    <div className="card card-teacher" style={{ marginTop:14 }}>
      <SectionHead icon="clipboard" title={t('teacher_quiz_list_title')}/>
      {error && <p className="field-error">{error}</p>}
      {quizzes===null && <p className="muted">{t('online_loading')}</p>}
      {quizzes && quizzes.length===0 && <p className="muted">{t('teacher_quiz_list_empty')}</p>}
      {quizzes && quizzes.map(quiz=>{
        const open = showing===quiz.id;
        return (
          <div key={quiz.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div>
                <b>{quiz.title}</b>
                <div className="meta">
                  {t('teacher_quiz_list_classes_meta',{ classes:classNames(quiz.classIds), subject:t(quiz.subjectKey), n:quiz.questions.length })
                    + (quiz.timeLimitMin ? ' · '+t('teacher_quiz_time_limit_pill',{ n:quiz.timeLimitMin }) : '')
                    + ' · '+t('teacher_quiz_taken_by',{ n:quiz.resultCount||0 })}
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className={'btn'+(open?' btn-primary':'')} style={{ fontSize:11, padding:'5px 10px' }} onClick={()=>toggleResults(quiz)}>
                  {open ? t('teacher_quiz_results_hide_btn') : t('teacher_quiz_results_show_btn')}
                </button>
                <button className="btn" style={{ fontSize:11, padding:'5px 10px' }} onClick={()=>remove(quiz)}>
                  {t('teacher_quiz_delete_btn')}
                </button>
              </div>
            </div>
            {open && (
              <div style={{ marginTop:2, padding:'8px 10px', background:'var(--chip-bg)', borderRadius:8 }}>
                {results===null && <p className="muted" style={{ margin:0 }}>{t('online_loading')}</p>}
                {results && results.length===0 && <p className="muted" style={{ margin:0 }}>{t('teacher_quiz_results_empty')}</p>}
                {results && results.map(r=>(
                  <div key={r.learnerId} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'4px 0' }}>
                    <span>
                      {r.learner}
                      {r.attempts>1 && <span className="meta">{' · '+t('teacher_quiz_latest_meta',{ score:r.score, total:r.total, n:r.attempts })}</span>}
                    </span>
                    <span className={'pill pill-'+scoreClass(r.first.score/r.first.total)} title={t('teacher_quiz_first_try_title')}>
                      {t('teacher_quiz_first_try_pill',{ score:r.first.score, total:r.first.total })}
                    </span>
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
