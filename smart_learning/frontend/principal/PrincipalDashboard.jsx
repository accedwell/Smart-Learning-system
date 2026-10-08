import { useStore } from '../src/store/AppStore.jsx'
import { teacherAvg } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { saveTextFile } from '../src/services/downloads.js'

function WorkPill({ workDone }){
  const { t } = useI18n();
  if(workDone===true) return <span className="pill pill-good">{t('principal_work_done_pill')}</span>;
  if(workDone===false) return <span className="pill pill-bad">{t('principal_reminder_pill')}</span>;
  return <span className="pill pill-warn">{t('principal_ask_pill')}</span>;
}

export default function PrincipalDashboard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.principal;
  const selected = s.teachers.find(tc=>tc.id===s.selectedTeacherId) || s.teachers[0];
  const editSelected = (fn)=>update(st=>fn(st.principal.teachers.find(tc=>tc.id===selected.id)));
  const dist = [5,4,3,2,1].map(v=>selected.ratings.filter(r=>r===v).length);
  const maxD = Math.max(...dist, 1);

  function downloadReport(teacher){
    const lines = [
      'Smart Learning - Teacher Performance Report',
      'Teacher: '+teacher.name+' ('+t(teacher.gradeKey)+' '+t(teacher.subjectKey)+')',
      'Generated: '+new Date().toLocaleString(),
      '',
      'Average learner rating: '+teacherAvg(teacher).toFixed(2)+' / 5 ('+teacher.ratings.length+' responses)',
      'Assigned interventions completed: Yes',
      '',
      'Rating breakdown:',
      ...[5,4,3,2,1].map(v=>`  ${v} stars: ${teacher.ratings.filter(r=>r===v).length}`),
    ].join('\n');
    saveTextFile(teacher.name.replace(/\s+/g,'_')+'-performance-report.txt', lines);
  }

  return (
    <div>
      {/* every teacher at a glance, behind a button; pick one to review below */}
      <div className="card card-principal">
        <SectionHead icon="cap" title={t('principal_teachers_title')}>
          <button className={'btn'+(s.showTeacherList?' btn-primary':'')} onClick={()=>update(st=>{ st.principal.showTeacherList = !st.principal.showTeacherList; })}>
            {s.showTeacherList ? t('principal_hide_teachers_btn') : t('principal_see_teachers_btn')}
          </button>
        </SectionHead>
        {s.showTeacherList ? s.teachers.map(tc=>{
          const isSelected = tc.id===selected.id;
          return (
            <div key={tc.id} className="row" onClick={()=>update(st=>{ st.principal.selectedTeacherId = tc.id; })}
              style={{ cursor:'pointer', ...(isSelected ? { background:'color-mix(in srgb, var(--principal) 10%, transparent)', borderRadius:10, paddingLeft:8, paddingRight:8 } : {}) }}>
              <div>
                <b>{tc.name}</b>
                <div className="meta">{t(tc.gradeKey)+' · '+t(tc.subjectKey)}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span className="meta" style={{ display:'flex', alignItems:'center', gap:2 }}>{teacherAvg(tc).toFixed(1)+' '}<Icon name="star"/>{' · '+tc.ratings.length}</span>
                <WorkPill workDone={tc.workDone}/>
              </div>
            </div>
          );
        }) : <p className="muted">{t('principal_teachers_hint',{ name:selected.name })}</p>}
      </div>

      {/* department reports submitted by HODs, most recent first */}
      <div className="card card-principal" style={{ marginTop:14 }}>
        <SectionHead icon="file" title={t('principal_reports_title')}/>
        {s.reports.length===0 && <p className="muted">{t('principal_reports_empty')}</p>}
        {s.reports.slice().reverse().map(rep=>(
          <div key={rep.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div>
              <b>{t(rep.deptLabelKey)}</b>
              <div className="meta">{t('principal_reports_caption',{ dept:t(rep.deptLabelKey), time:rep.sentAt })}</div>
            </div>
            {rep.rows.map(row=>(
              <div key={row.name} className="row" style={{ padding:'4px 0', border:'none', fontSize:12 }}>
                <span style={{ flex:1 }}>{row.name+' — '+t(row.gradeKey)+' '+t(row.subjectKey)}</span>
                <span className="meta" style={{ display:'flex', alignItems:'center', gap:2 }}>{row.attendance+'% att · '+row.performance+'% perf · '+row.avgRating.toFixed(1)+' '}<Icon name="star"/></span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop:14 }}>
        <div className="card card-principal">
          <SectionHead icon="clipboard" title={t('principal_oversight_title')} aside={selected.name}/>
          {selected.workDone===null && (
            <>
              <p className="muted">{t('principal_ask')}</p>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" onClick={()=>editSelected(tc=>{ tc.workDone = false; })}>{t('principal_not_yet')}</button>
                <button className="btn btn-primary" onClick={()=>editSelected(tc=>{ tc.workDone = true; })}>{t('principal_yes')}</button>
              </div>
            </>
          )}
          {selected.workDone===false && (
            <>
              <p className="pill pill-bad">{t('principal_reminder_pill')}</p>
              <p className="muted">{t('principal_reminder_note')}</p>
            </>
          )}
          {selected.workDone===true && (
            <>
              <p className="pill pill-good">{t('principal_work_done_pill')}</p>
              <button className="btn btn-primary" style={{ marginTop:8 }} onClick={()=>downloadReport(selected)}><Icon name="download"/>{' '+t('principal_download_btn')}</button>
            </>
          )}
        </div>

        <div className="card card-principal">
          <SectionHead icon="star" title={t('principal_ratings_title')} aside={selected.name}/>
          <div className="stat">
            <div className="num">{teacherAvg(selected).toFixed(1)+' / 5'}</div>
            <div className="lbl">{t('principal_ratings_caption',{ n:selected.ratings.length })}</div>
          </div>
          {dist.map((count,i)=>(
            <div key={i} className="row" style={{ padding:'5px 0', border:'none' }}>
              <span className="meta" style={{ width:34, display:'flex', alignItems:'center', gap:2 }}>{String(5-i)}<Icon name="star"/></span>
              <div className="bar" style={{ flex:1, margin:'0 8px' }}><span style={{ width:(count/maxD)*100+'%', background:'var(--principal)' }}/></div>
              <span className="meta">{String(count)}</span>
            </div>
          ))}
          <textarea rows="2" placeholder={t('principal_feedback_placeholder')} style={{ marginTop:10 }} value={selected.feedback}
            onChange={(e)=>{ const v = e.target.value; editSelected(tc=>{ tc.feedback = v; }); }}/>
          <button className="btn btn-primary" style={{ marginTop:8 }} onClick={()=>editSelected(tc=>{ tc.feedbackSent = !!tc.feedback.trim(); })}>{t('principal_send_feedback')}</button>
          {selected.feedbackSent && <p className="ai-note"><Icon name="check"/>{' '+t('principal_feedback_sent_alert',{ teacher:selected.name })}</p>}
        </div>
      </div>
    </div>
  );
}
