import { useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiPost, errorText } from '../src/services/api.js'
import ClassPicker from './ClassPicker.jsx'
import { makeEmptyQuizDraft } from './drafts.js'

// Builds a short-answer test for one or more of the teacher's classes (`classes`, from the
// backend) and publishes it there; only learners in those classes get it. Learners can retake
// it to practise, and their first try decides whether they show as at risk. The draft stays in
// the store, where the paper-to-quiz AI also puts what it writes.
export default function QuizBuilderCard({ classes, onPublished }){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.teacher;
  const draft = s.quizDraft;
  const edit = (fn)=>update(st=>fn(st.teacher.quizDraft));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(null);
  // only classes the backend knows as this teacher's can be picked
  const pickedIds = draft.classIds.filter(id=>classes.some(c=>c.id===id));

  async function publish(){
    setPublished(null);
    const cleanQuestions = draft.questions.filter(q=>q.text.trim() && q.answer.trim());
    if(pickedIds.length===0) return setError(t('teacher_class_pick_required'));
    if(!draft.title.trim() || cleanQuestions.length===0) return setError(t('teacher_quiz_validation_alert'));
    setError(null);
    setBusy(true);
    const { data, error: err } = await apiPost('/teacher/quizzes', {
      title:draft.title.trim(), classIds:pickedIds, timeLimitMin:draft.timeLimitMin||0,
      questions:cleanQuestions.map(q=>({ text:q.text.trim(), answer:q.answer.trim() })),
    }, state.auth.token);
    setBusy(false);
    if(err) return setError(errorText(t, err));
    onPublished(data.quiz);
    setPublished(data.quiz.title);
    update(st=>{
      st.teacher.quizDraft = makeEmptyQuizDraft(pickedIds);
      st.teacher.ocrSuccessNote = null;
    });
  }

  return (
    <div className="card card-teacher" style={{ marginTop:14 }}>
      <SectionHead icon="edit" title={t('teacher_quiz_builder_title')}/>
      <p className="muted" style={{ marginTop:-4 }}>{t('teacher_quiz_builder_sub')}</p>
      <p className="muted" style={{ fontSize:11.5 }}>{t('teacher_quiz_risk_hint')}</p>
      {s.ocrSuccessNote && <p className="ai-note" style={{ marginTop:10 }}><Icon name="sparkle"/>{' '+s.ocrSuccessNote}</p>}

      <div className="field" style={{ marginTop:10 }}>
        <label>{t('teacher_quiz_title_label')}</label>
        <input type="text" value={draft.title} placeholder={t('teacher_quiz_title_placeholder')} maxLength={150}
          onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.title = v; }); }}/>
      </div>

      <ClassPicker classes={classes} value={pickedIds} onChange={(ids)=>edit(d=>{ d.classIds = ids; })}/>

      <div className="field" style={{ marginTop:10 }}>
        <label>{t('teacher_quiz_time_limit_label')}</label>
        <input type="number" min="0" max="180" value={String(draft.timeLimitMin||0)}
          onChange={(e)=>{ const v = Math.min(180, Math.max(0, parseInt(e.target.value,10)||0)); edit(d=>{ d.timeLimitMin = v; }); }}/>
        <p className="muted" style={{ margin:'4px 0 0', fontSize:11 }}>{t('teacher_quiz_time_limit_hint')}</p>
      </div>

      <div style={{ marginTop:14, fontWeight:800, fontSize:12.5 }}>{t('teacher_quiz_questions_label')}</div>
      {draft.questions.map((q,qi)=>(
        <div key={qi} style={{ marginTop:8, padding:10, border:'1px solid var(--border)', borderRadius:10 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <label style={{ fontWeight:700 }}>{t('teacher_quiz_question_n',{ n:qi+1 })}</label>
            {draft.questions.length>1 && (
              <button className="btn" style={{ fontSize:11, padding:'4px 9px' }} onClick={()=>edit(d=>{ d.questions.splice(qi,1); })}>{t('teacher_quiz_remove_question')}</button>
            )}
          </div>
          <input type="text" value={q.text} placeholder={t('teacher_quiz_question_placeholder')} style={{ marginTop:6 }} maxLength={1000}
            onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.questions[qi].text = v; }); }}/>
          <div className="field" style={{ marginTop:8 }}>
            <label>{t('teacher_quiz_answer_label')}</label>
            <input type="text" value={q.answer} placeholder={t('teacher_quiz_answer_placeholder')} maxLength={200}
              onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.questions[qi].answer = v; }); }}/>
          </div>
        </div>
      ))}
      <button className="btn" style={{ marginTop:10 }} onClick={()=>edit(d=>{ d.questions.push({ text:'', answer:'' }); })}>{t('teacher_quiz_add_question')}</button>

      {error && <p className="field-error" style={{ marginTop:10 }}>{error}</p>}
      {published && <p className="ai-note" style={{ marginTop:10 }}><Icon name="check"/>{' '+t('teacher_quiz_published_classes_note',{ title:published })}</p>}
      <div style={{ marginTop:14 }}>
        <button className="btn btn-primary" disabled={busy} onClick={publish}>{t('teacher_quiz_publish_btn')}</button>
      </div>
    </div>
  );
}
