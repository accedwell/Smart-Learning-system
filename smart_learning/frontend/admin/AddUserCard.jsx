import { useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, GradeSelect, SubjectSelect } from '../src/components/ui.jsx'
import { RoleSelect, DeptSelect } from '../src/auth/authParts.jsx'
import { findAccount, generateTempPassword, isValidEmail } from '../src/services/accounts.js'
import InviteEmailCard from './InviteEmailCard.jsx'

// the administrator creates the account for every learner and staff member (nobody
// signs up themselves) and emails each new person a temporary password they replace
// on first login
export default function AddUserCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const draft = s.newUser;
  const [error, setError] = useState(null);
  const editDraft = (fn)=>update(st=>fn(st.admin.newUser));
  const learners = s.users.filter(u=>u.role==='learner');

  function addUser(e){
    e.preventDefault();
    const name = draft.name.trim();
    const email = draft.email.trim();
    if(!name) return setError('admin_error_name');
    if(!isValidEmail(email)) return setError('admin_error_email');
    if(findAccount(s.users, email)) return setError('admin_error_email_taken');
    setError(null);
    const tempPassword = generateTempPassword();
    const role = draft.role;
    const details = role==='learner' ? { grade:draft.grade, idNumber:draft.idNumber.trim() }
      : role==='teacher' ? { subjectKey:draft.subjectKey }
      : role==='hod' ? { dept:draft.dept }
      : role==='parent' ? { childIds: draft.childId ? [Number(draft.childId)] : [] } : {};
    update(st=>{
      const a = st.admin;
      a.users.push({ id:a.nextUserId++, name, email, role, password:tempPassword, mustChangePassword:true, ...details });
      a.lastInvite = { name, email, role, tempPassword };
      a.newUser.name = '';
      a.newUser.email = '';
      a.newUser.idNumber = '';
      a.newUser.childId = '';
    });
  }

  return (
    <div className="card card-admin">
      <SectionHead icon="edit" title={t('admin_add_title')}/>
      <p className="muted" style={{ marginTop:-6 }}>{t('admin_add_user_hint')}</p>

      <form className="pw-form" onSubmit={addUser}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="newUserName">{t('signup_name_label')}</label>
            <input type="text" id="newUserName" placeholder={t('admin_user_name_placeholder')} value={draft.name}
              onChange={(e)=>{ const v = e.target.value; editDraft(d=>{ d.name = v; }); }}/>
          </div>
          <div className="field">
            <label htmlFor="newUserEmail">{t('signup_email_label')}</label>
            <input type="email" id="newUserEmail" placeholder={t('admin_user_email_placeholder')} value={draft.email}
              onChange={(e)=>{ const v = e.target.value; editDraft(d=>{ d.email = v; }); }}/>
          </div>
          <div className="field">
            <label htmlFor="newUserRole">{t('admin_role_label')}</label>
            <RoleSelect id="newUserRole" value={draft.role} onChange={(v)=>editDraft(d=>{ d.role = v; })}/>
          </div>
          {draft.role==='learner' && (
            <div className="field">
              <label>{t('login_grade_label')}</label>
              <GradeSelect value={draft.grade} onChange={(v)=>editDraft(d=>{ d.grade = v; })}/>
            </div>
          )}
          {draft.role==='learner' && (
            <div className="field">
              <label htmlFor="newUserIdNumber">{t('login_id_label')}</label>
              <input type="text" id="newUserIdNumber" placeholder={t('login_id_placeholder')} value={draft.idNumber}
                onChange={(e)=>{ const v = e.target.value; editDraft(d=>{ d.idNumber = v; }); }}/>
            </div>
          )}
          {draft.role==='teacher' && (
            <div className="field">
              <label>{t('signup_subject_label')}</label>
              <SubjectSelect value={draft.subjectKey} onChange={(v)=>editDraft(d=>{ d.subjectKey = v; })}/>
            </div>
          )}
          {draft.role==='hod' && (
            <div className="field">
              <label>{t('hod_dept_select_label')}</label>
              <DeptSelect value={draft.dept} onChange={(v)=>editDraft(d=>{ d.dept = v; })}/>
            </div>
          )}
          {draft.role==='parent' && (
            <div className="field">
              <label>{t('admin_child_link_label')}</label>
              <select value={draft.childId} onChange={(e)=>{ const v = e.target.value; editDraft(d=>{ d.childId = v; }); }}>
                <option value=''>{t('admin_link_later')}</option>
                {learners.map(l=><option key={l.id} value={l.id}>{l.name+(l.grade ? ' · '+t('grade_'+l.grade) : '')}</option>)}
              </select>
            </div>
          )}
        </div>
        {error && <p className="field-error" style={{ margin:0 }}>{t(error)}</p>}
        <div><button type="submit" className="btn btn-primary">{'+ '+t('admin_add_user_btn')}</button></div>
      </form>

      {s.lastInvite && (
        <div style={{ marginTop:16 }}>
          <InviteEmailCard invite={s.lastInvite} onClose={()=>update(st=>{ st.admin.lastInvite = null; })}/>
        </div>
      )}
    </div>
  );
}
