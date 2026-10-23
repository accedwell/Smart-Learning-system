import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ROLES } from '../src/data/seed.js'
import { SectionHead } from '../src/components/ui.jsx'
import { apiGet, apiPatch, apiPost, apiRequest, errorText } from '../src/services/api.js'
import { registerClasses } from '../src/services/classes.js'
import { Avatar, RolePill } from '../src/components/RoleBadges.jsx'
import InviteEmailCard from './InviteEmailCard.jsx'
import SubjectPicker from './SubjectPicker.jsx'

// every account in the school (from the backend): search, filter by role, pair parents with
// their children, resend login details and remove people. Learners are listed by grade, then
// by their class (10A, 10B, 10C).
export default function UserListCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const token = state.auth.token;
  const [users, setUsers] = useState(null); // null while loading
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // { id, subjects, error } while a learner's subjects are being changed

  const [reloads, setReloads] = useState(0);
  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/admin/users', token), apiGet('/admin/classes', token)]).then(([ur, cr])=>{
      if(cancelled) return;
      if(ur.error){ setError(errorText(t, ur.error)); setUsers([]); return; }
      setUsers(ur.data.users);
      if(cr.data) setClasses(cr.data.classes);
    });
    return ()=>{ cancelled = true; };
  }, [token, t, reloads]);

  // a learner's class: they move into that class's subject groups, so both lists reload
  async function setClass(user, className){
    const { error: err } = await apiPatch(`/admin/users/${user.id}`, { className }, token);
    if(err) return setError(errorText(t, err));
    setError(null);
    setReloads(n=>n+1);
  }

  const all = users || [];
  const learners = all.filter(u=>u.role==='learner');
  const nameOf = (id)=>(all.find(u=>u.id===id)||{}).name;
  const parentsOf = (learnerId)=>all.filter(u=>u.role==='parent' && (u.childIds||[]).includes(learnerId));
  const q = query.trim().toLowerCase();
  const shown = all.filter(u=>(s.userFilter==='all' || u.role===s.userFilter)
    && (!q || u.name.toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q) || (u.idNumber||'').includes(q)));
  const setFilter = (f)=>update(st=>{ st.admin.userFilter = f; });

  // puts a parent as the backend now has it into the list (and their children's parent lists)
  function replaceParent(parent){
    setUsers(list=>list.map(u=>{
      if(u.id===parent.id) return parent;
      if(u.role!=='learner') return u;
      const others = (u.parentIds||[]).filter(id=>id!==parent.id);
      return { ...u, parentIds: parent.childIds.includes(u.id) ? [...others, parent.id] : others };
    }));
  }
  // pairs a parent with a learner: the parent then sees only their linked children's progress
  async function linkChild(parentId, learnerId){
    const { data, error: err } = await apiPost(`/admin/parents/${parentId}/children`, { learnerId }, token);
    if(err) return setError(errorText(t, err));
    replaceParent(data.user);
  }
  async function unlinkChild(parentId, learnerId){
    const { data, error: err } = await apiRequest('DELETE', `/admin/parents/${parentId}/children/${learnerId}`, { token });
    if(err) return setError(errorText(t, err));
    replaceParent(data.user);
  }
  async function removeUser(user){
    if(!window.confirm(t('admin_remove_confirm',{ name:user.name }))) return;
    const { error: err } = await apiRequest('DELETE', `/admin/users/${user.id}`, { token });
    if(err) return setError(errorText(t, err));
    // a removed learner disappears from every parent it was linked to
    setUsers(list=>list.filter(u=>u.id!==user.id).map(u=>(u.childIds ? { ...u, childIds:u.childIds.filter(c=>c!==user.id) } : u)));
  }
  // "10A, 11A": the classes a learner is in or a teacher teaches
  const classNamesOf = (u)=>[...new Set(classes
    .filter(c=>u.role==='teacher' ? c.teacherId===u.id : (c.learnerIds||[]).includes(u.id))
    .map(c=>c.name))].join(', ');
  // issues a fresh temporary password and shows the login email again
  // a learner's 7 subjects: their lessons follow
  async function saveSubjects(user){
    const { data, error: err } = await apiRequest('PUT', `/admin/users/${user.id}/subjects`, { token, body:{ subjects:editing.subjects } });
    if(err) return setEditing(e=>({ ...e, error:errorText(t, err) }));
    setUsers(list=>list.map(u=>(u.id===user.id ? { ...u, subjects:data.user.subjects } : u)));
    setEditing(null);
  }

  async function resendLogin(user){
    const { data, error: err } = await apiPost(`/admin/users/${user.id}/reset-login`, {}, token);
    if(err) return setError(errorText(t, err));
    setUsers(list=>list.map(u=>(u.id===user.id ? { ...u, mustChangePassword:true } : u)));
    update(st=>{ st.admin.lastInvite = data.invite; });
  }

  function renderUser(u){
    const isMe = u.id===state.auth.apiUserId;
    return (
      <div key={u.id} className="user-row">
        <Avatar name={u.name} role={u.role}/>
        <div className="user-main">
          <div className="user-name">
            <b>{u.name}</b>
            <RolePill role={u.role}/>
            {u.mustChangePassword && <span className="pill pill-warn">{t('admin_awaiting_login_pill')}</span>}
          </div>
          <div className="meta">{u.email || (u.idNumber ? t('login_id_label')+': '+u.idNumber : '—')}{u.role==='learner' && u.grade ? ' · '+t('grade_'+u.grade) : ''}{u.role==='learner' && u.className ? ' · '+t('admin_user_class',{ name:u.className }) : ''}{u.role==='teacher' && u.subjectKey ? ' · '+t(u.subjectKey) : ''}
            {(u.role==='learner' || u.role==='teacher') && classNamesOf(u) && classNamesOf(u)!==u.className ? ' · '+t('admin_user_classes',{ classes:classNamesOf(u) }) : ''}</div>
          {u.role==='learner' && (
            <div className="meta">{t('profile_subjects_label')+': '}{(u.subjects||[]).length ? u.subjects.map(x=>t(x)).join(', ') : <span className="pill pill-warn">{t('admin_subjects_none')}</span>}</div>
          )}
          {editing && editing.id===u.id && (
            <div style={{ marginTop:8 }}>
              <SubjectPicker value={editing.subjects} onChange={(v)=>setEditing(e=>({ ...e, subjects:v, error:null }))}/>
              {editing.error && <p className="field-error">{editing.error}</p>}
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" onClick={()=>saveSubjects(u)}>{t('profile_save_btn')}</button>
                <button className="btn" onClick={()=>setEditing(null)}>{t('pw_cancel_btn')}</button>
              </div>
            </div>
          )}
          {u.role==='learner' && parentsOf(u.id).length>0 && (
            <div className="meta">{t('admin_parents_label')+' '+parentsOf(u.id).map(p=>p.name).join(', ')}</div>
          )}
          {u.role==='parent' && (
            <div className="child-links">
              <span className="meta">{t('admin_children_label')}</span>
              {(u.childIds||[]).length===0 && <span className="pill pill-warn">{t('admin_no_child_linked')}</span>}
              {(u.childIds||[]).map(cid=>(
                <span key={cid} className="child-chip">
                  {nameOf(cid)}
                  <button title={t('admin_unlink_title')} aria-label={t('admin_unlink_title')+' '+nameOf(cid)} onClick={()=>unlinkChild(u.id, cid)}>×</button>
                </span>
              ))}
              {learners.some(l=>!(u.childIds||[]).includes(l.id)) && (
                <select value='' onChange={(e)=>{ if(e.target.value) linkChild(u.id, Number(e.target.value)); }}>
                  <option value=''>{t('admin_link_child_placeholder')}</option>
                  {learners.filter(l=>!(u.childIds||[]).includes(l.id)).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
        {!isMe && (
          <div className="user-actions">
            {u.role==='learner' && (
            <select className="class-select" aria-label={t('admin_class_label')} value={u.className || ''} onChange={(e)=>setClass(u, e.target.value)}>
              <option value="">{t('admin_class_none')}</option>
              {registerClasses(u.grade).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {u.role==='learner' && <button className="btn" onClick={()=>setEditing({ id:u.id, subjects:u.subjects&&u.subjects.length ? u.subjects : ['subject_lo'], error:null })}>{t('admin_subjects_btn')}</button>}
            {(u.email || u.role==='learner') && <button className="btn" onClick={()=>resendLogin(u)}>{t('admin_resend_btn')}</button>}
            <button className="btn btn-danger" onClick={()=>removeUser(u)}>{t('admin_remove_user_btn')}</button>
          </div>
        )}
      </div>
    );
  }

  // learners: a section per grade, and in it one per class (all of 10A/10B/10C, even empty,
  // unless searching), then those not in a class yet
  const shownLearners = shown.filter(u=>u.role==='learner');
  const shownOthers = shown.filter(u=>u.role!=='learner');
  const grades = [...new Set(shownLearners.map(u=>u.grade || ''))].sort();
  function gradeSection(grade){
    const inGrade = shownLearners.filter(u=>(u.grade || '')===grade);
    const names = [...new Set([...(q ? [] : registerClasses(grade)), ...inGrade.map(u=>u.className).filter(Boolean)])].sort();
    const unplaced = inGrade.filter(u=>!u.className);
    return (
      <section key={'grade-'+grade} className="learner-grade">
        <h3 className="group-head">{grade ? t('grade_'+grade) : t('tab_learner')} <span className="meta">{t('admin_group_count',{ n:inGrade.length })}</span></h3>
        {names.map(name=>{
          const inClass = inGrade.filter(u=>u.className===name);
          return (
            <div key={name} className="class-group">
              <div className="class-group-head"><b>{name}</b><span className="meta">{t('admin_group_count',{ n:inClass.length })}</span></div>
              {inClass.length===0 && <p className="muted" style={{ margin:'4px 0 8px' }}>{t('admin_class_empty')}</p>}
              {inClass.map(renderUser)}
            </div>
          );
        })}
        {unplaced.length>0 && (
          <div className="class-group">
            <div className="class-group-head"><b>{t('admin_no_class_group')}</b><span className="meta">{t('admin_group_count',{ n:unplaced.length })}</span></div>
            {unplaced.map(renderUser)}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="card card-admin">
      <SectionHead icon="users" title={t('admin_users_title')} aside={users ? t('admin_users_count',{ n:shown.length, total:all.length }) : null}/>
      {error && <p className="field-error">{error}</p>}
      {users===null && <p className="muted">{t('online_loading')}</p>}

      {s.lastInvite && (
        <div style={{ marginBottom:14 }}>
          <InviteEmailCard invite={s.lastInvite} onClose={()=>update(st=>{ st.admin.lastInvite = null; })}/>
        </div>
      )}

      <input type="text" className="user-search" placeholder={t('admin_search_placeholder')} value={query} onChange={(e)=>setQuery(e.target.value)}/>
      <div className="subject-filter" style={{ marginTop:10 }}>
        <button className={s.userFilter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('admin_filter_all')}</button>
        {ROLES.map(r=><button key={r} className={s.userFilter===r?'active':''} onClick={()=>setFilter(r)}>{t('tab_'+r)}</button>)}
      </div>

      {users && shown.length===0 && <p className="muted">{t('admin_users_empty')}</p>}
      <div className="user-list">
        {grades.map(gradeSection)}
        {shownOthers.map(renderUser)}
      </div>
    </div>
  );
}
