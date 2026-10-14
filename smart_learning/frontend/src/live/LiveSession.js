import { ICE_SERVERS, openStream, sendSignal, sendChat } from './liveClient.js'

// One person's side of a live classroom: the event stream, the video connections and their
// own camera, microphone and (teacher) screen.
//
// Connections form a star around the teacher: the teacher holds one RTCPeerConnection per
// learner and always makes the offer; a learner holds one, to the teacher. Each connection has
// one audio and one video transceiver both ways, so turning a camera, microphone or screen
// share on or off is a replaceTrack on those, with no renegotiation. Learners see and hear the
// teacher; the teacher also sees and hears any learner who switches their camera or mic on.
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
    this.pendingIce = new Map(); // id -> ICE candidates that came before their offer/answer
    this.remote = new Map(); // id -> MediaStream from that person
    this.mic = null;
    this.cam = null;
    this.screen = null;
    this.sending = { audio:null, video:null }; // what goes out on every connection
    this.mediaError = null;
    this.preview = new MediaStream(); // my own video, for the self view
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
    for(const track of [this.mic, this.cam, this.screen]) if(track) track.stop();
    this.mic = this.cam = this.screen = null;
    this.sending = { audio:null, video:null };
    this.refreshPreview();
  }

  // ---- events from the server ----

  onEvent(name, data){
    if(name==='welcome'){
      this.me = data.you;
      this.teacherId = data.teacherId;
      this.participants = new Map(data.participants.map(p=>[p.id, p]));
      this.chat = data.chat;
      if(this.role==='teacher') for(const p of data.participants) if(p.role==='learner') this.call(p.id);
    } else if(name==='joined'){
      this.participants.set(data.id, data);
      if(this.role==='teacher' && data.role==='learner') this.call(data.id);
      // the teacher came back: their offer is on its way
      if(this.role==='learner' && data.role==='teacher') this.closePeer(data.id);
    } else if(name==='left'){
      this.participants.delete(data.id);
      this.pendingIce.delete(data.id);
      this.closePeer(data.id);
    } else if(name==='signal'){
      this.onSignal(data.from, data.data);
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

  newPeer(id){
    this.closePeer(id);
    const pc = new RTCPeerConnection({ iceServers:ICE_SERVERS });
    const peer = { pc, audio:null, video:null };
    pc.onicecandidate = (e)=>{
      if(e.candidate) sendSignal(this.ocId, this.token, id, { candidate:e.candidate.toJSON() });
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
    const peer = this.newPeer(learnerId);
    peer.audio = peer.pc.addTransceiver('audio', { direction:'sendrecv' });
    peer.video = peer.pc.addTransceiver('video', { direction:'sendrecv' });
    try{
      await peer.audio.sender.replaceTrack(this.sending.audio);
      await peer.video.sender.replaceTrack(this.sending.video);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await sendSignal(this.ocId, this.token, learnerId, { sdp:peer.pc.localDescription.toJSON() });
    } catch(err){
      console.warn('[live] could not call', learnerId, err);
    }
  }

  async onSignal(from, data){
    try{
      if(data.sdp && data.sdp.type==='offer'){
        // learner: the teacher calls
        const peer = this.newPeer(from);
        await peer.pc.setRemoteDescription(data.sdp);
        for(const tr of peer.pc.getTransceivers()){
          const kind = tr.receiver.track.kind;
          tr.direction = 'sendrecv';
          peer[kind] = tr;
          await tr.sender.replaceTrack(this.sending[kind]);
        }
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await sendSignal(this.ocId, this.token, from, { sdp:peer.pc.localDescription.toJSON() });
        await this.flushIce(from);
      } else if(data.sdp && data.sdp.type==='answer'){
        const peer = this.peers.get(from);
        if(peer){
          await peer.pc.setRemoteDescription(data.sdp);
          await this.flushIce(from);
        }
      } else if(data.candidate){
        const peer = this.peers.get(from);
        if(peer && peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
        else this.pendingIce.set(from, [...(this.pendingIce.get(from) || []), data.candidate]);
      }
    } catch(err){
      console.warn('[live] signal from', from, err);
    }
  }

  async flushIce(id){
    const peer = this.peers.get(id);
    const list = this.pendingIce.get(id) || [];
    this.pendingIce.delete(id);
    for(const c of list) await peer.pc.addIceCandidate(c).catch(()=>{});
  }

  // ---- my camera, microphone and screen ----

  // puts what I send now on every connection
  applySending(kind){
    for(const peer of this.peers.values()){
      if(peer[kind]) peer[kind].sender.replaceTrack(this.sending[kind]).catch(()=>{});
    }
  }

  refreshPreview(){
    for(const track of this.preview.getTracks()) this.preview.removeTrack(track);
    if(this.sending.video) this.preview.addTrack(this.sending.video);
  }

  async setMic(on){
    this.mediaError = null;
    if(on && !this.mic){
      try{
        const [track] = (await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } })).getAudioTracks();
        this.mic = this.keepTrack(track, this.mic);
      } catch(err){
        this.mediaError = { code: err && err.name==='NotAllowedError' ? 'live_mic_denied' : 'live_no_mic' };
      }
    } else if(!on && this.mic){
      this.mic.stop();
      this.mic = null;
    }
    this.sending.audio = this.mic;
    this.applySending('audio');
    this.emit();
  }

  async setCamera(on){
    this.mediaError = null;
    if(on && !this.cam){
      try{
        const [track] = (await navigator.mediaDevices.getUserMedia({ video:{ width:{ ideal:1280 }, height:{ ideal:720 } } })).getVideoTracks();
        this.cam = this.keepTrack(track, this.cam);
      } catch(err){
        this.mediaError = { code: err && err.name==='NotAllowedError' ? 'live_camera_denied' : 'live_no_camera' };
      }
    } else if(!on && this.cam){
      this.cam.stop();
      this.cam = null;
    }
    this.updateVideo();
  }

  // teacher: shares a screen or window in place of the camera
  async setScreenShare(on){
    this.mediaError = null;
    if(on && !this.screen){
      try{
        const [track] = (await navigator.mediaDevices.getDisplayMedia({ video:true })).getVideoTracks();
        this.screen = this.keepTrack(track, this.screen);
        // the browser's own "Stop sharing" button
        if(this.screen) this.screen.onended = ()=>this.setScreenShare(false);
      } catch{
        this.screen = null; // the teacher closed the picker
      }
    } else if(!on && this.screen){
      this.screen.onended = null;
      this.screen.stop();
      this.screen = null;
    }
    this.updateVideo();
  }

  updateVideo(){
    this.sending.video = this.screen || this.cam;
    this.applySending('video');
    this.refreshPreview();
    this.emit();
  }

  // ---- chat ----

  sendChat(text){
    return sendChat(this.ocId, this.token, text);
  }
}

// whether a remote stream has live video to show (not switched off on the other side)
export function hasVideo(stream){
  return Boolean(stream) && stream.getVideoTracks().some(tr=>tr.readyState==='live' && !tr.muted);
}

export function hasAudio(stream){
  return Boolean(stream) && stream.getAudioTracks().some(tr=>tr.readyState==='live' && !tr.muted);
}
