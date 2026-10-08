import { useState } from 'react'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { Icon } from '../src/components/ui.jsx'
import { buildInviteEmail } from '../src/services/accounts.js'

// preview of the login-details email for a newly added (or reset) user
export default function InviteEmailCard({ invite, onClose }){
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const { subject, body, mailto } = buildInviteEmail(invite, t);

  async function copy(){
    try{
      await navigator.clipboard.writeText('To: '+invite.email+'\nSubject: '+subject+'\n\n'+body);
      setCopied(true);
    } catch{ /* clipboard blocked: the text is still on screen to select */ }
  }

  return (
    <div style={{ margin:'4px 0 6px', padding:14, border:'1px solid var(--border)', borderRadius:12, background:'var(--bg)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:800, marginBottom:8 }}>
        <Icon name="inbox"/>{t('admin_invite_title',{ name:invite.name })}
      </div>
      <div className="meta">To: {invite.email}</div>
      <div className="meta" style={{ marginBottom:8 }}>Subject: {subject}</div>
      <pre style={{ margin:0, whiteSpace:'pre-wrap', fontFamily:'inherit', fontSize:12.5, lineHeight:1.5 }}>{body}</pre>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <a className="btn btn-primary" href={mailto}>{t('admin_invite_open_btn')}</a>
        <button className="btn" onClick={copy}>{copied ? t('admin_invite_copied') : t('admin_invite_copy_btn')}</button>
        <button className="btn" onClick={onClose}>{t('admin_invite_close')}</button>
      </div>
    </div>
  );
}
