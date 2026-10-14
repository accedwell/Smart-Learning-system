import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, errorText } from '../src/services/api.js'
import { phaseOf, PHASE_PILL, formatWhen, useNow } from '../src/services/onlineClasses.js'
import LiveClassroom from '../src/live/LiveClassroom.jsx'

const STATUS_PILL = { present:'pill-good', late:'pill-warn', absent:'pill-bad' };

// The online classes scheduled for the learner's classes. Joining opens the live classroom
// right here in the app, and coming in is what marks the learner in the register.
export default function OnlineClassesCard(){
  const [live, setLive] = useState(null); // the online class the learner is in
  const [listKey, setListKey] = useState(0); // reloads the list (and the learner's mark) after leaving
  if(live) return <LiveClassroom onlineClass={live} onLeave={()=>{ setLive(null); setListKey(k=>k+1); }}/>;
  return <OnlineClassesList key={listKey} onJoin={setLive}/>;
}

function OnlineClassesList({ onJoin }){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const now = useNow();
  const [list, setList] = useState(null); // null while loading
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/learner/online-classes', token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err){ setError(errorText(t, err)); setList([]); return; }
      setList(data.onlineClasses);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  return (
    <div className="card card-learner">
      <SectionHead icon="users" title={t('learner_online_title')}/>
      {error && <p className="field-error">{error}</p>}
      {list===null && <p className="muted">{t('online_loading')}</p>}
      {list && list.length===0 && !error && <p className="muted">{t('learner_online_empty')}</p>}
      {list && list.map(oc=>{
        const phase = phaseOf(oc, now);
        const status = oc.myStatus || (phase==='ended' ? 'absent' : null);
        return (
          <div key={oc.id} className="row" style={{ alignItems:'flex-start' }}>
            <div>
              <b>{oc.title}</b>
              <div className="meta">{t('online_teacher_meta',{ teacher:oc.teacherName||'', class:oc.className+' '+t(oc.subjectKey), time:formatWhen(oc.startsAt), n:oc.durationMin })}</div>
              {status && (
                <div className="meta" style={{ marginTop:4 }}>
                  <span className={'pill '+STATUS_PILL[status]}>{t('learner_online_my_status',{ status:t('online_status_'+status) })}</span>
                  {oc.myMinutes!=null && ' '+t('learner_online_my_minutes',{ n:oc.myMinutes })}
                </div>
              )}
              {phase==='upcoming' && <div className="meta">{t('learner_online_opens')}</div>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
              <span className={'pill '+PHASE_PILL[phase]}>{t('online_phase_'+phase)}</span>
              {phase==='open' && (
                <button className="btn btn-primary" onClick={()=>onJoin(oc)}>
                  <Icon name="users"/>{' '+t(oc.myStatus && oc.myStatus!=='absent' ? 'learner_online_rejoin_btn' : 'learner_online_join_btn')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
