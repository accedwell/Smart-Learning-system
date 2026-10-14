import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { Icon } from '../components/ui.jsx'
import { apiPost, errorText } from '../services/api.js'
import { formatWhen, useNow } from '../services/onlineClasses.js'
import { LiveSession, hasVideo, hasAudio } from './LiveSession.js'

// plays a MediaStream; `muted` for my own preview (no echo)
function MediaView({ stream, muted, className }){
  const ref = useRef(null);
  useEffect(()=>{
    if(ref.current && ref.current.srcObject!==stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted}/>;
}

function Placeholder({ text }){
  return <div className="live-placeholder"><Icon name="users"/><span>{text}</span></div>;
}

// The live classroom of an online class: the teacher's video (or screen) for everyone, the
// learners who switched their camera or mic on (for the teacher), who is here, and the chat.
// `onlineClass` comes from the teacher's or learner's online-classes list.
export default function LiveClassroom({ onlineClass, onLeave }){
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
          <h2 style={{ margin:0 }}>{onlineClass.title}</h2>
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
            {isTeacher && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && (
              <button className={'btn'+(session.screen ? ' btn-primary' : '')} onClick={()=>session.setScreenShare(!session.screen)}>
                {t(session.screen ? 'live_share_stop' : 'live_share_start')}
              </button>
            )}
          </div>
          {session.mediaError && <p className="field-error" style={{ marginTop:8 }}>{t(session.mediaError.code)}</p>}
          {!isTeacher && <p className="muted" style={{ fontSize:11.5, marginTop:6 }}>{t('live_learner_hint')}</p>}

          {isTeacher && (
            <div className="live-grid">
              {learnersHere.map(p=>{
                const stream = session.remote.get(p.id);
                return (
                  <div key={p.id} className="live-tile">
                    {hasVideo(stream) ? <MediaView stream={stream} className="live-video"/> : <div className="live-tile-name">{p.name}</div>}
                    {stream && !hasVideo(stream) && <MediaView stream={stream} className="live-hidden"/>}
                    <div className="live-tile-label">{p.name}{hasAudio(stream) ? ' · '+t('live_speaking_on') : ''}</div>
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
