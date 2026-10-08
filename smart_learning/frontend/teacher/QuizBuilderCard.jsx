import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import GradeSubjectRow from './GradeSubjectRow.jsx'
import { makeEmptyQuizDraft } from './drafts.js'

// build short-answer quizzes for learners to type their own answers to
export default function QuizBuilderCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.teacher;
  const draft = s.quizDraft;
  const edit = (fn)=>update(st=>fn(st.teacher.quizDraft));

  function publish(){
    update(st=>{
      const tc = st.teacher;
      const d = tc.quizDraft;
      const cleanQuestions = d.questions.filter(q=>q.text.trim() && q.answer.trim());
      if(!d.title.trim() || cleanQuestions.length===0){ tc.quizValidationError = true; return; }
      tc.quizzes.push({
        id: tc.nextQuizId++,
        title: d.title.trim(),
        grade: d.grade,
        subjectKey: d.subjectKey,
        timeLimitMin: d.timeLimitMin||0,
        questions: cleanQuestions.map(q=>({ text:q.text.trim(), answer:q.answer.trim() })),
      });
      tc.quizDraft = makeEmptyQuizDraft(st.auth.grade);
      tc.quizValidationError = false;
      tc.ocrSuccessNote = null;
    });
  }

  return (
    <div className="card card-teacher" style={{ marginTop:14 }}>
      <SectionHead icon="edit" title={t('teacher_quiz_builder_title')}/>
      <p className="muted" style={{ marginTop:-4 }}>{t('teacher_quiz_builder_sub')}</p>
      {s.ocrSuccessNote && <p className="ai-note" style={{ marginTop:10 }}><Icon name="sparkle"/>{' '+s.ocrSuccessNote}</p>}

      <div className="field" style={{ marginTop:10 }}>
        <label>{t('teacher_quiz_title_label')}</label>
        <input type="text" value={draft.title} placeholder={t('teacher_quiz_title_placeholder')}
          onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.title = v; }); }}/>
      </div>

      <GradeSubjectRow grade={draft.grade} subjectKey={draft.subjectKey}
        onGrade={(v)=>edit(d=>{ d.grade = v; })} onSubject={(v)=>edit(d=>{ d.subjectKey = v; })}/>

      <div className="field" style={{ marginTop:10 }}>
        <label>{t('teacher_quiz_time_limit_label')}</label>
        <input type="number" min="0" value={String(draft.timeLimitMin||0)}
          onChange={(e)=>{ const v = Math.max(0, parseInt(e.target.value,10)||0); edit(d=>{ d.timeLimitMin = v; }); }}/>
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
          <input type="text" value={q.text} placeholder={t('teacher_quiz_question_placeholder')} style={{ marginTop:6 }}
            onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.questions[qi].text = v; }); }}/>
          <div className="field" style={{ marginTop:8 }}>
            <label>{t('teacher_quiz_answer_label')}</label>
            <input type="text" value={q.answer} placeholder={t('teacher_quiz_answer_placeholder')}
              onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.questions[qi].answer = v; }); }}/>
          </div>
        </div>
      ))}
      <button className="btn" style={{ marginTop:10 }} onClick={()=>edit(d=>{ d.questions.push({ text:'', answer:'' }); })}>{t('teacher_quiz_add_question')}</button>

      {s.quizValidationError && <p className="ai-note" style={{ marginTop:10 }}>{t('teacher_quiz_validation_alert')}</p>}
      <div style={{ marginTop:14 }}>
        <button className="btn btn-primary" onClick={publish}>{t('teacher_quiz_publish_btn')}</button>
      </div>
    </div>
  );
}
