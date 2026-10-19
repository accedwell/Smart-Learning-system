import { useState } from 'react'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { useStore } from '../src/store/AppStore.jsx'
import { Icon } from '../src/components/ui.jsx'
import { buildInviteEmail } from '../src/services/accounts.js'
import { apiPost, errorText } from '../src/services/api.js'

// preview of the login-details email for a newly added (or reset) user. "Send email" has the
// server send it straight away (POST /admin/users/:id/email-login).
export default function InviteEmailCard({ invite, onClose }){
  const { t } = useI18n();
  const { state } = useStore();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { kind:'sent'|'logged'|'error', text }
  const { subject, body } = buildInviteEmail(invite, t);

  async function copy(){
    try{
      await navigator.clipboard.writeText('To: '+invite.email+'\nSubject: '+subject+'\n\n'+body);
      setCopied(true);
    } catch{ /* clipboard blocked: the text is still on screen to select */ }
  }

  async function send(){
    setSending(true);
    setResult(null);
    const { data, error } = await apiPost(`/admin/users/${invite.userId}/email-login`, { tempPassword:invite.tempPassword }, state.auth.token);
    setSending(false);
    if(error) return setResult({ kind:'error', text:errorText(t, error) });
    setResult(data.sent
      ? { kind:'sent', text:t('admin_invite_sent',{ email:data.email }) }
      : { kind:'logged', text:t('admin_invite_logged') });
  }

  return (
    <div style={{ margin:'4px 0 6px', padding:14, border:'1px solid var(--border)', borderRadius:12, background:'var(--bg)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:800, marginBottom:8 }}>
        <Icon name="inbox"/>{t('admin_invite_title',{ name:invite.name })}
      </div>
      <div className="meta">To: {invite.email}</div>
      <div className="meta" style={{ marginBottom:8 }}>Subject: {subject}</div>
      <pre style={{ margin:0, whiteSpace:'pre-wrap', fontFamily:'inherit', fontSize:12.5, lineHeight:1.5 }}>{body}</pre>
      {result && (
        result.kind==='error'
          ? <p className="field-error">{result.text}</p>
          : <p className="ai-note"><Icon name="check"/>{' '+result.text}</p>
      )}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button className="btn btn-primary" onClick={send} disabled={sending || result?.kind==='sent'}>
          {sending ? t('admin_invite_sending') : result?.kind==='sent' ? t('admin_invite_sent_btn') : t('admin_invite_send_btn')}
        </button>
        <button className="btn" onClick={copy}>{copied ? t('admin_invite_copied') : t('admin_invite_copy_btn')}</button>
        <button className="btn" onClick={onClose}>{t('admin_invite_close')}</button>
      </div>
    </div>
  );
}
