import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, errorText } from '../src/services/api.js'
import { openFile } from '../src/services/files.js'

// question papers and study guides this learner's teachers uploaded for the learner's classes
export default function PapersCard(){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [papers, setPapers] = useState(null); // null while loading
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/learner/papers', token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err){ setError(errorText(t, err)); setPapers([]); return; }
      setPapers(data.papers);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  async function open(paper, download){
    const err = await openFile(paper.fileUrl, token, { download, fileName:paper.fileName });
    if(err) setError(errorText(t, err));
  }

  return (
    <div className="card card-learner">
      <SectionHead icon="paperclip" title={t('learner_papers_title')}/>
      {error && <p className="field-error">{error}</p>}
      {papers===null && <p className="muted">{t('online_loading')}</p>}
      {papers && papers.length===0 && !error && <p className="muted">{t('learner_papers_empty')}</p>}
      {papers && papers.map(paper=>(
        <div key={paper.id} className="row">
          <div>
            <b>{paper.title}</b>
            <div className="meta">{t('paper_list_item_meta',{ grade:t('grade_'+paper.grade), subject:t(paper.subjectKey) })+(paper.teacherName ? ' · '+paper.teacherName : '')}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={()=>open(paper, false)}><Icon name="eye"/>{' '+t('paper_view')}</button>
            <button className="btn" onClick={()=>open(paper, true)}><Icon name="paperclip"/>{' '+t('paper_link')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
