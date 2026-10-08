import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'

// question papers the teacher uploaded for this learner's grade
export default function PapersCard(){
  const { state } = useStore();
  const { t } = useI18n();
  const myPapers = state.teacher.papers.filter(p=>p.grade===state.auth.grade);
  return (
    <div className="card card-learner">
      <SectionHead icon="paperclip" title={t('learner_papers_title')}/>
      {myPapers.length===0 && <p className="muted">{t('learner_papers_empty')}</p>}
      {myPapers.map(paper=>(
        <div key={paper.id} className="row">
          <div>
            <b>{paper.title}</b>
            <div className="meta">{t('paper_list_item_meta',{ grade:t('grade_'+paper.grade), subject:t(paper.subjectKey) })}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <a href={paper.fileUrl} target="_blank" rel="noopener" className="btn"><Icon name="eye"/>{' '+t('paper_view')}</a>
            <a href={paper.fileUrl} download={paper.fileName} className="btn"><Icon name="paperclip"/>{' '+t('paper_link')}</a>
          </div>
        </div>
      ))}
    </div>
  );
}
