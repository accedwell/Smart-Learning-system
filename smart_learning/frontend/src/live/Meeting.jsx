import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { apiPost, errorText } from '../services/api.js'
import { formatWhen, useNow } from '../services/onlineClasses.js'
import { MeetingSession, previewCamera, listDevices } from './MeetingSession.js'

// The online classroom through the LiveKit video server, laid out like a meeting app: everyone's
// video in a grid (a shared screen large, with the people beside it), a toolbar at the bottom,
// and panels for the people and the chat. The same page works on computers, in phone browsers
// and inside the phone app.

const PATHS = {
  mic:'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff:'M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 11a7 7 0 0 1-1.1 3.8M5 11a7 7 0 0 0 10.5 6M12 18v3',
  cam:'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  camOff:'M3 3l18 18M15 10l6-3v10l-4-2M10 7h5v5M3 7h3v10h9',
  screen:'M3 4h18v12H3zM8 20h8M12 16v4',
  people:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  chat:'M4 5h16v11H8l-4 4z',
  hand:'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 16.5L2.6 13a1.5 1.5 0 0 1 2.7-1.3L8 15',
  settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15.1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5.9z',
  flip:'M4 9V7a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v2M20 15v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2M8 12l-3 3-3-3M16 12l3-3 3 3',
  leave:'M10 17l-5-5 5-5M5 12h11M14 4h5v16h-5',
  more:'M5 12h.01M12 12h.01M19 12h.01',
  close:'M6 6l12 12M18 6L6 18',
  full:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
};

function Glyph({ name }){
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]}/>
    </svg>
  );
}

function initials(name){
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w=>w[0].toUpperCase()).join('');
}

// shows a LiveKit video track (my own camera mirrored, like a mirror)
function VideoTrack({ track, mirror, fit }){
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current;
    if(!el || !track) return undefined;
    track.attach(el);
    return ()=>{ track.detach(el); };
  }, [track]);
  return <video ref={ref} className={'meet-video'+(mirror ? ' mirror' : '')+(fit ? ' fit' : '')} autoPlay playsInline muted/>;
}

function Tile({ person, t, screen }){
  const track = screen ? person.screenTrack : person.camTrack;
  return (
    <div className={'meet-tile'+(person.speaking && !screen ? ' speaking' : '')+(screen ? ' screen' : '')}>
      {track ? <VideoTrack track={track} mirror={person.isMe && !screen} fit={screen}/>
        : <div className="meet-avatar"><span>{initials(person.name)}</span></div>}
      <div className="meet-tile-label">
        {!screen && !person.mic && <span className="meet-badge off" title={t('meet_muted')}><Glyph name="micOff"/></span>}
        {!screen && person.hand && <span className="meet-badge hand" title={t('meet_hand_up')}><Glyph name="hand"/></span>}
        <span className="meet-tile-name">{screen ? t('meet_is_sharing', { name:person.name }) : person.isMe ? t('live_you', { name:person.name }) : person.name}</span>
        {!screen && person.host && <span className="meet-host">{t('tab_teacher')}</span>}
      </div>
    </div>
  );
}

// before coming in: my camera preview and what to switch on
function PreJoin({ session, onlineClass, t, onLeave }){
  const [cam, setCam] = useState(false);
  const [mic, setMic] = useState(false);
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [cams, setCams] = useState([]);
  const [mics, setMics] = useState([]);
  const [camId, setCamId] = useState('');
  const [micId, setMicId] = useState('');

  useEffect(()=>{
    if(!cam){ setPreview(null); return undefined; }
    let track = null;
    let cancelled = false;
    previewCamera(camId).then(async (tr)=>{
      if(cancelled){ tr.stop(); return; }
      track = tr;
      setPreview(tr);
      setProblem(null);
      // the names of the devices show once the browser may use them
      setCams(await listDevices('videoinput'));
      setMics(await listDevices('audioinput'));
    }).catch((err)=>{
      if(cancelled) return;
      setCam(false);
      setProblem(err && err.name==='NotAllowedError' ? 'live_camera_denied' : err && err.name==='NotFoundError' ? 'live_no_camera' : 'live_camera_failed');
    });
    return ()=>{ cancelled = true; if(track) track.stop(); };
  }, [cam, camId]);

  useEffect(()=>{
    listDevices('videoinput').then(setCams);
    listDevices('audioinput').then(setMics);
  }, []);

  const ready = session.welcomed && session.media!=='joining';
  function join(){
    if(preview) preview.stop();
    session.join({ mic, cam, micId, camId });
  }

  return (
    <div className="meet-prejoin">
      <div className="meet-prejoin-preview">
        {preview ? <VideoTrack track={preview} mirror/> : <div className="meet-avatar"><span>{t(cam ? 'live_status_connecting' : 'meet_preview_off')}</span></div>}
        <div className="meet-prejoin-toggles">
          <button className={'meet-round'+(mic ? '' : ' off')} onClick={()=>setMic(!mic)} aria-label={t(mic ? 'live_mic_on' : 'live_mic_off')} title={t(mic ? 'live_mic_on' : 'live_mic_off')}><Glyph name={mic ? 'mic' : 'micOff'}/></button>
          <button className={'meet-round'+(cam ? '' : ' off')} onClick={()=>setCam(!cam)} aria-label={t(cam ? 'live_camera_on' : 'live_camera_off')} title={t(cam ? 'live_camera_on' : 'live_camera_off')}><Glyph name={cam ? 'cam' : 'camOff'}/></button>
        </div>
      </div>
      <div className="meet-prejoin-side">
        <h2 style={{ margin:'0 0 4px' }}>{onlineClass.title}</h2>
        <p className="muted" style={{ marginTop:0 }}>{onlineClass.className+' '+t(onlineClass.subjectKey)+' · '+formatWhen(onlineClass.startsAt)}</p>
        <p style={{ fontSize:13.5 }}>{t('meet_join_note')}</p>
        {!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && <p className="muted" style={{ fontSize:12.5 }}>{t('live_share_picture_hint')}</p>}
        {cams.length > 1 && (
          <label className="meet-field">{t('meet_camera')}
            <select value={camId} onChange={(e)=>setCamId(e.target.value)}>
              <option value="">{t('meet_default_device')}</option>
              {cams.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label || t('meet_camera')}</option>)}
            </select>
          </label>
        )}
        {mics.length > 1 && (
          <label className="meet-field">{t('meet_microphone')}
            <select value={micId} onChange={(e)=>setMicId(e.target.value)}>
              <option value="">{t('meet_default_device')}</option>
              {mics.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label || t('meet_microphone')}</option>)}
            </select>
          </label>
        )}
        {problem && <p className="field-error">{t(problem)}</p>}
        {session.mediaError && <p className="field-error">{errorText(t, session.mediaError)}</p>}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
          <button className="btn btn-primary" disabled={!ready} onClick={join}>{session.media==='joining' ? t('live_status_connecting') : t('meet_join_btn')}</button>
          <button className="btn" onClick={onLeave}>{t('live_back_btn')}</button>
        </div>
      </div>
    </div>
  );
}

function Settings({ session, t }){
  const [lists, setLists] = useState({ audioinput:[], videoinput:[], audiooutput:[] });
  useEffect(()=>{
    Promise.all(['audioinput', 'videoinput', 'audiooutput'].map(listDevices)).then(([audioinput, videoinput, audiooutput])=>setLists({ audioinput, videoinput, audiooutput }));
  }, []);
  const rows = [['audioinput', 'meet_microphone'], ['videoinput', 'meet_camera'], ['audiooutput', 'meet_speaker']];
  return (
    <div className="meet-panel-body">
      {rows.filter(([kind])=>lists[kind].length > 0).map(([kind, label])=>(
        <label key={kind} className="meet-field">{t(label)}
          <select value={session.activeDevice(kind) || ''} onChange={(e)=>session.useDevice(kind, e.target.value)}>
            {lists[kind].map(d=><option key={d.deviceId} value={d.deviceId}>{d.label || t(label)}</option>)}
          </select>
        </label>
      ))}
      <p className="muted" style={{ fontSize:12 }}>{t('meet_settings_note')}</p>
    </div>
  );
}

function People({ session, people, isTeacher, t }){
  return (
    <div className="meet-panel-body">
      {people.map(p=>(
        <div key={p.id} className="meet-person">
          <div className="meet-person-avatar">{initials(p.name)}</div>
          <div className="meet-person-main">
            <div className="meet-person-name">{p.isMe ? t('live_you', { name:p.name }) : p.name}{p.host && <span className="meet-host">{t('tab_teacher')}</span>}</div>
            <div className="meet-person-icons">
              <span className={p.mic ? 'on' : 'off'} title={t(p.mic ? 'meet_mic_is_on' : 'meet_muted')}><Glyph name={p.mic ? 'mic' : 'micOff'}/></span>
              <span className={p.cam ? 'on' : 'off'} title={t(p.cam ? 'meet_cam_is_on' : 'meet_cam_is_off')}><Glyph name={p.cam ? 'cam' : 'camOff'}/></span>
              {p.hand && <span className="hand" title={t('meet_hand_up')}><Glyph name="hand"/></span>}
            </div>
          </div>
          {isTeacher && !p.isMe && !p.host && (
            <div className="meet-person-actions">
              {p.mic && <button className="btn btn-sm" disabled={session.asked.get(p.id)==='mute'} onClick={()=>session.ask(p.id, 'mute')}>{session.asked.get(p.id)==='mute' ? t('live_camera_asked') : t('meet_ask_mute')}</button>}
              {!p.cam && <button className="btn btn-sm" disabled={session.asked.get(p.id)==='camera'} onClick={()=>session.ask(p.id, 'camera')}>{session.asked.get(p.id)==='camera' ? t('live_camera_asked') : t('live_ask_camera')}</button>}
              <button className="btn btn-sm btn-danger" onClick={()=>{ if(window.confirm(t('meet_remove_confirm', { name:p.name }))) session.remove(p.id); }}>{t('meet_remove')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Chat({ session, t }){
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const end = useRef(null);
  useEffect(()=>{ if(end.current) end.current.scrollIntoView({ block:'nearest' }); }, [session.chat.length]);
  async function send(e){
    e.preventDefault();
    const text = message.trim();
    if(!text) return;
    setError(null);
    const { error: err } = await session.sendChat(text);
    if(err) setError(errorText(t, err));
    else setMessage('');
  }
  const time = (at)=>new Date(at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  return (
    <div className="meet-panel-body meet-chat">
      <div className="meet-chat-list">
        {session.chat.length===0 && <p className="muted" style={{ fontSize:12.5 }}>{t('live_chat_empty')}</p>}
        {session.chat.map((m, i)=>(
          <div key={i} className={'meet-chat-msg'+(m.from.role==='teacher' ? ' from-teacher' : '')}>
            <div className="meet-chat-head"><b>{m.from.name}</b><span>{time(m.at)}</span></div>
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={end}/>
      </div>
      <form onSubmit={send} className="meet-chat-form">
        <input value={message} onChange={(e)=>setMessage(e.target.value)} maxLength={500} placeholder={t('live_chat_placeholder')} aria-label={t('live_chat_placeholder')}/>
        <button type="submit" className="btn btn-primary">{t('chat_send')}</button>
      </form>
      {error && <p className="field-error" style={{ marginTop:6 }}>{error}</p>}
    </div>
  );
}

// Phones get the phone layout (.compact): a phone browser by its size or touch screen, and the
// phone app always (`compact`), since some phones' app browsers report a desktop-wide page.
const PHONE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1100px)';
function usePhoneLayout(forced){
  const [phone, setPhone] = useState(()=>forced || window.matchMedia(PHONE_QUERY).matches);
  useEffect(()=>{
    if(forced) return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const changed = ()=>setPhone(mq.matches);
    if(mq.addEventListener) mq.addEventListener('change', changed); else mq.addListener(changed);
    return ()=>{ if(mq.removeEventListener) mq.removeEventListener('change', changed); else mq.removeListener(changed); };
  }, [forced]);
  return forced || phone;
}

export default function Meeting({ compact, ...props }){
  const phone = usePhoneLayout(Boolean(compact));
  return <div className={phone ? 'compact' : undefined}><MeetingRoom {...props}/></div>;
}

function MeetingRoom({ onlineClass, onLeave }){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const isTeacher = state.auth.role==='teacher';
  const now = useNow(15000);
  const [session] = useState(()=>new MeetingSession(onlineClass.id, token, state.auth.role));
  useSyncExternalStore(session.subscribe, session.getVersion);
  const [panel, setPanel] = useState(null); // 'people' | 'chat' | 'settings'
  const [more, setMore] = useState(false);
  const [ending, setEnding] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const pictureInput = useRef(null);

  useEffect(()=>{
    session.start();
    return ()=>session.stop();
  }, [session]);

  function openPanel(name){
    const next = panel===name ? null : name;
    setPanel(next);
    setMore(false);
    session.setChatOpen(next==='chat');
  }

  async function endForEveryone(){
    if(!window.confirm(t('live_end_confirm'))) return;
    setEnding(true);
    const { error } = await apiPost(`/teacher/online-classes/${onlineClass.id}/end`, {}, token);
    setEnding(false);
    if(error) window.alert(errorText(t, error));
    else onLeave();
  }

  if(session.error || session.ended || session.removed){
    const text = session.ended ? t('live_ended') : session.removed ? t('live_removed') : errorText(t, session.error);
    return (
      <div className="card live-closed">
        <h2>{onlineClass.title}</h2>
        <p>{text}</p>
        <button className="btn btn-primary" onClick={onLeave}>{t('live_back_btn')}</button>
      </div>
    );
  }

  if(session.media==='idle' || session.media==='joining' || (session.media==='lost' && !session.joinOptions)){
    return <PreJoin session={session} onlineClass={onlineClass} t={t} onLeave={onLeave}/>;
  }

  const people = session.people();
  const sharing = people.filter(p=>p.screenTrack);
  const presenter = sharing.find(p=>!p.isMe) || sharing[0];
  const minutesLeft = Math.max(0, Math.round((new Date(onlineClass.endsAt).getTime()-now)/60000));
  const canShare = Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const micOn = session.isOn('mic');
  const camOn = session.isOn('camera');
  const screenOn = session.isOn('screen');
  const handUp = session.hasHand();
  const statusKey = session.media==='reconnecting' || session.status==='reconnecting' ? 'live_status_reconnecting' : 'live_status_live';
  const count = people.length;
  const cols = count<=1 ? 1 : count<=4 ? 2 : count<=9 ? 3 : 4;

  const share = ()=>{
    if(screenOn) return session.setScreenShare(false);
    if(canShare) return session.setScreenShare(true);
    pictureInput.current.click();
  };

  return (
    <div className={'meet'+(panel ? ' with-panel' : '')}>
      <div className="meet-head">
        <div className="meet-head-info">
          <b className="meet-title">{onlineClass.title}</b>
          <span className="meta">{onlineClass.className+' '+t(onlineClass.subjectKey)+' · '+t('live_minutes_left', { n:minutesLeft })}</span>
        </div>
        <span className={'pill '+(statusKey==='live_status_live' ? 'pill-good' : 'pill-warn')}>{t(statusKey)}</span>
      </div>

      {session.media==='lost' && (
        <div className="meet-banner bad">
          <span>{session.mediaError ? errorText(t, session.mediaError) : t('meet_connection_lost')}</span>
          <button className="btn btn-primary btn-sm" onClick={()=>session.rejoin()}>{t('meet_retry')}</button>
        </div>
      )}
      {!session.canPlayAudio && (
        <div className="meet-banner">
          <span>{t('meet_sound_blocked')}</span>
          <button className="btn btn-primary btn-sm" onClick={()=>session.startAudio()}>{t('live_tap_for_sound')}</button>
        </div>
      )}
      {session.cameraAsked && !camOn && (
        <div className="meet-banner">
          <span>{t('live_camera_request')}</span>
          <span style={{ display:'flex', gap:6 }}>
            <button className="btn btn-primary btn-sm" onClick={()=>session.setCamera(true)}>{t('live_camera_off')}</button>
            <button className="btn btn-sm" onClick={()=>session.dismissAsk()}>{t('meet_close')}</button>
          </span>
        </div>
      )}
      {session.muteAsked && micOn && (
        <div className="meet-banner">
          <span>{t('meet_mute_request')}</span>
          <span style={{ display:'flex', gap:6 }}>
            <button className="btn btn-primary btn-sm" onClick={()=>session.setMic(false)}>{t('live_mic_on')}</button>
            <button className="btn btn-sm" onClick={()=>session.dismissAsk()}>{t('meet_close')}</button>
          </span>
        </div>
      )}
      {session.mediaError && session.media!=='lost' && <div className="meet-banner bad"><span>{errorText(t, session.mediaError)}</span></div>}

      <div className="meet-body">
        <div className="meet-stage">
          {presenter ? (
            <div className={'meet-presenting'+(fullScreen ? ' full' : '')}>
              <div className="meet-screen">
                <Tile person={presenter} t={t} screen/>
                <button className="meet-full-btn" onClick={()=>setFullScreen(!fullScreen)} aria-label={t('meet_full_screen')} title={t('meet_full_screen')}><Glyph name={fullScreen ? 'close' : 'full'}/></button>
              </div>
              {!fullScreen && <div className="meet-strip">{people.map(p=><Tile key={p.id} person={p} t={t}/>)}</div>}
            </div>
          ) : (
            <div className={'meet-grid'+(count<=1 ? ' solo' : '')} style={{ '--cols':cols }}>
              {people.map(p=><Tile key={p.id} person={p} t={t}/>)}
              {count===0 && (
                <div className="meet-empty">
                  <div className="meet-avatar"><span>{initials(state.auth.name)}</span></div>
                  <p>{t(session.media==='lost' ? 'meet_not_connected' : 'live_status_connecting')}</p>
                </div>
              )}
              {count===1 && <p className="meet-alone">{t('meet_waiting')}</p>}
            </div>
          )}
        </div>

        {panel && <div className="meet-backdrop" onClick={()=>openPanel(panel)}/>}
        {panel && (
          <aside className="meet-panel">
            <div className="meet-panel-head">
              <b>{panel==='people' ? t('meet_people_count', { n:count }) : panel==='chat' ? t('meet_chat') : t('meet_settings')}</b>
              <button className="meet-icon-btn" onClick={()=>openPanel(panel)} aria-label={t('meet_close')}><Glyph name="close"/></button>
            </div>
            {panel==='people' && <People session={session} people={people} isTeacher={isTeacher} t={t}/>}
            {panel==='chat' && <Chat session={session} t={t}/>}
            {panel==='settings' && <Settings session={session} t={t}/>}
          </aside>
        )}
      </div>

      <div className="meet-toasts" aria-live="polite">
        {session.toasts.map(x=><div key={x.id} className="meet-toast">{t(x.key, x.vars)}</div>)}
      </div>

      <div className="meet-toolbar">
        <button className={'meet-tool'+(micOn ? ' on' : ' off')} onClick={()=>session.setMic(!micOn)}>
          <Glyph name={micOn ? 'mic' : 'micOff'}/><span className="long">{t(micOn ? 'live_mic_on' : 'live_mic_off')}</span><span className="short">{t('meet_short_mic')}</span>
        </button>
        <button className={'meet-tool'+(camOn ? ' on' : ' off')} onClick={()=>session.setCamera(!camOn)}>
          <Glyph name={camOn ? 'cam' : 'camOff'}/><span className="long">{t(camOn ? 'live_camera_on' : 'live_camera_off')}</span><span className="short">{t('meet_camera')}</span>
        </button>
        <button className={'meet-tool'+(screenOn ? ' active' : '')} onClick={share}>
          <Glyph name="screen"/><span className="long">{t(screenOn ? 'live_share_stop' : 'live_share_start')}</span><span className="short">{t(screenOn ? 'meet_short_stop' : 'meet_short_share')}</span>
        </button>
        <input ref={pictureInput} type="file" accept="image/*" hidden onChange={(e)=>{ const f = e.target.files[0]; e.target.value = ''; if(f) session.sharePicture(f); }}/>
        <button className={'meet-tool wide-only'+(panel==='people' ? ' active' : '')} onClick={()=>openPanel('people')}>
          <Glyph name="people"/><span>{t('meet_people')}</span>
        </button>
        <button className={'meet-tool'+(panel==='chat' ? ' active' : '')} onClick={()=>openPanel('chat')}>
          <Glyph name="chat"/><span>{t('meet_chat')}</span>{session.unread > 0 && <i className="meet-dot">{session.unread}</i>}
        </button>
        <button className={'meet-tool wide-only'+(handUp ? ' active' : '')} onClick={()=>session.setHand(!handUp)}>
          <Glyph name="hand"/><span>{t(handUp ? 'meet_lower_hand' : 'meet_raise_hand')}</span>
        </button>
        {camOn && (
          <button className="meet-tool wide-only" onClick={()=>session.switchCamera()}>
            <Glyph name="flip"/><span>{t('meet_switch_camera')}</span>
          </button>
        )}
        <button className={'meet-tool wide-only'+(panel==='settings' ? ' active' : '')} onClick={()=>openPanel('settings')}>
          <Glyph name="settings"/><span>{t('meet_settings')}</span>
        </button>
        <div className="meet-more-wrap narrow-only">
          <button className={'meet-tool'+(more ? ' active' : '')} onClick={()=>setMore(!more)}>
            <Glyph name="more"/><span>{t('meet_more')}</span>
          </button>
          {more && <div className="meet-backdrop clear" onClick={()=>setMore(false)}/>}
          {more && (
            <div className="meet-more">
              <button onClick={()=>openPanel('people')}><Glyph name="people"/>{t('meet_people')}</button>
              <button onClick={()=>{ session.setHand(!handUp); setMore(false); }}><Glyph name="hand"/>{t(handUp ? 'meet_lower_hand' : 'meet_raise_hand')}</button>
              {camOn && <button onClick={()=>{ session.switchCamera(); setMore(false); }}><Glyph name="flip"/>{t('meet_switch_camera')}</button>}
              <button onClick={()=>openPanel('settings')}><Glyph name="settings"/>{t('meet_settings')}</button>
              {isTeacher && <button className="danger" disabled={ending} onClick={endForEveryone}><Glyph name="close"/>{t('live_end_btn')}</button>}
            </div>
          )}
        </div>
        <button className="meet-tool leave" onClick={onLeave}>
          <Glyph name="leave"/><span>{t('live_leave_btn')}</span>
        </button>
        {isTeacher && (
          <button className="meet-tool end wide-only" disabled={ending} onClick={endForEveryone}>
            <Glyph name="close"/><span>{t('live_end_btn')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
