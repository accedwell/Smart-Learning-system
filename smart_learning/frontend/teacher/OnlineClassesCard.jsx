import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { SectionHead, Icon } from '../src/components/ui.jsx'
import { apiGet, apiPost, apiRequest, errorText } from '../src/services/api.js'
import { classLabel } from '../src/services/classes.js'
import { saveTextFile } from '../src/services/downloads.js'
import { phaseOf, PHASE_PILL, formatWhen, useNow, nextQuarterHour } from '../src/services/onlineClasses.js'
import LiveClassroom from '../src/live/LiveClassroom.jsx'

const STATUS_PILL = { present:'pill-good', late:'pill-warn', absent:'pill-bad' };

// The teacher schedules online classes for their own classes, teaches them in the app's live
// classroom and keeps each one's register. Learners are marked present (or late) when they
// come into the classroom, with the minutes they stayed; the teacher can change any mark.
export default function OnlineClassesCard(){
  const [live, setLive] = useState(null); // the online class being taught
  const [listKey, setListKey] = useState(0); // reloads the list after leaving the classroom
  if(live) return <LiveClassroom onlineClass={live} onLeave={()=>{ setLive(null); setListKey(k=>k+1); }}/>;
  return <OnlineClassesList key={listKey} onStart={setLive}/>;
}

function OnlineClassesList({ onStart }){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const now = useNow();
  const [classes, setClasses] = useState([]);
  const [list, setList] = useState(null); // null while loading
  const [form, setForm] = useState(()=>({ classId:'', title:'', startsAt:nextQuarterHour(), durationMin:'60' }));
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState(null);
  const [openRegister, setOpenRegister] = useState(null); // online class id
  const [register, setRegister] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/teacher/class', token), apiGet('/teacher/online-classes', token)]).then(([cr, lr])=>{
      if(cancelled) return;
      const failed = cr.error || lr.error;
      if(failed){ setError(errorText(t, failed)); setList([]); return; }
      setClasses(cr.data.classes);
      setForm(f=>({ ...f, classId: f.classId || String(cr.data.classes[0]?.id || '') }));
      setList(lr.data.onlineClasses);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  const set = (field)=>(e)=>setForm(f=>({ ...f, [field]:e.target.value }));
  const fail = (err)=>{ setError(errorText(t, err)); };

  async function schedule(e){
    e.preventDefault();
    setSaving(true);
    setError(null);
    setCreated(false);
    const { data, error: err } = await apiPost('/teacher/online-classes', {
      classId:Number(form.classId), title:form.title, durationMin:Number(form.durationMin),
      startsAt:new Date(form.startsAt).toISOString(),
    }, token);
    setSaving(false);
    if(err) return fail(err);
    setList(l=>[data.onlineClass, ...l]);
    setForm(f=>({ ...f, title:'', startsAt:nextQuarterHour() }));
    setCreated(true);
  }

  async function showRegister(oc){
    if(openRegister===oc.id){ setOpenRegister(null); setRegister(null); return; }
    setOpenRegister(oc.id);
    setRegister(null);
    const { data, error: err } = await apiGet(`/teacher/online-classes/${oc.id}/register`, token);
    if(err) return fail(err);
    setRegister(data.register);
  }

  async function mark(oc, learnerId, status){
    const { data, error: err } = await apiRequest('PUT', `/teacher/online-classes/${oc.id}/register/${learnerId}`, { body:{ status }, token });
    if(err) return fail(err);
    setRegister(data.register);
    refreshCounts(oc.id, data.register);
  }

  // keeps the "n present · n late" line in step with the register
  function refreshCounts(id, rows){
    const count = (s)=>rows.filter(r=>r.status===s).length;
    setList(l=>l.map(x=>x.id===id ? { ...x, present:count('present'), late:count('late'), learners:rows.length } : x));
  }

  async function endClass(oc){
    const { data, error: err } = await apiPost(`/teacher/online-classes/${oc.id}/end`, {}, token);
    if(err) return fail(err);
    setList(l=>l.map(x=>x.id===oc.id ? data.onlineClass : x));
  }

  async function cancelClass(oc){
    if(!window.confirm(t('online_cancel_confirm'))) return;
    const { error: err } = await apiRequest('DELETE', `/teacher/online-classes/${oc.id}`, { token });
    if(err) return fail(err);
    setList(l=>l.filter(x=>x.id!==oc.id));
    if(openRegister===oc.id){ setOpenRegister(null); setRegister(null); }
  }

  function statusText(row, ended){
    if(row.status) return t('online_status_'+row.status);
    return ended ? t('online_status_absent') : t('online_status_not_joined');
  }

  function downloadRegister(oc){
    const ended = phaseOf(oc, now)==='ended';
    const cell = (v)=>'"'+String(v??'').replace(/"/g, '""')+'"';
    const lines = [
      [t('online_topic_label'), oc.title], [t('online_class_label'), oc.className+' '+t(oc.subjectKey)], [t('online_start_label'), formatWhen(oc.startsAt)],
      [],
      [t('tab_learner'), t('online_col_status'), t('online_col_came_in'), t('online_col_minutes')],
      ...register.map(r=>[r.name, statusText(r, ended), r.joinedAt ? formatWhen(r.joinedAt) : '', r.joinedAt ? r.minutes : '']),
    ];
    const safeName = (oc.className+'-'+oc.title).replace(/[^\w-]+/g, '_').slice(0, 60);
    saveTextFile(`register-${safeName}.csv`, lines.map(row=>row.map(cell).join(',')).join('\r\n'));
  }

  return (
    <>
      <div className="card card-teacher">
        <SectionHead icon="users" title={t('online_new_title')}/>
        {classes.length===0 && list!==null && <p className="muted">{t('teacher_no_classes')}</p>}
        {classes.length>0 && (
          <form onSubmit={schedule}>
            <div className="field">
              <label htmlFor="ocClass">{t('online_class_label')}</label>
              <select id="ocClass" value={form.classId} onChange={set('classId')}>
                {classes.map(c=><option key={c.id} value={c.id}>{classLabel(c, t)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ocTitle">{t('online_topic_label')}</label>
              <input id="ocTitle" value={form.title} onChange={set('title')} placeholder={t('online_topic_placeholder')} maxLength={150} required/>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <div className="field" style={{ flex:'2 1 200px' }}>
                <label htmlFor="ocStart">{t('online_start_label')}</label>
                <input id="ocStart" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required/>
              </div>
              <div className="field" style={{ flex:'1 1 120px' }}>
                <label htmlFor="ocDuration">{t('online_duration_label')}</label>
                <input id="ocDuration" type="number" min={10} max={240} step={5} value={form.durationMin} onChange={set('durationMin')} required/>
              </div>
            </div>
            <p className="muted" style={{ margin:'0 0 10px', fontSize:11.5 }}>{t('online_inapp_hint')}</p>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>{t('online_create_btn')}</button>
            {created && <p className="ai-note"><Icon name="check"/>{' '+t('online_created_note')}</p>}
          </form>
        )}
        {classes.length===0 && error && <p className="field-error">{error}</p>}
      </div>

      <div className="card card-teacher" style={{ marginTop:14 }}>
        <SectionHead icon="clipboard" title={t('online_list_title')}/>
        {list===null && <p className="muted">{t('online_loading')}</p>}
        {list && list.length===0 && <p className="muted">{t('online_list_empty')}</p>}
        {list && list.map(oc=>{
          const phase = phaseOf(oc, now);
          const absent = Math.max(0, oc.learners-oc.present-oc.late);
          return (
            <div key={oc.id} className="row" style={{ flexDirection:'column', alignItems:'stretch', gap:8 }}>
              <div className="row" style={{ border:'none', padding:0, alignItems:'flex-start' }}>
                <div>
                  <b>{oc.title}</b>
                  <div className="meta">{t('online_meta',{ class:oc.className+' '+t(oc.subjectKey), time:formatWhen(oc.startsAt), n:oc.durationMin })}</div>
                  <div className="meta">
                    {phase==='ended'
                      ? t('online_counts',{ present:oc.present, late:oc.late, absent })
                      : t('online_counts_live',{ joined:oc.present+oc.late, n:oc.learners })}
                  </div>
                </div>
                <span className={'pill '+PHASE_PILL[phase]}>{t('online_phase_'+phase)}</span>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {phase==='open' && <button className="btn btn-primary" onClick={()=>onStart(oc)}><Icon name="users"/>{' '+t('online_start_btn')}</button>}
                <button className="btn" onClick={()=>showRegister(oc)}><Icon name="clipboard"/>{' '+t(openRegister===oc.id ? 'online_register_hide_btn' : 'online_register_btn')}</button>
                {phase==='open' && <button className="btn" onClick={()=>endClass(oc)}>{t('online_end_btn')}</button>}
                {phase==='upcoming' && <button className="btn btn-danger" onClick={()=>cancelClass(oc)}>{t('online_cancel_btn')}</button>}
              </div>
              {openRegister===oc.id && (
                <div style={{ paddingLeft:4 }}>
                  {register===null && <p className="muted">{t('online_loading')}</p>}
                  {register && register.length===0 && <p className="muted">{t('online_register_empty')}</p>}
                  {register && register.map(r=>(
                    <div key={r.learnerId} className="row" style={{ padding:'7px 0' }}>
                      <div>
                        <span>{r.name}</span>
                        <div className="meta">
                          {[
                            r.inRoom && t('online_in_room'),
                            r.joinedAt && t('online_joined_at',{ time:formatWhen(r.joinedAt) }),
                            r.joinedAt && t('online_minutes',{ n:r.minutes }),
                            r.markedBy==='teacher' && t('online_marked_by_teacher'),
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className={'pill '+(STATUS_PILL[r.status] || (phase==='ended' ? 'pill-bad' : ''))}>{statusText(r, phase==='ended')}</span>
                        <select aria-label={r.name} value={r.status || ''} onChange={(e)=>mark(oc, r.learnerId, e.target.value || null)} style={{ width:'auto' }}>
                          <option value="">—</option>
                          <option value="present">{t('online_status_present')}</option>
                          <option value="late">{t('online_status_late')}</option>
                          <option value="absent">{t('online_status_absent')}</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  {register && register.length>0 && (
                    <button className="btn" style={{ marginTop:8 }} onClick={()=>downloadRegister(oc)}><Icon name="download"/>{' '+t('online_download_btn')}</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
