import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ResultRing } from '../src/components/ui.jsx'
import { formatQuizTime, newAttempt, submitAttempt } from './quizState.js'

// one teacher quiz in progress (short typed answers, optional time limit) or its result
export default function QuizTaking({ quiz }){
  const { state, update } = useStore();
  const { t } = useI18n();
  const attempt = state.learner.quizAttempts[quiz.id];
  const [now, setNow] = useState(()=>Date.now());
  const running = attempt && !attempt.submitted && attempt.deadline;

  useEffect(()=>{
    if(!running) return;
    const handle = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(handle);
  }, [running]);

  // time's up: submit automatically (also catches a deadline that passed while away)
  useEffect(()=>{
    if(running && now>=attempt.deadline) update(s=>submitAttempt(s, quiz, true));
  }, [running, now, attempt, quiz, update]);

  const back = <button className="btn" style={{ marginBottom:10 }} onClick={()=>update(s=>{ s.learner.activeQuizId = null; })}>{t('learner_quiz_back_btn')}</button>;
  if(!attempt) return back;

  const total = quiz.questions.length;
  if(attempt.submitted){
    const retake = ()=>{ const fresh = newAttempt(quiz); update(s=>{ s.learner.quizAttempts[quiz.id] = fresh; }); };
    return (
      <div>
        {back}
        {attempt.timedOut && <p className="ai-note">{t('learner_quiz_time_up_note')}</p>}
        <div className="quiz-result">
          <ResultRing score={attempt.score} total={total}/>
          <p className="muted" style={{ margin:'0 0 10px' }}>{t('learner_quiz_result_caption',{ correct:attempt.score, total })}</p>
        </div>
        <button className="btn" style={{ marginTop:6 }} onClick={retake}>{t('learner_quiz_retake_btn')}</button>
      </div>
    );
  }

  const item = quiz.questions[attempt.index];
  const answer = attempt.answers[attempt.index]||'';
  const isLast = attempt.index===total-1;
  return (
    <div>
      {back}
      {attempt.deadline && (
        <div className="quiz-progress" style={{ fontWeight:800 }}>{t('learner_quiz_time_remaining',{ time:formatQuizTime((attempt.deadline-now)/1000) })}</div>
      )}
      <div className="quiz-progress">{t('learner_quiz_progress',{ current:attempt.index+1, total })}</div>
      <div className="quiz-bar"><span style={{ width:(attempt.index/total)*100+'%' }}/></div>
      <p className="quiz-question">{item.text}</p>
      <input type="text" value={answer} placeholder={t('learner_quiz_answer_placeholder')} style={{ marginTop:4 }}
        onChange={(e)=>{ const v = e.target.value; update(s=>{ s.learner.quizAttempts[quiz.id].answers[attempt.index] = v; }); }}/>
      <button className="btn btn-primary" style={{ marginTop:14 }} disabled={!answer.trim()}
        onClick={isLast ? ()=>update(s=>submitAttempt(s, quiz, false)) : ()=>update(s=>{ s.learner.quizAttempts[quiz.id].index++; })}>
        {isLast ? t('learner_quiz_submit_btn') : t('learner_quiz_next_btn')}
      </button>
    </div>
  );
}
