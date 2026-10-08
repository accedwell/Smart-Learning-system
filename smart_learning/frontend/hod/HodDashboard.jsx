import { useStore } from '../src/store/AppStore.jsx'
import { teacherAvg } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { DEPARTMENTS } from '../src/data/seed.js'
import { SectionHead, Icon, AiNote } from '../src/components/ui.jsx'
import { askOneLiner, langNote } from '../src/services/ai.js'

export default function HodDashboard(){
  const { state, update } = useStore();
  const { t, lang } = useI18n();
  const h = state.hod;
  const currentDept = DEPARTMENTS.find(dep=>dep.id===h.dept) || DEPARTMENTS[0];
  const teachers = state.principal.teachers.filter(tc=>tc.dept===h.dept);
  const setWorkDone = (id, value)=>update(st=>{ st.principal.teachers.find(tc=>tc.id===id).workDone = value; });

  async function suggestIntervention(teacher){
    update(st=>{ st.hod.suggestion[teacher.id] = t('chat_thinking'); });
    const text = await askOneLiner(`${teacher.name} teaches ${t(teacher.gradeKey)} ${t(teacher.subjectKey)} at a school on a platform called Smart Learning, and has an average learner rating of ${teacherAvg(teacher).toFixed(1)}/5 from ${teacher.ratings.length} responses. In ONE short, practical sentence (max 25 words), suggest a concrete area of support or coaching the Head of Department could offer this teacher.${langNote(lang)}`);
    update(st=>{
      if(text) st.hod.suggestion[teacher.id] = text;
      else delete st.hod.suggestion[teacher.id];
    });
  }

  // compile attendance, performance and ratings for every teacher in this
  // department into one report on the principal's dashboard
  function sendReport(){
    const sentAt = new Date().toLocaleString();
    update(st=>{
      st.principal.reports.push({
        id: st.nextReportId++,
        dept: currentDept.id,
        deptLabelKey: currentDept.labelKey,
        sentAt,
        rows: teachers.map(tc=>({ name:tc.name, subjectKey:tc.subjectKey, gradeKey:tc.gradeKey, attendance:tc.attendance, performance:tc.performance, avgRating:teacherAvg(tc) })),
      });
      st.hod.lastReportSentAt = sentAt;
    });
  }

  return (
    <div className="card-hod role-scope">
      <div className="card card-hod">
        <SectionHead icon="building" title={t('hod_dept_title')} aside={t(currentDept.labelKey)}/>
        {teachers.length===0 && <p className="muted">{t('hod_teachers_empty')}</p>}
        {teachers.map(tc=>(
          <div key={tc.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
            <div className="row" style={{ border:'none', padding:0 }}>
              <div>
                <b>{tc.name}</b>
                <div className="meta">
                  {t(tc.gradeKey)+' '+t(tc.subjectKey)+' · '+teacherAvg(tc).toFixed(1)+' '}<Icon name="star"/>{' · '+t('hod_avg_caption',{ n:tc.ratings.length })}
                </div>
              </div>
              {tc.workDone===false
                ? <span className="pill pill-bad">{t('hod_escalated_pill')}</span>
                : <span className="pill pill-good">{t('hod_on_track_pill')}</span>}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn" onClick={()=>suggestIntervention(tc)}>{t('hod_suggest_btn')}</button>
              {tc.workDone===false
                ? <button className="btn" onClick={()=>setWorkDone(tc.id, null)}>{t('hod_clear_flag_btn')}</button>
                : <button className="btn btn-primary" onClick={()=>setWorkDone(tc.id, false)}>{t('hod_escalate_btn')}</button>}
            </div>
            {h.suggestion[tc.id] && <AiNote label={t('hod_ai_prefix')}>{h.suggestion[tc.id]}</AiNote>}
            {tc.workDone===false && <p className="muted" style={{ margin:'2px 0 0', fontSize:11 }}><Icon name="inbox"/>{' '+t('hod_escalate_note')}</p>}
          </div>
        ))}
      </div>

      <div className="card card-hod" style={{ marginTop:14 }}>
        <SectionHead icon="file" title={t('hod_report_title')}/>
        <p className="muted">{t('hod_report_desc')}</p>
        {teachers.length>0 && (
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
                <span style={{ width:80, textAlign:'right' }}>{tc.attendance+'%'}</span>
                <span style={{ width:80, textAlign:'right' }}>{tc.performance+'%'}</span>
                <span style={{ width:60, textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:2 }}>{teacherAvg(tc).toFixed(1)+' '}<Icon name="star"/></span>
              </div>
            ))}
          </>
        )}
        <button className="btn btn-primary" style={{ marginTop:10 }} onClick={sendReport}>{t('hod_report_send_btn')}</button>
        {h.lastReportSentAt && <p className="ai-note"><Icon name="check"/>{' '+t('hod_report_sent_note')}</p>}
      </div>
    </div>
  );
}
