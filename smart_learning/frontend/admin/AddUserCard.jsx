import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, GradeSelect, SubjectSelect } from '../src/components/ui.jsx'
import { RoleSelect, DeptSelect } from '../src/auth/authParts.jsx'
import { isValidEmail } from '../src/services/accounts.js'
import { apiGet, apiPost, errorText } from '../src/services/api.js'
import InviteEmailCard from './InviteEmailCard.jsx'

// the administrator creates the account for every learner and staff member (nobody
// signs up themselves). The backend saves it with a temporary password and hands back the
// invite, which the administrator emails to the new person; they replace the password on
// first login.
export default function AddUserCard(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const token = state.auth.token;
  const draft = s.newUser;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [learners, setLearners] = useState([]); // for linking a new parent to their child
  const editDraft = (fn)=>update(st=>fn(st.admin.newUser));

  useEffect(()=>{
    let cancelled = false;
    apiGet('/admin/users?role=learner', token).then(({ data })=>{
      if(!cancelled && data) setLearners(data.users);
    });
    return ()=>{ cancelled = true; };
  }, [token]);

  async function addUser(e){
    e.preventDefault();
    const name = draft.name.trim();
    const email = draft.email.trim();
    if(!name) return setError(t('admin_error_name'));
    if(!isValidEmail(email)) return setError(t('admin_error_email'));
    setError(null);
    const role = draft.role;
    const details = role==='learner' ? { grade:draft.grade, idNumber:draft.idNumber.trim() }
      : role==='teacher' ? { subjectKey:draft.subjectKey }
      : role==='hod' ? { dept:draft.dept }
      : role==='parent' && draft.childId ? { childId:Number(draft.childId) } : {};
    setBusy(true);
    const { data, error: err } = await apiPost('/admin/users', { name, email, role, ...details }, token);
    setBusy(false);
    if(err) return setError(errorText(t, err));
    update(st=>{
      const a = st.admin;
      a.lastInvite = data.invite;
      a.newUser.name = '';
      a.newUser.email = '';
      a.newUser.idNumber = '';
      a.newUser.childId = '';
    });
    if(role==='learner') setLearners(list=>[...list, data.user]);
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
        {error && <p className="field-error" style={{ margin:0 }}>{error}</p>}
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{'+ '+t('admin_add_user_btn')}</button></div>
      </form>

      {s.lastInvite && (
        <div style={{ marginTop:16 }}>
          <InviteEmailCard invite={s.lastInvite} onClose={()=>update(st=>{ st.admin.lastInvite = null; })}/>
        </div>
      )}
    </div>
  );
}
