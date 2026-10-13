import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { forLearner } from '../src/services/classes.js'

// question papers this learner's teachers uploaded for the learner's classes
export default function PapersCard(){
  const { state } = useStore();
  const { t } = useI18n();
  const myPapers = forLearner(state, state.teacher.papers, state.auth.userId);
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
