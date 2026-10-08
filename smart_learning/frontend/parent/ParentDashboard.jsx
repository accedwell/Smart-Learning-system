import { useStore } from '../src/store/AppStore.jsx'
import { scoreClass } from '../src/store/metrics.js'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { saveTextFile } from '../src/services/downloads.js'

// a parent only ever sees the learners the school administrator linked to their account
export default function ParentDashboard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.parent;
  const users = state.admin.users;
  const me = users.find(u=>u.id===state.auth.userId);
  const children = ((me && me.childIds) || []).map(id=>users.find(u=>u.id===id && u.role==='learner')).filter(Boolean);

  if(children.length===0){
    return (
      <div className="card card-parent" style={{ maxWidth:560 }}>
        <SectionHead icon="users" title={t('parent_no_child_title')}/>
        <p className="muted">{t('parent_no_child')}</p>
      </div>
    );
  }

  const child = children.find(c=>c.id===s.selectedChildId) || children[0];
  const progress = child.progress || 0;
  const unread = s.notifications.filter(n=>!n.read).length;
  // this child's marks on their teacher's quizzes
  const marks = state.teacher.quizzes.flatMap(quiz=>{
    const r = (state.teacher.quizResults[quiz.id]||[]).find(x=>x.learnerId===child.id);
    return r ? [{ quiz, ...r }] : [];
  });

  function downloadChildReport(){
    const lines = [
      'Smart Learning - Learner Progress Report',
      'Learner: '+child.name+(child.grade ? ' ('+t('grade_'+child.grade)+')' : ''),
      'Generated: '+new Date().toLocaleString(),
      '',
      'Overall progress this term: '+progress+'%',
      '',
      'Quiz marks:',
      ...(marks.length ? marks.map(m=>`  - ${m.quiz.title} (${t(m.quiz.subjectKey)}): ${m.score}/${m.total}`) : ['  - none yet']),
      '',
      'Recent notifications:',
      ...s.notifications.map(n=>`  - [${t(n.timeKey)}] ${t(n.key,{ child:child.name })}`),
    ].join('\n');
    saveTextFile(child.name.replace(/\s+/g,'_')+'-progress-report.txt', lines);
  }

  return (
    <div>
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
          <button className="btn btn-primary" style={{ marginTop:12 }} onClick={downloadChildReport}><Icon name="download"/>{' '+t('parent_download_btn')}</button>
        </div>

        <div className="card card-parent">
          <SectionHead icon="bell" title={t('parent_notifications_title')}
            titleExtra={unread>0 && <span className="pill pill-bad" style={{ marginLeft:8 }}>{String(unread)}</span>}>
            {unread>0 && (
              <button className="btn" onClick={()=>update(st=>{ st.parent.notifications.forEach(n=>{ n.read = true; }); })}>{t('parent_mark_read')}</button>
            )}
          </SectionHead>
          {s.notifications.map(n=>(
            <div key={n.key} className="row">
              <div style={n.read ? undefined : { fontWeight:700 }}>{n.read ? '' : '● '}{t(n.key,{ child:child.name })}</div>
              <span className="meta">{t(n.timeKey)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-parent" style={{ marginTop:14 }}>
        <SectionHead icon="clipboard" title={t('parent_quiz_marks_title')} aside={child.name}/>
        {marks.length===0 && <p className="muted">{t('parent_quiz_marks_empty',{ child:child.name })}</p>}
        {marks.map(m=>(
          <div key={m.quiz.id} className="row">
            <div>
              <b>{m.quiz.title}</b>
              <div className="meta">{t(m.quiz.subjectKey)+' · '+t('grade_'+m.quiz.grade)}</div>
            </div>
            <span className={'pill pill-'+scoreClass(m.score/m.total)}>{m.score+'/'+m.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
