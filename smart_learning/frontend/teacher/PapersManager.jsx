import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, apiRequest, apiUpload, errorText } from '../src/services/api.js'
import { openFile } from '../src/services/files.js'
import ClassPicker from './ClassPicker.jsx'
import QuizFromPaper from './QuizFromPaper.jsx'
import { makeEmptyPaperDraft } from './drafts.js'

const MAX_BYTES = 5*1024*1024;

// The teacher uploads question papers and study guides (PDF, Word .docx or a photo) for their
// classes; learners in those classes can open them. As soon as a file is uploaded the system
// reads it and writes quiz questions from it (QuizFromPaper), and the teacher only picks which
// to use. Everything is saved on the backend.
export default function PapersManager(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const draft = state.teacher.paperDraft;
  const edit = (fn)=>update(st=>fn(st.teacher.paperDraft));
  const [classes, setClasses] = useState([]);
  const [papers, setPapers] = useState(null); // null while loading
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0); // resets the file input after an upload
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [quizFor, setQuizFor] = useState(null); // the paper a quiz is being made from

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/teacher/class', token), apiGet('/teacher/papers', token)]).then(([cr, pr])=>{
      if(cancelled) return;
      const failed = cr.error || pr.error;
      if(failed){ setError(errorText(t, failed)); setPapers([]); return; }
      setClasses(cr.data.classes);
      setPapers(pr.data.papers);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  const pickedIds = draft.classIds.filter(id=>classes.some(c=>c.id===id));
  const namesOf = (ids)=>classes.filter(c=>ids.includes(c.id)).map(c=>c.name).join(', ');

  function chooseFile(f){
    setError(null);
    if(f && f.size > MAX_BYTES){ setError(t('paper_too_big')); setFile(null); return; }
    setFile(f || null);
  }

  async function upload(){
    if(pickedIds.length===0) return setError(t('teacher_class_pick_required'));
    if(!draft.title.trim() || !file) return setError(t('paper_validation_alert'));
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append('title', draft.title.trim());
    form.append('classIds', pickedIds.join(','));
    form.append('file', file);
    const { data, error: err } = await apiUpload('/teacher/papers', form, token);
    setUploading(false);
    if(err) return setError(errorText(t, err));
    setPapers(list=>[data.paper, ...(list||[])]);
    setFile(null);
    setFileKey(k=>k+1);
    update(st=>{ st.teacher.paperDraft = makeEmptyPaperDraft(pickedIds); });
    // straight on to the quiz: the system reads the file and writes the questions
    setQuizFor(data.paper);
  }

  async function remove(paper){
    if(!window.confirm(t('paper_delete_confirm'))) return;
    const { error: err } = await apiRequest('DELETE', `/teacher/papers/${paper.id}`, { token });
    if(err) return setError(errorText(t, err));
    setPapers(list=>list.filter(p=>p.id!==paper.id));
    if(quizFor && quizFor.id===paper.id) setQuizFor(null);
  }

  async function open(paper, download){
    const err = await openFile(paper.fileUrl, token, { download, fileName:paper.fileName });
    if(err) setError(errorText(t, err));
  }

  return (
    <div>
      <div className="card card-teacher">
        <SectionHead icon="paperclip" title={t('teacher_papers_title')}/>
        <p className="muted" style={{ marginTop:-4 }}>{t('teacher_papers_sub')}</p>
        <div className="field" style={{ marginTop:10 }}>
          <label>{t('paper_title_label')}</label>
          <input type="text" value={draft.title} placeholder={t('paper_title_placeholder')} maxLength={150}
            onChange={(e)=>{ const v = e.target.value; edit(d=>{ d.title = v; }); }}/>
        </div>
        <ClassPicker classes={classes} value={pickedIds} onChange={(ids)=>edit(d=>{ d.classIds = ids; })}/>
        <div className="field" style={{ marginTop:10 }}>
          <label>{t('paper_file_label')}</label>
          <p className="muted" style={{ margin:'0 0 6px' }}>{t('paper_file_hint')}</p>
          <input key={fileKey} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif" onChange={(e)=>chooseFile(e.target.files && e.target.files[0])}/>
        </div>
        {error && <p className="field-error" style={{ marginTop:10 }}>{error}</p>}
        <div style={{ marginTop:14 }}>
          <button className="btn btn-primary" disabled={uploading} onClick={upload}>
            <Icon name="sparkle"/>{' '+(uploading ? t('paper_uploading') : t('paper_upload_btn'))}
          </button>
        </div>
      </div>

      {quizFor && (
        <QuizFromPaper key={quizFor.id} paper={quizFor} classNames={namesOf(quizFor.classIds)} onClose={()=>setQuizFor(null)}/>
      )}

      <div className="card card-teacher" style={{ marginTop:14 }}>
        <SectionHead icon="clipboard" title={t('paper_list_title')}/>
        {papers===null && <p className="muted">{t('online_loading')}</p>}
        {papers && papers.length===0 && <p className="muted">{t('paper_list_empty')}</p>}
        {papers && papers.map(paper=>(
          <div key={paper.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div>
                <b>{paper.title}</b>
                <div className="meta">{t('paper_list_classes_meta',{ classes:namesOf(paper.classIds), subject:t(paper.subjectKey) })+' · '+paper.fileName}</div>
              </div>
              <button className="btn" style={{ fontSize:11, padding:'5px 10px' }} onClick={()=>remove(paper)}>{t('paper_delete_btn')}</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-primary" style={{ fontSize:11, padding:'5px 10px' }} disabled={quizFor && quizFor.id===paper.id}
                onClick={()=>setQuizFor(paper)}><Icon name="sparkle"/>{' '+t('paper_quiz_btn')}</button>
              <button className="btn" style={{ fontSize:11, padding:'5px 10px' }} onClick={()=>open(paper, false)}><Icon name="eye"/>{' '+t('paper_view')}</button>
              <button className="btn" style={{ fontSize:11, padding:'5px 10px' }} onClick={()=>open(paper, true)}><Icon name="download"/>{' '+t('paper_link')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
