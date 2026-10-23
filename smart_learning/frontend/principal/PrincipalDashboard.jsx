import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { DEPARTMENTS } from '../src/data/seed.js'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { saveTextFile } from '../src/services/downloads.js'
import { formatDateTime } from '../src/services/dates.js'
import { apiGet, apiPatch, apiPost, errorText } from '../src/services/api.js'

function WorkPill({ workDone }){
  const { t } = useI18n();
  if(workDone===true) return <span className="pill pill-good">{t('principal_work_done_pill')}</span>;
  if(workDone===false) return <span className="pill pill-bad">{t('principal_reminder_pill')}</span>;
  return <span className="pill pill-warn">{t('principal_ask_pill')}</span>;
}


// Every teacher, the HODs' department reports, oversight and feedback all come from the
// backend (/api/principal), so they are saved in the database.
export default function PrincipalDashboard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const s = state.principal;
  const [teachers, setTeachers] = useState(null); // null while loading
  const [reports, setReports] = useState([]);
  const [drafts, setDrafts] = useState({}); // teacherId -> feedback being written
  const [sent, setSent] = useState({}); // teacherId -> true once feedback went out
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/principal/teachers', token), apiGet('/principal/reports', token)]).then(([tr, rr])=>{
      if(cancelled) return;
      const failed = tr.error || rr.error;
      if(failed){ setError(errorText(t, failed)); setTeachers([]); return; }
      setTeachers(tr.data.teachers);
      setReports(rr.data.reports);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  async function run(request){
    setBusy(true);
    setError(null);
    const result = await request();
    setBusy(false);
    if(result.error) setError(errorText(t, result.error));
    return result;
  }

  const teachingText = (tc)=>[tc.gradeKey && t(tc.gradeKey), tc.subjectKey && t(tc.subjectKey)].filter(Boolean).join(' · ');
  const avgText = (avg)=>avg==null ? '–' : Number(avg).toFixed(1);
  const deptLabel = (id)=>{ const dep = DEPARTMENTS.find(d=>d.id===id); return dep ? t(dep.labelKey) : (id || ''); };

  if(teachers===null) return <div className="card card-principal"><p className="muted">{t('online_loading')}</p></div>;
  const selected = teachers.find(tc=>tc.id===s.selectedTeacherId) || teachers[0];

  async function setWorkDone(value){
    const { data } = await run(()=>apiPatch(`/principal/teachers/${selected.id}/work-done`, { workDone:value }, token));
    if(data) setTeachers(list=>list.map(tc=>tc.id===selected.id ? data.teacher : tc));
  }

  async function sendFeedback(){
    const message = (drafts[selected.id] || '').trim();
    if(!message) return;
    const { data } = await run(()=>apiPost(`/principal/teachers/${selected.id}/feedback`, { message }, token));
    if(!data) return;
    setDrafts(d=>({ ...d, [selected.id]:'' }));
    setSent(x=>({ ...x, [selected.id]:true }));
  }

  function downloadReport(teacher){
    const lines = [
      'Smart Learning - Teacher Performance Report',
      'Teacher: '+teacher.name+(teachingText(teacher) ? ' ('+teachingText(teacher)+')' : ''),
      'Generated: '+formatDateTime(new Date()),
      '',
      'Attendance: '+(teacher.attendance ?? '–')+'%',
      'Performance: '+(teacher.performance ?? '–')+'%',
      'Average learner rating: '+avgText(teacher.ratings.average)+' / 5 ('+teacher.ratings.count+' responses)',
      'Assigned interventions completed: Yes',
      '',
      'Rating breakdown:',
      ...teacher.ratings.distribution.map(d=>`  ${d.stars} stars: ${d.count}`),
    ].join('\n');
    saveTextFile(teacher.name.replace(/\s+/g,'_')+'-performance-report.txt', lines);
  }

  return (
    <div>
      {error && <p className="field-error">{error}</p>}
      {/* every teacher at a glance, behind a button; pick one to review below */}
      <div className="card card-principal">
        <SectionHead icon="cap" title={t('principal_teachers_title')}>
          {selected && (
            <button className={'btn'+(s.showTeacherList?' btn-primary':'')} onClick={()=>update(st=>{ st.principal.showTeacherList = !st.principal.showTeacherList; })}>
              {s.showTeacherList ? t('principal_hide_teachers_btn') : t('principal_see_teachers_btn')}
            </button>
          )}
        </SectionHead>
        {!selected && <p className="muted">{t('principal_teachers_empty')}</p>}
        {selected && (s.showTeacherList ? teachers.map(tc=>{
          const isSelected = tc.id===selected.id;
          return (
            <div key={tc.id} className="row" onClick={()=>update(st=>{ st.principal.selectedTeacherId = tc.id; })}
              style={{ cursor:'pointer', ...(isSelected ? { background:'color-mix(in srgb, var(--principal) 10%, transparent)', borderRadius:10, paddingLeft:8, paddingRight:8 } : {}) }}>
              <div>
                <b>{tc.name}</b>
                <div className="meta">{teachingText(tc)}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span className="meta" style={{ display:'flex', alignItems:'center', gap:2 }}>{avgText(tc.ratings.average)+' '}<Icon name="star"/>{' · '+tc.ratings.count}</span>
                <WorkPill workDone={tc.workDone}/>
              </div>
            </div>
          );
        }) : <p className="muted">{t('principal_teachers_hint',{ name:selected.name })}</p>)}
      </div>

      {/* department reports submitted by HODs, most recent first */}
      <div className="card card-principal" style={{ marginTop:14 }}>
        <SectionHead icon="file" title={t('principal_reports_title')}/>
        {reports.length===0 && <p className="muted">{t('principal_reports_empty')}</p>}
        {reports.map(rep=>(
          <div key={rep.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div>
              <b>{deptLabel(rep.dept)}</b>
              <div className="meta">{t('principal_reports_caption',{ dept:rep.hodName || deptLabel(rep.dept), time:formatDateTime(rep.sentAt) })}</div>
            </div>
            {(rep.rows || []).map(row=>(
              <div key={row.teacherId || row.name} className="row" style={{ padding:'4px 0', border:'none', fontSize:12 }}>
                <span style={{ flex:1 }}>{row.name+' — '+teachingText(row)}</span>
                <span className="meta" style={{ display:'flex', alignItems:'center', gap:2 }}>{(row.attendance ?? '–')+'% att · '+(row.performance ?? '–')+'% perf · '+avgText(row.avgRating)+' '}<Icon name="star"/></span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <div className="grid grid-2" style={{ marginTop:14 }}>
          <div className="card card-principal">
            <SectionHead icon="clipboard" title={t('principal_oversight_title')} aside={selected.name}/>
            {selected.workDone===null && (
              <>
                <p className="muted">{t('principal_ask')}</p>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn" disabled={busy} onClick={()=>setWorkDone(false)}>{t('principal_not_yet')}</button>
                  <button className="btn btn-primary" disabled={busy} onClick={()=>setWorkDone(true)}>{t('principal_yes')}</button>
                </div>
              </>
            )}
            {selected.workDone===false && (
              <>
                <p><span className="pill pill-bad">{t('principal_reminder_pill')}</span></p>
                <p className="muted">{t('principal_reminder_note')}</p>
                <button className="btn btn-primary" style={{ marginTop:8 }} disabled={busy} onClick={()=>setWorkDone(true)}>{t('principal_yes')}</button>
              </>
            )}
            {selected.workDone===true && (
              <>
                <p><span className="pill pill-good">{t('principal_work_done_pill')}</span></p>
                <button className="btn btn-primary" style={{ marginTop:8 }} onClick={()=>downloadReport(selected)}><Icon name="download"/>{' '+t('principal_download_btn')}</button>
              </>
            )}
          </div>

          <div className="card card-principal">
            <SectionHead icon="star" title={t('principal_ratings_title')} aside={selected.name}/>
            <div className="stat">
              <div className="num">{avgText(selected.ratings.average)+' / 5'}</div>
              <div className="lbl">{t('principal_ratings_caption',{ n:selected.ratings.count })}</div>
            </div>
            {selected.ratings.distribution.map(d=>(
              <div key={d.stars} className="row" style={{ padding:'5px 0', border:'none' }}>
                <span className="meta" style={{ width:34, display:'flex', alignItems:'center', gap:2 }}>{String(d.stars)}<Icon name="star"/></span>
                <div className="bar" style={{ flex:1, margin:'0 8px' }}><span style={{ width:(selected.ratings.count ? d.count/Math.max(...selected.ratings.distribution.map(x=>x.count)) : 0)*100+'%', background:'var(--principal)' }}/></div>
                <span className="meta">{String(d.count)}</span>
              </div>
            ))}
            <textarea rows="2" maxLength={2000} placeholder={t('principal_feedback_placeholder')} style={{ marginTop:10 }} value={drafts[selected.id] || ''}
              onChange={(e)=>{ const v = e.target.value; setDrafts(d=>({ ...d, [selected.id]:v })); setSent(x=>({ ...x, [selected.id]:false })); }}/>
            <button className="btn btn-primary" style={{ marginTop:8 }} disabled={busy || !(drafts[selected.id] || '').trim()} onClick={sendFeedback}>{t('principal_send_feedback')}</button>
            {sent[selected.id] && <p className="ai-note"><Icon name="check"/>{' '+t('principal_feedback_sent_alert',{ teacher:selected.name })}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
