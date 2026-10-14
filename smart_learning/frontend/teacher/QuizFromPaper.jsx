import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiPost, errorText } from '../src/services/api.js'

// The quiz the system made from an uploaded question paper or study guide: the backend reads the
// file (OCR for photos and scans) and writes the questions, with AI when it is set up; the teacher
// only ticks the questions they want and publishes. The quiz goes to the paper's classes.
export default function QuizFromPaper({ paper, classNames, onClose }){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [result, setResult] = useState(null); // { source, questions, classIds }
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState([]); // indexes of the ticked questions
  const [answers, setAnswers] = useState({}); // index -> the memo answer typed for a question taken from the paper
  const [title, setTitle] = useState(()=>t('quizgen_default_title',{ title:paper.title }));
  const [timeLimit, setTimeLimit] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(()=>{
    let cancelled = false;
    apiPost(`/teacher/papers/${paper.id}/generate-quiz`, {}, token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err) setError(errorText(t, err));
      else setResult(data);
    });
    return ()=>{ cancelled = true; };
  }, [paper.id, token, t]);

  const toggle = (i)=>setPicked(p=>p.includes(i) ? p.filter(x=>x!==i) : [...p, i].sort((a,b)=>a-b));

  // a question from the paper has no answer until the teacher types the memo's
  const answerOf = (i)=>(result.questions[i].needsAnswer ? (answers[i]||'') : result.questions[i].answer).trim();

  async function publish(){
    if(picked.length===0) return setError(t('quizgen_pick_one'));
    if(picked.some(i=>!answerOf(i))) return setError(t('quizgen_need_answers'));
    if(!title.trim()) return setError(t('teacher_quiz_validation_alert'));
    setError(null);
    setPublishing(true);
    const { error: err } = await apiPost('/teacher/quizzes', {
      title:title.trim(), classIds:result.classIds, timeLimitMin:timeLimit,
      questions:picked.map(i=>({ text:result.questions[i].text, answer:answerOf(i) })),
    }, token);
    setPublishing(false);
    if(err) return setError(errorText(t, err));
    setPublished(true);
  }

  return (
    <div className="card card-teacher" style={{ marginTop:14 }}>
      <SectionHead icon="sparkle" title={t('quizgen_title')}>
        <button className="btn" style={{ fontSize:11, padding:'5px 10px' }} onClick={onClose}>{t('quizgen_close')}</button>
      </SectionHead>

      {!result && !error && <p className="muted"><span className="spin" style={{ display:'inline-block', verticalAlign:'middle', marginRight:8 }}/>{t('quizgen_loading')}</p>}
      {error && <p className="field-error">{error}</p>}

      {published && (
        <div className="ai-note">
          <Icon name="check"/>{' '+t('quizgen_published',{ classes:classNames })}
          <div style={{ marginTop:8 }}>
            <button className="btn" onClick={()=>update(st=>{ st.teacher.tab = 'quiz'; })}>{t('nav_set_quiz')}</button>
          </div>
        </div>
      )}

      {result && !published && (
        <>
          <p className="muted" style={{ marginTop:-4 }}>
            {t(result.source==='ai' ? 'quizgen_source_ai' : 'quizgen_source_text',{ title:paper.title })}
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', margin:'6px 0' }}>
            <button className="btn" style={{ fontSize:11, padding:'4px 9px' }} onClick={()=>setPicked(result.questions.map((_, i)=>i))}>{t('quizgen_select_all')}</button>
            <button className="btn" style={{ fontSize:11, padding:'4px 9px' }} onClick={()=>setPicked([])}>{t('quizgen_clear')}</button>
            <span className="meta">{t('quizgen_selected',{ n:picked.length, total:result.questions.length })}</span>
          </div>
          <div className="field">
            {result.questions.map((q, i)=>{
              const on = picked.includes(i);
              return (
                <div key={i} className={'class-option'+(on ? ' checked' : '')} style={{ display:'block', margin:'6px 0', padding:'10px 12px' }}>
                  <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', margin:0, fontWeight:'normal' }}>
                    <input type="checkbox" checked={on} onChange={()=>toggle(i)} style={{ marginTop:3 }}/>
                    <span>
                      <span style={{ display:'block' }}>{(i+1)+'. '+q.text}</span>
                      <span className="meta">{q.needsAnswer ? t('quizgen_from_paper') : t('quizgen_answer',{ answer:q.answer })}</span>
                    </span>
                  </label>
                  {q.needsAnswer && on && (
                    <input type="text" value={answers[i]||''} maxLength={200} placeholder={t('quizgen_answer_placeholder')}
                      aria-label={t('quizgen_answer_placeholder')} style={{ marginTop:8 }}
                      onChange={(e)=>{ const v = e.target.value; setAnswers(a=>({ ...a, [i]:v })); }}/>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <div className="field" style={{ flex:'2 1 220px' }}>
              <label htmlFor="qgTitle">{t('quizgen_quiz_title')}</label>
              <input id="qgTitle" value={title} maxLength={150} onChange={(e)=>setTitle(e.target.value)}/>
            </div>
            <div className="field" style={{ flex:'1 1 140px' }}>
              <label htmlFor="qgTime">{t('teacher_quiz_time_limit_label')}</label>
              <input id="qgTime" type="number" min="0" max="180" value={String(timeLimit)}
                onChange={(e)=>setTimeLimit(Math.min(180, Math.max(0, parseInt(e.target.value, 10) || 0)))}/>
            </div>
          </div>
          <p className="meta" style={{ margin:'0 0 8px' }}>{t('quizgen_goes_to',{ classes:classNames })}</p>
          <button className="btn btn-primary" disabled={publishing || picked.length===0} onClick={publish}>
            {t('quizgen_publish_btn',{ n:picked.length })}
          </button>
        </>
      )}
    </div>
  );
}
