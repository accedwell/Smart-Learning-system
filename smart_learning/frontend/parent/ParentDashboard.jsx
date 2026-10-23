import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { scoreClass } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, apiPost, errorText } from '../src/services/api.js'
import { formatDate, timeAgo } from '../src/services/dates.js'

const STATUS_PILL = { on_track:'good', watch:'warn', at_risk:'bad' };


// A parent only ever sees the learners the school administrator linked to their account.
// Children, their marks and the parent's notifications all come from the backend.
export default function ParentDashboard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const token = state.auth.token;
  const s = state.parent;
  const [children, setChildren] = useState(null); // null while loading
  const [details, setDetails] = useState({}); // childId -> { child, status, lessons, quizMarks }
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState(null);
  const [reportBusy, setReportBusy] = useState(null); // 'view' | 'download' while the PDF is made

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

  // the report as a PDF, made by the server: shown in a new tab, or saved as a file
  async function reportPdf(){
    const res = await fetch(`/api/parent/children/${child.id}/report.pdf`, { headers:{ Authorization:'Bearer '+token } });
    if(!res.ok) throw new Error('report');
    return URL.createObjectURL(await res.blob());
  }
  async function viewReport(){
    setReportBusy('view');
    const tab = window.open('', '_blank'); // opened straight away, so the browser doesn't block it
    try{
      const url = await reportPdf();
      if(tab) tab.location.href = url; else window.location.href = url;
    } catch{
      if(tab) tab.close();
      setError(t('m_paper_open_error'));
    }
    setReportBusy(null);
  }
  async function downloadReport(){
    setReportBusy('download');
    try{
      const url = await reportPdf();
      const a = document.createElement('a');
      a.href = url;
      a.download = child.name.replace(/\s+/g,'-')+'-progress-report.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 10000);
    } catch{
      setError(t('m_paper_open_error'));
    }
    setReportBusy(null);
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
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
            <button className="btn" onClick={viewReport} disabled={reportBusy!=null}><Icon name="file"/>{' '+(reportBusy==='view' ? t('online_loading') : t('parent_report_view_btn'))}</button>
            <button className="btn btn-primary" onClick={downloadReport} disabled={reportBusy!=null}><Icon name="download"/>{' '+(reportBusy==='download' ? t('online_loading') : t('parent_download_btn'))}</button>
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
              <span className="meta" style={{ whiteSpace:'nowrap' }} title={formatDate(n.createdAt)}>{timeAgo(n.createdAt, lang)}</span>
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
              <div className="meta">{[m.subjectKey && t(m.subjectKey), formatDate(m.submittedAt)].filter(Boolean).join(' · ')}</div>
            </div>
            <span className={'pill pill-'+scoreClass(m.score/m.total)}>{m.score+'/'+m.total}</span>
          </div>
        ))}
      </div>

      {/* the child's subjects: a lesson and an assessment for each */}
      {detail && (
        <div className="grid grid-2" style={{ marginTop:14 }}>
          <div className="card card-parent">
            <SectionHead icon="book" title={t('parent_lessons_title',{ child:child.name.split(' ')[0] })}/>
            {detail.lessons.map(l=>{
              const subject = l.subjectKey ? t(l.subjectKey) : '';
              return (
                <div key={l.id} className="row" style={{ alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    {subject && <div className="lesson-subject">{subject}</div>}
                    <div>{t(l.key,{ subject })}</div>
                    {l.assessment && <div className="meta">{t('parent_assessment_line',{ title:t(l.assessment.titleKey,{ subject }), date:l.assessment.due })}</div>}
                    <div className="bar"><span style={{ width:l.progress+'%', background:l.done ? 'var(--good)' : 'var(--brand)' }}/></div>
                  </div>
                  {l.done ? <span className="pill pill-good">{t('learner_completed')}</span> : <span className="meta">{l.progress+'%'}</span>}
                </div>
              );
            })}
          </div>
          <div className="card card-parent">
            <SectionHead icon="users" title={t('nav_online_classes')}/>
            <p style={{ margin:'0 0 8px' }}>{detail.attendance.total ? t('parent_attendance_line', detail.attendance) : t('parent_attendance_none')}</p>
            {detail.attendance.classes.slice(0, 10).map((oc, i)=>(
              <div key={i} className="row">
                <div>
                  <b>{oc.title}</b>
                  <div className="meta">{t(oc.subjectKey)+' · '+formatDate(oc.startsAt)}</div>
                </div>
                <span className={'pill pill-'+({ present:'good', late:'warn', absent:'bad' }[oc.status])}>{t('online_status_'+oc.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
