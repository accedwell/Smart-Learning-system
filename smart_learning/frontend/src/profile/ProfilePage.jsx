import { useState } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { DEPARTMENTS } from '../data/seed.js'
import { SectionHead, Icon } from '../components/ui.jsx'
import { Avatar, RolePill } from '../components/RoleBadges.jsx'
import { findAccount, isValidEmail } from '../services/accounts.js'
import ChangePasswordForm from '../auth/ChangePasswordForm.jsx'

function DetailRow({ label, children }){
  return (
    <div className="row" style={{ padding:'9px 0' }}>
      <span className="meta">{label}</span>
      <span style={{ textAlign:'right', fontWeight:600 }}>{children}</span>
    </div>
  );
}

// "My Profile", the same page for every role: who you are, your editable contact
// details, the school details the administrator manages, and your password
export default function ProfilePage({ onBack }){
  const { state, update } = useStore();
  const { t } = useI18n();
  const auth = state.auth;
  const users = state.admin.users;
  const account = auth.userId!=null ? users.find(u=>u.id===auth.userId) : null;
  const person = account || { name:auth.name, email:'', role:auth.role, grade:auth.grade };

  const [name, setName] = useState(person.name||'');
  const [email, setEmail] = useState(person.email||'');
  const [phone, setPhone] = useState(person.phone||'');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  function saveDetails(e){
    e.preventDefault();
    const n = name.trim(), em = email.trim();
    if(!n) return setError('admin_error_name');
    if(!isValidEmail(em)) return setError('admin_error_email');
    const other = findAccount(users, em);
    if(other && other.id!==account.id) return setError('admin_error_email_taken');
    setError(null);
    update(s=>{
      const u = s.admin.users.find(x=>x.id===account.id);
      u.name = n; u.email = em; u.phone = phone.trim();
      s.auth.name = n; s.auth.email = em;
    });
    setSaved(true);
  }

  function savePassword(newPassword){
    update(s=>{
      const u = s.admin.users.find(x=>x.id===account.id);
      u.password = newPassword;
      u.mustChangePassword = false;
    });
    setPwSaved(true);
  }

  const dept = DEPARTMENTS.find(d=>d.id===person.dept);
  const children = (person.childIds||[]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
  const idNumber = person.idNumber || auth.idNumber;
  const staffNumber = auth.staffNumber;

  return (
    <div className="profile-page">
      <button className="btn" style={{ marginBottom:14 }} onClick={onBack}>{t('profile_back')}</button>

      <div className={'card card-'+person.role+' profile-head'}>
        <Avatar name={person.name} role={person.role} large/>
        <div style={{ minWidth:0 }}>
          <h2 style={{ margin:'0 0 6px', fontSize:22 }}>{person.name || t('tab_'+person.role)}</h2>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <RolePill role={person.role}/>
            {person.email && <span className="meta">{person.email}</span>}
          </div>
        </div>
      </div>

      {!account && <p className="ai-note" style={{ marginTop:14 }}>{t('profile_demo_note')}</p>}

      <div className="grid grid-2" style={{ marginTop:14 }}>
        {account && (
          <div className={'card card-'+person.role}>
            <SectionHead icon="edit" title={t('profile_details_title')}/>
            <form className="pw-form" onSubmit={saveDetails}>
              <div className="field">
                <label htmlFor="profileName">{t('signup_name_label')}</label>
                <input type="text" id="profileName" value={name} onChange={(e)=>{ setName(e.target.value); setSaved(false); }}/>
              </div>
              <div className="field">
                <label htmlFor="profileEmail">{t('signup_email_label')}</label>
                <input type="email" id="profileEmail" value={email} onChange={(e)=>{ setEmail(e.target.value); setSaved(false); }}/>
              </div>
              <div className="field">
                <label htmlFor="profilePhone">{t('profile_phone_label')}</label>
                <input type="text" id="profilePhone" value={phone} placeholder={t('profile_phone_placeholder')} onChange={(e)=>{ setPhone(e.target.value); setSaved(false); }}/>
              </div>
              {error && <p className="field-error" style={{ margin:0 }}>{t(error)}</p>}
              {saved && <p className="ai-note" style={{ margin:0 }}><Icon name="check"/>{' '+t('profile_saved_note')}</p>}
              <div><button type="submit" className="btn btn-primary">{t('profile_save_btn')}</button></div>
            </form>
          </div>
        )}

        <div className={'card card-'+person.role}>
          <SectionHead icon="building" title={t('profile_school_title')}/>
          <DetailRow label={t('admin_role_label')}>{t('tab_'+person.role)}</DetailRow>
          {person.role==='learner' && <DetailRow label={t('login_grade_label')}>{t('grade_'+(person.grade||'10'))}</DetailRow>}
          {person.role==='learner' && idNumber && <DetailRow label={t('login_id_label')}>{idNumber}</DetailRow>}
          {person.role==='learner' && <DetailRow label={t('profile_parents_label')}>{users.filter(u=>u.role==='parent' && (u.childIds||[]).includes(person.id)).map(p=>p.name).join(', ') || '—'}</DetailRow>}
          {person.role==='teacher' && <DetailRow label={t('signup_subject_label')}>{person.subjectKey ? t(person.subjectKey) : '—'}</DetailRow>}
          {person.role==='teacher' && staffNumber && <DetailRow label={t('login_staff_label')}>{staffNumber}</DetailRow>}
          {person.role==='hod' && <DetailRow label={t('hod_dept_select_label')}>{dept ? t(dept.labelKey) : '—'}</DetailRow>}
          {person.role==='parent' && <DetailRow label={t('profile_children_label')}>{children.map(c=>c.name+(c.grade ? ' ('+t('grade_'+c.grade)+')' : '')).join(', ') || '—'}</DetailRow>}
          <p className="muted" style={{ marginTop:10, fontSize:11.5 }}>{t('profile_managed_note')}</p>
        </div>

        {account && (
          <div className={'card card-'+person.role}>
            <SectionHead icon="lock" title={t('profile_security_title')}/>
            {pwSaved ? (
              <>
                <p className="ai-note" style={{ marginTop:0 }}><Icon name="check"/>{' '+t('pw_changed_note')}</p>
                <button className="btn" onClick={()=>setPwSaved(false)}>{t('change_password_button')}</button>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop:-6 }}>{t('pw_change_sub')}</p>
                <ChangePasswordForm account={account} requireCurrent onSave={savePassword} className="pw-form"/>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
