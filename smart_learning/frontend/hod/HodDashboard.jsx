import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { DEPARTMENTS } from '../src/data/seed.js'
import { SectionHead, Icon, AiNote } from '../src/components/ui.jsx'
import { apiGet, apiPatch, apiPost, errorText } from '../src/services/api.js'

// The HOD's teachers, escalations and reports all come from the backend (/api/hod), so they
// are saved in the database, where the principal's dashboard reads them too.
export default function HodDashboard(){
  const { state } = useStore();
  const { t, lang } = useI18n();
  const token = state.auth.token;
  const [dept, setDept] = useState(state.hod.dept);
  const [teachers, setTeachers] = useState(null); // null while loading
  const [reports, setReports] = useState([]);
  const [suggestions, setSuggestions] = useState({}); // teacherId -> text
  const [busy, setBusy] = useState({}); // teacherId or 'report' -> true while a request runs
  const [error, setError] = useState(null);
  const currentDept = DEPARTMENTS.find(dep=>dep.id===dept) || DEPARTMENTS[0];

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/hod/teachers', token), apiGet('/hod/reports', token)]).then(([tr, rr])=>{
      if(cancelled) return;
      const failed = tr.error || rr.error;
      if(failed){ setError(errorText(t, failed)); setTeachers([]); return; }
      setDept(tr.data.dept);
      setTeachers(tr.data.teachers);
      setReports(rr.data.reports);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  async function run(key, request){
    setBusy(b=>({ ...b, [key]:true }));
    setError(null);
    const result = await request();
    setBusy(b=>({ ...b, [key]:false }));
    if(result.error) setError(errorText(t, result.error));
    return result;
  }

  async function setWorkDone(teacher, value){
    const { data } = await run(teacher.id, ()=>apiPatch(`/hod/teachers/${teacher.id}/work-done`, { workDone:value }, token));
    if(!data) return;
    setTeachers(list=>list.map(tc=>tc.id===teacher.id ? data.teacher : tc));
  }

  async function suggestIntervention(teacher){
    setSuggestions(s=>({ ...s, [teacher.id]:t('chat_thinking') }));
    const { data } = await run(teacher.id, ()=>apiPost(`/hod/teachers/${teacher.id}/suggestion`, { lang }, token));
    setSuggestions(s=>{
      const next = { ...s };
      if(data && data.suggestion) next[teacher.id] = data.suggestion;
      else delete next[teacher.id];
      return next;
    });
  }

  // compiles attendance, performance and ratings for every teacher in this department into
  // one report on the principal's dashboard
  async function sendReport(){
    const { data } = await run('report', ()=>apiPost('/hod/reports', {}, token));
    if(!data) return;
    setReports(list=>[data.report, ...list]);
  }

  const ratingText = (tc)=>tc.ratings.average==null ? t('hod_no_ratings') : tc.ratings.average.toFixed(1);
  const lastReport = reports[0];

  return (
    <div className="card-hod role-scope">
      <div className="card card-hod">
        <SectionHead icon="building" title={t('hod_dept_title')} aside={t(currentDept.labelKey)}/>
        {error && <p className="field-error">{error}</p>}
        {teachers===null && <p className="muted">{t('hod_loading')}</p>}
        {teachers && teachers.length===0 && !error && <p className="muted">{t('hod_teachers_empty')}</p>}
        {teachers && teachers.map(tc=>(
          <div key={tc.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div>
                <b>{tc.name}</b>
                <div className="meta">
                  {(tc.gradeKey ? t(tc.gradeKey)+' ' : '')+t(tc.subjectKey)+' · '+ratingText(tc)+' '}
                  {tc.ratings.average!=null && <><Icon name="star"/>{' · '+t('hod_avg_caption',{ n:tc.ratings.count })}</>}
                </div>
              </div>
              {tc.workDone===false
                ? <span className="pill pill-bad">{t('hod_escalated_pill')}</span>
                : <span className="pill pill-good">{t('hod_on_track_pill')}</span>}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn" disabled={busy[tc.id]} onClick={()=>suggestIntervention(tc)}>{t('hod_suggest_btn')}</button>
              {tc.workDone===false
                ? <button className="btn" disabled={busy[tc.id]} onClick={()=>setWorkDone(tc, null)}>{t('hod_clear_flag_btn')}</button>
                : <button className="btn btn-primary" disabled={busy[tc.id]} onClick={()=>setWorkDone(tc, false)}>{t('hod_escalate_btn')}</button>}
            </div>
            {suggestions[tc.id] && <AiNote label={t('hod_ai_prefix')}>{suggestions[tc.id]}</AiNote>}
            {tc.workDone===false && <p className="muted" style={{ margin:'2px 0 0', fontSize:11 }}><Icon name="inbox"/>{' '+t('hod_escalate_note')}</p>}
          </div>
        ))}
      </div>

      <div className="card card-hod" style={{ marginTop:14 }}>
        <SectionHead icon="file" title={t('hod_report_title')}/>
        <p className="muted">{t('hod_report_desc')}</p>
        {teachers && teachers.length>0 && (
          <>
            <div className="row" style={{ border:'none', padding:'6px 0', fontSize:11, fontWeight:800, color:'var(--ink-soft)' }}>
              <span style={{ flex:1 }}>{t('hod_report_col_teacher')}</span>
              <span style={{ width:80, textAlign:'right' }}>{t('hod_report_col_attendance')}</span>
              <span style={{ width:80, textAlign:'right' }}>{t('hod_report_col_performance')}</span>
              <span style={{ width:60, textAlign:'right' }}>{t('hod_report_col_rating')}</span>
            </div>
            {teachers.map(tc=>(
              <div key={tc.id} className="row" style={{ padding:'6px 0' }}>
                <span style={{ flex:1 }}>{tc.name}</span>
                <span style={{ width:80, textAlign:'right' }}>{tc.attendance==null ? '—' : tc.attendance+'%'}</span>
                <span style={{ width:80, textAlign:'right' }}>{tc.performance==null ? '—' : tc.performance+'%'}</span>
                <span style={{ width:60, textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:2 }}>
                  {tc.ratings.average==null ? '—' : <>{tc.ratings.average.toFixed(1)+' '}<Icon name="star"/></>}
                </span>
              </div>
            ))}
          </>
        )}
        <button className="btn btn-primary" style={{ marginTop:10 }} disabled={!teachers || teachers.length===0 || busy.report} onClick={sendReport}>{t('hod_report_send_btn')}</button>
        {lastReport && <p className="ai-note"><Icon name="check"/>{' '+t('hod_report_last_sent',{ time:formatTime(lastReport.sentAt) })}</p>}
      </div>
    </div>
  );
}

function formatTime(value){
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}
