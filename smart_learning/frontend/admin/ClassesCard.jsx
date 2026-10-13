import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { GRADES } from '../src/data/seed.js'
import { SectionHead, GradeSelect, SubjectSelect } from '../src/components/ui.jsx'
import { classLabel } from '../src/services/classes.js'

// The administrator sets up the classes (subject groups): a name like 10A, the grade, the
// subject, the teacher and the learners. Teachers then see only their own classes, and
// learners only get quizzes and papers sent to the classes they are in.
export default function ClassesCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const draft = s.newClass;
  const editDraft = (fn)=>update(st=>fn(st.admin.newClass));
  const teachers = s.users.filter(u=>u.role==='teacher');
  const learners = s.users.filter(u=>u.role==='learner');
  const nameOf = (id)=>(s.users.find(u=>u.id===id)||{}).name;
  const sorted = [...s.classes].sort((a,b)=>GRADES.indexOf(a.grade)-GRADES.indexOf(b.grade)
    || a.name.localeCompare(b.name) || t(a.subjectKey).localeCompare(t(b.subjectKey)));

  function addClass(e){
    e.preventDefault();
    const name = draft.name.trim().toUpperCase();
    update(st=>{
      const a = st.admin;
      if(!name){ a.classError = 'admin_class_error_name'; return; }
      if(a.classes.some(c=>c.name===name && c.grade===draft.grade && c.subjectKey===draft.subjectKey)){ a.classError = 'admin_class_error_taken'; return; }
      a.classError = null;
      a.classes.push({ id:a.nextClassId++, name, grade:draft.grade, subjectKey:draft.subjectKey, teacherId:draft.teacherId ? Number(draft.teacherId) : null, learnerIds:[] });
      a.newClass.name = '';
    });
  }
  const editClass = (id, fn)=>update(st=>fn(st.admin.classes.find(c=>c.id===id)));
  const removeClass = (id)=>update(st=>{
    st.admin.classes = st.admin.classes.filter(c=>c.id!==id);
    // its quizzes and papers stop going to it; ones left with no class at all go too
    for(const key of ['quizzes','papers']){
      st.teacher[key].forEach(item=>{ item.classIds = item.classIds.filter(c=>c!==id); });
      st.teacher[key] = st.teacher[key].filter(item=>item.classIds.length>0);
    }
  });

  return (
    <>
      <div className="card card-admin">
        <SectionHead icon="cap" title={t('admin_classes_title')}/>
        <p className="muted" style={{ marginTop:-6 }}>{t('admin_classes_hint')}</p>
        <form className="pw-form" onSubmit={addClass}>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="newClassName">{t('admin_class_name_label')}</label>
              <input type="text" id="newClassName" placeholder={t('admin_class_name_placeholder')} value={draft.name} maxLength={10}
                onChange={(e)=>{ const v = e.target.value; editDraft(d=>{ d.name = v; }); }}/>
            </div>
            <div className="field">
              <label htmlFor="newClassGrade">{t('login_grade_label')}</label>
              <GradeSelect id="newClassGrade" value={draft.grade} onChange={(v)=>editDraft(d=>{ d.grade = v; })}/>
            </div>
            <div className="field">
              <label htmlFor="newClassSubject">{t('signup_subject_label')}</label>
              <SubjectSelect id="newClassSubject" value={draft.subjectKey} onChange={(v)=>editDraft(d=>{ d.subjectKey = v; })}/>
            </div>
            <div className="field">
              <label htmlFor="newClassTeacher">{t('admin_class_teacher_label')}</label>
              <select id="newClassTeacher" value={draft.teacherId} onChange={(e)=>{ const v = e.target.value; editDraft(d=>{ d.teacherId = v; }); }}>
                <option value=''>{t('admin_class_teacher_later')}</option>
                {teachers.map(tc=><option key={tc.id} value={tc.id}>{tc.name+(tc.subjectKey ? ' · '+t(tc.subjectKey) : '')}</option>)}
              </select>
            </div>
          </div>
          {s.classError && <p className="field-error" style={{ margin:0 }}>{t(s.classError)}</p>}
          <div><button type="submit" className="btn btn-primary">{'+ '+t('admin_add_class_btn')}</button></div>
        </form>
      </div>

      <div className="card card-admin" style={{ marginTop:14 }}>
        <SectionHead icon="users" title={t('admin_class_list_title')} aside={t('admin_class_count',{ n:s.classes.length })}/>
        {sorted.length===0 && <p className="muted">{t('admin_classes_empty')}</p>}
        <div className="user-list">
          {sorted.map(c=>{
            const addable = learners.filter(l=>l.grade===c.grade && !c.learnerIds.includes(l.id));
            return (
              <div key={c.id} className="user-row">
                <div className="user-main">
                  <div className="user-name"><b>{classLabel(c, t)}</b><span className="meta">{t('grade_'+c.grade)}</span></div>
                  <div className="child-links">
                    <span className="meta">{t('admin_class_teacher_label')+':'}</span>
                    <select value={c.teacherId ?? ''} onChange={(e)=>{ const v = e.target.value; editClass(c.id, x=>{ x.teacherId = v ? Number(v) : null; }); }}>
                      <option value=''>{t('admin_class_no_teacher')}</option>
                      {teachers.map(tc=><option key={tc.id} value={tc.id}>{tc.name}</option>)}
                    </select>
                  </div>
                  <div className="child-links">
                    <span className="meta">{t('admin_class_learners_label')}</span>
                    {c.learnerIds.length===0 && <span className="pill pill-warn">{t('admin_class_no_learners')}</span>}
                    {c.learnerIds.map(id=>(
                      <span key={id} className="child-chip">
                        {nameOf(id)}
                        <button title={t('admin_class_remove_learner_title')} aria-label={t('admin_class_remove_learner_title')+' '+nameOf(id)}
                          onClick={()=>editClass(c.id, x=>{ x.learnerIds = x.learnerIds.filter(l=>l!==id); })}>×</button>
                      </span>
                    ))}
                    {addable.length>0 && (
                      <select value='' onChange={(e)=>{ const v = Number(e.target.value); if(v) editClass(c.id, x=>{ x.learnerIds.push(v); }); }}>
                        <option value=''>{t('admin_class_add_learner')}</option>
                        {addable.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <div className="user-actions">
                  <button className="btn btn-danger" onClick={()=>removeClass(c.id)}>{t('admin_remove_class_btn')}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
