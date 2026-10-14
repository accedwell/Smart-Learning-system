import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { GRADES } from '../src/data/seed.js'
import { SectionHead, GradeSelect, SubjectSelect } from '../src/components/ui.jsx'
import { apiGet, apiPost, apiPatch, apiRequest, errorText } from '../src/services/api.js'
import { classLabel } from '../src/services/classes.js'

// The administrator sets up the classes (subject groups): a name like 10A, the grade, the
// subject, the teacher and the learners. Teachers then see only their own classes, and
// learners only get quizzes, papers and online classes sent to the classes they are in.
// Everything is saved on the backend; the new-class form's draft stays in the store.
export default function ClassesCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const draft = state.admin.newClass;
  const editDraft = (fn)=>update(st=>fn(st.admin.newClass));
  const [classes, setClasses] = useState(null); // null while loading
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/admin/classes', token), apiGet('/admin/users', token)]).then(([cr, ur])=>{
      if(cancelled) return;
      const failed = cr.error || ur.error;
      if(failed){ setError(errorText(t, failed)); setClasses([]); return; }
      setClasses(cr.data.classes);
      setUsers(ur.data.users);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  const teachers = users.filter(u=>u.role==='teacher');
  const learners = users.filter(u=>u.role==='learner');
  const nameOf = (id)=>(users.find(u=>u.id===id)||{}).name;
  const sorted = [...(classes||[])].sort((a,b)=>GRADES.indexOf(a.grade)-GRADES.indexOf(b.grade)
    || a.name.localeCompare(b.name) || t(a.subjectKey).localeCompare(t(b.subjectKey)));

  // puts a class as the backend now has it into the list
  const replace = (c)=>setClasses(list=>list.map(x=>x.id===c.id ? c : x));

  async function run(request, onDone){
    setError(null);
    setBusy(true);
    const { data, error: err } = await request();
    setBusy(false);
    if(err) return setError(errorText(t, err));
    onDone(data);
  }

  function addClass(e){
    e.preventDefault();
    const name = draft.name.trim().toUpperCase();
    if(!name) return setError(t('admin_class_error_name'));
    run(()=>apiPost('/admin/classes', {
      name, grade:draft.grade, subjectKey:draft.subjectKey, teacherId: draft.teacherId ? Number(draft.teacherId) : null,
    }, token), (data)=>{
      setClasses(list=>[...list, data.class]);
      update(st=>{ st.admin.newClass.name = ''; });
    });
  }

  const setTeacher = (c, teacherId)=>run(()=>apiPatch(`/admin/classes/${c.id}`, { teacherId: teacherId ? Number(teacherId) : null }, token), (data)=>replace(data.class));
  const addLearner = (c, learnerId)=>run(()=>apiRequest('PUT', `/admin/classes/${c.id}/learners/${learnerId}`, { body:{}, token }), (data)=>replace(data.class));
  const removeLearner = (c, learnerId)=>run(()=>apiRequest('DELETE', `/admin/classes/${c.id}/learners/${learnerId}`, { token }), (data)=>replace(data.class));
  function removeClass(c){
    if(!window.confirm(t('admin_remove_class_confirm',{ name:classLabel(c, t) }))) return;
    run(()=>apiRequest('DELETE', `/admin/classes/${c.id}`, { token }), ()=>setClasses(list=>list.filter(x=>x.id!==c.id)));
  }

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
          {error && <p className="field-error" style={{ margin:0 }}>{error}</p>}
          <div><button type="submit" className="btn btn-primary" disabled={busy}>{'+ '+t('admin_add_class_btn')}</button></div>
        </form>
      </div>

      <div className="card card-admin" style={{ marginTop:14 }}>
        <SectionHead icon="users" title={t('admin_class_list_title')} aside={classes ? t('admin_class_count',{ n:classes.length }) : null}/>
        {classes===null && <p className="muted">{t('online_loading')}</p>}
        {classes && sorted.length===0 && <p className="muted">{t('admin_classes_empty')}</p>}
        <div className="user-list">
          {sorted.map(c=>{
            // only learners of the class's grade can join it
            const addable = learners.filter(l=>l.grade===c.grade && !c.learnerIds.includes(l.id));
            return (
              <div key={c.id} className="user-row">
                <div className="user-main">
                  <div className="user-name"><b>{classLabel(c, t)}</b><span className="meta">{t('grade_'+c.grade)}</span></div>
                  <div className="child-links">
                    <span className="meta">{t('admin_class_teacher_label')+':'}</span>
                    <select value={c.teacherId ?? ''} disabled={busy} onChange={(e)=>setTeacher(c, e.target.value)}>
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
                          disabled={busy} onClick={()=>removeLearner(c, id)}>×</button>
                      </span>
                    ))}
                    {addable.length>0 && (
                      <select value='' disabled={busy} onChange={(e)=>{ const v = Number(e.target.value); if(v) addLearner(c, v); }}>
                        <option value=''>{t('admin_class_add_learner')}</option>
                        {addable.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <div className="user-actions">
                  <button className="btn btn-danger" disabled={busy} onClick={()=>removeClass(c)}>{t('admin_remove_class_btn')}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
