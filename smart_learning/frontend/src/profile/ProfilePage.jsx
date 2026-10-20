import { useEffect, useState } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { DEPARTMENTS } from '../data/seed.js'
import { SectionHead, Icon } from '../components/ui.jsx'
import { Avatar, RolePill } from '../components/RoleBadges.jsx'
import { isValidEmail } from '../services/accounts.js'
import { apiGet, apiPatch, apiPost, errorText } from '../services/api.js'
import { rememberToken } from '../services/session.js'
import { PasswordInput } from '../auth/authParts.jsx'
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
// details, the school details the administrator manages, and your password. All of it
// comes from, and is saved to, the backend (/api/auth/me).
export default function ProfilePage({ onBack }){
  const { state, update } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [person, setPerson] = useState(null); // null while loading
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''); // needed only to change the email
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/auth/me', token).then(({ data, error: err })=>{
      if(cancelled) return;
      if(err){ setError(errorText(t, err)); return; }
      setPerson(data.user);
      setName(data.user.name || '');
      setEmail(data.user.email || '');
      setPhone(data.user.phone || '');
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  if(!person){
    return (
      <div className="profile-page">
        <button className="btn" style={{ marginBottom:14 }} onClick={onBack}>{t('profile_back')}</button>
        {error ? <p className="field-error">{error}</p> : <p className="muted">{t('online_loading')}</p>}
      </div>
    );
  }

  // learners added with their ID number have no email (their login details go to their parent)
  const noEmail = person.role==='learner' && !person.email;
  const emailChanged = !noEmail && email.trim().toLowerCase()!==person.email;

  async function saveDetails(e){
    e.preventDefault();
    const n = name.trim(), em = email.trim();
    if(!n) return setError(t('admin_error_name'));
    if(!noEmail && !isValidEmail(em)) return setError(t('admin_error_email'));
    setError(null);
    setSaving(true);
    const body = { name:n, phone:phone.trim(), ...(noEmail ? {} : { email:em }), ...(emailChanged ? { currentPassword } : {}) };
    const { data, error: err } = await apiPatch('/auth/me', body, token);
    setSaving(false);
    if(err) return setError(errorText(t, err));
    setPerson(p=>({ ...p, ...data.user }));
    setEmail(data.user.email);
    setCurrentPassword('');
    update(s=>{ s.auth.name = data.user.name; s.auth.email = data.user.email; });
    setSaved(true);
  }

  // a new password signs out every other session, so this tab gets its new token
  async function savePassword(newPassword, current){
    const { data, error: err } = await apiPost('/auth/change-password', { currentPassword:current, newPassword }, token);
    if(err) return errorText(t, err);
    update(s=>{ s.auth.token = data.token; });
    rememberToken(data.token);
    setPwSaved(true);
  }

  const dept = DEPARTMENTS.find(d=>d.id===person.dept);

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

      <div className="grid grid-2" style={{ marginTop:14 }}>
        <div className={'card card-'+person.role}>
          <SectionHead icon="edit" title={t('profile_details_title')}/>
          <form className="pw-form" onSubmit={saveDetails}>
            <div className="field">
              <label htmlFor="profileName">{t('signup_name_label')}</label>
              <input type="text" id="profileName" maxLength={100} value={name} onChange={(e)=>{ setName(e.target.value); setSaved(false); }}/>
            </div>
            {!noEmail && (
              <div className="field">
                <label htmlFor="profileEmail">{t('signup_email_label')}</label>
                <input type="email" id="profileEmail" value={email} onChange={(e)=>{ setEmail(e.target.value); setSaved(false); }}/>
              </div>
            )}
            {emailChanged && (
              <div className="field">
                <label htmlFor="profileCurrentPw">{t('pw_current_label')}</label>
                <PasswordInput id="profileCurrentPw" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" required/>
                <p className="muted" style={{ margin:'4px 0 0', fontSize:11.5 }}>{t('profile_email_password_hint')}</p>
              </div>
            )}
            <div className="field">
              <label htmlFor="profilePhone">{t('profile_phone_label')}</label>
              <input type="text" id="profilePhone" maxLength={30} value={phone} placeholder={t('profile_phone_placeholder')} onChange={(e)=>{ setPhone(e.target.value); setSaved(false); }}/>
            </div>
            {error && <p className="field-error" style={{ margin:0 }}>{error}</p>}
            {saved && <p className="ai-note" style={{ margin:0 }}><Icon name="check"/>{' '+t('profile_saved_note')}</p>}
            <div><button type="submit" className="btn btn-primary" disabled={saving}>{t('profile_save_btn')}</button></div>
          </form>
        </div>

        <div className={'card card-'+person.role}>
          <SectionHead icon="building" title={t('profile_school_title')}/>
          <DetailRow label={t('admin_role_label')}>{t('tab_'+person.role)}</DetailRow>
          {person.role==='learner' && <DetailRow label={t('login_grade_label')}>{t('grade_'+(person.grade||'10'))}</DetailRow>}
          {person.role==='learner' && person.idNumber && <DetailRow label={t('login_id_label')}>{person.idNumber}</DetailRow>}
          {person.role==='learner' && person.subjects && person.subjects.length>0 && <DetailRow label={t('profile_subjects_label')}>{person.subjects.map(s=>t(s)).join(', ')}</DetailRow>}
          {person.role==='learner' && <DetailRow label={t('profile_parents_label')}>{(person.parents||[]).join(', ') || '—'}</DetailRow>}
          {person.role==='teacher' && <DetailRow label={t('signup_subject_label')}>{person.subjectKey ? t(person.subjectKey) : '—'}</DetailRow>}
          {person.role==='teacher' && person.staffNumber && <DetailRow label={t('login_staff_label')}>{person.staffNumber}</DetailRow>}
          {person.role==='hod' && <DetailRow label={t('hod_dept_select_label')}>{dept ? t(dept.labelKey) : '—'}</DetailRow>}
          {person.role==='parent' && <DetailRow label={t('profile_children_label')}>{(person.children||[]).map(c=>c.name+(c.grade ? ' ('+t('grade_'+c.grade)+')' : '')).join(', ') || '—'}</DetailRow>}
          <p className="muted" style={{ marginTop:10, fontSize:11.5 }}>{t('profile_managed_note')}</p>
        </div>

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
              <ChangePasswordForm account={person} requireCurrent onSave={savePassword} className="pw-form"/>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
