import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ROLES } from '../src/data/seed.js'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, errorText } from '../src/services/api.js'

const STAFF_ROLES = ['teacher','hod','principal','admin'];

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

// school at a glance, from the backend: headline counts, users per role and subject trends
export default function AdminOverview({ onOpenUsers }){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [data, setData] = useState(null); // null while loading
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    apiGet('/admin/overview', token).then(({ data: d, error: err })=>{
      if(cancelled) return;
      if(err) setError(errorText(t, err));
      else setData(d);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  if(error) return <div className="card card-admin"><p className="field-error">{error}</p></div>;
  if(!data) return <div className="card card-admin"><p className="muted">{t('online_loading')}</p></div>;

  const counts = data.counts;
  const perRole = ROLES.map(r=>({ role:r, n:counts[r]||0 }));
  const maxRole = Math.max(1, ...perRole.map(r=>r.n));
  const awaiting = data.awaitingFirstLogin || 0;

  return (
    <>
      <div className="stat-row admin-stats">
        <StatTile icon="cap" value={counts.learner||0} label={t('admin_stat_learners')} accent="var(--learner)"/>
        <StatTile icon="users" value={STAFF_ROLES.reduce((n, r)=>n+(counts[r]||0), 0)} label={t('admin_stat_staff')} accent="var(--teacher)"/>
        <StatTile icon="bell" value={counts.parent||0} label={t('admin_stat_parents')} accent="var(--parent)"/>
        <StatTile icon="lock" value={awaiting} label={t('admin_stat_awaiting')} accent={awaiting ? 'var(--warn)' : 'var(--good)'}/>
      </div>

      <div className="grid grid-2">
        <div className="card card-admin">
          <SectionHead icon="users" title={t('admin_roles_title')}>
            <button className="btn" style={{ fontSize:11.5, padding:'5px 12px' }} onClick={onOpenUsers}>{t('admin_manage_users_btn')}</button>
          </SectionHead>
          {perRole.map(({ role, n })=>(
            <div key={role} className="row" style={{ padding:'7px 0', border:'none' }}>
              <span style={{ width:150, fontSize:12.5, fontWeight:600 }}>{t('tab_'+role)}</span>
              <div className="bar" style={{ flex:1, margin:'0 10px' }}><span style={{ width:(n/maxRole)*100+'%', background:`var(--${role})` }}/></div>
              <b style={{ width:24, textAlign:'right' }}>{n}</b>
            </div>
          ))}
        </div>

        <div className="card card-admin">
          <SectionHead icon="building" title={t('admin_title')}/>
          {data.subjects.map(row=>{
            const needsAttention = row.performance < 70;
            return (
              <div key={row.key} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:6 }}>
                <div className="row" style={{ border:'none', padding:0 }}>
                  <b>{t(row.key)}</b>
                  {needsAttention
                    ? <span className="pill pill-bad">{t('admin_needs_intervention')}</span>
                    : <span className="pill pill-good">{t('admin_on_track')}</span>}
                </div>
                <div className="meta">{t('admin_caption',{ a:row.attendance, p:row.performance })}</div>
                <div className="bar"><span style={{ width:row.performance+'%', background:needsAttention?'var(--bad)':'var(--admin)' }}/></div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
