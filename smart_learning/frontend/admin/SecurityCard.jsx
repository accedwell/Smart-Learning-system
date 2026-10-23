import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, apiPost, errorText } from '../src/services/api.js'
import { formatDateTime, timeAgo } from '../src/services/dates.js'

const EVENTS = ['login_ok','new_device','login_failed','account_locked','login_blocked','account_unlocked','code_sent','code_failed',
  'password_changed','reset_requested','password_reset','user_created','user_removed','login_reset'];
const BAD = new Set(['login_failed','account_locked','login_blocked','code_failed']);
const GOOD = new Set(['login_ok','account_unlocked','password_reset']);

// "Chrome on Windows", "Phone app on Android"... from the browser's user-agent text
function deviceName(ua){
  if(!ua) return '';
  const browser = /Expo|okhttp|CFNetwork|Dalvik/i.test(ua) ? 'Phone app'
    : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /node|curl|undici/i.test(ua) ? 'Script' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? browser+' on '+os : browser;
}

function StatTile({ icon, value, label, accent }){
  return (
    <div className="stat-tile" style={{ '--accent-bar':accent }}>
      <span className="icon-badge"><Icon name={icon}/></span>
      <div className="stat">
        <div className="num">{value}</div>
        <div className="lbl">{label}</div>
      </div>
    </div>
  );
}

// The administrator's Security page: what happened at sign-in, and the locked accounts
// (with Unlock), from /api/admin/security
export default function SecurityCard(){
  const { state } = useStore();
  const { t, lang } = useI18n();
  const token = state.auth.token;
  const [filter, setFilter] = useState('');
  const [data, setData] = useState(null); // null while loading
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ()=>{
    const { data: d, error: err } = await apiGet('/admin/security'+(filter ? '?event='+filter : ''), token);
    if(err) setError(errorText(t, err));
    else{ setError(null); setData(d); }
  }, [filter, token, t]);

  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, 30000); // keeps itself up to date while open
    return ()=>clearInterval(timer);
  }, [load]);

  async function unlock(user){
    setBusyId(user.id);
    const { error: err } = await apiPost(`/admin/users/${user.id}/unlock`, {}, token);
    setBusyId(null);
    if(err) setError(errorText(t, err));
    else load();
  }

  if(!data) return <div className="card card-admin">{error ? <p className="field-error">{error}</p> : <p className="muted">{t('online_loading')}</p>}</div>;
  const n = (k)=>data.last24h[k] || 0;

  return (
    <>
      <div className="stat-row admin-stats">
        <StatTile icon="check" value={n('login_ok')} label={t('sec_stat_logins')} accent="var(--good)"/>
        <StatTile icon="lock" value={n('login_failed')+n('code_failed')} label={t('sec_stat_failed')} accent={n('login_failed') ? 'var(--warn)' : 'var(--good)'}/>
        <StatTile icon="shield" value={n('account_locked')} label={t('sec_stat_locked')} accent={n('account_locked') ? 'var(--bad)' : 'var(--good)'}/>
        <StatTile icon="edit" value={n('password_reset')} label={t('sec_stat_resets')} accent="var(--brand)"/>
      </div>
      {error && <p className="field-error">{error}</p>}

      <div className="card card-admin">
        <SectionHead icon="lock" title={t('sec_locked_title')}/>
        {data.locked.length===0 && <p className="muted">{t('sec_locked_empty')}</p>}
        {data.locked.map(u=>(
          <div key={u.id} className="row">
            <div>
              <b>{u.name}</b> <span className="meta">{u.login+' · '+t('tab_'+u.role)}</span>
              <div className="meta">{t('sec_locked_until',{ time:formatDateTime(u.lockedUntil) })}</div>
            </div>
            <button className="btn btn-primary" disabled={busyId===u.id} onClick={()=>unlock(u)}>{t('sec_unlock')}</button>
          </div>
        ))}
      </div>

      <div className="card card-admin" style={{ marginTop:14 }}>
        <SectionHead icon="shield" title={t('sec_title')}>
          <select value={filter} onChange={(e)=>setFilter(e.target.value)} aria-label={t('sec_filter_all')} style={{ maxWidth:220 }}>
            <option value="">{t('sec_filter_all')}</option>
            {EVENTS.map(ev=><option key={ev} value={ev}>{t('sec_ev_'+ev)}</option>)}
          </select>
        </SectionHead>
        <p className="muted" style={{ marginTop:0 }}>{t('sec_subtitle')}</p>
        {data.events.length===0 && <p className="muted">{t('sec_empty')}</p>}
        {data.events.map(e=>{
          const who = e.userName || (e.login ? t('sec_unknown_account') : '');
          const pill = BAD.has(e.event) ? 'pill-bad' : GOOD.has(e.event) ? 'pill-good' : 'pill-warn';
          const details = [
            e.role && t('tab_'+e.role),
            !e.userName && e.login && t('sec_typed',{ login:e.login }),
            e.actorName && t('sec_by',{ name:e.actorName }),
            e.ip && 'IP '+e.ip,
            deviceName(e.userAgent),
          ].filter(Boolean).join(' · ');
          return (
            <div key={e.id} className="sec-event">
              <div><span className={'pill '+pill}>{t('sec_ev_'+e.event)}</span> <b style={{ marginLeft:6 }}>{who}</b></div>
              <span className="meta sec-time" title={formatDateTime(e.createdAt)}>{timeAgo(e.createdAt, lang)}</span>
              <div className="meta">{details}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
