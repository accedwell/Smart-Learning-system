import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { QUIZ_BANK } from '../src/data/seed.js'
import { SectionHead, Icon, AiNote, ResultRing } from '../src/components/ui.jsx'
import { apiPost, errorText } from '../src/services/api.js'
import { isTeacherQuizActive } from './quizState.js'

const EMPTY_QUIZ = { started:false, submitted:false, index:0, answers:[], score:null, feedback:null, sending:false, error:null };

// built-in multiple-choice check-in quiz across subjects
export default function CheckinQuizCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const q = state.learner.quiz;
  const total = QUIZ_BANK.length;

  // the backend marks it and saves the attempt, which the teachers' class lists use for the
  // learner's status until they have taken one of the teacher's tests
  async function submit(){
    update(s=>{ s.learner.quiz.sending = true; s.learner.quiz.error = null; });
    const { data, error } = await apiPost('/learner/checkin', { answers:q.answers, lang }, state.auth.token);
    update(s=>{
      const quiz = s.learner.quiz;
      quiz.sending = false;
      if(error){ quiz.error = errorText(t, error); return; }
      quiz.score = data.score;
      quiz.feedback = data.feedback;
      quiz.submitted = true;
    });
  }

  let body;
  if(!q.started){
    const locked = isTeacherQuizActive(state.learner);
    body = (
      <>
        <p className="muted">{locked ? t('learner_quiz_locked_note') : t('quiz_intro')}</p>
        <button className="btn btn-primary" style={{ marginTop:6 }} disabled={locked}
          onClick={()=>update(s=>{ s.learner.quiz = { ...EMPTY_QUIZ, answers:[], started:true }; })}>{t('quiz_start_btn')}</button>
      </>
    );
  } else if(!q.submitted){
    const item = QUIZ_BANK[q.index];
    const isLast = q.index===total-1;
    body = (
      <>
        <div className="quiz-progress">{t('quiz_progress',{ current:q.index+1, total })}</div>
        <div className="quiz-bar"><span style={{ width:(q.index/total)*100+'%' }}/></div>
        <p className="quiz-question">{t(item.qKey)}</p>
        <div className="quiz-options">
          {item.optKeys.map((optKey,i)=>(
            <div key={optKey} className={'quiz-option'+(q.answers[q.index]===i?' selected':'')} onClick={()=>update(s=>{ s.learner.quiz.answers[s.learner.quiz.index] = i; })}>
              <span className="dot"/><span>{t(optKey)}</span>
            </div>
          ))}
        </div>
        {q.error && <p className="field-error">{q.error}</p>}
        <button className="btn btn-primary" style={{ marginTop:14 }} disabled={q.answers[q.index]==null || q.sending}
          onClick={isLast ? submit : ()=>update(s=>{ s.learner.quiz.index++; })}>
          {isLast ? t('quiz_submit_btn') : t('quiz_next_btn')}
        </button>
      </>
    );
  } else {
    const pct = q.score/total;
    const statusKey = pct>=0.8 ? 'quiz_status_good' : (pct>=0.5 ? 'quiz_status_watch' : 'quiz_status_bad');
    body = (
      <>
        <div className="quiz-result">
          <ResultRing score={q.score} total={total}/>
          <p style={{ fontWeight:800, margin:'0 0 4px' }}>{t(statusKey)}</p>
          <p className="muted" style={{ margin:'0 0 10px' }}>{t('quiz_score_caption',{ correct:q.score, total })}</p>
        </div>
        {q.feedback && <AiNote label={t('quiz_ai_prefix')}>{q.feedback}</AiNote>}
        {pct<0.8 && <p className="muted" style={{ marginTop:10 }}><Icon name="inbox"/>{' '+t('quiz_teacher_note')}</p>}
        <button className="btn" style={{ marginTop:12 }} onClick={()=>update(s=>{ s.learner.quiz = { ...EMPTY_QUIZ, answers:[] }; })}>{t('quiz_retake_btn')}</button>
      </>
    );
  }

  return (
    <div className="card card-learner" style={{ marginTop:14 }}>
      <SectionHead icon="help" title={t('quiz_title')}/>
      {body}
    </div>
  );
}
