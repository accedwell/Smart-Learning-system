import { useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ROLES } from '../src/data/seed.js'
import { SectionHead } from '../src/components/ui.jsx'
import { generateTempPassword } from '../src/services/accounts.js'
import { Avatar, RolePill } from '../src/components/RoleBadges.jsx'
import InviteEmailCard from './InviteEmailCard.jsx'

// every account in the school: search, filter by role, pair parents with their
// children, resend login details and remove people
export default function UserListCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const [query, setQuery] = useState('');
  const learners = s.users.filter(u=>u.role==='learner');
  const nameOf = (id)=>(s.users.find(u=>u.id===id)||{}).name;
  const parentsOf = (learnerId)=>s.users.filter(u=>u.role==='parent' && (u.childIds||[]).includes(learnerId));
  const q = query.trim().toLowerCase();
  const shown = s.users.filter(u=>(s.userFilter==='all' || u.role===s.userFilter)
    && (!q || u.name.toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)));
  const setFilter = (f)=>update(st=>{ st.admin.userFilter = f; });

  // pairs a parent with a learner: the parent then sees only their linked children's progress
  function linkChild(parentId, learnerId){
    update(st=>{
      const p = st.admin.users.find(u=>u.id===parentId);
      p.childIds = p.childIds || [];
      if(!p.childIds.includes(learnerId)) p.childIds.push(learnerId);
    });
  }
  function unlinkChild(parentId, learnerId){
    update(st=>{
      const p = st.admin.users.find(u=>u.id===parentId);
      p.childIds = (p.childIds||[]).filter(id=>id!==learnerId);
    });
  }
  function removeUser(id){
    update(st=>{
      st.admin.users = st.admin.users.filter(x=>x.id!==id);
      // a removed learner disappears from every parent it was linked to
      st.admin.users.forEach(u=>{ if(u.childIds) u.childIds = u.childIds.filter(c=>c!==id); });
    });
  }
  // issues a fresh temporary password and shows the login email again
  function resendLogin(user){
    const tempPassword = generateTempPassword();
    update(st=>{
      const u = st.admin.users.find(x=>x.id===user.id);
      u.password = tempPassword;
      u.mustChangePassword = true;
      st.admin.lastInvite = { name:u.name, email:u.email, role:u.role, tempPassword };
    });
  }

  return (
    <div className="card card-admin">
      <SectionHead icon="users" title={t('admin_users_title')} aside={t('admin_users_count',{ n:shown.length, total:s.users.length })}/>

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

      {shown.length===0 && <p className="muted">{t('admin_users_empty')}</p>}
      <div className="user-list">
        {shown.map(u=>{
          const isMe = u.id===state.auth.userId;
          return (
            <div key={u.id} className="user-row">
              <Avatar name={u.name} role={u.role}/>
              <div className="user-main">
                <div className="user-name">
                  <b>{u.name}</b>
                  <RolePill role={u.role}/>
                  {u.mustChangePassword && <span className="pill pill-warn">{t('admin_awaiting_login_pill')}</span>}
                </div>
                <div className="meta">{u.email || '—'}{u.role==='learner' && u.grade ? ' · '+t('grade_'+u.grade) : ''}{u.role==='teacher' && u.subjectKey ? ' · '+t(u.subjectKey) : ''}</div>
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
                  <button className="btn btn-danger" onClick={()=>removeUser(u.id)}>{t('admin_remove_user_btn')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
