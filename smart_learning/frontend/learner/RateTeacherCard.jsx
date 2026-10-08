import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'

export default function RateTeacherCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.learner;
  return (
    <div className="card card-learner">
      <SectionHead icon="star" title={t('learner_rate_title')}/>
      <p className="muted">{t('learner_rate_sub',{ teacher:s.teacherName })}</p>
      <div className="stars">
        {[1,2,3,4,5].map(i=>(
          <button key={i} className={i<=s.rating?'on':''} onClick={()=>update(st=>{ st.learner.rating = i; })}><Icon name="star"/></button>
        ))}
      </div>
      {s.rating>0 && <p className="ai-note">{t('learner_rate_thanks',{ n:s.rating })}</p>}
    </div>
  );
}
