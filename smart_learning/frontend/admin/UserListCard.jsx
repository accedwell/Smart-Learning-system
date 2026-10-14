import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ROLES } from '../src/data/seed.js'
import { SectionHead } from '../src/components/ui.jsx'
import { apiGet, apiPost, apiRequest, errorText } from '../src/services/api.js'
import { Avatar, RolePill } from '../src/components/RoleBadges.jsx'
import InviteEmailCard from './InviteEmailCard.jsx'

// every account in the school (from the backend): search, filter by role, pair parents with
// their children, resend login details and remove people
export default function UserListCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const token = state.auth.token;
  const [users, setUsers] = useState(null); // null while loading
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/admin/users', token), apiGet('/admin/classes', token)]).then(([ur, cr])=>{
      if(cancelled) return;
      if(ur.error){ setError(errorText(t, ur.error)); setUsers([]); return; }
      setUsers(ur.data.users);
      if(cr.data) setClasses(cr.data.classes);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  const all = users || [];
  const learners = all.filter(u=>u.role==='learner');
  const nameOf = (id)=>(all.find(u=>u.id===id)||{}).name;
  const parentsOf = (learnerId)=>all.filter(u=>u.role==='parent' && (u.childIds||[]).includes(learnerId));
  const q = query.trim().toLowerCase();
  const shown = all.filter(u=>(s.userFilter==='all' || u.role===s.userFilter)
    && (!q || u.name.toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)));
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
  async function resendLogin(user){
    const { data, error: err } = await apiPost(`/admin/users/${user.id}/reset-login`, {}, token);
    if(err) return setError(errorText(t, err));
    setUsers(list=>list.map(u=>(u.id===user.id ? { ...u, mustChangePassword:true } : u)));
    update(st=>{ st.admin.lastInvite = data.invite; });
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
        {shown.map(u=>{
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
                <div className="meta">{u.email || '—'}{u.role==='learner' && u.grade ? ' · '+t('grade_'+u.grade) : ''}{u.role==='teacher' && u.subjectKey ? ' · '+t(u.subjectKey) : ''}
                  {(u.role==='learner' || u.role==='teacher') && classNamesOf(u) ? ' · '+t('admin_user_classes',{ classes:classNamesOf(u) }) : ''}</div>
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
                  {u.email && <button className="btn" onClick={()=>resendLogin(u)}>{t('admin_resend_btn')}</button>}
                  <button className="btn btn-danger" onClick={()=>removeUser(u)}>{t('admin_remove_user_btn')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
