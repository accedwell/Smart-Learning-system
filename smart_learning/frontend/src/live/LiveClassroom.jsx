import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { Icon } from '../components/ui.jsx'
import { apiPost, errorText } from '../services/api.js'
import { formatWhen, useNow } from '../services/onlineClasses.js'
import { LiveSession, hasVideo, hasAudio, cantConnect } from './LiveSession.js'
// the meeting layout (with the LiveKit library) loads only when a class opens
const Meeting = lazy(()=>import('./Meeting.jsx'))
import { apiGet } from '../services/api.js'

// Plays a MediaStream; `muted` for my own preview (no echo). Browsers only start a video with
// sound by themselves once the person has tapped the page; until then it plays without sound
// (so the picture isn't stuck black) and offers a button to turn the sound on.
function MediaView({ stream, muted, className }){
  const { t } = useI18n();
  const ref = useRef(null);
  const [silenced, setSilenced] = useState(false);
  useEffect(()=>{
    const video = ref.current;
    if(!video) return;
    if(video.srcObject!==stream) video.srcObject = stream || null;
    if(!stream) return;
    video.play().catch((err)=>{
      if(muted || !err || err.name!=='NotAllowedError') return;
      video.muted = true;
      video.play().catch(()=>{});
      setSilenced(true);
    });
  }, [stream, muted]);

  function soundOn(){
    const video = ref.current;
    if(!video) return;
    video.muted = false;
    video.play().then(()=>setSilenced(false)).catch(()=>{});
  }

  if(!silenced) return <video ref={ref} className={className} autoPlay playsInline muted={muted}/>;
  return (
    <>
      <video ref={ref} className={className} autoPlay playsInline muted/>
      <button className="btn btn-primary live-sound-btn" onClick={soundOn}>{t('live_tap_for_sound')}</button>
    </>
  );
}

function Placeholder({ text }){
  return <div className="live-placeholder"><Icon name="users"/><span>{text}</span></div>;
}

// The live classroom of an online class: the teacher's video (or screen) for everyone, the
// learners who switched their camera or mic on (for the teacher), who is here, and the chat.
// `onlineClass` comes from the teacher's or learner's online-classes list.
// The classroom goes through the LiveKit video server when the backend has one (everyone sees
// everyone, like a meeting app); without it, video goes straight between devices as before.
export default function LiveClassroom(props){
  const { state } = useStore();
  const { t } = useI18n();
  const [mode, setMode] = useState(null);
  useEffect(()=>{
    let cancelled = false;
    apiGet('/live/media-server', state.auth.token).then(({ data })=>{
      if(!cancelled) setMode(data && data.livekit ? 'meeting' : 'direct');
    });
    return ()=>{ cancelled = true; };
  }, [state.auth.token]);
  if(!mode) return <p className="muted">{t('live_status_connecting')}</p>;
  if(mode==='direct') return <DirectClassroom {...props}/>;
  return <Suspense fallback={<p className="muted">{t('live_status_connecting')}</p>}><Meeting {...props}/></Suspense>;
}

function DirectClassroom({ onlineClass, onLeave }){
  const { state } = useStore();
  const { t } = useI18n();
  const role = state.auth.role;
  const token = state.auth.token;
  const now = useNow(15000);
  const [session] = useState(()=>new LiveSession(onlineClass.id, token, role));
  useSyncExternalStore(session.subscribe, session.getVersion);
  const [message, setMessage] = useState('');
  const [chatError, setChatError] = useState(null);
  const [ending, setEnding] = useState(false);
  const chatEnd = useRef(null);
  const pictureInput = useRef(null);

  useEffect(()=>{
    session.start();
    return ()=>session.stop();
  }, [session]);

  useEffect(()=>{
    if(chatEnd.current) chatEnd.current.scrollIntoView({ block:'nearest' });
  }, [session.chat.length]);

  const isTeacher = role==='teacher';
  const people = [...session.participants.values()];
  const learnersHere = people.filter(p=>p.role==='learner');
  const teacherHere = people.find(p=>p.role==='teacher');
  const teacherStream = session.remote.get(session.teacherId);
  const minutesLeft = Math.max(0, Math.round((new Date(onlineClass.endsAt).getTime()-now)/60000));
  // screen sharing needs a computer: phone browsers (and the app's web view) can't share a screen
  const canShare = Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const presenting = session.spotlight; // learner: who is presenting ({ id, name }), if anyone

  async function send(e){
    e.preventDefault();
    const text = message.trim();
    if(!text) return;
    setChatError(null);
    const { error } = await session.sendChat(text);
    if(error) setChatError(errorText(t, error));
    else setMessage('');
  }

  async function endForEveryone(){
    if(!window.confirm(t('live_end_confirm'))) return;
    setEnding(true);
    const { error } = await apiPost(`/teacher/online-classes/${onlineClass.id}/end`, {}, token);
    setEnding(false);
    if(error) setChatError(errorText(t, error));
    else onLeave();
  }

  if(session.error || session.ended){
    const text = session.ended ? t('live_ended') : errorText(t, session.error);
    return (
      <div className="card live-closed">
        <h2>{onlineClass.title}</h2>
        <p>{text}</p>
        <button className="btn btn-primary" onClick={onLeave}>{t('live_back_btn')}</button>
      </div>
    );
  }

  const statusText = session.status==='live' ? t('live_status_live') : t('live_status_'+session.status);

  return (
    <div className="live-room">
      <div className="live-head">
        <div>
          <h2 className="live-title" style={{ margin:0 }}>{onlineClass.title}</h2>
          <div className="meta">
            {onlineClass.className+' '+t(onlineClass.subjectKey)+' · '+formatWhen(onlineClass.startsAt)+' · '+t('live_minutes_left',{ n:minutesLeft })}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span className={'pill '+(session.status==='live' ? 'pill-good' : 'pill-warn')}>{statusText}</span>
          {isTeacher && <button className="btn btn-danger" disabled={ending} onClick={endForEveryone}>{t('live_end_btn')}</button>}
          <button className="btn" onClick={onLeave}>{t('live_leave_btn')}</button>
        </div>
      </div>

      <div className="live-body">
        <div className="live-main">
          {!isTeacher && session.cameraAsked && !session.cam && (
            <div className="live-presenting live-camera-ask">
              <span>{t('live_camera_request')}</span>
              <button className="btn btn-primary" onClick={()=>session.setCamera(true)}>{t('live_camera_off')}</button>
            </div>
          )}
          {!isTeacher && presenting && (
            <p className="live-presenting">{presenting.id===state.auth.apiUserId ? t('live_you_presenting') : t('live_presenting',{ name:presenting.name })}</p>
          )}
          <div className="live-stage">
            {isTeacher
              ? (session.sending.video
                  ? <MediaView stream={session.preview} muted className="live-video"/>
                  : <Placeholder text={t('live_your_camera_off')}/>)
              : (!teacherHere
                  ? <Placeholder text={t('live_waiting_teacher')}/>
                  : hasVideo(teacherStream)
                    ? <MediaView stream={teacherStream} className="live-video"/>
                    : <Placeholder text={t('live_teacher_camera_off')}/>)}
            {/* the teacher's voice also plays while their camera is off */}
            {!isTeacher && teacherHere && !hasVideo(teacherStream) && teacherStream && <MediaView stream={teacherStream} className="live-hidden"/>}
            {!isTeacher && session.sending.video && <MediaView stream={session.preview} muted className="live-self"/>}
          </div>

          <div className="live-controls">
            <button className={'btn'+(session.sending.audio ? ' btn-primary' : '')} onClick={()=>session.setMic(!session.sending.audio)}>
              {t(session.sending.audio ? 'live_mic_on' : 'live_mic_off')}
            </button>
            <button className={'btn'+(session.cam ? ' btn-primary' : '')} onClick={()=>session.setCamera(!session.cam)}>
              {t(session.cam ? 'live_camera_on' : 'live_camera_off')}
            </button>
            {canShare ? (
              <button className={'btn'+(session.screen ? ' btn-primary' : '')} onClick={()=>session.setScreenShare(!session.screen)}>
                {t(session.screen ? 'live_share_stop' : 'live_share_start')}
              </button>
            ) : (
              // phones: share a screenshot or photo from the gallery instead of the screen
              <>
                <button className={'btn'+(session.screen ? ' btn-primary' : '')}
                  onClick={()=>session.screen ? session.setScreenShare(false) : pictureInput.current.click()}>
                  {t(session.screen ? 'live_share_stop' : 'live_share_picture')}
                </button>
                <input ref={pictureInput} type="file" accept="image/*" hidden
                  onChange={(e)=>{ const file = e.target.files[0]; e.target.value = ''; if(file) session.sharePicture(file); }}/>
              </>
            )}
          </div>
          {session.mediaError && <p className="field-error" style={{ marginTop:8 }}>{t(session.mediaError.code)}</p>}
          {!isTeacher && teacherHere && cantConnect(session, teacherHere.id) && <p className="field-error" style={{ marginTop:8 }}>{t('live_connect_failed_teacher')}</p>}
          {isTeacher && learnersHere.some(p=>cantConnect(session, p.id)) && <p className="field-error" style={{ marginTop:8 }}>{t('live_connect_failed_learners')}</p>}
          {!isTeacher && <p className="muted" style={{ fontSize:11.5, marginTop:6 }}>{t('live_learner_hint')+(canShare ? '' : ' '+t('live_share_picture_hint'))}</p>}

          {isTeacher && (
            <div className="live-grid">
              {learnersHere.map(p=>{
                const stream = session.remote.get(p.id);
                const onShow = session.spotlight===p.id;
                const picture = !hasVideo(stream) && session.snapshots.get(p.id); // through the server
                return (
                  <div key={p.id} className={'live-tile'+(onShow ? ' on-show' : '')}>
                    {hasVideo(stream) ? <MediaView stream={stream} className="live-video"/>
                      : picture ? <img src={picture} alt={p.name} className="live-video"/>
                      : <div className="live-tile-name">{p.name}</div>}
                    {stream && !hasVideo(stream) && <MediaView stream={stream} className="live-hidden"/>}
                    <div className="live-tile-label">{p.name}{picture ? ' · '+t('live_camera_on_label') : cantConnect(session, p.id) ? ' · '+t('live_not_connected') : hasAudio(stream) ? ' · '+t('live_speaking_on') : ''}</div>
                    {!hasVideo(stream) && !picture && (
                      <button className="live-tile-show btn" disabled={session.askedCamera.has(p.id)} onClick={()=>session.askCamera(p.id)}>
                        {session.askedCamera.has(p.id) ? t('live_camera_asked') : t('live_ask_camera')}
                      </button>
                    )}
                    {(onShow || hasVideo(stream)) && (
                      <button className={'live-tile-show btn'+(onShow ? ' btn-primary' : '')} onClick={()=>session.setSpotlight(onShow ? null : p.id)}>
                        {onShow ? t('live_stop_showing') : t('live_show_to_class')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="live-side">
          <div className="live-people">
            <b>{t('live_here_title',{ n:people.length+1 })}</b>
            <div className="meta">{t('live_you',{ name:state.auth.name })}</div>
            {teacherHere && <div className="meta">{teacherHere.name+' · '+t('tab_teacher')}</div>}
            {learnersHere.map(p=><div key={p.id} className="meta">{p.name}</div>)}
          </div>
          <div className="live-chat">
            <div className="live-chat-list">
              {session.chat.length===0 && <p className="muted" style={{ fontSize:12 }}>{t('live_chat_empty')}</p>}
              {session.chat.map((m, i)=>(
                <div key={i} className={'live-chat-msg'+(m.from.role==='teacher' ? ' from-teacher' : '')}>
                  <b>{m.from.name}</b> <span>{m.text}</span>
                </div>
              ))}
              <div ref={chatEnd}/>
            </div>
            <form onSubmit={send} className="live-chat-form">
              <input value={message} onChange={(e)=>setMessage(e.target.value)} maxLength={500} placeholder={t('live_chat_placeholder')} aria-label={t('live_chat_placeholder')}/>
              <button type="submit" className="btn btn-primary">{t('chat_send')}</button>
            </form>
            {chatError && <p className="field-error" style={{ marginTop:6 }}>{chatError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
