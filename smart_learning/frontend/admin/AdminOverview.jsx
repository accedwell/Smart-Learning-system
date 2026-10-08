import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { ROLES } from '../src/data/seed.js'
import { SectionHead, Icon } from '../src/components/ui.jsx'

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

// school at a glance: headline counts, users per role and subject trends
export default function AdminOverview({ onOpenUsers }){
  const { state } = useStore();
  const { t } = useI18n();
  const s = state.admin;
  const count = (fn)=>s.users.filter(fn).length;
  const perRole = ROLES.map(r=>({ role:r, n:count(u=>u.role===r) }));
  const maxRole = Math.max(1, ...perRole.map(r=>r.n));
  const awaiting = count(u=>u.mustChangePassword);

  return (
    <>
      <div className="stat-row admin-stats">
        <StatTile icon="cap" value={count(u=>u.role==='learner')} label={t('admin_stat_learners')} accent="var(--learner)"/>
        <StatTile icon="users" value={count(u=>STAFF_ROLES.includes(u.role))} label={t('admin_stat_staff')} accent="var(--teacher)"/>
        <StatTile icon="bell" value={count(u=>u.role==='parent')} label={t('admin_stat_parents')} accent="var(--parent)"/>
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
          {s.rows.map(row=>{
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
