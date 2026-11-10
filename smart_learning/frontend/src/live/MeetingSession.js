import { Room, RoomEvent, Track, LocalVideoTrack, VideoPresets, createLocalVideoTrack } from 'livekit-client'
import { openStream, sendSignal, sendChat } from './liveClient.js'
import { mediaProblem } from './LiveSession.js'
import { apiPost } from '../services/api.js'

// One person's place in an online class held through the LiveKit video server: everyone sends
// their camera, mic and screen to LiveKit once and sees and hears everyone else through it.
//
// Two connections make up the class:
// - the classroom stream of the backend (/api/live/:id/stream): being in it is what marks a
//   learner in the register; it also carries the chat, the teacher's requests ("please turn
//   on your camera", "please mute"), being removed, and the class ending;
// - the LiveKit room (video, sound, screens, raised hands), entered with a pass the backend
//   gives to people in the classroom.
//
// Nobody can switch on someone else's mic or camera: the teacher can only ask.

const HAND = 'hand';

export class MeetingSession {
  constructor(ocId, token, role){
    this.ocId = ocId;
    this.token = token;
    this.role = role;
    this.listeners = new Set();
    this.version = 0;

    this.status = 'connecting'; // the classroom stream: connecting | live | reconnecting
    this.media = 'idle';        // the video room: idle | joining | live | reconnecting | lost
    this.error = null;          // the classroom can't be used ({ code })
    this.ended = false;
    this.removed = false;
    this.welcomed = false;
    this.me = null;
    this.teacherId = null;
    this.chat = [];
    this.unread = 0;
    this.chatOpen = false;
    this.toasts = [];           // { id, text: { key, vars } }
    this.mediaError = null;     // { code } why a mic, camera or screen couldn't start
    this.cameraAsked = false;   // the teacher asked me to turn my camera on
    this.muteAsked = false;     // the teacher asked me to mute
    this.asked = new Map();     // teacher: learner id -> 'camera' | 'mute' (asked just now)
    this.canPlayAudio = true;   // false: the browser waits for a tap before playing sound
    this.facing = 'user';
    this.room = null;
    this.picture = null;        // a picture shared from a phone: { track, timer }
    this.audioBox = null;
    this.joinOptions = null;
    this.toastId = 0;
  }

  subscribe = (fn)=>{ this.listeners.add(fn); return ()=>this.listeners.delete(fn); };
  getVersion = ()=>this.version;
  emit(){ this.version++; for(const fn of this.listeners) fn(); }

  // ---- the classroom stream ----

  start(){
    this.stopped = false;
    this.stream = openStream(this.ocId, this.token, {
      onStatus:(status)=>{ this.status = status; this.emit(); },
      onError:(error)=>{ this.error = error; this.teardown(); this.emit(); },
      onEvent:(name, data)=>this.onEvent(name, data),
    });
  }

  stop(){
    this.stopped = true;
    if(this.stream) this.stream.close();
    this.teardown();
  }

  onEvent(name, data){
    if(name==='welcome'){
      this.welcomed = true;
      this.me = data.you;
      this.teacherId = data.teacherId;
      this.chat = data.chat || [];
      // the stream came back after a drop while I was in the video room: nothing to redo
    } else if(name==='chat'){
      this.chat = [...this.chat, data];
      if(!this.chatOpen && (!this.me || data.from.id!==this.me.id)){
        this.unread++;
        this.toast('meet_chat_new', { name:data.from.name });
      }
    } else if(name==='signal'){
      const ask = data.data || {};
      if(ask.askCamera && !this.isOn('camera')) this.cameraAsked = true;
      if(ask.askMute && this.isOn('mic')) this.muteAsked = true;
    } else if(name==='notice'){
      if(data.removed) this.toast('meet_removed_person', { name:data.removed.name });
    } else if(name==='ended'){
      this.ended = true;
      this.teardown();
    } else if(name==='replaced'){
      this.error = { code:'live_replaced' };
      this.teardown();
    } else if(name==='removed'){
      this.removed = true;
      this.teardown();
    }
    this.emit();
  }

  toast(key, vars){
    const id = ++this.toastId;
    this.toasts = [...this.toasts, { id, key, vars }].slice(-3);
    setTimeout(()=>{ this.toasts = this.toasts.filter(t=>t.id!==id); this.emit(); }, 4000);
  }

  // ---- the video room ----

  // { mic, cam, micId, camId }: what to switch on when I come in
  async join(options){
    this.joinOptions = options;
    this.media = 'joining';
    this.mediaError = null;
    this.emit();
    const { data, error } = await apiPost(`/live/${this.ocId}/media-token`, {}, this.token);
    if(error || this.stopped){
      this.media = 'lost';
      this.mediaError = error || null;
      return this.emit();
    }
    const url = data.url || window.location.origin.replace(/^http/, 'ws') + '/livekit';
    const room = new Room({
      adaptiveStream:true,
      dynacast:true,
      videoCaptureDefaults:{ resolution:VideoPresets.h720.resolution, facingMode:'user' },
      audioCaptureDefaults:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true },
      publishDefaults:{ simulcast:true },
    });
    this.room = room;
    this.wire(room);
    try{
      // gives up after about 10 seconds (e.g. the video server isn't running), with a message
      await room.connect(url, data.token, { websocketTimeout:10000, maxRetries:1 });
    } catch(err){
      if(this.stopped || (this.room && this.room!==room)) return;
      console.warn('[meeting] could not connect to the video server', err);
      this.room = null;
      this.media = 'lost';
      this.mediaError = { code:'meet_connect_failed' };
      return this.emit();
    }
    if(this.room!==room) return room.disconnect();
    this.media = 'live';
    this.canPlayAudio = room.canPlaybackAudio;
    this.emit();
    if(options.mic) await this.setMic(true, options.micId);
    if(options.cam) await this.setCamera(true, options.camId);
  }

  // the connection to the video room broke for good: comes in again with the same choices
  rejoin(){
    if(this.room){ this.room.disconnect(); this.room = null; }
    const { micId, camId } = this.joinOptions || {};
    return this.join({ mic:false, cam:false, micId, camId });
  }

  wire(room){
    const update = ()=>this.emit();
    room
      .on(RoomEvent.ParticipantConnected, (p)=>{ this.toast('meet_joined', { name:p.name || p.identity }); update(); })
      .on(RoomEvent.ParticipantDisconnected, (p)=>{
        this.toast('meet_left', { name:p.name || p.identity });
        this.asked.delete(Number(p.identity));
        update();
      })
      .on(RoomEvent.TrackSubscribed, (track)=>{
        if(track.kind===Track.Kind.Audio) this.audioEl().appendChild(track.attach());
        update();
      })
      .on(RoomEvent.TrackUnsubscribed, (track)=>{ track.detach().forEach(el=>el.remove()); update(); })
      .on(RoomEvent.TrackMuted, update)
      .on(RoomEvent.TrackUnmuted, update)
      .on(RoomEvent.TrackPublished, update)
      .on(RoomEvent.TrackUnpublished, update)
      .on(RoomEvent.LocalTrackPublished, update)
      .on(RoomEvent.LocalTrackUnpublished, (pub)=>{
        // the browser's own "Stop sharing" button
        if(this.picture && pub.track===this.picture.track) this.stopPicture();
        update();
      })
      .on(RoomEvent.ActiveSpeakersChanged, update)
      .on(RoomEvent.ParticipantAttributesChanged, (changed, p)=>{
        if(HAND in changed && changed[HAND] && p!==room.localParticipant) this.toast('meet_hand_raised', { name:p.name || p.identity });
        update();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, ()=>{ this.canPlayAudio = room.canPlaybackAudio; update(); })
      .on(RoomEvent.MediaDevicesChanged, update)
      .on(RoomEvent.Reconnecting, ()=>{ this.media = 'reconnecting'; update(); })
      .on(RoomEvent.Reconnected, ()=>{ this.media = 'live'; update(); })
      .on(RoomEvent.Disconnected, ()=>{
        if(this.room!==room) return;
        this.room = null;
        this.stopPicture();
        // the class ended, I was removed or I left: nothing to do; otherwise the network
        if(!this.ended && !this.removed && !this.stopped && !this.error) this.media = 'lost';
        update();
      });
  }

  audioEl(){
    if(!this.audioBox){
      this.audioBox = document.createElement('div');
      this.audioBox.hidden = true;
      document.body.appendChild(this.audioBox);
    }
    return this.audioBox;
  }

  teardown(){
    this.stopPicture();
    if(this.room){ const room = this.room; this.room = null; room.disconnect(); }
    if(this.audioBox){ this.audioBox.remove(); this.audioBox = null; }
  }

  // the browser blocked sound until a tap: the tap calls this
  startAudio(){
    if(this.room) this.room.startAudio().then(()=>{ this.canPlayAudio = true; this.emit(); }).catch(()=>{});
  }

  // ---- people ----

  // everyone in the video room, me first, then the teacher, then by name
  people(){
    if(!this.room) return [];
    const all = [this.room.localParticipant, ...this.room.remoteParticipants.values()];
    return all.map(p=>{
      let meta = {};
      try{ meta = JSON.parse(p.metadata || '{}'); } catch{ /* no metadata */ }
      const camPub = p.getTrackPublication(Track.Source.Camera);
      const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
      return {
        id:Number(p.identity),
        name:p.name || p.identity,
        isMe:p===this.room.localParticipant,
        host:Boolean(meta.host),
        role:meta.role,
        mic:p.isMicrophoneEnabled,
        cam:Boolean(camPub && camPub.track && !camPub.isMuted),
        camTrack:camPub && !camPub.isMuted ? camPub.track : null,
        screenTrack:screenPub && !screenPub.isMuted ? screenPub.track : null,
        speaking:p.isSpeaking,
        hand:Boolean(p.attributes && p.attributes[HAND]),
      };
    }).sort((a, b)=>(b.isMe-a.isMe) || (b.host-a.host) || a.name.localeCompare(b.name));
  }

  // ---- my mic, camera, screen and hand ----

  isOn(kind){
    const p = this.room && this.room.localParticipant;
    if(!p) return false;
    if(kind==='mic') return p.isMicrophoneEnabled;
    if(kind==='camera') return p.isCameraEnabled;
    return p.isScreenShareEnabled;
  }

  async setMic(on, deviceId){
    if(!this.room) return;
    this.mediaError = null;
    try{
      await this.room.localParticipant.setMicrophoneEnabled(on, deviceId ? { deviceId } : undefined);
      if(!on) this.muteAsked = false;
    } catch(err){
      this.mediaError = { code:mediaProblem(err, 'mic') };
    }
    this.emit();
  }

  async setCamera(on, deviceId){
    if(!this.room) return;
    this.mediaError = null;
    try{
      await this.room.localParticipant.setCameraEnabled(on, deviceId ? { deviceId } : { facingMode:this.facing });
      if(on) this.cameraAsked = false;
    } catch(err){
      this.mediaError = { code:mediaProblem(err, 'camera') };
    }
    this.emit();
  }

  // a computer: the screen, a window or a tab, picked in the browser's own window
  async setScreenShare(on){
    if(!this.room) return;
    this.mediaError = null;
    if(!on && this.picture) return this.stopPicture(true);
    try{
      await this.room.localParticipant.setScreenShareEnabled(on, { audio:true, selfBrowserSurface:'exclude', surfaceSwitching:'include' });
    } catch(err){
      // closing the browser's picker without choosing is no problem
      if(!err || err.name!=='NotAllowedError') this.mediaError = { code:'live_screen_failed' };
    }
    this.emit();
  }

  // A phone can't share its screen from a web page, so it shares a picture (a screenshot, or a
  // photo of one's work) in its place: drawn on a canvas whose video goes out as the screen.
  async sharePicture(file){
    if(!this.room) return;
    this.mediaError = null;
    if(this.isOn('screen')) await this.setScreenShare(false);
    try{
      const url = URL.createObjectURL(file);
      const img = new Image();
      try{
        img.src = url;
        await img.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(img.naturalWidth * scale / 2) * 2);
      canvas.height = Math.max(2, Math.round(img.naturalHeight * scale / 2) * 2);
      const draw = ()=>canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      draw();
      const track = new LocalVideoTrack(canvas.captureStream(5).getVideoTracks()[0]);
      // a still canvas sends no new frames, so it is drawn again now and then for new viewers
      this.picture = { track, timer:setInterval(draw, 500) };
      await this.room.localParticipant.publishTrack(track, { source:Track.Source.ScreenShare, simulcast:false });
    } catch(err){
      console.warn('[meeting] could not share the picture', err);
      this.stopPicture(true);
      this.mediaError = { code:'live_picture_failed' };
    }
    this.emit();
  }

  stopPicture(unpublish){
    if(!this.picture) return;
    const { track, timer } = this.picture;
    this.picture = null;
    clearInterval(timer);
    if(unpublish && this.room) this.room.localParticipant.unpublishTrack(track).catch(()=>{});
    track.stop();
    this.emit();
  }

  // front <-> back camera on a phone; the next camera on a computer with more than one
  async switchCamera(){
    if(!this.room || !this.isOn('camera')) return;
    try{
      const cams = await Room.getLocalDevices('videoinput');
      const pub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
      if(cams.length > 2 || !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)){
        const current = this.room.getActiveDevice('videoinput');
        const at = cams.findIndex(c=>c.deviceId===current);
        const next = cams[(at + 1) % cams.length];
        if(next) await this.room.switchActiveDevice('videoinput', next.deviceId);
      } else {
        this.facing = this.facing==='user' ? 'environment' : 'user';
        await pub.videoTrack.restartTrack({ facingMode:this.facing });
      }
    } catch(err){
      this.mediaError = { code:mediaProblem(err, 'camera') };
    }
    this.emit();
  }

  async useDevice(kind, deviceId){
    if(!this.room) return;
    try{
      await this.room.switchActiveDevice(kind, deviceId);
    } catch(err){
      this.mediaError = { code:mediaProblem(err, kind==='audioinput' ? 'mic' : 'camera') };
    }
    this.emit();
  }

  activeDevice(kind){
    return this.room ? this.room.getActiveDevice(kind) : undefined;
  }

  async setHand(up){
    if(!this.room) return;
    await this.room.localParticipant.setAttributes({ [HAND]:up ? '1' : '' }).catch(()=>{});
    this.emit();
  }

  hasHand(){
    const p = this.room && this.room.localParticipant;
    return Boolean(p && p.attributes && p.attributes[HAND]);
  }

  // ---- chat ----

  setChatOpen(open){
    this.chatOpen = open;
    if(open) this.unread = 0;
    this.emit();
  }

  sendChat(text){
    return sendChat(this.ocId, this.token, text);
  }

  // ---- the teacher's controls ----

  ask(learnerId, what){
    if(this.role!=='teacher') return;
    this.asked.set(learnerId, what);
    sendSignal(this.ocId, this.token, learnerId, what==='camera' ? { askCamera:true } : { askMute:true }).catch(()=>{});
    setTimeout(()=>{ if(this.asked.get(learnerId)===what){ this.asked.delete(learnerId); this.emit(); } }, 15000);
    this.emit();
  }

  async remove(learnerId){
    const { error } = await apiPost(`/live/${this.ocId}/remove`, { learnerId }, this.token);
    if(error) this.mediaError = error;
    this.emit();
  }

  dismissAsk(){
    this.cameraAsked = false;
    this.muteAsked = false;
    this.emit();
  }
}

// a camera preview before coming in (null when it couldn't start)
export async function previewCamera(deviceId){
  return createLocalVideoTrack(deviceId ? { deviceId } : { facingMode:'user', resolution:VideoPresets.h540.resolution });
}

export async function listDevices(kind){
  try{ return await Room.getLocalDevices(kind, false); }
  catch{ return []; }
}
