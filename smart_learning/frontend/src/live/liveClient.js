import { apiPost } from '../services/api.js'

// The live classroom's connection to the backend (/api/live). The event stream is read with
// fetch rather than EventSource, because EventSource can't send the sign-in token. It
// reconnects by itself after a dropped connection, but not after the class ended, the page
// opened elsewhere ('replaced') or an error answer such as "this class has ended".

// public STUN server: lets two browsers on different networks find a route to each other
export const ICE_SERVERS = [{ urls:'stun:stun.l.google.com:19302' }];

const RETRY_MS = [1000, 2000, 5000, 10000];

// handlers: { onEvent(name, data), onStatus('connecting' | 'live' | 'reconnecting'), onError(error) }
export function openStream(ocId, token, handlers){
  const abort = new AbortController();
  let attempt = 0;
  let finished = false;

  async function run(){
    while(!finished){
      handlers.onStatus(attempt===0 ? 'connecting' : 'reconnecting');
      try{
        const res = await fetch(`/api/live/${ocId}/stream`, { headers:{ Authorization:'Bearer '+token }, signal:abort.signal });
        if(!res.ok){
          const body = await res.json().catch(()=>null);
          finished = true;
          handlers.onError((body && body.error) || { code:'api_error_server' });
          return;
        }
        attempt = 0;
        handlers.onStatus('live');
        await readEvents(res.body, (name, data)=>{
          if(name==='ended' || name==='replaced') finished = true;
          handlers.onEvent(name, data);
        });
      } catch{
        if(abort.signal.aborted) return;
      }
      if(finished || abort.signal.aborted) return;
      await new Promise(r=>setTimeout(r, RETRY_MS[Math.min(attempt++, RETRY_MS.length-1)]));
    }
  }
  run();

  return { close(){ finished = true; abort.abort(); } };
}

// calls onEvent(name, data) for each server-sent event until the stream ends
async function readEvents(body, onEvent){
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for(;;){
    const { value, done } = await reader.read();
    if(done) return;
    buffer += decoder.decode(value, { stream:true });
    let cut;
    while((cut = buffer.indexOf('\n\n')) >= 0){
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut+2);
      let name = 'message';
      let data = '';
      for(const line of block.split('\n')){
        if(line.startsWith('event:')) name = line.slice(6).trim();
        else if(line.startsWith('data:')) data += line.slice(5).trim();
      }
      if(data) onEvent(name, JSON.parse(data));
    }
  }
}

export function sendSignal(ocId, token, to, data){
  return apiPost(`/live/${ocId}/signal`, { to, data }, token);
}

export function sendChat(ocId, token, text){
  return apiPost(`/live/${ocId}/chat`, { text }, token);
}
