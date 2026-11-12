import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { BrandMark } from '../components/ui.jsx'

// "hello" in each of South Africa's 11 official languages: always written in its own language
const GREETINGS = [
  ['Hello', 'English'], ['Sawubona', 'isiZulu'], ['Molo', 'isiXhosa'], ['Hallo', 'Afrikaans'],
  ['Thobela', 'Sepedi'], ['Dumela', 'Sesotho'], ['Dumelang', 'Setswana'], ['Sanibonani', 'siSwati'],
  ['Ndaa', 'Tshivenda'], ['Avuxeni', 'Xitsonga'], ['Lotjhani', 'isiNdebele'],
];

// small line icons for the subjects on the two crossing tapes
const SUBJECT_ICONS = {
  math: <path d="M5 7h6M8 4v6M14 7h5M5 17h6M15 14l4 4M19 14l-4 4"/>,
  atom: <><circle cx="12" cy="12" r="1.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/></>,
  leaf: <><path d="M5 19c0-8.5 6-14 15-14 0 9-6 15-14.5 15"/><path d="M5 19l8.5-8.5"/></>,
  chart: <path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>,
  lang: <><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18"/></>,
  pillars: <path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20.5h18"/>,
  code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13"/>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.9 0-1.1-1-1.5-1-2.6 0-1 .9-1.5 2-1.5h2.2a3.8 3.8 0 0 0 3.8-3.8C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>,
  music: <><path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></>,
};
// the two rings of the subject orbit: subject key and its icon
const ORBIT_INNER = [
  ['subject_1', 'math'], ['subject_physical_sciences', 'atom'], ['subject_3', 'leaf'],
  ['subject_2', 'lang'], ['subject_accounting', 'chart'], ['subject_geography', 'globe'],
];
const ORBIT_OUTER = [
  ['subject_isizulu', 'lang'], ['subject_history', 'pillars'], ['subject_it', 'code'], ['subject_lo', 'heart'],
  ['subject_business', 'chart'], ['subject_afrikaans', 'lang'], ['subject_economics', 'chart'], ['subject_tourism', 'globe'],
  ['subject_music', 'music'], ['subject_visual_arts', 'palette'],
];

// The subjects circling the Smart Learning mark: two rings turning slowly in opposite
// directions, each bubble staying upright as it goes round
function SubjectOrbit({ t }){
  const ring = (items, cls)=>(
    <div className={'orbit-ring '+cls}>
      {items.map(([key, icon], i)=>(
        <span key={key} className="orbit-slot" style={{ '--a': (360 / items.length * i) + 'deg' }}>
          <span className="orbit-chip">
            <span className="orbit-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{SUBJECT_ICONS[icon]}</svg></span>
            {t(key)}
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="orbit" aria-hidden="true">
      <span className="orbit-track outer"/>
      <span className="orbit-track inner"/>
      {ring(ORBIT_OUTER, 'outer')}
      {ring(ORBIT_INNER, 'inner')}
      <div className="orbit-core">
        <BrandMark size={44}/>
        <b>CAPS</b>
        <small>8–12</small>
      </div>
    </div>
  );
}

const icon = (paths) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const ROLE_ICONS = {
  learner: icon(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11h5"/></>),
  teacher: icon(<><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M7 20l3-4M17 20l-3-4"/><path d="M7 9l3 3 5-5"/></>),
  parent: icon(<><circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6"/><path d="M13.5 20c.2-2.6 1.7-4.6 3.5-4.6s3.4 2 3.5 4.6"/></>),
  hod: icon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>),
  principal: icon(<><path d="M3 10l9-6 9 6"/><path d="M5 10v9M19 10v9M9.5 19v-5h5v5M3 19h18"/></>),
  admin: icon(<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></>),
};
const ROLES = ['learner', 'teacher', 'parent', 'hod', 'principal', 'admin'];

function Greeting(){
  const [i, setI] = useState(0);
  useEffect(()=>{
    // people who asked for less motion keep the first greeting
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(()=>setI(n=>(n+1) % GREETINGS.length), 2200);
    return ()=>clearInterval(timer);
  }, []);
  const [word, lang] = GREETINGS[i];
  return (
    <span className="landing-greeting" aria-live="off">
      <span key={i} className="landing-greeting-word">{word}<small>{lang}</small></span>
    </span>
  );
}

const reducedMotion = ()=>Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// fades a section in the first time it scrolls into view
function Reveal({ children, className = '', as: Tag = 'section' }){
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(()=>{
    const el = ref.current;
    if(!el || reducedMotion() || !('IntersectionObserver' in window)){ setShown(true); return undefined; }
    const io = new IntersectionObserver((entries)=>{
      if(entries.some(e=>e.isIntersecting)){ setShown(true); io.disconnect(); }
    }, { threshold:0.12 });
    io.observe(el);
    return ()=>io.disconnect();
  }, []);
  return <Tag ref={ref} className={className + ' landing-reveal' + (shown ? ' in' : '')}>{children}</Tag>;
}

// The AI tutor, shown answering a question per subject: the answer types itself out, then the
// next subject follows, until someone picks a subject themselves.
const TUTOR_DEMOS = [
  { subject:'subject_1', q:'landing_ai_m_q', a:'landing_ai_m_a' },
  { subject:'subject_3', q:'landing_ai_ls_q', a:'landing_ai_ls_a' },
  { subject:'subject_accounting', q:'landing_ai_acc_q', a:'landing_ai_acc_a' },
];
function TutorDemo({ t }){
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [auto, setAuto] = useState(true);
  const answer = t(TUTOR_DEMOS[index].a);
  useEffect(()=>{
    if(reducedMotion()){ setTyped(answer.length); return undefined; }
    setTyped(0);
    let n = 0;
    let next = null;
    // a short "thinking" pause, then a few characters at a time
    const start = setTimeout(function step(){
      n = Math.min(answer.length, n + 3);
      setTyped(n);
      if(n < answer.length) next = setTimeout(step, 28);
    }, 700);
    return ()=>{ clearTimeout(start); clearTimeout(next); };
  }, [index, answer]);
  // when the answer is complete, move on to the next subject after a moment
  useEffect(()=>{
    if(!auto || typed < answer.length || reducedMotion()) return undefined;
    const timer = setTimeout(()=>setIndex(i=>(i+1) % TUTOR_DEMOS.length), 4500);
    return ()=>clearTimeout(timer);
  }, [auto, typed, answer]);
  const thinking = typed === 0;
  return (
    <div className="tutor-demo">
      <div className="tutor-tabs" role="tablist">
        {TUTOR_DEMOS.map((d, i)=>(
          <button key={d.subject} role="tab" aria-selected={i===index} className={i===index ? 'on' : ''}
            onClick={()=>{ setAuto(false); setIndex(i); }}>{t(d.subject)}</button>
        ))}
      </div>
      <div className="tutor-window">
        <div className="tutor-head">
          <span className="tutor-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.5 3 L12.2 8.3 L17.5 10 L12.2 11.7 L10.5 17 L8.8 11.7 L3.5 10 L8.8 8.3 Z"/><path d="M17.5 14 L18.3 16.3 L20.5 17 L18.3 17.7 L17.5 20 L16.7 17.7 L14.5 17 L16.7 16.3 Z"/></svg>
          </span>
          <b>{t('landing_ai_name')}</b>
          <span className="tutor-online"/>
        </div>
        <div className="tutor-body" aria-live="polite">
          <div className="tutor-msg me" key={'q'+index}>{t(TUTOR_DEMOS[index].q)}</div>
          <div className="tutor-msg bot">
            {thinking
              ? <span className="tutor-dots"><i/><i/><i/></span>
              : <>{answer.slice(0, typed)}{typed < answer.length && <span className="tutor-caret"/>}</>}
          </div>
        </div>
        <div className="tutor-input" aria-hidden="true">
          <span>{t('landing_ai_placeholder')}</span>
          <span className="tutor-send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </div>
      </div>
    </div>
  );
}

// a picture of a live class (made with HTML, not a screenshot): the teacher speaking, learners'
// tiles, a raised hand and the class's buttons
function LivePreview({ t }){
  const tiles = [
    { name:t('tab_teacher'), initials:'MK', speaking:true, cls:'t1' },
    { name:'Lerato', initials:'LD', cls:'t2' },
    { name:'Kagiso', initials:'KM', hand:true, cls:'t3' },
    { name:'Naledi', initials:'NK', cls:'t4' },
  ];
  const tool = (paths, cls = '')=>(
    <span className={'live-tool '+cls}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths}</svg></span>
  );
  return (
    <div className="live-preview" aria-hidden="true">
      <div className="live-top">
        <span className="live-badge"><i/>{t('landing_live_badge')}</span>
        <span className="live-title">10A · {t('subject_1')}</span>
        <span className="live-time">24:18</span>
      </div>
      <div className="live-grid">
        {tiles.map(tile=>(
          <div key={tile.cls} className={'live-tile '+tile.cls+(tile.speaking ? ' speaking' : '')}>
            <span className="live-face">{tile.initials}</span>
            {tile.hand && <span className="live-hand">✋</span>}
            <span className="live-name">{tile.name}</span>
          </div>
        ))}
      </div>
      <div className="live-toolbar">
        {tool(<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>, 'on')}
        {tool(<><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></>, 'on')}
        {tool(<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 14V8M9 10.5 12 7.5l3 3M8 21h8"/></>)}
        {tool(<><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.7 0-4-1.4-5.3-3.6L4 14.5a1.5 1.5 0 0 1 2.6-1.5L8 15"/></>)}
        {tool(<><path d="M4 5h16v11H8l-4 4z"/></>)}
        {tool(<><path d="M3 15c3-3 6-4.5 9-4.5s6 1.5 9 4.5l-2.5 2.5-3.5-2v-3a10 10 0 0 0-6 0v3l-3.5 2z"/></>, 'leave')}
      </div>
    </div>
  );
}

// The real app on a laptop and a phone (screenshots of a learner's dashboard), tilted in 3D;
// it leans a little towards the mouse
function Showcase({ t }){
  const ref = useRef(null);
  const tilt = (e)=>{
    const el = ref.current;
    if(!el || e.pointerType !== 'mouse' || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', (-12 + x * 10).toFixed(2) + 'deg');
    el.style.setProperty('--rx', (5 - y * 8).toFixed(2) + 'deg');
  };
  const reset = ()=>{
    const el = ref.current;
    if(el){ el.style.removeProperty('--ry'); el.style.removeProperty('--rx'); }
  };
  return (
    <div className="showcase" ref={ref} onPointerMove={tilt} onPointerLeave={reset} aria-hidden="true">
      <div className="showcase-glow"/>
      <div className="showcase-stage">
        <div className="laptop">
          <div className="laptop-screen"><img src="/img/showcase-desktop.webp" alt="" width="1280" height="800"/></div>
          <div className="laptop-base"/>
        </div>
        <div className="phone">
          <div className="phone-screen"><img src="/img/showcase-phone.webp" alt="" width="390" height="844"/></div>
          <span className="phone-notch"/>
        </div>
      </div>
      <div className="showcase-chip chip-quiz">
        <span className="chip-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
        <span className="chip-text"><b>{t('landing_float_quiz')}</b><small>{t('subject_3')} · 8/10</small></span>
      </div>
      <div className="showcase-chip chip-tutor">
        <span className="chip-icon ai"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.5 3 L12.2 8.3 L17.5 10 L12.2 11.7 L10.5 17 L8.8 11.7 L3.5 10 L8.8 8.3 Z"/><path d="M17.5 14 L18.3 16.3 L20.5 17 L18.3 17.7 L17.5 20 L16.7 17.7 L14.5 17 L16.7 16.3 Z"/></svg></span>
        <span className="chip-text"><b>{t('landing_float_tutor')}</b><small className="chip-math">x² − 5x + 6 = 0 → x = 2; x = 3</small></span>
      </div>
    </div>
  );
}

export default function Landing({ onLogin }){
  const { t } = useI18n();
  const facts = [['11', t('landing_fact_langs')], ['8–12', t('landing_fact_grades')], ['24/7', t('landing_fact_ai')], ['6', t('landing_fact_roles')]];
  const steps = [1, 2, 3].map(n=>[t(`landing_step${n}_title`), t(`landing_step${n}_sub`)]);
  return (
    <div className="landing-page">
      <div className="landing-wrap">
        <div className="landing-topbar">
          <div className="landing-logo">
            <BrandMark size={30}/>
            <b>{t('app_title')}</b>
          </div>
          <div className="landing-topbar-actions">
            <button className="btn landing-btn-outline" onClick={onLogin}>{t('landing_get_started_btn')}</button>
          </div>
        </div>
        <div className="landing-hero-grid">
          <div className="landing-hero">
            <div className="landing-hero-top">
              <Greeting/>
            </div>
            <h1>{t('landing_headline_pre')}<span className="highlight">{t('landing_headline_highlight')}</span>{t('landing_headline_post')}</h1>
            <p>{t('landing_subtitle')}</p>
            <div className="landing-cta-row">
              <button className="btn btn-primary landing-cta" onClick={onLogin}>{t('landing_get_started_btn')}</button>
              <span className="landing-already">{t('auth_no_account')}</span>
            </div>
            <a className="landing-scroll" href="#landing-more">
              {t('landing_scroll')}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </a>
          </div>
          <Showcase t={t}/>
        </div>
      </div>


      <div className="landing-more" id="landing-more">
          <div className="landing-features">
            <div className="landing-feature">
              <span className="landing-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.5 3 L12.2 8.3 L17.5 10 L12.2 11.7 L10.5 17 L8.8 11.7 L3.5 10 L8.8 8.3 Z" fill="currentColor" stroke="currentColor"/>
                  <path d="M17.5 14 L18.3 16.3 L20.5 17 L18.3 17.7 L17.5 20 L16.7 17.7 L14.5 17 L16.7 16.3 Z" fill="currentColor" stroke="currentColor"/>
                </svg>
              </span>
              <div>
                <b>{t('landing_feat2_title')}</b>
                <span>{t('landing_feat2_sub')}</span>
              </div>
            </div>
            <div className="landing-feature">
              <span className="landing-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M3 12 h18"/>
                  <path d="M12 3 a13 13 0 0 1 0 18 a13 13 0 0 1 0 -18 Z"/>
                </svg>
              </span>
              <div>
                <b>{t('landing_feat3_title')}</b>
                <span>{t('landing_feat3_sub')}</span>
              </div>
            </div>
          </div>

        <div className="landing-facts">
          {facts.map(([n, label])=>(
            <div key={label} className="landing-fact"><b>{n}</b><span>{label}</span></div>
          ))}
        </div>

        <Reveal className="landing-section landing-split reverse landing-subjects">
          <div className="landing-split-text">
            <span className="landing-kicker">{t('landing_subjects_kicker')}</span>
            <h2>{t('landing_subjects_title')}</h2>
            <p className="landing-lead">{t('landing_subjects_sub')}</p>
          </div>
          <SubjectOrbit t={t}/>
        </Reveal>

        <Reveal className="landing-section landing-split">
          <div className="landing-split-text">
            <span className="landing-kicker">{t('landing_ai_kicker')}</span>
            <h2>{t('landing_ai_title')}</h2>
            <p className="landing-lead">{t('landing_ai_sub')}</p>
          </div>
          <TutorDemo t={t}/>
        </Reveal>

        <Reveal className="landing-section landing-split reverse">
          <div className="landing-split-text">
            <span className="landing-kicker">{t('landing_live_kicker')}</span>
            <h2>{t('landing_live_title')}</h2>
            <p className="landing-lead">{t('landing_live_sub')}</p>
            <ul className="landing-checks">
              {[1, 2, 3, 4].map(n=><li key={n}>{t('landing_live_f'+n)}</li>)}
            </ul>
          </div>
          <LivePreview t={t}/>
        </Reveal>

        <Reveal className="landing-section">
          <span className="landing-kicker">{t('landing_roles_kicker')}</span>
          <h2>{t('landing_roles_title')}</h2>
          <div className="landing-roles">
            {ROLES.map(role=>(
              <div key={role} className={'landing-role role-'+role}>
                <span className="landing-role-icon">{ROLE_ICONS[role]}</span>
                <b>{t('tab_'+role)}</b>
                <p>{t('landing_role_'+role)}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="landing-section">
          <h2>{t('landing_steps_title')}</h2>
          <ol className="landing-steps">
            {steps.map(([title, sub], i)=>(
              <li key={i}><span className="landing-step-n">{i+1}</span><b>{title}</b><p>{sub}</p></li>
            ))}
          </ol>
        </Reveal>

        <Reveal className="landing-final">
          <h2>{t('landing_final_title')}</h2>
          <p>{t('landing_final_sub')}</p>
          <button className="btn btn-primary landing-cta" onClick={onLogin}>{t('landing_get_started_btn')}</button>
        </Reveal>

        <footer className="landing-footer">
          <BrandMark size={22}/><span>{t('app_title')}</span>
        </footer>
      </div>
    </div>
  );
}
