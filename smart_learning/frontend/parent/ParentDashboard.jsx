import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { scoreClass } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { saveTextFile } from '../src/services/downloads.js'
import { apiGet, apiPost, errorText } from '../src/services/api.js'

const STATUS_PILL = { on_track:'good', watch:'warn', at_risk:'bad' };

function formatTime(value){
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

// A parent only ever sees the learners the school administrator linked to their account.
// Children, their marks and the parent's notifications all come from the backend.
export default function ParentDashboard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const s = state.parent;
  const [children, setChildren] = useState(null); // null while loading
  const [details, setDetails] = useState({}); // childId -> { child, status, lessons, quizMarks }
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/parent/children', token), apiGet('/notifications', token)]).then(([cr, nr])=>{
      if(cancelled) return;
      const failed = cr.error || nr.error;
      if(failed){ setError(errorText(t, failed)); setChildren([]); return; }
      setChildren(cr.data.children);
      setNotifications(nr.data.notifications);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  const child = children && (children.find(c=>c.id===s.selectedChildId) || children[0]);
  const childId = child && child.id;
  const detail = childId ? details[childId] : null;

  // the chosen child's marks, loaded once per child
  useEffect(()=>{
    if(!childId || details[childId]) return;
    let cancelled = false;
    apiGet(`/parent/children/${childId}`, token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err) setError(errorText(t, err));
      else setDetails(d=>({ ...d, [childId]:data }));
    });
    return ()=>{ cancelled = true; };
  }, [childId, details, token, t]);

  if(children===null) return <div className="card card-parent"><p className="muted">{t('online_loading')}</p></div>;

  if(children.length===0){
    return (
      <div className="card card-parent" style={{ maxWidth:560 }}>
        <SectionHead icon="users" title={t('parent_no_child_title')}/>
        {error ? <p className="field-error">{error}</p> : <p className="muted">{t('parent_no_child')}</p>}
      </div>
    );
  }

  const progress = (detail ? detail.child.progress : child.progress) || 0;
  const marks = detail ? detail.quizMarks : [];
  const unread = notifications.filter(n=>!n.read).length;
  const noteText = (n)=>n.key ? t(n.key, n.params || {}) : n.message;

  async function markAllRead(){
    const { error: err } = await apiPost('/notifications/read-all', {}, token);
    if(err){ setError(errorText(t, err)); return; }
    setNotifications(list=>list.map(n=>({ ...n, read:true })));
  }

  function downloadChildReport(){
    const lines = [
      'Smart Learning - Learner Progress Report',
      'Learner: '+child.name+(child.grade ? ' ('+t('grade_'+child.grade)+')' : ''),
      'Generated: '+new Date().toLocaleString(),
      '',
      'Overall progress this term: '+progress+'%',
      ...(detail && detail.status ? ['Status: '+t('status_'+detail.status)] : []),
      '',
      'Quiz marks:',
      ...(marks.length ? marks.map(m=>`  - ${m.title}${m.subjectKey ? ' ('+t(m.subjectKey)+')' : ''}: ${m.score}/${m.total}`) : ['  - none yet']),
      '',
      'Recent notifications:',
      ...(notifications.length ? notifications.slice(0, 10).map(n=>`  - [${formatTime(n.createdAt)}] ${noteText(n)}`) : ['  - none']),
    ].join('\n');
    saveTextFile(child.name.replace(/\s+/g,'_')+'-progress-report.txt', lines);
  }

  return (
    <div>
      {error && <p className="field-error">{error}</p>}
      {children.length>1 && (
        <div className="subject-filter" aria-label={t('parent_child_select_label')}>
          {children.map(c=>(
            <button key={c.id} className={c.id===child.id?'active':''} onClick={()=>update(st=>{ st.parent.selectedChildId = c.id; })}>{c.name}</button>
          ))}
        </div>
      )}
      <div className="grid grid-2">
        <div className="card card-parent">
          <SectionHead icon="chart" title={t('parent_progress_title')} aside={child.name+(child.grade ? ' · '+t('grade_'+child.grade) : '')}/>
          <div className="bar" style={{ height:10 }}><span style={{ width:progress+'%', background:'var(--parent)' }}/></div>
          <p className="muted" style={{ marginTop:6 }}>{t('parent_progress_caption',{ pct:progress })}</p>
          {detail && detail.status && <span className={'pill pill-'+STATUS_PILL[detail.status]}>{t('status_'+detail.status)}</span>}
          <div>
            <button className="btn btn-primary" style={{ marginTop:12 }} onClick={downloadChildReport}><Icon name="download"/>{' '+t('parent_download_btn')}</button>
          </div>
        </div>

        <div className="card card-parent">
          <SectionHead icon="bell" title={t('parent_notifications_title')}
            titleExtra={unread>0 && <span className="pill pill-bad" style={{ marginLeft:8 }}>{String(unread)}</span>}>
            {unread>0 && <button className="btn" onClick={markAllRead}>{t('parent_mark_read')}</button>}
          </SectionHead>
          {notifications.length===0 && <p className="muted">{t('parent_notifications_empty')}</p>}
          {notifications.map(n=>(
            <div key={n.id} className="row">
              <div style={n.read ? undefined : { fontWeight:700 }}>{n.read ? '' : '● '}{noteText(n)}</div>
              <span className="meta">{formatTime(n.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-parent" style={{ marginTop:14 }}>
        <SectionHead icon="clipboard" title={t('parent_quiz_marks_title')} aside={child.name}/>
        {!detail && <p className="muted">{t('online_loading')}</p>}
        {detail && marks.length===0 && <p className="muted">{t('parent_quiz_marks_empty',{ child:child.name })}</p>}
        {marks.map(m=>(
          <div key={m.quizId+'-'+m.submittedAt} className="row">
            <div>
              <b>{m.title}</b>
              <div className="meta">{[m.subjectKey && t(m.subjectKey), formatTime(m.submittedAt)].filter(Boolean).join(' · ')}</div>
            </div>
            <span className={'pill pill-'+scoreClass(m.score/m.total)}>{m.score+'/'+m.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
