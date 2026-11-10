import { ICE_SERVERS, openStream, sendSignal, sendChat, sendSnapshot } from './liveClient.js'

// One person's side of a live classroom: the event stream, the video connections and their
// own camera, microphone and (teacher) screen.
//
// Connections form a star around the teacher: the teacher holds one RTCPeerConnection per
// learner and always makes the offer; a learner holds one, to the teacher. Each connection has
// one audio and one video transceiver both ways, so turning a camera, microphone or screen
// share on or off is a replaceTrack on those, with no renegotiation. Learners see and hear the
// teacher; the teacher also sees and hears any learner who switches their camera or mic on.
//
// A learner can present (their screen, or their camera on a phone): the teacher puts them on
// show for the class ("spotlight"), and then sends that learner's video, and their voice mixed
// with the teacher's own, to every other learner in place of the teacher's camera. The
// presenter keeps getting the teacher's own video. Learners are told who is presenting.
//
// So the teacher can always see who is in class, a learner's camera also sends a small still
// picture about once a second through the server (it goes where the direct video can't, e.g.
// between different networks). The teacher shows it when the live video isn't coming through,
// and can ask a learner to turn their camera on.
//
// Every call has its own id, carried by its offer, its answer and its ICE candidates. When a
// learner rejoins (a reload, a dropped network) the teacher calls again; a late answer or
// candidate from the earlier call is then ignored instead of breaking the new connection.
//
// React reads it through subscribe() and `version`, which goes up on every change.
export class LiveSession {
  constructor(ocId, token, role){
    this.ocId = ocId;
    this.token = token;
    this.role = role;
    this.version = 0;
    this.listeners = new Set();
    this.status = 'connecting'; // 'connecting' | 'live' | 'reconnecting'
    this.ended = false;
    this.error = null;
    this.me = null;
    this.teacherId = null;
    this.participants = new Map(); // id -> { id, name, role }, not counting me
    this.chat = [];
    this.peers = new Map(); // other person's id -> { pc, audio, video } (transceivers)
    this.pendingIce = new Map(); // id -> ICE candidates ({ call, candidate }) that came before their offer/answer
    this.remote = new Map(); // id -> MediaStream from that person
    this.mic = null;
    this.cam = null;
    this.screen = null;
    this.sending = { audio:null, video:null }; // what goes out on every connection
    this.mediaError = null;
    this.preview = new MediaStream(); // my own video, for the self view
    this.spotlight = null; // teacher: the learner on show for the class (their id); learner: { id, name } or null
    this.mixer = null; // teacher: the AudioContext mixing my mic with the presenter's voice
    this.snapshots = new Map(); // teacher: learner id -> the latest still picture from their camera
    this.askedCamera = new Set(); // teacher: learners asked to turn their camera on
    this.cameraAsked = false; // learner: the teacher asked me to turn my camera on
    this.snapTimer = null; // learner: sends my camera's still pictures
    this.iceServers = ICE_SERVERS; // the server's, with its TURN relay, once it welcomes me
  }

  subscribe = (fn)=>{
    this.listeners.add(fn);
    return ()=>this.listeners.delete(fn);
  };

  getVersion = ()=>this.version;

  emit(){
    this.version++;
    for(const fn of this.listeners) fn();
  }

  start(){
    this.stopped = false;
    this.stream = openStream(this.ocId, this.token, {
      onStatus:(status)=>{ this.status = status; this.emit(); },
      onError:(error)=>{ this.error = error; this.teardown(); this.emit(); },
      onEvent:(name, data)=>this.onEvent(name, data),
    });
    // the teacher comes in with camera and microphone on; learners switch theirs on when they want to speak
    if(this.role==='teacher'){
      this.setCamera(true);
      this.setMic(true);
    }
  }

  stop(){
    this.stopped = true;
    if(this.stream) this.stream.close();
    this.teardown();
  }

  // A camera or microphone track that arrived after the classroom closed, or after another
  // request already got one (React starts effects twice in development), is let go at once
  // so the device's light goes off.
  keepTrack(track, current){
    if(this.stopped || current){
      track.stop();
      return current;
    }
    return track;
  }

  teardown(){
    for(const id of [...this.peers.keys()]) this.closePeer(id);
    this.stopPicture();
    for(const track of [this.mic, this.cam, this.screen]) if(track) track.stop();
    this.mic = this.cam = this.screen = null;
    this.spotlight = null;
    this.closeMixer();
    this.stopSnapshots(false);
    this.snapshots.clear();
    this.sending = { audio:null, video:null };
    this.refreshPreview();
  }

  // ---- events from the server ----

  onEvent(name, data){
    if(name==='welcome'){
      this.me = data.you;
      this.teacherId = data.teacherId;
      if(data.iceServers) this.iceServers = data.iceServers;
      this.participants = new Map(data.participants.map(p=>[p.id, p]));
      this.chat = data.chat;
      if(this.role==='teacher') for(const p of data.participants) if(p.role==='learner') this.call(p.id);
    } else if(name==='joined'){
      this.participants.set(data.id, data);
      if(this.role==='teacher' && data.role==='learner'){
        this.call(data.id);
        if(this.spotlight) this.tellSpotlight(data.id);
      }
      // the teacher came back: their offer is on its way
      if(this.role==='learner' && data.role==='teacher') this.closePeer(data.id);
    } else if(name==='left'){
      this.participants.delete(data.id);
      this.pendingIce.delete(data.id);
      this.closePeer(data.id);
      // the presenter left: back to the teacher's own video for everyone
      if(this.role==='teacher' && this.spotlight===data.id) this.setSpotlight(null);
      this.snapshots.delete(data.id);
      this.askedCamera.delete(data.id);
    } else if(name==='signal'){
      this.onSignal(data.from, data.data);
    } else if(name==='snapshot'){
      if(data.image) this.snapshots.set(data.from, data.image);
      else this.snapshots.delete(data.from);
    } else if(name==='chat'){
      this.chat = [...this.chat, data];
    } else if(name==='ended'){
      this.ended = true;
      this.teardown();
    } else if(name==='replaced'){
      this.error = { code:'live_replaced' };
      this.teardown();
    }
    this.emit();
  }

  // ---- video connections ----

  // `call`: the id of the call this connection belongs to
  newPeer(id, call){
    this.closePeer(id);
    const pc = new RTCPeerConnection({ iceServers:this.iceServers });
    const peer = { pc, call, audio:null, video:null };
    pc.onicecandidate = (e)=>{
      if(e.candidate) sendSignal(this.ocId, this.token, id, { call, candidate:e.candidate.toJSON() });
    };
    pc.ontrack = (e)=>{
      const stream = this.remote.get(id) || new MediaStream();
      if(!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      // a camera switched off (replaceTrack(null)) shows as a muted track on this side
      e.track.onmute = e.track.onunmute = ()=>this.emit();
      this.remote.set(id, stream);
      this.emit();
    };
    pc.onconnectionstatechange = ()=>this.emit();
    this.peers.set(id, peer);
    return peer;
  }

  closePeer(id){
    const peer = this.peers.get(id);
    if(peer){
      peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null;
      peer.pc.close();
    }
    this.peers.delete(id);
    this.remote.delete(id);
  }

  // teacher: opens a connection to a learner
  async call(learnerId){
    const call = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.pendingIce.delete(learnerId); // candidates of an earlier call
    const peer = this.newPeer(learnerId, call);
    peer.audio = peer.pc.addTransceiver('audio', { direction:'sendrecv' });
    peer.video = peer.pc.addTransceiver('video', { direction:'sendrecv' });
    try{
      await peer.audio.sender.replaceTrack(this.sendingFor(learnerId, 'audio'));
      await peer.video.sender.replaceTrack(this.sendingFor(learnerId, 'video'));
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      if(this.peers.get(learnerId)!==peer) return; // called again meanwhile
      // the presenter came back: the class now gets their video and voice from this new connection
      if(this.spotlight===learnerId){ this.updateVideo(); this.updateAudio(); }
      await sendSignal(this.ocId, this.token, learnerId, { call, sdp:peer.pc.localDescription.toJSON() });
    } catch(err){
      console.warn('[live] could not call', learnerId, err);
    }
  }

  async onSignal(from, data){
    try{
      if(data.askCamera){
        // learner: the teacher wants to see me
        if(this.role==='learner' && !this.cam){ this.cameraAsked = true; this.emit(); }
      } else if(data.spotlight!==undefined){
        // learner: the teacher says who is presenting (null: nobody)
        if(this.role==='learner') this.spotlight = data.spotlight;
        this.emit();
      } else if(data.sdp && data.sdp.type==='offer'){
        // learner: the teacher calls (again, after a rejoin: the new call replaces the old one)
        const peer = this.newPeer(from, data.call);
        await peer.pc.setRemoteDescription(data.sdp);
        for(const tr of peer.pc.getTransceivers()){
          const kind = tr.receiver.track.kind;
          tr.direction = 'sendrecv';
          peer[kind] = tr;
          await tr.sender.replaceTrack(this.sending[kind]);
        }
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        if(this.peers.get(from)!==peer) return; // a newer call came in meanwhile
        await sendSignal(this.ocId, this.token, from, { call:data.call, sdp:peer.pc.localDescription.toJSON() });
        await this.flushIce(from);
      } else if(data.sdp && data.sdp.type==='answer'){
        // teacher: only the answer to the call this connection made
        const peer = this.peers.get(from);
        if(peer && peer.call===data.call && peer.pc.signalingState==='have-local-offer'){
          await peer.pc.setRemoteDescription(data.sdp);
          await this.flushIce(from);
        }
      } else if(data.candidate){
        // for the current call once it is set up; otherwise kept until its offer or answer comes
        // (flushIce then uses only the ones of that call, so an earlier call's are dropped)
        const peer = this.peers.get(from);
        if(peer && peer.call===data.call && peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
        else this.pendingIce.set(from, [...(this.pendingIce.get(from) || []), { call:data.call, candidate:data.candidate }]);
      }
    } catch(err){
      console.warn('[live] signal from', from, err);
    }
  }

  // the candidates that came early, for this connection's call only
  async flushIce(id){
    const peer = this.peers.get(id);
    const list = this.pendingIce.get(id) || [];
    this.pendingIce.delete(id);
    if(!peer) return;
    for(const c of list) if(c.call===peer.call) await peer.pc.addIceCandidate(c.candidate).catch(()=>{});
  }

  // ---- my camera, microphone and screen ----

  // what goes out to one person: the same for everyone, except that a presenting learner gets
  // the teacher's own camera and mic rather than their own screen and voice back
  sendingFor(id, kind){
    if(this.role==='teacher' && this.spotlight===id) return kind==='audio' ? this.mic : (this.screen || this.cam);
    return this.sending[kind];
  }

  // puts what I send now on every connection
  applySending(kind){
    for(const [id, peer] of this.peers){
      if(peer[kind]) peer[kind].sender.replaceTrack(this.sendingFor(id, kind)).catch(()=>{});
    }
  }

  // ---- presenting (teacher) ----

  // the presenter's video or voice as it arrives here
  presenterTrack(kind){
    const peer = this.spotlight && this.peers.get(this.spotlight);
    const track = peer && peer[kind] && peer[kind].receiver.track;
    return track && track.readyState==='live' ? track : null;
  }

  // puts a learner on show for the class (null: nobody), and tells every learner
  setSpotlight(learnerId){
    if(this.role!=='teacher') return;
    this.spotlight = learnerId;
    this.updateVideo();
    this.updateAudio();
    for(const p of this.participants.values()) if(p.role==='learner') this.tellSpotlight(p.id);
  }

  tellSpotlight(learnerId){
    const p = this.spotlight && this.participants.get(this.spotlight);
    sendSignal(this.ocId, this.token, learnerId, { spotlight: p ? { id:p.id, name:p.name } : null }).catch(()=>{});
  }

  // teacher: asks a learner to turn their camera on (they get a message with the button)
  askCamera(learnerId){
    if(this.role!=='teacher') return;
    this.askedCamera.add(learnerId);
    sendSignal(this.ocId, this.token, learnerId, { askCamera:true }).catch(()=>{});
    this.emit();
  }

  // ---- still pictures from my camera (learner) ----

  // sends one about every second while my camera is on; stops (and tells the teacher) when it goes off
  syncSnapshots(){
    if(this.role!=='learner') return;
    if(this.cam && !this.snapTimer) this.startSnapshots();
    else if(!this.cam && this.snapTimer) this.stopSnapshots(true);
  }

  startSnapshots(){
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([this.cam]);
    video.play().catch(()=>{});
    const canvas = document.createElement('canvas');
    let busy = false;
    this.snapTimer = setInterval(async ()=>{
      if(busy || !video.videoWidth || this.stopped) return;
      const width = 240;
      canvas.width = width;
      canvas.height = Math.round(width * video.videoHeight / video.videoWidth);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      busy = true;
      await sendSnapshot(this.ocId, this.token, canvas.toDataURL('image/jpeg', 0.6)).catch(()=>{});
      busy = false;
    }, 1000);
    this.snapVideo = video;
  }

  stopSnapshots(tell){
    if(!this.snapTimer) return;
    clearInterval(this.snapTimer);
    this.snapTimer = null;
    if(this.snapVideo){ this.snapVideo.srcObject = null; this.snapVideo = null; }
    if(tell) sendSnapshot(this.ocId, this.token, null).catch(()=>{});
  }

  closeMixer(){
    if(this.mixer){ this.mixer.close().catch(()=>{}); this.mixer = null; }
  }

  // what everyone hears from me: my mic, mixed with the presenter's voice while someone presents
  updateAudio(){
    this.closeMixer();
    const theirs = this.role==='teacher' ? this.presenterTrack('audio') : null;
    if(theirs && window.AudioContext){
      const ctx = new AudioContext();
      const out = ctx.createMediaStreamDestination();
      for(const track of [this.mic, theirs]) if(track) ctx.createMediaStreamSource(new MediaStream([track])).connect(out);
      this.mixer = ctx;
      this.sending.audio = out.stream.getAudioTracks()[0];
    } else {
      this.sending.audio = this.mic;
    }
    this.applySending('audio');
  }

  refreshPreview(){
    for(const track of this.preview.getTracks()) this.preview.removeTrack(track);
    const own = this.screen || this.cam;
    if(own) this.preview.addTrack(own);
  }

  async setMic(on){
    this.mediaError = null;
    if(on && !this.mic){
      try{
        const [track] = (await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } })).getAudioTracks();
        this.mic = this.keepTrack(track, this.mic);
      } catch(err){
        this.mediaError = { code:mediaProblem(err, 'mic') };
      }
    } else if(!on && this.mic){
      this.mic.stop();
      this.mic = null;
    }
    this.updateAudio();
    this.emit();
  }

  async setCamera(on){
    this.mediaError = null;
    if(on && !this.cam){
      try{
        const [track] = (await navigator.mediaDevices.getUserMedia({ video:{ width:{ ideal:1280 }, height:{ ideal:720 } } })).getVideoTracks();
        this.cam = this.keepTrack(track, this.cam);
      } catch(err){
        this.mediaError = { code:mediaProblem(err, 'camera') };
      }
    } else if(!on && this.cam){
      this.cam.stop();
      this.cam = null;
    }
    this.updateVideo();
  }

  // shares a screen or window in place of the camera (the teacher, or a learner presenting)
  async setScreenShare(on){
    this.mediaError = null;
    if(on && !this.screen){
      try{
        const [track] = (await navigator.mediaDevices.getDisplayMedia({ video:true })).getVideoTracks();
        this.screen = this.keepTrack(track, this.screen);
        // the browser's own "Stop sharing" button
        if(this.screen) this.screen.onended = ()=>this.setScreenShare(false);
      } catch(err){
        this.screen = null;
        // closing the picker without choosing is no problem
        if(!err || err.name!=='NotAllowedError') this.mediaError = { code:mediaProblem(err, 'screen') };
      }
    } else if(!on && this.screen){
      this.stopPicture();
      this.screen.onended = null;
      this.screen.stop();
      this.screen = null;
    }
    this.updateVideo();
  }

  // Phones can't share their screen, so there one shares a picture instead (a screenshot or a
  // photo of one's work): it is drawn on a canvas whose video goes out in place of the screen.
  async sharePicture(file){
    this.mediaError = null;
    if(this.screen) this.setScreenShare(false);
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
      const [track] = canvas.captureStream(5).getVideoTracks();
      // a still canvas sends no new frames, so it is drawn again now and then for new viewers
      this.pictureTimer = setInterval(draw, 500);
      this.screen = this.keepTrack(track, this.screen);
      if(!this.screen) this.stopPicture();
    } catch {
      this.stopPicture();
      this.mediaError = { code:'live_picture_failed' };
    }
    this.updateVideo();
  }

  stopPicture(){
    if(this.pictureTimer){ clearInterval(this.pictureTimer); this.pictureTimer = null; }
  }

  updateVideo(){
    if(this.cam) this.cameraAsked = false;
    this.syncSnapshots();
    // while a learner presents, the class sees them; my own preview stays my camera
    const own = this.screen || this.cam;
    this.sending.video = (this.role==='teacher' && this.presenterTrack('video')) || own;
    this.applySending('video');
    this.refreshPreview();
    this.emit();
  }

  // ---- chat ----

  sendChat(text){
    return sendChat(this.ocId, this.token, text);
  }
}

// The message key for why a microphone, camera or screen share ('mic' | 'camera' | 'screen')
// couldn't start. Browsers only allow them on https:// pages (and http://localhost).
export function mediaProblem(err, kind){
  if(!window.isSecureContext || !navigator.mediaDevices) return 'live_media_insecure';
  const name = err && err.name;
  if(kind==='screen') return 'live_screen_failed';
  if(name==='NotAllowedError' || name==='SecurityError') return `live_${kind}_denied`;
  if(name==='NotFoundError' || name==='OverconstrainedError') return `live_no_${kind}`;
  if(name==='NotReadableError' || name==='AbortError') return `live_${kind}_busy`;
  return `live_${kind}_failed`;
}

// whether a video connection to that person could not be made (their network blocks it)
export function cantConnect(session, id){
  const peer = session.peers.get(id);
  return Boolean(peer) && peer.pc.connectionState==='failed';
}

// whether a remote stream has live video to show (not switched off on the other side)
export function hasVideo(stream){
  return Boolean(stream) && stream.getVideoTracks().some(tr=>tr.readyState==='live' && !tr.muted);
}

export function hasAudio(stream){
  return Boolean(stream) && stream.getAudioTracks().some(tr=>tr.readyState==='live' && !tr.muted);
}
