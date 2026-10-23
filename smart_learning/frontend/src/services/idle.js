import { useEffect, useState } from 'react'

// Automatic sign-out after 30 minutes without activity (no mouse, keys, touch or scrolling),
// so a shared school computer left open doesn't stay signed in. A playing video (an online
// class) counts as activity. The last activity is kept in this tab's sessionStorage, so a
// page refresh can't restart the clock.
export const IDLE_MINUTES = 30;
const IDLE_MS = IDLE_MINUTES*60*1000;
const WARN_MS = 60*1000; // the warning shows for the last minute
const KEY = 'smart-learning-last-active';
const ACTIVITY = ['pointerdown','pointermove','keydown','wheel','scroll','touchstart'];

function readLast(){
  try{ return Number(sessionStorage.getItem(KEY)) || 0; } catch{ return 0; }
}
function writeLast(time){
  try{ sessionStorage.setItem(KEY, String(time)); } catch{ /* only this page's clock then */ }
}

// true when a remembered sign-in has been idle too long to restore after a refresh
export function idleTooLong(){
  const last = readLast();
  return last>0 && Date.now()-last >= IDLE_MS;
}

const videoPlaying = ()=>[...document.querySelectorAll('video')].some(v=>!v.paused && !v.ended);

// While `active`, calls onIdle once the time is up; returns the seconds left during the last
// minute (for the warning), otherwise null.
export function useIdleSignOut(active, onIdle){
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(()=>{
    if(!active) return undefined;
    let last = Date.now();
    let saved = 0;
    const mark = ()=>{
      last = Date.now();
      if(last-saved > 5000){ saved = last; writeLast(last); } // storage at most every 5 seconds
    };
    mark();
    ACTIVITY.forEach(ev=>window.addEventListener(ev, mark, { passive:true, capture:true }));
    const timer = setInterval(()=>{
      if(videoPlaying()) mark();
      const idle = Date.now()-last;
      if(idle >= IDLE_MS){ clearInterval(timer); setSecondsLeft(null); onIdle(); return; }
      setSecondsLeft(idle >= IDLE_MS-WARN_MS ? Math.ceil((IDLE_MS-idle)/1000) : null);
    }, 1000);
    return ()=>{
      clearInterval(timer);
      ACTIVITY.forEach(ev=>window.removeEventListener(ev, mark, { capture:true }));
      setSecondsLeft(null);
    };
  // onIdle is read when the time is up; a new function each render must not restart the clock
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return secondsLeft;
}

export function forgetActivity(){
  try{ sessionStorage.removeItem(KEY); } catch{ /* nothing to forget */ }
}
