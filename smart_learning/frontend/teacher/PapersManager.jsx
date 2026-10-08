import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { getSampler } from '../src/services/ai.js'
import GradeSubjectRow from './GradeSubjectRow.jsx'
import { makeEmptyPaperDraft } from './drafts.js'

const OCR_ERROR_KEYS = {
  not_granted:'paper_ocr_not_granted',
  images_unavailable:'paper_ocr_unavailable', image_rejected:'paper_ocr_unavailable',
  sampling_disabled:'paper_ocr_unavailable', not_declared:'paper_ocr_unavailable',
  capability_disabled:'paper_ocr_unavailable', capability_removed:'paper_ocr_unavailable',
  rate_limited:'paper_ocr_rate_limited',
  invalid_json:'paper_ocr_empty', empty_completion:'paper_ocr_empty',
};

function isImagePaper(paper){
  return /\.(png|jpe?g|gif|webp)$/i.test(paper.fileName||'') || /^data:image\//i.test(paper.fileUrl||'');
}

// upload question papers for the class, and turn an image of one into a draft quiz with AI
export default function PapersManager(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.teacher;
  const draft = s.paperDraft;
  const edit = (fn)=>update(st=>fn(st.teacher.paperDraft));

  function handleUpload(file){
    if(!file) return;
    if(file.size > 5*1024*1024){ update(st=>{ st.teacher.paperTooBig = true; }); return; }
    update(st=>{ st.teacher.paperTooBig = false; });
    const reader = new FileReader();
    reader.onload = ()=>edit(d=>{ d.fileName = file.name; d.fileUrl = reader.result; });
    reader.readAsDataURL(file);
  }

  function publish(){
    update(st=>{
      const tc = st.teacher;
      const d = tc.paperDraft;
      if(!d.title.trim() || !d.fileUrl){ tc.paperValidationError = true; return; }
      tc.paperValidationError = false;
      tc.papers.push({ id:tc.nextPaperId++, title:d.title.trim(), grade:d.grade, subjectKey:d.subjectKey, fileName:d.fileName, fileUrl:d.fileUrl });
      tc.paperDraft = makeEmptyPaperDraft(st.auth.grade);
    });
  }

  async function generateQuiz(paper){
    const fail = (code)=>update(st=>{ st.teacher.ocrErrorId = paper.id; st.teacher.ocrErrorCode = code; st.teacher.ocrGeneratingId = null; });
    const sample = await getSampler();
    if(!sample){ fail('not_declared'); return; }
    update(st=>{ st.teacher.ocrGeneratingId = paper.id; st.teacher.ocrErrorId = null; st.teacher.ocrErrorCode = null; });
    try{
      const blob = await (await fetch(paper.fileUrl)).blob();
      const prompt = 'This image is a photo or scan of a Grade '+t('grade_'+paper.grade)+' '+t(paper.subjectKey)+
        ' question paper titled "'+paper.title+'". Read the questions in the image and write up to 6 short-answer '+
        'quiz questions based on its content, each with a concise correct answer a learner would type themselves. '+
        'Reply with ONLY a JSON array, like [{"text":"...","answer":"..."}, ...], no other text.';
      const data = await sample.json(prompt, { images:[blob], modelTier:'default', cache:false });
      const questions = (Array.isArray(data) ? data : [])
        .map(q=>({ text:String((q&&q.text)||'').trim(), answer:String((q&&q.answer)||'').trim() }))
        .filter(q=>q.text && q.answer)
        .slice(0,6);
      if(questions.length===0){ fail('invalid_json'); return; }
      update(st=>{
        const tc = st.teacher;
        tc.quizDraft = { title:'AI Quiz — '+paper.title, grade:paper.grade, subjectKey:paper.subjectKey, timeLimitMin:0, questions };
        tc.tab = 'quiz';
        tc.ocrGeneratingId = null;
        tc.ocrSuccessNote = t('paper_ocr_success',{ title:paper.title, n:questions.length });
      });
    } catch(e){
      fail((e && e.code) || 'upstream_error');
    }
  }

  return (
    <div>
      <div className="card card-teacher">
        <SectionHead icon="paperclip" title={t('teacher_papers_title')}/>
        <p className="muted" style={{ marginTop:-4 }}>{t('teacher_papers_sub')}</p>
        <div className="field" style={{ marginTop:10 }}>
          <label>{t('paper_title_label')}</label>
          <input type="text" value={draft.title} placeholder={t('paper_title_placeholder')}
            onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.title = v; }); }}/>
        </div>
        <GradeSubjectRow grade={draft.grade} subjectKey={draft.subjectKey}
          onGrade={(v)=>edit(d=>{ d.grade = v; })} onSubject={(v)=>edit(d=>{ d.subjectKey = v; })}/>
        <div className="field" style={{ marginTop:10 }}>
          <label>{t('paper_file_label')}</label>
          <p className="muted" style={{ margin:'0 0 6px' }}>{t('paper_file_hint')}</p>
          {draft.fileName ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span className="meta"><Icon name="paperclip"/>{' '+t('paper_uploaded',{ name:draft.fileName })}</span>
              <button className="btn" style={{ fontSize:11, padding:'4px 9px' }} onClick={()=>edit(d=>{ d.fileName = null; d.fileUrl = null; })}>{t('paper_remove')}</button>
            </div>
          ) : (
            <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e)=>handleUpload(e.target.files && e.target.files[0])}/>
          )}
        </div>
        {s.paperTooBig && <p className="ai-note" style={{ marginTop:10 }}>{t('paper_too_big')}</p>}
        {s.paperValidationError && <p className="ai-note" style={{ marginTop:10 }}>{t('paper_validation_alert')}</p>}
        <div style={{ marginTop:14 }}>
          <button className="btn btn-primary" onClick={publish}>{t('paper_publish_btn')}</button>
        </div>
      </div>

      <div className="card card-teacher" style={{ marginTop:14 }}>
        <SectionHead icon="clipboard" title={t('paper_list_title')}/>
        {s.papers.length===0 && <p className="muted">{t('paper_list_empty')}</p>}
        {s.papers.map(paper=>{
          const generating = s.ocrGeneratingId===paper.id;
          return (
            <div key={paper.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
              <div className="row" style={{ border:'none', padding:0 }}>
                <div>
                  <b>{paper.title}</b>
                  <div className="meta">{t('paper_list_item_meta',{ grade:t('grade_'+paper.grade), subject:t(paper.subjectKey) })}</div>
                </div>
                <button className="btn" style={{ fontSize:11, padding:'5px 10px' }}
                  onClick={()=>update(st=>{ st.teacher.papers = st.teacher.papers.filter(p=>p.id!==paper.id); })}>{t('paper_delete_btn')}</button>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <a href={paper.fileUrl} download={paper.fileName} className="meta" style={{ color:'var(--teacher)' }}><Icon name="paperclip"/>{' '+t('paper_link')}</a>
                {isImagePaper(paper) ? (
                  <button className="btn" style={{ fontSize:11, padding:'5px 10px' }} disabled={generating} onClick={()=>generateQuiz(paper)}>
                    {generating ? t('paper_ocr_loading') : <><Icon name="sparkle"/>{' '+t('paper_ocr_btn')}</>}
                  </button>
                ) : (
                  <span className="meta">{t('paper_ocr_image_only')}</span>
                )}
              </div>
              {s.ocrErrorId===paper.id && <p className="ai-note">{t(OCR_ERROR_KEYS[s.ocrErrorCode] || 'paper_ocr_error')}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
