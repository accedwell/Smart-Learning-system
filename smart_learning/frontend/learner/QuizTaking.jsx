import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ResultRing } from '../src/components/ui.jsx'
import { apiPost, errorText } from '../src/services/api.js'
import { formatQuizTime } from './quizState.js'

// Starts the attempt (or resumes one in progress). A test the learner already handed in comes
// back submitted when they only open it, so a practice try is started instead.
async function beginAttempt(quizId, token, retake){
  const first = await apiPost(`/learner/quizzes/${quizId}/start`, { retake }, token);
  if(first.data && first.data.attempt.submitted && !retake) return apiPost(`/learner/quizzes/${quizId}/start`, { retake:true }, token);
  return first;
}

// One teacher test in progress (short typed answers, optional time limit) or its result.
// The backend starts the attempt (or resumes one in progress), keeps the deadline and marks
// it; after a submission the learner sees the right answers and can practise again.
export default function QuizTaking({ quiz, onBack }){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [questions, setQuestions] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null); // { attempt, review, firstTry } after submitting
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(()=>Date.now());
  const submitting = useRef(false);
  // the answers again, for submit(): the countdown's timer must always send the latest ones
  const answersRef = useRef([]);
  const setAllAnswers = (next)=>{ answersRef.current = next; setAnswers(next); };

  // shows the attempt beginAttempt() answered with
  const applyStart = useCallback(({ data, error: err })=>{
    setBusy(false);
    if(err){ setError(errorText(t, err)); return; }
    submitting.current = false;
    setResult(null);
    setQuestions(data.quiz.questions);
    setAttempt(data.attempt);
    setIndex(0);
    answersRef.current = [];
    setAnswers([]);
    update(st=>{ st.learner.activeQuizRunning = true; });
  }, [t, update]);

  useEffect(()=>{
    let cancelled = false;
    beginAttempt(quiz.id, token, false).then(r=>{ if(!cancelled) applyStart(r); });
    return ()=>{ cancelled = true; };
  }, [quiz.id, token, applyStart]);

  async function practiseAgain(){
    setError(null);
    setBusy(true);
    applyStart(await beginAttempt(quiz.id, token, true));
  }

  const submit = useCallback(async ()=>{
    if(submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const { data, error: err } = await apiPost(`/learner/quizzes/${quiz.id}/submit`, { answers:answersRef.current }, token);
    setBusy(false);
    if(err){
      submitting.current = false;
      setError(errorText(t, err));
      return;
    }
    setResult(data);
    update(st=>{ st.learner.activeQuizRunning = false; });
  }, [quiz.id, token, t, update]);

  const deadline = attempt && attempt.deadline ? new Date(attempt.deadline).getTime() : null;
  const running = deadline!=null && !result;

  // the countdown; when time is up, what there is gets submitted (also catches a deadline
  // that passed while the learner was away)
  useEffect(()=>{
    if(!running) return;
    const handle = setInterval(()=>{
      const n = Date.now();
      setNow(n);
      if(n>=deadline) submit();
    }, 1000);
    return ()=>clearInterval(handle);
  }, [running, deadline, submit]);

  const back = <button className="btn" style={{ marginBottom:10 }} onClick={onBack}>{t('learner_quiz_back_btn')}</button>;

  if(result){
    const { score, total, timedOut } = result.attempt;
    return (
      <div>
        {back}
        {timedOut && <p className="ai-note">{t('learner_quiz_time_up_note')}</p>}
        <div className="quiz-result">
          <ResultRing score={score} total={total}/>
          <p className="muted" style={{ margin:'0 0 6px' }}>{t('learner_quiz_result_caption',{ correct:score, total })}</p>
          <p className="muted" style={{ margin:'0 0 10px', fontSize:12 }}>{t(result.firstTry ? 'learner_quiz_first_try_note' : 'learner_quiz_practice_try_note')}</p>
        </div>
        <div style={{ marginTop:6 }}>
          {result.review.map((r, i)=>(
            <div key={i} className="row" style={{ alignItems:'flex-start', padding:'8px 0' }}>
              <div>
                <div>{r.text}</div>
                <div className="meta">
                  {t('learner_quiz_your_answer',{ answer:r.given || '—' })}
                  {!r.correct && ' · '+t('learner_quiz_right_answer',{ answer:r.answer })}
                </div>
              </div>
              <span className={'pill '+(r.correct ? 'pill-good' : 'pill-bad')}>{t(r.correct ? 'learner_quiz_correct' : 'learner_quiz_wrong')}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" style={{ marginTop:10 }} disabled={busy} onClick={practiseAgain}>{t('learner_quiz_practise_btn')}</button>
      </div>
    );
  }

  if(!questions){
    return <div>{back}{error ? <p className="field-error">{error}</p> : <p className="muted">{t('online_loading')}</p>}</div>;
  }

  const total = questions.length;
  const answer = answers[index] || '';
  const isLast = index===total-1;
  return (
    <div>
      {back}
      {deadline!=null && (
        <div className="quiz-progress" style={{ fontWeight:800 }}>{t('learner_quiz_time_remaining',{ time:formatQuizTime((deadline-now)/1000) })}</div>
      )}
      <div className="quiz-progress">{t('learner_quiz_progress',{ current:index+1, total })}</div>
      <div className="quiz-bar"><span style={{ width:(index/total)*100+'%' }}/></div>
      <p className="quiz-question">{questions[index].text}</p>
      <input type="text" value={answer} placeholder={t('learner_quiz_answer_placeholder')} style={{ marginTop:4 }} maxLength={200}
        onChange={(e)=>{ const next = [...answersRef.current]; next[index] = e.target.value; setAllAnswers(next); }}/>
      {error && <p className="field-error" style={{ marginTop:8 }}>{error}</p>}
      <div style={{ display:'flex', gap:8, marginTop:14 }}>
        {index>0 && <button className="btn" onClick={()=>setIndex(i=>i-1)}>{t('learner_quiz_prev_btn')}</button>}
        <button className="btn btn-primary" disabled={!answer.trim() || busy}
          onClick={isLast ? submit : ()=>setIndex(i=>i+1)}>
          {isLast ? t('learner_quiz_submit_btn') : t('learner_quiz_next_btn')}
        </button>
      </div>
    </div>
  );
}
