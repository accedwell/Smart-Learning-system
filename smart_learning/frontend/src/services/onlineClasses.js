import { useEffect, useState } from 'react'

// Online classes (backend: /api/teacher/online-classes and /api/learner/online-classes).
// Learners can join from 15 minutes before the start until the class ends, as on the server.
export const JOIN_EARLY_MS = 15*60*1000;

// 'upcoming' | 'open' | 'ended', worked out again on the client so the page stays right
// while it is left open
export function phaseOf(oc, now){
  if(now >= new Date(oc.endsAt).getTime()) return 'ended';
  return now >= new Date(oc.startsAt).getTime()-JOIN_EARLY_MS ? 'open' : 'upcoming';
}

export const PHASE_PILL = { upcoming:'pill-warn', open:'pill-good', ended:'' };

export function formatWhen(value){
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
}

// the current time, refreshed every `everyMs`
export function useNow(everyMs=30000){
  const [now, setNow] = useState(()=>Date.now());
  useEffect(()=>{
    const id = setInterval(()=>setNow(Date.now()), everyMs);
    return ()=>clearInterval(id);
  }, [everyMs]);
  return now;
}

// a value for <input type="datetime-local">: the next whole quarter hour, in local time
export function nextQuarterHour(){
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes()+1)/15)*15);
  const pad = (n)=>String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
