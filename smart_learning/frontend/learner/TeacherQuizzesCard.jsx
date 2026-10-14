import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead } from '../src/components/ui.jsx'
import { scoreClass } from '../src/store/metrics.js'
import { apiGet, errorText } from '../src/services/api.js'
import { isCheckinQuizActive } from './quizState.js'
import QuizTaking from './QuizTaking.jsx'

// The tests this learner's teachers set for the learner's classes (from the backend). The
// first try at each counts towards the learner's status; after that they can practise with
// it as often as they like.
export default function TeacherQuizzesCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.learner;
  const token = state.auth.token;
  const [quizzes, setQuizzes] = useState(null); // null while loading
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/learner/quizzes', token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err){ setError(errorText(t, err)); setQuizzes([]); return; }
      setQuizzes(data.quizzes);
    });
    return ()=>{ cancelled = true; };
  }, [token, t, reload]);

  const activeQuiz = s.activeQuizId!=null && quizzes ? quizzes.find(q=>q.id===s.activeQuizId) : null;
  const close = ()=>{
    update(st=>{ st.learner.activeQuizId = null; st.learner.activeQuizRunning = false; });
    setReload(n=>n+1);
  };

  let body;
  if(activeQuiz){
    body = <QuizTaking quiz={activeQuiz} onBack={close}/>;
  } else if(quizzes===null){
    body = <p className="muted">{t('online_loading')}</p>;
  } else if(quizzes.length===0){
    body = error ? null : <p className="muted">{t('learner_quizzes_empty')}</p>;
  } else {
    // one chip per subject that has a test
    const subjectsPresent = [...new Set(quizzes.map(q=>q.subjectKey))];
    const filter = subjectsPresent.includes(s.quizSubjectFilter) ? s.quizSubjectFilter : 'all';
    const setFilter = (f)=>update(st=>{ st.learner.quizSubjectFilter = f; });
    const shown = filter==='all' ? quizzes : quizzes.filter(q=>q.subjectKey===filter);
    // while the check-in quiz is in progress, the tests are locked
    const checkinActive = isCheckinQuizActive(s);
    const take = (quiz)=>{
      if(checkinActive) return;
      update(st=>{ st.learner.activeQuizId = quiz.id; });
    };
    body = (
      <>
        <p className="muted" style={{ marginTop:-4 }}>{t('learner_quiz_practice_note')}</p>
        {subjectsPresent.length>1 && (
          <div className="subject-filter">
            <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('learner_quiz_filter_all')}</button>
            {subjectsPresent.map(sk=><button key={sk} className={filter===sk?'active':''} onClick={()=>setFilter(sk)}>{t(sk)}</button>)}
          </div>
        )}
        {checkinActive && <p className="muted" style={{ marginBottom:4 }}>{t('learner_quiz_locked_note')}</p>}
        {shown.map(quiz=>{
          const attempt = quiz.attempt;
          const inProgress = attempt && !attempt.submitted;
          return (
            <div key={quiz.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
              <div className="row" style={{ border:'none', padding:0, alignItems:'flex-start' }}>
                <div>
                  <b>{quiz.title}</b>
                  <div className="meta">
                    {t('teacher_quiz_list_item_meta',{ grade:t('grade_'+quiz.grade), subject:t(quiz.subjectKey), n:quiz.questionCount })
                      + (quiz.teacherName ? ' · '+quiz.teacherName : '')
                      + (quiz.timeLimitMin ? ' · '+t('teacher_quiz_time_limit_pill',{ n:quiz.timeLimitMin }) : '')}
                  </div>
                  {quiz.tries>1 && attempt && attempt.submitted && (
                    <div className="meta">{t('learner_quiz_latest_meta',{ score:attempt.score, total:attempt.total, n:quiz.tries })}</div>
                  )}
                </div>
                {quiz.firstTry && (
                  <span className={'pill pill-'+scoreClass(quiz.firstTry.score/quiz.firstTry.total)}>
                    {t('learner_quiz_first_try_pill',{ score:quiz.firstTry.score, total:quiz.firstTry.total })}
                  </span>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-primary" disabled={checkinActive} onClick={()=>take(quiz)}>
                  {inProgress ? t('learner_quiz_continue_btn') : quiz.firstTry ? t('learner_quiz_practise_btn') : t('learner_quiz_take_btn')}
                </button>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="card card-learner" style={{ marginTop:14 }}>
      <SectionHead icon="edit" title={t('learner_quizzes_title')}/>
      {error && <p className="field-error">{error}</p>}
      {body}
    </div>
  );
}
