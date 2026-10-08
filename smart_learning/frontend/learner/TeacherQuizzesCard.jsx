import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead } from '../src/components/ui.jsx'
import { isCheckinQuizActive, newAttempt } from './quizState.js'
import QuizTaking from './QuizTaking.jsx'

// quizzes the teacher set (from the teacher's quiz builder) for this learner's grade
export default function TeacherQuizzesCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.learner;
  const allMyQuizzes = state.teacher.quizzes.filter(q=>q.grade===state.auth.grade);
  const activeQuiz = s.activeQuizId!=null ? allMyQuizzes.find(q=>q.id===s.activeQuizId) : null;

  let body;
  if(activeQuiz){
    body = <QuizTaking quiz={activeQuiz}/>;
  } else if(allMyQuizzes.length===0){
    body = <p className="muted">{t('learner_quizzes_empty')}</p>;
  } else {
    // one chip per subject that has a quiz at this grade
    const subjectsPresent = [...new Set(allMyQuizzes.map(q=>q.subjectKey))];
    const filter = subjectsPresent.includes(s.quizSubjectFilter) ? s.quizSubjectFilter : 'all';
    const setFilter = (f)=>update(st=>{ st.learner.quizSubjectFilter = f; });
    const myQuizzes = filter==='all' ? allMyQuizzes : allMyQuizzes.filter(q=>q.subjectKey===filter);
    // while the check-in quiz is in progress, Take/Retake are disabled
    const checkinActive = isCheckinQuizActive(s);
    const take = (quiz)=>{
      if(checkinActive) return;
      const fresh = newAttempt(quiz);
      update(st=>{
        st.learner.activeQuizId = quiz.id;
        if(!st.learner.quizAttempts[quiz.id]) st.learner.quizAttempts[quiz.id] = fresh;
      });
    };
    body = (
      <>
        {subjectsPresent.length>1 && (
          <div className="subject-filter">
            <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('learner_quiz_filter_all')}</button>
            {subjectsPresent.map(sk=><button key={sk} className={filter===sk?'active':''} onClick={()=>setFilter(sk)}>{t(sk)}</button>)}
          </div>
        )}
        {checkinActive && <p className="muted" style={{ marginBottom:4 }}>{t('learner_quiz_locked_note')}</p>}
        {myQuizzes.map(quiz=>{
          const attempt = s.quizAttempts[quiz.id];
          const done = attempt && attempt.submitted;
          return (
            <div key={quiz.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
              <div className="row" style={{ border:'none', padding:0 }}>
                <div>
                  <b>{quiz.title}</b>
                  <div className="meta">{t('teacher_quiz_list_item_meta',{ grade:t('grade_'+quiz.grade), subject:t(quiz.subjectKey), n:quiz.questions.length })}</div>
                </div>
                {done && <span className="pill pill-good">{t('learner_quiz_score_pill',{ correct:attempt.score, total:quiz.questions.length })}</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-primary" disabled={checkinActive} onClick={()=>take(quiz)}>
                  {done ? t('learner_quiz_retake_btn') : t('learner_quiz_take_btn')}
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
      {body}
    </div>
  );
}
