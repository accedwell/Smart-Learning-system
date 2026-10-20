import { useState } from 'react'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { useStore } from '../src/store/AppStore.jsx'
import { Icon } from '../src/components/ui.jsx'
import { buildInviteEmail } from '../src/services/accounts.js'
import { apiPost, errorText } from '../src/services/api.js'

// preview of the login-details email for a newly added (or reset) user. "Send email" has the
// server send it straight away (POST /admin/users/:id/email-login). A learner added with their
// ID number has no email: theirs go to their parent (invite.parent), with the parent's own login
// too when the parent's account is new.
export default function InviteEmailCard({ invite, onClose }){
  const { t } = useI18n();
  const { state } = useStore();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { kind:'sent'|'logged'|'error', text }
  const family = Boolean(invite.idNumber);
  const parent = invite.parent;
  const { subject, body } = family ? familyEmail(invite, t) : buildInviteEmail(invite, t);

  async function copy(){
    try{
      await navigator.clipboard.writeText('To: '+(invite.email||'')+'\nSubject: '+subject+'\n\n'+body);
      setCopied(true);
    } catch{ /* clipboard blocked: the text is still on screen to select */ }
  }

  async function send(){
    setSending(true);
    setResult(null);
    const payload = { tempPassword:invite.tempPassword,
      ...(parent ? { parentId:parent.userId, ...(parent.tempPassword ? { parentTempPassword:parent.tempPassword } : {}) } : {}) };
    const { data, error } = await apiPost(`/admin/users/${invite.userId}/email-login`, payload, state.auth.token);
    setSending(false);
    if(error) return setResult({ kind:'error', text:errorText(t, error) });
    setResult(data.sent
      ? { kind:'sent', text:t('admin_invite_sent',{ email:data.email }) }
      : { kind:'logged', text:t('admin_invite_logged') });
  }

  return (
    <div style={{ margin:'4px 0 6px', padding:14, border:'1px solid var(--border)', borderRadius:12, background:'var(--bg)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:800, marginBottom:8 }}>
        <Icon name="inbox"/>{family ? t('admin_invite_family_title',{ name:invite.name }) : t('admin_invite_title',{ name:invite.name })}
      </div>
      <div className="meta">To: {invite.email || '—'}{family && parent ? ' ('+parent.name+')' : ''}</div>
      <div className="meta" style={{ marginBottom:8 }}>Subject: {subject}</div>
      <pre style={{ margin:0, whiteSpace:'pre-wrap', fontFamily:'inherit', fontSize:12.5, lineHeight:1.5 }}>{body}</pre>
      {family && !parent && <p className="field-error">{t('admin_error_no_parent_email')}</p>}
      {result && (
        result.kind==='error'
          ? <p className="field-error">{result.text}</p>
          : <p className="ai-note"><Icon name="check"/>{' '+result.text}</p>
      )}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button className="btn btn-primary" onClick={send} disabled={sending || result?.kind==='sent' || (family && !parent)}>
          {sending ? t('admin_invite_sending') : result?.kind==='sent' ? t('admin_invite_sent_btn') : t('admin_invite_send_btn')}
        </button>
        <button className="btn" onClick={copy}>{copied ? t('admin_invite_copied') : t('admin_invite_copy_btn')}</button>
        <button className="btn" onClick={onClose}>{t('admin_invite_close')}</button>
      </div>
    </div>
  );
}

// the email to a learner's parent, as the server sends it (in the admin's language here)
function familyEmail(invite, t){
  const parent = invite.parent;
  const lines = [
    t('invite_family_greeting',{ name:parent ? parent.name : '' }),
    '',
    t('invite_family_intro',{ name:invite.name }),
    '',
    t('admin_invite_learner_login',{ name:invite.name }),
    t('login_id_label')+': '+invite.idNumber,
    t('m_temp_password')+': '+invite.tempPassword,
  ];
  if(parent && parent.tempPassword){
    lines.push('', t('admin_invite_parent_login'), t('login_email_label')+': '+parent.email, t('m_temp_password')+': '+parent.tempPassword);
  } else if(parent){
    lines.push('', t('admin_invite_parent_keeps'));
  }
  lines.push('', t('invite_family_outro',{ url:window.location.origin }), '', 'Smart Learning');
  return { subject:t('invite_family_subject',{ name:invite.name }), body:lines.join('\n') };
}
