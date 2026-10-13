import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { QUIZ_BANK } from '../src/data/seed.js'
import { SectionHead, Icon, AiNote, ResultRing } from '../src/components/ui.jsx'
import { askOneLiner, langNote } from '../src/services/ai.js'
import { isTeacherQuizActive } from './quizState.js'

const EMPTY_QUIZ = { started:false, submitted:false, index:0, answers:[], score:null, feedback:null };

// built-in multiple-choice check-in quiz across subjects
export default function CheckinQuizCard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const q = state.learner.quiz;
  const total = QUIZ_BANK.length;

  async function submit(){
    let score = 0;
    const missedTopics = [];
    QUIZ_BANK.forEach((item,i)=>{
      if(q.answers[i]===item.correct) score++;
      else missedTopics.push(t(item.qKey));
    });
    const pct = score/total;
    update(s=>{
      s.learner.quiz.score = score;
      s.learner.quiz.submitted = true;
      // reflect the result onto the learner's status on their teachers' class lists
      const entry = s.admin.users.find(u=>u.id===s.auth.userId && u.role==='learner');
      if(entry){
        entry.status = pct>=0.8 ? 'on_track' : (pct>=0.5 ? 'watch' : 'at_risk');
        entry.noteKey = null;
        entry.noteText = t('quiz_score_caption',{ correct:score, total });
      }
    });
    if(missedTopics.length===0) return;
    const feedback = await askOneLiner(`A Grade ${state.auth.grade||'10'} learner just took a short check-in quiz on a platform called Smart Learning and got ${score} out of ${total} correct. They struggled with questions about: ${missedTopics.join('; ')}. In ONE short, encouraging sentence (max 25 words), tell them what to focus on next.${langNote(lang)}`);
    if(feedback) update(s=>{ s.learner.quiz.feedback = feedback; });
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
        <button className="btn btn-primary" style={{ marginTop:14 }} disabled={q.answers[q.index]==null}
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
